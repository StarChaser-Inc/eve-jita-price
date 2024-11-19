import { Context, Schema } from "koishi"
import fs from "fs"
import * as zlib from "zlib"
import filePath from "path"

export const name = "eve-jita-price"

interface itemInfo {
  id: number
  name: {
    de: string
    en: string
    es: string
    fr: string
    ja: string
    ru: string
    zh: string
  }
  groupID: number
}

export interface Config {
  maxSearch: number
  preDecompression: boolean
  customSpecialFields: {
    monitoringContent: string
    response: string
    directOutput: boolean
  }[]
  customPriceInquiryInstructionsAndLocation: {
    command: string
    location: string
  }[]
  customTypesJsonFilePath: string
}

export const Config: Schema<Config> = Schema.object({
  maxSearch: Schema.number().description('最大搜索结果数量').default(10),
  customSpecialFields: Schema.array(Schema.object({
    monitoringContent: Schema.string().description('监听内容').required(),
    response: Schema.string().description('响应内容').required().role('textarea'),
    directOutput: Schema.boolean().description('是否直接输出响应内容（值为false时会在输出后执行查价计算）').default(true)
  })).description('自定义特殊响应字段（因为群友特爱整活，所以增加了这个功能）').role('table'),
  preDecompression: Schema.boolean().description('是否在插件启动时解压typeId文件').default(true),
  customPriceInquiryInstructionsAndLocation: Schema.array(Schema.object({
    command: Schema.string().description('指令').required(),
    location: Schema.string().description('星域id').required()
  })).description('自定义价格询价指令及星域id').role('table').default([{command: 'jita', location: '10000002'}]),
  customTypesJsonFilePath: Schema.string().description('自定义types.json.gz文件路径').default(`${filePath.join(__dirname, 'types.json.gz')}`)
}) as Schema<Config>

export function apply(ctx: Context, cfg: Config): void {
  function formatNumberWithCommas(num: number | string): string {
    if (typeof num === 'number' && isNaN(num)) return 'NaN'
    typeof num === 'string' ? num = +parseFloat(num).toFixed(2) : num = +num.toFixed(2)
    const [integer, fraction] = num.toString().split(".")
    const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    return fraction ? `${formattedInteger}.${fraction}` : formattedInteger
  }

  function search(name: string, types: itemInfo[]): itemInfo[] {
    return types.filter(item =>
      (item.name && item.name.zh && item.name.zh.toUpperCase().startsWith(name.toUpperCase())) ||
      (item.name && item.name.en && item.name.en.toUpperCase().startsWith(name.toUpperCase())) ||
      (item.name && item.name.de && item.name.de.startsWith(name)) ||
      (item.name && item.name.fr && item.name.fr.startsWith(name)) ||
      (item.name && item.name.es && item.name.es.startsWith(name)) ||
      (item.name && item.name.ja && item.name.ja.startsWith(name)) ||
      (item.name && item.name.ru && item.name.ru.startsWith(name))
    )
  }

  async function getItemPrice(itemId: number, locationId: string, method: 'buy' |'sell'): Promise<number[]> {
    for (let i = 0; i < 5; i++) {
      // 至多尝试 5 次，防止死循环
      try {
        return ((await ctx.http.get(`https://esi.evetech.net/latest/markets/${locationId}/orders/?datasource=tranquility&order_type=${method}&type_id=${itemId}`)) as { price: number }[]).map(order => order.price)
      } catch {
        console.error("请求失败，正在重试:");
        // 每1秒重试一次
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return [NaN]
  }

  function gunzip(): itemInfo[] {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(cfg.customTypesJsonFilePath)).toString())
  }

  let types: itemInfo[] = undefined
  ctx.on('ready', () => {
    if (cfg.preDecompression) {
      types = gunzip()
    }
  })
  for (const { command, location } of cfg.customPriceInquiryInstructionsAndLocation) {
    ctx.command(`${command} <...itemName>`)
    .action(async (_, ...itemName) => {
      const name = itemName.join(' ')
      if (!name) return '请输入物品名称'
      if (cfg.customSpecialFields.map(field => field.monitoringContent).includes(name)) {
        if (cfg.customSpecialFields.find(field => field.monitoringContent === name).directOutput) return cfg.customSpecialFields.find(field => field.monitoringContent === name).response
        else _.session.send(cfg.customSpecialFields.find(field => field.monitoringContent === name).response)
      }
      let uTypes: itemInfo[] = []
      if (types) uTypes = types
      else uTypes = gunzip()
      let items = search(name, uTypes)
      if (items.length === 0) return `没有找到名称为 "${name}" 的物品`
      if (!name.includes('SKIN') || !name.includes('涂装')) items = items.filter(item => item.name && item.name.en && !item.name.en.includes('SKIN'))
      if (!name.includes('Blueprint') || !name.includes('蓝图')) items = items.filter(item => item.name && item.name.en && !item.name.en.includes('Blueprint'))
      if (items.length === 0) items = search(name, uTypes)
      if (items.length > cfg.maxSearch) return `找到 ${items.length} 个结果，请缩小搜索范围`
      let suit = false
      let plex = false
      let allSell = 0
      let allBuy = 0
      let allM = 0
      if (items.every(i => i.groupID === 300) && items.length === 6) suit = true
      if (items.every(i => i.id == 44992) && items.length === 1) plex = true
      let mArr = []
      for (const item of items) {
        const maxBuy = Math.max(...(await getItemPrice(item.id, location, 'buy')))
        const minSell = Math.min(...(await getItemPrice(item.id, location,'sell')))
        const m = +((maxBuy + minSell) / 2).toFixed(2)
        if (suit || plex) {
          allBuy += maxBuy
          allSell += minSell
          allM += m
        }
        mArr.push(`${item.name.zh}/${item.name.en}\n  -最低卖价：${formatNumberWithCommas(minSell)} ISK\n  -平均价格：${formatNumberWithCommas(m)} ISK\n  -最高买价：${formatNumberWithCommas(maxBuy)} ISK`)
      }
      if (suit) {
        mArr.push(`以上物品总价\n  -最低卖价：${formatNumberWithCommas(allSell)} ISK\n  -平均价格：${formatNumberWithCommas(allM)} ISK\n  -最高买价：${formatNumberWithCommas(allBuy)} ISK\n`)
      }
      if (plex) {
        mArr.push(`500x PLEX\n  -最低卖价：${formatNumberWithCommas(allSell * 500)} ISK\n  -平均价格：${formatNumberWithCommas(allM * 500)} ISK\n  -最高买价：${formatNumberWithCommas(allBuy * 500)} ISK\n`)
      }
      return mArr.join('\n--------------\n')
    })
  }
}
