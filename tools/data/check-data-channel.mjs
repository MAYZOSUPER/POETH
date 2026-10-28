// Сквозная проверка канала данных без переустановки (S12) — на упакованной сборке или из исходников.
// Без клавиатуры и мыши, отдельный профиль (POETH_USER_DATA_DIR), без тостов Windows
// (POETH_NO_WINDOWS_TOASTS=1 — текст тоста пишется в лог «[notify] …»):
//   0) настоящий канал: публичный манифест (links.DATA_MANIFEST_URL) валиден, файлы совпадают по sha256;
//      POETH против него — пакет равен встроенным данным → ничего не качает и не ругается;
//   1) пакет новее встроенного (локальный сервер) → скачан, проверен, применён, «Данные обновлены»,
//      poeth://data отдаёт новый файл;
//   2) испорченный файл пакета (неверный sha256) → откат, надстройки нет, poeth://data — встроенные данные;
//   3) сети нет (закрытый порт) → тихо: без тоста, без надстройки, приложение живо.
//
//   npm run package:dir && node tools/data/check-data-channel.mjs --exe=dist-release/win-unpacked/POETH.exe
//   npm run build && node tools/data/check-data-channel.mjs                     # из исходников
//   node tools/data/check-data-channel.mjs --skip-live                          # без сети

import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const electronPath = require('electron')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const EXE = argv.find((a) => a.startsWith('--exe='))?.slice(6)
const SKIP_LIVE = argv.includes('--skip-live')
const LIVE_URL = 'https://raw.githubusercontent.com/MAYZOSUPER/POETH/data/manifest.json'
const WORK = mkdtempSync(path.join(tmpdir(), 'poeth-data-check-'))
const BUNDLED = path.join(ROOT, 'resources/data/poe1')
// файл, который меняем в тестовом пакете; отдаётся по poeth://data/<game>/<lang>/<file>
const PROBE = 'en/client_strings.json'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const results = []
const check = (name, ok, detail = '') => {
  results.push(!!ok)
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
async function waitFor(fn, ms = 20000, step = 250) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const v = await fn()
    if (v) return v
    await sleep(step)
  }
  return null
}

// ---------------------------------------------------------------------------
// пакеты: «новее встроенного» (изменён PROBE) и «испорченный» (тот же, сервер портит PROBE)
// ---------------------------------------------------------------------------

function buildData(dir, version) {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/data/publish-data.mjs'), '--version', version, '--out', dir], { stdio: 'ignore' })
  const m = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const f = path.join(dir, 'poe1', PROBE)
  appendFileSync(f, '\n')
  const buf = readFileSync(f)
  m.files[PROBE] = { sha256: sha(buf), size: buf.length }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2))
  return buf.length
}
const NEW = path.join(WORK, 'data-new')
const newSize = buildData(NEW, '9.9.9-check')
const bundledSize = statSync(path.join(BUNDLED, PROBE)).size

function startServer(dataDir, extra = []) {
  const s = spawn(process.execPath, [path.join(ROOT, 'tools/updates/fake-update-server.mjs'), '--data', dataDir, ...extra], {
    stdio: ['ignore', 'pipe', 'inherit']
  })
  const reqs = []
  const ready = new Promise((resolve) => {
    readline.createInterface({ input: s.stdout }).on('line', (l) => {
      const e = JSON.parse(l)
      if (e.port) resolve(e.port)
      if (e.req) reqs.push(e.req)
    })
  })
  return { proc: s, ready, reqs }
}

/** Порт, на котором никто не слушает (сеть «недоступна»: соединение отклоняется). */
async function closedPort() {
  const srv = net.createServer()
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const { port } = srv.address()
  await new Promise((r) => srv.close(r))
  return port
}

// ---------------------------------------------------------------------------
// POETH
// ---------------------------------------------------------------------------

function startPoeth(name, env) {
  const profile = path.join(WORK, `profile-${name}`)
  mkdirSync(profile, { recursive: true })
  writeFileSync(
    path.join(profile, 'settings.json'),
    JSON.stringify({ schemaVersion: 2, uiLang: 'ru', startup: { firstRunDone: true, minimized: true, withWindows: false }, updates: { check: true } })
  )
  const cdpPort = 9500 + Math.floor(Math.random() * 400)
  const args = [`--remote-debugging-port=${cdpPort}`]
  const p = spawn(EXE ? path.resolve(ROOT, EXE) : electronPath, EXE ? args : [ROOT, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      POETH_USER_DATA_DIR: profile,
      POETH_UPDATE_DELAY_MS: '2500',
      // без тостов Windows: Electron при первом тосте ставит ярлык и COM-ключ на проверяемый exe
      POETH_NO_WINDOWS_TOASTS: '1',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const log = []
  p.stdout.on('data', (d) => log.push(String(d)))
  p.stderr.on('data', (d) => log.push(String(d)))
  let exited = false
  p.on('exit', () => (exited = true))
  return { proc: p, log, text: () => log.join(''), profile, cdpPort, isExited: () => exited }
}

function kill(p) {
  try {
    execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* уже нет */
  }
}

/** Размер файла, который приложение отдаёт по poeth://data (из окна компаньона, CDP). */
async function servedSize(app, rel) {
  const list = await waitFor(async () => {
    try {
      const l = await (await fetch(`http://127.0.0.1:${app.cdpPort}/json/list`)).json()
      return l.find((t) => t.type === 'page' && /index\.html/.test(t.url)) ? l : null
    } catch {
      return null
    }
  }, 20000)
  const page = list?.find((t) => t.type === 'page' && /index\.html/.test(t.url))
  if (!page) return null
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)))
  const expression = `fetch('poeth://data/poe1/${rel}').then(r => r.ok ? r.arrayBuffer().then(b => b.byteLength) : -r.status)`
  const value = await new Promise((resolve) => {
    ws.on('message', (d) => {
      const m = JSON.parse(String(d))
      if (m.id === 1) resolve(m.result?.result?.value ?? null)
    })
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
  ws.close()
  return value
}

const overrideFiles = (app) => {
  const dir = path.join(app.profile, 'data')
  return existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).sort() : []
}
const notifyLine = (app) => app.text().match(/\[notify\] .*(?:Данные обновлены|Data updated).*/)?.[0] ?? null

async function run(name, env, body) {
  const app = startPoeth(name, env)
  try {
    await body(app)
  } catch (e) {
    check(`прогон «${name}»`, false, e.message)
  } finally {
    kill(app.proc)
    writeFileSync(path.join(WORK, `poeth-${name}.log`), app.text())
    await sleep(600)
  }
}

console.log(`POETH: ${EXE ? path.resolve(ROOT, EXE) : 'из исходников (electron .)'}\n`)

// ---------------- 0) настоящий канал ----------------
if (!SKIP_LIVE) {
  try {
    const m = await (await fetch(LIVE_URL, { headers: { 'Cache-Control': 'no-cache' } })).json()
    const files = Object.entries(m.files ?? {})
    check('публичный манифест доступен и валиден', m.game === 'poe1' && typeof m.version === 'string' && files.length > 0, `${LIVE_URL} → ${m.game} ${m.version}, ${files.length} файлов`)
    let same = 0
    let fetched = 0
    for (const [rel, f] of files) {
      const local = existsSync(path.join(BUNDLED, rel)) ? sha(readFileSync(path.join(BUNDLED, rel))) : null
      if (local === f.sha256) same++
    }
    for (const rel of ['regex/maps.en.json', 'en/stats.ndjson']) {
      const buf = Buffer.from(await (await fetch(new URL(`poe1/${rel}`, LIVE_URL))).arrayBuffer())
      if (sha(buf) === m.files[rel]?.sha256 && buf.length === m.files[rel]?.size) fetched++
    }
    check('файлы канала совпадают с манифестом по sha256 и размеру', fetched === 2, `${fetched}/2`)
    check('пакет канала = встроенные данные этой сборки', same === files.length, `${same}/${files.length} совпадают`)

    await run('live', { POETH_UPDATE_URL: `http://127.0.0.1:${await closedPort()}/` }, async (app) => {
      // дошёл до манифеста, всё совпало со встроенным — ничего не качает, надстройки нет
      const line = await waitFor(async () => app.text().match(/\[data\] poe1 \S+: up to date/)?.[0], 40000)
      const t = app.text()
      const clean = !/\[data\] (update check failed|manifest skipped|update .* rolled back)/.test(t)
      check('POETH против настоящего канала: данные актуальны, ничего не скачано', !!line && clean && overrideFiles(app).length === 0, line ?? 'нет записи в логе')
    })
  } catch (e) {
    check('настоящий канал', false, e.message)
  }
}

// ---------------- 1) пакет новее встроенного ----------------
{
  const srv = startServer(NEW)
  const port = await srv.ready
  await run('newer', { POETH_DATA_MANIFEST_URL: `http://127.0.0.1:${port}/data/manifest.json`, POETH_UPDATE_URL: `http://127.0.0.1:${await closedPort()}/` }, async (app) => {
    const applied = await waitFor(async () => app.text().match(/\[data\] poe1 9\.9\.9-check: (\d+) files, (\d+) downloaded/), 40000)
    check('пакет скачан, проверен и применён', !!applied, applied ? applied[0] : 'нет записи в логе')
    check('скачан только изменённый файл', srv.reqs.filter((r) => r.startsWith('/data/poe1/')).join(',') === `/data/poe1/${PROBE}`, srv.reqs.join(','))
    const files = overrideFiles(app)
    const want = ['poe1', 'poe1/manifest.json', `poe1/${path.posix.dirname(PROBE)}`, `poe1/${PROBE}`].map((p) => p.split('/').join(path.sep)).sort()
    check('надстройка: manifest.json + изменённый файл', JSON.stringify(files) === JSON.stringify(want), files.join(','))
    const toast = await waitFor(async () => notifyLine(app), 5000)
    check('тост «Данные обновлены»', !!toast, toast ?? 'нет')
    const size = await servedSize(app, PROBE)
    check('poeth://data отдаёт новый файл', size === newSize, `${size} байт (новый ${newSize}, встроенный ${bundledSize})`)
  })
  srv.proc.kill()
}

// ---------------- 2) испорченный файл → откат ----------------
{
  const srv = startServer(NEW, ['--tamper', PROBE])
  const port = await srv.ready
  await run('tampered', { POETH_DATA_MANIFEST_URL: `http://127.0.0.1:${port}/data/manifest.json`, POETH_UPDATE_URL: `http://127.0.0.1:${await closedPort()}/` }, async (app) => {
    const rolled = await waitFor(async () => app.text().match(/\[data\] update 9\.9\.9-check rolled back: (.*)/)?.[1], 40000)
    check('неверный sha256 → откат', !!rolled, rolled ?? 'нет записи в логе')
    const left = overrideFiles(app)
    check('надстройки и временных папок нет', left.length === 0, left.join(',') || 'пусто')
    check('тоста нет', !notifyLine(app))
    const size = await servedSize(app, PROBE)
    check('приложение работает на встроенных данных', size === bundledSize, `${size} байт (встроенный ${bundledSize})`)
  })
  srv.proc.kill()
}

// ---------------- 3) сети нет ----------------
{
  const port = await closedPort()
  await run('offline', { POETH_DATA_MANIFEST_URL: `http://127.0.0.1:${port}/data/manifest.json`, POETH_UPDATE_URL: `http://127.0.0.1:${port}/` }, async (app) => {
    const failed = await waitFor(async () => app.text().match(/\[data\] update check failed: (.*)/)?.[1], 30000)
    check('сети нет → проверка тихо не удалась (только лог)', !!failed, failed ?? 'нет записи в логе')
    check('без тоста и без надстройки', !notifyLine(app) && overrideFiles(app).length === 0)
    const size = await servedSize(app, PROBE)
    check('приложение живо, данные встроенные', !app.isExited() && size === bundledSize, `${size} байт`)
  })
}

const bad = results.filter((x) => !x).length
console.log(`\n${results.length - bad}/${results.length} проверок · логи и профили: ${WORK}`)
if (!bad) rmSync(WORK, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
