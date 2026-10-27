// Локальный сервер обновлений для проверки без GitHub (S10a). Отдаёт:
//   /latest.yml, /<installer>          — «релиз» для electron-updater (generic provider)
//   /data/manifest.json, /data/<game>/… — пакет данных для обновления без переустановки
//
//   node tools/updates/fake-update-server.mjs --installer <exe> [--version 0.1.1] [--port 0]
//          [--data dist-data] [--tamper en/stats.ndjson]
//
// Приложение направляется сюда переменными (только loopback):
//   POETH_UPDATE_URL=http://127.0.0.1:<порт>/
//   POETH_DATA_MANIFEST_URL=http://127.0.0.1:<порт>/data/manifest.json
// --tamper <путь> отдаёт этот файл пакета с испорченным содержимым — проверка отката.
// Печатает JSON-строку {"port":…} в stdout, когда готов; запросы — в stdout ({"req":"/…"}).

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}

const version = arg('version', '0.1.1')
const installerPath = arg('installer', '')
const dataDir = arg('data', '')
const tamper = arg('tamper', '')
const port = Number(arg('port', '0'))

const installerName = `POETH-Setup-${version}.exe`
const installer = installerPath ? await fs.readFile(installerPath) : Buffer.from('not an installer')
const sha512 = createHash('sha512').update(installer).digest('base64')

const notes = [
  '<h2>Что нового</h2>',
  '<ul><li>Тестовый релиз с локального сервера</li><li>Проверка окна «Вышло обновление»</li></ul>',
  '<p>What’s new: local test release.</p>'
].join('')

const latestYml = [
  `version: ${version}`,
  'files:',
  `  - url: ${installerName}`,
  `    sha512: ${sha512}`,
  `    size: ${installer.length}`,
  `path: ${installerName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  `releaseNotes: '${notes.replace(/'/g, "''")}'`,
  ''
].join('\n')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  process.stdout.write(JSON.stringify({ req: url.pathname }) + '\n')
  try {
    if (url.pathname === '/latest.yml') {
      res.writeHead(200, { 'content-type': 'text/yaml' }).end(latestYml)
      return
    }
    if (url.pathname === `/${installerName}`) {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': installer.length }).end(installer)
      return
    }
    if (dataDir && url.pathname.startsWith('/data/')) {
      const rel = decodeURIComponent(url.pathname.slice('/data/'.length))
      if (rel.includes('..')) throw new Error('bad path')
      let buf = await fs.readFile(path.join(dataDir, rel))
      if (tamper && rel.endsWith(`/${tamper}`)) {
        buf = Buffer.from(buf) // та же длина, другое содержимое → sha256 не совпадёт
        buf[0] = buf[0] ^ 0xff
      }
      res.writeHead(200).end(buf)
      return
    }
    res.writeHead(404).end('not found')
  } catch {
    res.writeHead(404).end('not found')
  }
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ port: server.address().port, version, installer: installerName }) + '\n')
})
