import { Context, Schema, h } from 'koishi'
import * as fs from 'fs'
import * as zlib from 'zlib'
import * as path from 'path'

export const name = 'eve-jita-price'

interface json {
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
  markdown: boolean
}

export const Config: Schema<Config> = Schema.object({
  maxSearch: Schema.number().description('最大搜索结果数量').default(10),
  markdown: Schema.boolean().description('是否使用 Markdown 格式输出').default(false)
})


function formatNumberWithCommas(num: number | string): string {
  const [integer, fraction] = num.toString().split(".")
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return fraction ? `${formattedInteger}.${fraction}` : formattedInteger
}

export function apply(ctx: Context, cfg: Config) {
  let typeIDs: json[]
  ctx.on('ready', () => {
    const typeIDs_json_gz = fs.readFileSync(path.resolve(__dirname, 'types.json.gz'))
    try {
      const buffer = zlib.gunzipSync(typeIDs_json_gz)
      typeIDs = JSON.parse(buffer.toString()) as json[]
    } catch (err) {
      ctx.logger.error(err)
      ctx.stop()
    }
  })
  ctx.command('jita <...inputname>')
  .action(async ({session}, ...inputname) => {
    const name = inputname.join(' ')
    if (!name){
      return '请输入要查询的物品名称'
    } else {
      let search = typeIDs.filter(item =>
        (item.name && item.name.zh && item.name.zh.startsWith(name)) ||
        (item.name && item.name.en && item.name.en.toUpperCase().startsWith(name.toUpperCase())) ||
        (item.name && item.name.de && item.name.de.startsWith(name)) ||
        (item.name && item.name.fr && item.name.fr.startsWith(name)) ||
        (item.name && item.name.es && item.name.es.startsWith(name)) ||
        (item.name && item.name.ja && item.name.ja.startsWith(name)) ||
        (item.name && item.name.ru && item.name.ru.startsWith(name))
      )
      if (search.length === 0){
        return '未找到相关物品'
      }
      if (!name.includes('SKIN') || !name.includes('涂装')){
        search = search.filter(item => (item.name && item.name.en && !item.name.en.includes('SKIN')))
      }
      if (!name.includes('Blueprint') || !name.includes('蓝图')){
        search = search.filter(item => (item.name && item.name.en && !item.name.en.includes('Blueprint')))
      }
      if (search.length === 0){
        search = typeIDs.filter(item =>
          (item.name && item.name.zh && item.name.zh.startsWith(name)) ||
          (item.name && item.name.en && item.name.en.toUpperCase().startsWith(name.toUpperCase())) ||
          (item.name && item.name.de && item.name.de.startsWith(name)) ||
          (item.name && item.name.fr && item.name.fr.startsWith(name)) ||
          (item.name && item.name.es && item.name.es.startsWith(name)) ||
          (item.name && item.name.ja && item.name.ja.startsWith(name)) ||
          (item.name && item.name.ru && item.name.ru.startsWith(name))
        )
      }
      let suit = false
      let plex = false
      let ALL_SELL = 0
      let ALL_BUY = 0
      let ALL_MPRICE = 0
      if (search.every(item => item.groupID === 300) && search.length === 6){
        suit = true
      }
      if (search.every(item => item.id === 44992) && search.length === 1){
        plex = true
      }
      const price = []
      for (let i = 0; i < search.length; i++){
        if (i + 1 >= cfg.maxSearch) break
        const buy = (await ctx.http.get(`https://esi.evetech.net/latest/markets/10000002/orders/?datasource=tranquility&order_type=buy&type_id=${search[i].id}`)).map(order => order.price)
        const sell = (await ctx.http.get(`https://esi.evetech.net/latest/markets/10000002/orders/?datasource=tranquility&order_type=sell&type_id=${search[i].id}`)).map(order => order.price)
        const maxbuy = Math.max(...buy)
        const minsell = Math.min(...sell)
        const mprice = (maxbuy + minsell) / 2
        if (cfg.markdown){
          price.push(`## ${search[i].name.zh}/${search[i].name.en}&#10;- 最低卖价：${formatNumberWithCommas(minsell)} ISK&#10;- 最高买价：${formatNumberWithCommas(maxbuy)} ISK&#10;- 平均价格：${formatNumberWithCommas(mprice)} ISK`)
        } else {
          price.push(`${search[i].name.zh}/${search[i].name.en}&#10;  -最低卖价：${formatNumberWithCommas(minsell)} ISK&#10;  -最高买价：${formatNumberWithCommas(maxbuy)} ISK&#10;  -平均价格：${formatNumberWithCommas(mprice)} ISK`)
        }
        if (suit){
          ALL_SELL += minsell
          ALL_BUY  += maxbuy
          ALL_MPRICE += mprice
        }
        if (plex){
          ALL_SELL += minsell
          ALL_BUY  += maxbuy
          ALL_MPRICE += mprice
        }
      }
      if (suit){
        if (cfg.markdown){
          price.push(`## 以上物品总价&#10;- 最低卖价：${formatNumberWithCommas(ALL_SELL)} ISK&#10;- 最高买价：${formatNumberWithCommas(ALL_BUY)} ISK&#10;- 平均价格：${formatNumberWithCommas(ALL_MPRICE)} ISK`)
        } else {
          price.push(`以上物品总价：&#10;  -最低卖价：${formatNumberWithCommas(ALL_SELL)} ISK&#10;  -最高买价：${formatNumberWithCommas(ALL_BUY)} ISK&#10;  -平均价格：${formatNumberWithCommas(ALL_MPRICE)} ISK`)
        }
      }
      if (plex){
        if (cfg.markdown){
          price.push(`## 500x PLEX&#10;- 最低卖价：${formatNumberWithCommas(ALL_SELL * 500)} ISK&#10;- 最高买价：${formatNumberWithCommas(ALL_BUY * 500)} ISK&#10;- 平均价格：${formatNumberWithCommas(ALL_MPRICE * 500)} ISK`)
        } else {
          price.push(`500x PLEX&#10;  -最低卖价：${formatNumberWithCommas(ALL_SELL * 500)} ISK&#10;  -最高买价：${formatNumberWithCommas(ALL_BUY * 500)} ISK&#10;  -平均价格：${formatNumberWithCommas(ALL_MPRICE * 500)} ISK`)
        }
      }
      if (cfg.markdown){
        return h('at', { id: session.userId }) + '.&#10;' + price.join('&#10;&#10;---&#10;')
      } else {
        return h('at', { id: session.userId }) + '.&#10;' + price.join('&#10;--------------------&#10;')
      }
    }
  })
}
