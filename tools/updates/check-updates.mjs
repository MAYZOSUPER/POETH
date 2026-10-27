// Живая проверка обновлений (S10a) без GitHub и без нажатий клавиш/мыши — только CDP:
//   1) пакет данных: локальный манифест с одним изменённым файлом → userData/data/poe1 применён;
//   2) обновление приложения: окно «Вышло обновление v0.1.1» → «Обновить сейчас» → загрузка →
//      POETH закрывается и запускает «установщик» (тестовый exe пишет свои аргументы в файл);
//   3) испорченный пакет данных (--tamper) → откат, прежние данные целы.
//
//   npm run build && node tools/updates/check-updates.mjs
//   node tools/updates/check-updates.mjs --exe=dist-release/win-unpacked/POETH.exe   # упакованная
//
// Окна POETH показываются без перехвата фокуса; клавиатура и мышь не используются.

import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const electronPath = require('electron')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EXE = process.argv.slice(2).find((a) => a.startsWith('--exe='))?.slice(6)
const WORK = mkdtempSync(path.join(tmpdir(), 'poeth-upd-check-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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
// тестовый «установщик»: пишет аргументы запуска в файл и выходит
// ---------------------------------------------------------------------------

const installerExe = path.join(WORK, 'fake-installer.exe')
const MARKER = path.join(WORK, 'installer-ran.txt')
const cs = `
using System; using System.IO;
public static class FakeInstaller {
  public static int Main(string[] args) {
    var p = Environment.GetEnvironmentVariable("POETH_FAKE_INSTALLER_MARKER");
    if (!string.IsNullOrEmpty(p)) File.WriteAllText(p, string.Join(" ", args));
    return 0;
  }
}`
writeFileSync(path.join(WORK, 'fake.cs'), cs)
execFileSync('powershell', [
  '-NoProfile',
  '-Command',
  `Add-Type -TypeDefinition (Get-Content -Raw '${path.join(WORK, 'fake.cs')}') -OutputAssembly '${installerExe}' -OutputType ConsoleApplication`
])

// ---------------------------------------------------------------------------
// пакеты данных: v1 (изменён maps.en.json) и v2 (ещё client_strings.json — его испортим)
// ---------------------------------------------------------------------------

function buildData(dir, version, touch) {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/data/publish-data.mjs'), '--version', version, '--out', dir], { stdio: 'ignore' })
  const m = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  for (const rel of touch) {
    const f = path.join(dir, 'poe1', rel)
    appendFileSync(f, '\n')
    const buf = readFileSync(f)
    m.files[rel] = { sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length }
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2))
}
const DATA1 = path.join(WORK, 'data1')
const DATA2 = path.join(WORK, 'data2')
buildData(DATA1, '3.30.0-test1', ['regex/maps.en.json'])
buildData(DATA2, '3.30.0-test2', ['regex/maps.en.json', 'en/client_strings.json'])

// ---------------------------------------------------------------------------
// сервер, POETH, CDP
// ---------------------------------------------------------------------------

function startServer(dataDir, extra = []) {
  const s = spawn(process.execPath, [path.join(ROOT, 'tools/updates/fake-update-server.mjs'), '--installer', installerExe, '--data', dataDir, ...extra], {
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

const PROFILE = path.join(WORK, 'profile')
writeFileSync(
  path.join(WORK, 'settings.seed.json'),
  JSON.stringify({ schemaVersion: 2, startup: { firstRunDone: true, minimized: true, withWindows: false }, updates: { check: true } })
)

function startPoeth(port, cdpPort) {
  rmSync(path.join(PROFILE, 'settings.json'), { force: true })
  mkdirSync(PROFILE, { recursive: true })
  writeFileSync(path.join(PROFILE, 'settings.json'), readFileSync(path.join(WORK, 'settings.seed.json')))
  const args = [`--remote-debugging-port=${cdpPort}`]
  const p = spawn(EXE ? path.resolve(ROOT, EXE) : electronPath, EXE ? args : [ROOT, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      POETH_USER_DATA_DIR: PROFILE,
      POETH_UPDATE_URL: `http://127.0.0.1:${port}/`,
      POETH_DATA_MANIFEST_URL: `http://127.0.0.1:${port}/data/manifest.json`,
      POETH_UPDATE_DELAY_MS: '2500',
      POETH_FAKE_INSTALLER_MARKER: MARKER
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const log = []
  p.stdout.on('data', (d) => log.push(String(d)))
  p.stderr.on('data', (d) => log.push(String(d)))
  let exited = false
  p.on('exit', () => (exited = true))
  return { proc: p, log, isExited: () => exited }
}

async function targets(cdpPort) {
  try {
    return await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
  } catch {
    return []
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)))
  let id = 0
  const pend = new Map()
  ws.on('message', (d) => {
    const m = JSON.parse(String(d))
    pend.get(m.id)?.(m)
    pend.delete(m.id)
  })
  const ev = (expression) =>
    new Promise((resolve, reject) => {
      const i = ++id
      pend.set(i, (m) => (m.error || m.result?.exceptionDetails ? reject(new Error(JSON.stringify(m.error ?? m.result.exceptionDetails))) : resolve(m.result.result.value)))
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
  return { ws, ev }
}

function kill(p) {
  try {
    execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* already gone */
  }
}

const override = path.join(PROFILE, 'data', 'poe1')
const appliedVersion = () => {
  try {
    return JSON.parse(readFileSync(path.join(override, 'manifest.json'), 'utf8')).version
  } catch {
    return null
  }
}

// ---------------- прогон 1: данные + обновление приложения ----------------
{
  const srv = startServer(DATA1)
  const port = await srv.ready
  const cdpPort = 9700 + Math.floor(Math.random() * 200)
  const app = startPoeth(port, cdpPort)
  try {
    const splash = await waitFor(async () => (await targets(cdpPort)).some((t) => /view=splash/.test(t.url)), 15000, 100)
    check('экран загрузки показан при запуске', splash)
    const startLine = await waitFor(async () => app.log.join('').match(/\[startup\] splash=\w+ companion=(\w+)/)?.[1], 15000)
    check('компаньон не открылся сам (запуск свёрнутым)', startLine === 'hidden', startLine ?? 'нет записи')

    const applied = await waitFor(async () => appliedVersion() === '3.30.0-test1', 30000)
    const files = existsSync(override) ? readdirSync(override, { recursive: true }).map(String).sort() : []
    check('пакет данных применён (manifest.json + только изменённый файл)', applied && JSON.stringify(files) === JSON.stringify(['manifest.json', 'regex', path.join('regex', 'maps.en.json')]), JSON.stringify(files))
    check('скачан только изменённый файл', srv.reqs.filter((r) => r.startsWith('/data/poe1/')).join(',') === '/data/poe1/regex/maps.en.json', srv.reqs.join(','))

    const upd = await waitFor(async () => (await targets(cdpPort)).find((t) => /view=update/.test(t.url)), 30000)
    check('окно «Вышло обновление» открылось', !!upd)
    if (upd) {
      const u = await connect(upd.webSocketDebuggerUrl)
      const text = await waitFor(async () => {
        const t = await u.ev("document.querySelector('.svc--update')?.innerText ?? ''")
        return /0\.1\.1/.test(t) ? t : null
      }, 10000)
      check('в окне версия и «что нового»', !!text && /Тестовый релиз/.test(text) && !/<li>/.test(text), text?.replace(/\s+/g, ' ').slice(0, 140))
      await u.ev("document.querySelector('.svc--update .ui-btn--primary').click()")
      const ran = await waitFor(async () => existsSync(MARKER) && readFileSync(MARKER, 'utf8'), 60000, 500)
      check('«Обновить сейчас» → загрузка → запуск установщика', !!ran && /--updated/.test(ran) && /\/S/.test(ran), ran || 'нет')
      check('POETH закрылся для установки', await waitFor(async () => app.isExited(), 15000))
      u.ws.close()
    }
  } catch (e) {
    check('прогон 1', false, e.message)
  } finally {
    kill(app.proc)
    srv.proc.kill()
    writeFileSync(path.join(WORK, 'poeth-run1.log'), app.log.join(''))
    await sleep(700)
  }
}

// ---------------- прогон 2: испорченный пакет данных → откат ----------------
{
  const srv = startServer(DATA2, ['--tamper', 'en/client_strings.json'])
  const port = await srv.ready
  const cdpPort = 9700 + Math.floor(Math.random() * 200)
  const app = startPoeth(port, cdpPort)
  try {
    const rolled = await waitFor(async () => app.log.join('').match(/\[data\] update 3\.30\.0-test2 rolled back: (.*)/)?.[1], 40000)
    check('испорченный файл → откат', !!rolled, rolled ?? 'нет записи в логе')
    check('прежний пакет данных цел', appliedVersion() === '3.30.0-test1', String(appliedVersion()))
    const leftovers = existsSync(path.join(PROFILE, 'data')) ? readdirSync(path.join(PROFILE, 'data')).filter((n) => n.startsWith('.')) : []
    check('временных папок не осталось', leftovers.length === 0, leftovers.join(','))
  } catch (e) {
    check('прогон 2', false, e.message)
  } finally {
    kill(app.proc)
    srv.proc.kill()
    writeFileSync(path.join(WORK, 'poeth-run2.log'), app.log.join(''))
    await sleep(500)
  }
}

// кэш тестового апдейтера (%LOCALAPPDATA%/poeth-updater-test) — не оставлять у пользователя
if (process.env.LOCALAPPDATA) rmSync(path.join(process.env.LOCALAPPDATA, 'poeth-updater-test'), { recursive: true, force: true })

const bad = results.filter((x) => !x).length
console.log(`\n${results.length - bad}/${results.length} проверок · логи: ${WORK}`)
process.exit(bad ? 1 : 0)
