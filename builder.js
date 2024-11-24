'use strict'
const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const filePath = path.join(__dirname, 'types.yaml')
const content = fs.readFileSync(filePath, 'utf8')
const data = yaml.load(content)
const newFile = []
for (const key in data) {
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    if (!data[key].marketGroupID) continue
    newFile.push({
      id: key,
      name: data[key].name,
      groupID: data[key].groupID
    })
  }
}
const newFileContent = JSON.stringify(newFile)
const newFilePath = path.join(__dirname, 'types.json')
fs.writeFileSync(newFilePath, newFileContent)
const readStream = fs.createReadStream(path.join(__dirname, 'types.json'))
const writeStream = fs.createWriteStream(path.join(__dirname, 'types.json.gz'))
const gzip = zlib.createGzip()
readStream.pipe(gzip).pipe(writeStream)
writeStream.on('finish', () => fs.unlinkSync(path.join(__dirname, 'types.json')))
