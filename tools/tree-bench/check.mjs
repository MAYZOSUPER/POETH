// Проверка наложения дерева этапа на стенде (S38), без игры и без нажатий: окно «Path of Exile» со своим
// рисунком дерева (bench.cjs) + POETH из out/ (npm run build) со своим профилем, POETH_BUILD=1,
// POETH_TREE_POB (код билда), POETH_TREE_SHOW=1 (наложение само показывается, когда «игра» в фокусе).
// Сверка: центры колец наложения (CDP, страница оверлея) против нод стенда (его своя формула) — по hash.
//
//   npm run build && node tools/tree-bench/check.mjs
//   node tools/tree-bench/check.mjs --scale=1.25          # масштаб Windows 125 % у обоих окон
//   node tools/tree-bench/check.mjs --size=1920x1080 --shot=<файл.png>
//   node tools/tree-bench/check.mjs --force               # не ждать, пока за ПК никого не будет
//
// Клавиш не жмёт и мышь не двигает; окно стенда выходит на передний план (иначе оверлей не показывается) —
// поэтому не запускается, если за ПК работали последние 60 с. Закрывает только свои процессы по PID.

import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const electronPath = require('electron')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const opt = (name) => {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`))
  return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true
}
const SCALE = opt('scale')
const SIZE = String(opt('size') ?? '1600x900')
const POB = String(opt('pob') ?? 'tests/fixtures/pob/pobbin-acts-all-axes.txt')
const SHOT = opt('shot')
const FORCE = !!opt('force')
const CDP_PORT = 9400 + Math.floor(Math.random() * 300)
const IDLE_REQUIRED_MS = 60_000
/** допустимое расхождение центра кольца и ноды стенда, CSS-пиксели */
const TOLERANCE_PX = 1.5

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// WinAPI-помощник S1 (сколько мс не было ввода, снимок экрана не делает — см. shot())
const ps = spawn('powershell', ['-NoProfile', '-Command', readFileSync(path.join(ROOT, 'tools/overlay/foreground.ps1'), 'utf8')], {
  stdio: ['pipe', 'pipe', 'inherit']
})
const psQueue = []
readline.createInterface({ input: ps.stdout }).on('line', (line) => psQueue.shift()?.(line.trim()))
const psCmd = (line) =>
  new Promise((resolve) => {
    psQueue.push(resolve)
    ps.stdin.write(line + '\n')
  })

// ---------------------------------------------------------------------------- стенд

let bench
const benchEvents = []
const benchWaiters = []
function startBench() {
  const args = [path.join(ROOT, 'tools/tree-bench/bench.cjs'), `--size=${SIZE}`, `--pob=${POB}`, '--frameless']
  if (SCALE) args.push(`--force-device-scale-factor=${SCALE}`)
  bench = spawn(electronPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] })
  readline.createInterface({ input: bench.stdout }).on('line', (line) => {
    let e
    try {
      e = JSON.parse(line)
    } catch {
      return
    }
    benchEvents.push(e)
    for (const w of [...benchWaiters]) if (w.test(e)) w.resolve(e)
  })
}
const waitBench = (test, ms) =>
  new Promise((resolve, reject) => {
    const hit = benchEvents.find(test)
    if (hit) return resolve(hit)
    benchWaiters.push({ test, resolve })
    setTimeout(() => reject(new Error('стенд не ответил')), ms)
  })
let benchPort = 0
const benchCmd = async (msg) =>
  (await fetch(`http://127.0.0.1:${benchPort}/`, { method: 'POST', body: JSON.stringify(msg) })).json()

// ---------------------------------------------------------------------------- POETH + CDP

let poeth
const poethLog = []
let cdp
let cdpSeq = 0
const cdpPending = new Map()

async function connectOverlay() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      const t = list.find((x) => x.type === 'page' && /overlay\.html/.test(x.url))
      if (t) {
        cdp = new WebSocket(t.webSocketDebuggerUrl)
        await new Promise((res, rej) => {
          cdp.once('open', res)
          cdp.once('error', rej)
        })
        cdp.on('message', (data) => {
          const msg = JSON.parse(String(data))
          const cb = cdpPending.get(msg.id)
          if (cb) {
            cdpPending.delete(msg.id)
            cb(msg)
          }
        })
        return
      }
    } catch {
      /* ещё не поднялся */
    }
    await sleep(250)
  }
  throw new Error('страница оверлея не найдена через CDP')
}

function evaluate(expression) {
  const id = ++cdpSeq
  return new Promise((resolve, reject) => {
    cdpPending.set(id, (msg) => {
      if (msg.error || msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.error ?? msg.result.exceptionDetails)))
      else resolve(msg.result.result.value)
    })
    cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
}

/** Центры колец наложения (CSS-пиксели окна оверлея) по hash. */
const rings = () =>
  evaluate(`(() => Object.fromEntries([...document.querySelectorAll('.bt-svg circle[data-hash]')].map((c) => {
    const r = c.getBoundingClientRect(); return [c.dataset.hash, { x: r.left + r.width / 2, y: r.top + r.height / 2 }] })))()`)

/** Клик по кнопке плашки через CDP (событие только странице оверлея — в ОС и игру ничего не уходит). */
const clickPanel = (sel) => evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b || b.disabled) return false; b.click(); return true })()`)

async function waitFor(fn, ms = 4000, step = 100) {
  const until = Date.now() + ms
  let v
  while (Date.now() < until) {
    v = await fn()
    if (v) return v
    await sleep(step)
  }
  return v
}

/** Сверить кольца с нодами стенда: сколько общих hash и наибольшее расхождение. */
async function compare(label) {
  const st = await benchCmd({ cmd: 'state' })
  const got = await rings()
  let n = 0
  let max = 0
  let worst = null
  for (const p of st.points) {
    const r = got[String(p.hash)]
    if (!r) continue
    n++
    const d = Math.hypot(r.x - p.x, r.y - p.y)
    if (d > max) {
      max = d
      worst = { hash: p.hash, bench: p, overlay: r }
    }
  }
  check(`${label}: кольца на нодах стенда`, n >= 5 && max <= TOLERANCE_PX, `нод ${n}, расхождение до ${max.toFixed(2)} px${worst && max > TOLERANCE_PX ? ` (${JSON.stringify(worst)})` : ''}`)
  return { n, max }
}

/** Снимок области окна стенда (System.Drawing) — посмотреть глазами. */
function shot(file, b) {
  const k = Number(SCALE ?? 1)
  const [x, y, w, h] = [b.x, b.y, b.width, b.height].map((v) => Math.round(v * k))
  const script = `Add-Type -AssemblyName System.Drawing; $bmp = New-Object System.Drawing.Bitmap ${w}, ${h};
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(${x}, ${y}, 0, 0, $bmp.Size); $bmp.Save('${file.replace(/'/g, "''")}'); $g.Dispose(); $bmp.Dispose()`
  execFileSync('powershell', ['-NoProfile', '-Command', script])
  console.log(`  снимок: ${file}`)
}

// ---------------------------------------------------------------------------- сценарий

async function main() {
  const idle = Number(await psCmd('idle'))
  if (!FORCE && !(idle >= IDLE_REQUIRED_MS)) throw new Error(`за ПК работают (ввод ${Math.round(idle / 1000)} с назад) — запустите позже или с --force`)

  startBench()
  const ready = await waitBench((e) => e.evt === 'ready', 20000)
  benchPort = ready.port
  console.log(`стенд: pid ${bench.pid}, окно ${JSON.stringify(ready.bounds)}`)

  const profile = mkdtempSync(path.join(tmpdir(), 'poeth-s38-'))
  writeFileSync(
    path.join(profile, 'settings.json'),
    JSON.stringify({ schemaVersion: 2, startup: { firstRunDone: true, minimized: true, withWindows: false } })
  )
  const gameLog = path.join(profile, 'Client.txt')
  writeFileSync(gameLog, '')
  const appArgs = [ROOT, `--remote-debugging-port=${CDP_PORT}`]
  if (SCALE) appArgs.push(`--force-device-scale-factor=${SCALE}`)
  poeth = spawn(electronPath, appArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      POETH_USER_DATA_DIR: profile,
      POETH_GAME_LOG: gameLog,
      POETH_NO_WINDOWS_TOASTS: '1',
      POETH_BUILD: '1',
      POETH_TREE_POB: path.resolve(ROOT, POB),
      POETH_TREE_SHOW: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  poeth.stdout.on('data', (d) => poethLog.push(String(d)))
  poeth.stderr.on('data', (d) => poethLog.push(String(d)))
  console.log(`POETH: pid ${poeth.pid}, профиль ${profile}`)

  await connectOverlay()
  await sleep(1500)
  await benchCmd({ cmd: 'focus' })
  const shown = await waitFor(() => evaluate("document.querySelectorAll('.bt-svg circle[data-hash]').length"), 8000)
  check('наложение показалось само (POETH_TREE_SHOW), когда «игра» в фокусе', shown > 0, `колец ${shown}`)
  if (!shown) {
    const s = await evaluate('window.overlayApi.buildTree.state()')
    const o = await evaluate('window.overlayApi.overlay.getState()')
    console.log('  состояние наложения:', JSON.stringify({ ...s, drawing: s.drawing ? `${s.drawing.nodes.length} нод` : null }))
    console.log('  оверлей:', JSON.stringify({ status: o.status, focus: o.focus }))
    return
  }

  const st = await evaluate('window.overlayApi.buildTree.state()')
  check('этап из кода PoB', !!st.stage, JSON.stringify(st.stage))
  // ±0,2 %: автоподгонка по снимку стенда уточняет масштаб наименьшими квадратами
  check('после входа: z = 2 (точек на единицу дерева = высота окна / 10000 · 2)', st.view && st.client && Math.abs((st.view.scale * 10000) / (2 * st.client.height) - 1) < 2e-3, JSON.stringify({ view: st.view, client: st.client }))
  await compare('после входа (круг класса в центре)')
  if (SHOT) shot(String(SHOT), ready.bounds)

  // этап → следующий: другой набор колец, снова на нодах стенда (стенд рисует свой этап — сверяем общие ноды)
  const before = await rings()
  check('кнопка «следующий этап» на плашке', await clickPanel('.bt-panel button[aria-label]:not(.bt-flip)'))
  await sleep(300)
  const after = await rings()
  check('этап сменился — кольца другие', Object.keys(after).join() !== Object.keys(before).join(), `было ${Object.keys(before).length}, стало ${Object.keys(after).length}`)
  await compare('следующий этап')

  // стенд потянули командой (как игрок мышью, но без мыши) → «В центр» на плашке и стенд в центр — снова совпадает
  await benchCmd({ cmd: 'pan', dx: 240, dy: -130 })
  await benchCmd({ cmd: 'reset' })
  check('кнопка «В центр»', await clickPanel('.bt-panel__row > button.ui-btn--sm:not(.ui-btn--icon)'))
  await sleep(300)
  await compare('после «В центр»')

  // плашка — кликабельный прямоугольник в main (над ней мышь не двигает дерево)
  const panel = await evaluate("(() => { const r = document.querySelector('.bt-panel').getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top } })()")
  check('плашка этапа сверху по центру', panel.w > 100 && panel.top < 80, JSON.stringify(panel))
}

let failed = false
try {
  await main()
} catch (e) {
  failed = true
  console.error('✗', e.message)
} finally {
  try {
    if (benchPort) await benchCmd({ cmd: 'quit' })
  } catch {
    /* уже закрыт */
  }
  for (const p of [poeth, bench])
    if (p?.pid)
      try {
        execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        /* уже вышел */
      }
  ps.kill()
  const bad = results.filter((r) => !r.ok)
  console.log(`\nитого: ${results.length - bad.length}/${results.length}`)
  if (bad.length || failed) {
    console.log('--- лог POETH (хвост) ---\n' + poethLog.join('').split('\n').slice(-40).join('\n'))
    process.exitCode = 1
  }
}
