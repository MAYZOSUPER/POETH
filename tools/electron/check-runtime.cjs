// Проверка рантайма после смены версии Electron (S34): без игры и без POETH — нативные модули, поток
// распознавания, safeStorage, electron-updater, буфер обмена. Модули и код берутся из сборки (app.asar)
// или из рабочей копии (node_modules + out/ после `npm run build`).
//
//   npx electron tools/electron/check-runtime.cjs                                   # node_modules + out/
//   npx electron tools/electron/check-runtime.cjs --app=dist-release/win-unpacked/resources/app.asar
//   npx electron tools/electron/check-runtime.cjs --interactive                     # + окно, клавиша, буфер
//
// Без --interactive окон нет, клавиши и буфер обмена не трогаются. С --interactive (как
// tools/overlay/check-overlay.mjs — только когда за ПК 2 минуты никого, --force — всё равно):
//  - тестовое окно (fake-game.cjs, отдельный процесс) с уникальным заголовком (не «Path of Exile» — к игре не цепляемся),
//    attach electron-overlay-window, снимок окна (захват стакана S28);
//  - uiohook ловит F24, нажатую в это окно (keyTap);
//  - буфер обмена: текст + HTML + RTF + картинка — снимок и возврат на API Electron 44 (как HostClipboard);
//    буфер пользователя сохраняется и возвращается в конце.

const { app, BrowserWindow, clipboard, ClipboardItem, nativeImage, safeStorage } = require('electron')
const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { Worker } = require('worker_threads')

const ROOT = path.resolve(__dirname, '../..')
const arg = (n) => {
  const a = process.argv.find((x) => x === `--${n}` || x.startsWith(`--${n}=`))
  return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true
}
const APP = typeof arg('app') === 'string' ? path.resolve(ROOT, arg('app')) : ROOT
const INTERACTIVE = !!arg('interactive')
const FORCE = !!arg('force')
/** resources/ocr: в сборке — extraResources (<resources>/resources/ocr), в рабочей копии — resources/ocr */
const OCR_DIR = APP === ROOT ? path.join(ROOT, 'resources/ocr') : path.join(path.dirname(APP), 'resources/ocr')
const FIX = path.join(ROOT, 'tests/fixtures/ocr/poe1')
const TITLE = 'POETH S34 runtime check'

app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'poeth-s34-runtime-')))

const results = []
function check(name, ok, detail = '') {
  results.push(!!ok)
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const req = (mod) => require(path.join(APP, 'node_modules', mod))

function idleMs() {
  const ps = `Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Idle { [StructLayout(LayoutKind.Sequential)] public struct LII { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LII p);
public static uint Ms() { var li = new LII(); li.cbSize = (uint)Marshal.SizeOf(li); GetLastInputInfo(ref li); return unchecked((uint)Environment.TickCount - li.dwTime); } }
"@; [Idle]::Ms()`
  return Number(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim())
}

// ---------------------------------------------------------------------------
// поток распознавания стакана (S28): worker из сборки, tesseract из resources/ocr
// ---------------------------------------------------------------------------

/** как в tests/ocr/read.test.ts (стакан Valdo's Puzzle Box за Chaos Orb, EN-клиент) */
const EXPECTED = [
  [1, 296, 2],
  [1, 299, 1],
  [1, 303, 16],
  [1, 310, 1],
  [1, 318, 6],
  [1, 318, 200]
]

function bitmapOf(file) {
  const img = nativeImage.createFromPath(file)
  const { width, height } = img.getSize()
  return { width, height, data: new Uint8Array(img.toBitmap()) } // BGRA, как снимок окна игры
}

async function checkOcrWorker() {
  const chunks = path.join(APP, 'out/main/chunks')
  const file = fs.readdirSync(chunks).find((f) => /^worker-.*\.js$/.test(f))
  if (!file) return check('поток OCR: worker-*.js в out/main/chunks', false, 'нет файла — npm run build')
  const w = new Worker(path.join(chunks, file), { workerData: { dir: OCR_DIR } })
  let seq = 0
  const ask = (img, hint) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      const t = setTimeout(() => reject(new Error('timeout')), 15000)
      const onMsg = (r) => {
        if (r.id !== id) return
        clearTimeout(t)
        w.off('message', onMsg)
        resolve(r)
      }
      w.on('message', onMsg)
      w.postMessage({ id, img, hint }, [img.data.buffer])
    })
  try {
    const t0 = Date.now()
    const r = await ask(bitmapOf(path.join(FIX, 'market-ratio-alt-en.png')), 13)
    const rows = r.ok && r.table ? r.table.rows.map((x) => [x.want.value, x.have.value, x.stock.value]) : null
    const sure = r.ok && r.table ? r.table.rows.every((x) => x.want.sure && x.have.sure && x.stock.sure) : false
    check('поток OCR (worker_threads + wasm): стакан прочитан ровно', JSON.stringify(rows) === JSON.stringify(EXPECTED) && sure,
      `${Date.now() - t0} мс с загрузкой модели · ${r.ok ? JSON.stringify(rows) : r.error}`)
    const r2 = await ask(bitmapOf(path.join(FIX, 'exchange-window-en.png')), 13)
    check('поток OCR: окно обмена без Alt — «стакан не найден»', r2.ok && r2.table === null, r2.ok ? `ms=${r2.ms}` : r2.error)
  } catch (e) {
    check('поток OCR', false, String(e))
  } finally {
    await w.terminate()
  }
}

// ---------------------------------------------------------------------------
// буфер обмена (интерактивно): то же, что HostClipboard в src/main/input/hostClipboard.ts
// ---------------------------------------------------------------------------

const KEPT = ['text/plain', 'text/html', 'text/rtf', 'image/png']

async function snapshot() {
  const snap = {}
  const [item] = await clipboard.read()
  if (!item) return snap
  for (const type of KEPT) {
    const has = type === 'image/png' ? item.types.some((t) => t.startsWith('image/')) : item.types.includes(type)
    if (!has) continue
    const blob = await item.getType(type)
    if (blob.size > 0) snap[type] = blob
  }
  return snap
}
async function restore(s) {
  if (Object.keys(s).length > 0) await clipboard.write([new ClipboardItem(s)])
  else clipboard.clear()
}

async function checkClipboard() {
  const user = await snapshot()
  try {
    // «буфер игрока»: текст + HTML + RTF + картинка 64×48 (как копия из браузера/Word)
    const png = nativeImage.createFromBitmap(Buffer.alloc(64 * 48 * 4, 0x7f), { width: 64, height: 48 }).toPNG()
    const rich = {
      'text/plain': 'пароль игрока 🙂',
      'text/html': '<b>жирный</b> текст',
      'text/rtf': '{\\rtf1\\ansi bold}',
      'image/png': new Blob([png], { type: 'image/png' })
    }
    await clipboard.write([new ClipboardItem(rich)])
    const [it] = await clipboard.read()
    check('буфер: read() видит text/plain, text/html, text/rtf, image/png', KEPT.every((t) => it.types.includes(t)), it.types.join(', '))

    let t0 = performance.now()
    const snap = await snapshot()
    const snapMs = performance.now() - t0
    // лень read(): элемент, полученный ДО смены буфера, отдаёт новое содержимое — поэтому снимок читаем сразу
    const [lazy] = await clipboard.read()
    clipboard.clear()
    await clipboard.writeText('Item Class: Stackable Currency\r\nRarity: Currency\r\nChaos Orb')
    const lazyText = await (await lazy.getType('text/plain')).text().catch(() => '(нет)')
    check('буфер: элемент read() ленивый (поэтому снимок читается сразу)', lazyText.startsWith('Item Class'), lazyText.slice(0, 30))

    t0 = performance.now()
    await restore(snap)
    const restoreMs = performance.now() - t0
    const back = await snapshot()
    const text = await clipboard.readText()
    const html = back['text/html'] ? await back['text/html'].text() : ''
    const rtf = back['text/rtf'] ? await back['text/rtf'].text() : ''
    const img = back['image/png'] ? nativeImage.createFromBuffer(Buffer.from(await back['image/png'].arrayBuffer())).getSize() : null
    check('буфер: текст вернулся', text === rich['text/plain'], text)
    check('буфер: HTML вернулся', html.includes('<b>жирный</b>'), html.slice(0, 60))
    check('буфер: RTF вернулся', rtf.includes('\\rtf1'), rtf.slice(0, 40))
    check('буфер: картинка вернулась', !!img && img.width === 64 && img.height === 48, JSON.stringify(img))
    check('буфер: снимок и возврат быстрые (маленькая картинка)', snapMs < 100 && restoreMs < 100, `${snapMs.toFixed(1)} / ${restoreMs.toFixed(1)} мс`)

    // большой скриншот в буфере (2560×1440): сколько добавит Ctrl+D
    const big = nativeImage.createFromBitmap(Buffer.alloc(2560 * 1440 * 4, 0x40), { width: 2560, height: 1440 }).toPNG()
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([big], { type: 'image/png' }) })])
    t0 = performance.now()
    const s2 = await snapshot()
    const bigSnap = performance.now() - t0
    t0 = performance.now()
    await restore(s2)
    const bigRestore = performance.now() - t0
    const [it2] = await clipboard.read()
    check('буфер: скриншот 2560×1440 — снимок и возврат', it2.types.some((t) => t.startsWith('image/')), `${bigSnap.toFixed(0)} / ${bigRestore.toFixed(0)} мс`)

    const empty = (clipboard.clear(), await snapshot())
    await restore(empty)
    check('буфер: пустой остаётся пустым', (await clipboard.read()).length === 0 || (await clipboard.readText()) === '')
  } catch (e) {
    check('буфер обмена', false, String(e && e.stack || e))
  } finally {
    await restore(user)
  }
}

// ---------------------------------------------------------------------------
// окно, attach, снимок, клавиша (интерактивно)
// ---------------------------------------------------------------------------

/** Тестовое окно — отдельным процессом, как игра (tools/overlay/fake-game.cjs с уникальным заголовком). */
function startTarget() {
  const p = spawn(process.execPath, [path.join(ROOT, 'tools/overlay/fake-game.cjs'), `--title=${TITLE}`, '--size=800x450'], {
    stdio: ['ignore', 'pipe', 'ignore']
  })
  const ready = new Promise((resolve) => {
    readline.createInterface({ input: p.stdout }).on('line', (line) => {
      try {
        const e = JSON.parse(line)
        if (e.evt === 'ready') resolve(e.port)
      } catch {
        /* не событие */
      }
    })
  })
  const cmd = async (port, obj) => (await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', body: JSON.stringify(obj) })).json()
  return { proc: p, ready, cmd }
}

/** Вывести окно вперёд через WinAPI (tools/overlay/foreground.ps1: AttachThreadInput) → заголовок окна впереди. */
function activateWindow(title) {
  const ps = fs.readFileSync(path.join(ROOT, 'tools/overlay/foreground.ps1'), 'utf8')
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { input: `activate ${title}\nfg\n`, encoding: 'utf8' })
  return out.trim().split(/\r?\n/).pop()
}

async function checkWindowAndHook(OverlayController, OVERLAY_WINDOW_OPTS, uIOhook, K) {
  const target = startTarget()
  const port = await Promise.race([target.ready, sleep(15000).then(() => null)])
  if (!port) {
    target.proc.kill()
    return check('тестовое окно запустилось', false)
  }
  const overlay = new BrowserWindow({ ...OVERLAY_WINDOW_OPTS, show: false })
  await overlay.loadURL('data:text/html,<body style="background:transparent"></body>')
  const attached = new Promise((resolve) => OverlayController.events.once('attach', resolve))
  const focused = new Promise((resolve) => OverlayController.events.on('focus', () => resolve(true)))
  OverlayController.attachByTitle(overlay, TITLE)
  await target.cmd(port, { cmd: 'focus', win: 'game' })
  const fg = activateWindow(TITLE)
  check('тестовое окно на переднем плане', fg === TITLE, fg)
  const ev = await Promise.race([attached, sleep(5000).then(() => null)])
  check('electron-overlay-window: attach к тестовому окну (другой процесс)', !!ev, ev ? JSON.stringify(ev) : 'нет события attach за 5 с')
  check('electron-overlay-window: hasAccess', ev?.hasAccess === true)
  check('electron-overlay-window: фокус окна отслеживается', await Promise.race([focused, sleep(2000).then(() => false)]))
  if (ev) {
    try {
      const shot = OverlayController.screenshot()
      const b = OverlayController.targetBounds
      const lit = shot.some((v, i) => i % 4 !== 3 && v > 0)
      check('снимок окна (захват стакана S28): w×h×4, не пустой', shot.length === b.width * b.height * 4 && lit, `${b.width}×${b.height}, ${shot.length} байт`)
    } catch (e) {
      check('снимок окна', false, String(e))
    }
  }

  const got = new Promise((resolve) => {
    const on = (e) => {
      if (e.keycode === K.F24) {
        uIOhook.off('keydown', on)
        resolve(true)
      }
    }
    uIOhook.on('keydown', on)
  })
  uIOhook.start()
  await sleep(200)
  // клавиша — только в тестовое окно (оно на переднем плане — по данным electron-overlay-window)
  if (OverlayController.targetHasFocus) uIOhook.keyTap(K.F24)
  const caught = await Promise.race([got, sleep(2000).then(() => false)])
  uIOhook.stop()
  check('uiohook: хук запущен и поймал F24 (keyTap в тестовое окно)', caught)
  overlay.destroy()
  await target.cmd(port, { cmd: 'quit' }).catch(() => null)
  await sleep(300)
  if (target.proc.exitCode === null) target.proc.kill()
}

// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  try {
    console.log(`Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node} · ${APP === ROOT ? 'рабочая копия' : APP}`)

    let hook = null
    try {
      hook = req('uiohook-napi')
      check('uiohook-napi загружен', typeof hook.uIOhook?.start === 'function')
    } catch (e) {
      check('uiohook-napi загружен', false, String(e))
    }
    let ow = null
    try {
      ow = req('electron-overlay-window')
      check('electron-overlay-window загружен', typeof ow.OverlayController?.attachByTitle === 'function')
    } catch (e) {
      check('electron-overlay-window загружен', false, String(e))
    }
    try {
      const { autoUpdater } = req('electron-updater')
      check('electron-updater загружен', typeof autoUpdater?.checkForUpdates === 'function')
    } catch (e) {
      check('electron-updater загружен', false, String(e))
    }
    const enc = safeStorage.isEncryptionAvailable()
    const round = enc ? safeStorage.decryptString(safeStorage.encryptString('POESESSID S34 ✓')) : ''
    check('safeStorage (DPAPI): шифрование и расшифровка', enc && round === 'POESESSID S34 ✓')

    await checkOcrWorker()

    if (INTERACTIVE) {
      const idle = idleMs()
      if (!FORCE && !(idle >= 120000)) {
        check('интерактивная часть', false, `за ПК работают (ввод ${Math.round(idle / 1000)} с назад) — позже или --force`)
      } else {
        if (typeof ClipboardItem === 'function') await checkClipboard()
        else console.log('· буфер обмена: API до Electron 44 — пропуск')
        if (ow && hook) await checkWindowAndHook(ow.OverlayController, ow.OVERLAY_WINDOW_OPTS, hook.uIOhook, hook.UiohookKey)
      }
    }
  } catch (e) {
    check('проверка упала', false, String(e && e.stack || e))
  }
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} проверок`)
  app.exit(ok === results.length ? 0 : 1)
})
