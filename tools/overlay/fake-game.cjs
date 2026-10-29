// Тестовое окно «Path of Exile» для проверки игрового оверлея без игры (S1).
//
//   npx electron tools/overlay/fake-game.cjs                  # окно 'Path of Exile' 1280×720
//   npx electron tools/overlay/fake-game.cjs --poe2           # заголовок 'Path of Exile 2'
//   npx electron tools/overlay/fake-game.cjs --size=1920x1080 --frameless --other
//
// Что умеет (как игра):
// - наведите курсор на предмет и нажмите Ctrl+C — в буфер попадёт его текст (CRLF, как у игры;
//   с задержкой --copy-delay=<мс>, по умолчанию 30). Выделенный мышью текст копируется как обычно;
// - Enter — чат (Enter ещё раз — «отправить», Esc — закрыть), Ctrl+Enter — ответ последнему;
// - Ctrl+F — поиск в стэше (Enter — применить, подсвечивает совпадения).
// --other — второе окно «POETH test - other app»: проверить, что хоткеи области 'game'
// не перехватываются, когда «игра» не в фокусе.
//
// Для автоматической проверки (tools/overlay/check-overlay.mjs): команды — POST JSON на
// http://127.0.0.1:<port>/ (порт — в событии ready; stdin в main Electron на Windows не читается):
//   {"cmd":"focus","win":"game"|"other"} · {"cmd":"hover","id":"en-rare"|null} · {"cmd":"state"}
//   {"cmd":"clipboard"} · {"cmd":"clipboard-set","text":"…"} · {"cmd":"clipboard-save"|"clipboard-restore"}
//   {"cmd":"quit"}
// ответ — JSON; события (focus/blur/key/chat/copy) — JSON-строками в stdout ({"evt":...}).
//
// Это dev-инструмент: страница локальная, nodeIntegration включён намеренно.

const { app, BrowserWindow, clipboard, ClipboardItem, ipcMain } = require('electron')
const http = require('http')
const path = require('path')

function arg(name, def) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return def
  const eq = hit.indexOf('=')
  return eq === -1 ? true : hit.slice(eq + 1)
}

const TITLE = arg('poe2', false) ? 'Path of Exile 2' : arg('title', 'Path of Exile')
const [W, H] = String(arg('size', '1280x720')).split('x').map(Number)
const FRAMELESS = !!arg('frameless', false)
const WITH_OTHER = !!arg('other', false)
const COPY_DELAY = Number(arg('copy-delay', 30))

// отдельный профиль: не мешать POETH и параллельным запускам
app.setPath('userData', path.join(app.getPath('temp'), 'poeth-fake-game'))

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

let game = null
let other = null
/** буфер пользователя на время автопроверки: MIME → Blob (API буфера Electron 44 — W3C, на Promise) */
let savedClipboard = null

function lockTitle(win, title) {
  win.on('page-title-updated', (e) => e.preventDefault())
  win.setTitle(title)
}

function createGame() {
  game = new BrowserWindow({
    title: TITLE,
    width: W || 1280,
    height: H || 720,
    useContentSize: true,
    frame: !FRAMELESS,
    backgroundColor: '#0d0b09',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, spellcheck: false }
  })
  game.setMenu(null)
  lockTitle(game, TITLE)
  game.loadFile(path.join(__dirname, 'fake-game.html'), { query: { delay: String(COPY_DELAY) } })
  game.on('focus', () => emit({ evt: 'focus', win: 'game' }))
  game.on('blur', () => emit({ evt: 'blur', win: 'game' }))
  game.on('closed', () => app.quit())
}

function createOther() {
  other = new BrowserWindow({
    title: 'POETH test - other app',
    width: 520,
    height: 260,
    x: 40,
    y: 40,
    backgroundColor: '#1b1d22',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false }
  })
  other.setMenu(null)
  lockTitle(other, 'POETH test - other app')
  other.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(`<!doctype html><meta charset="utf-8"><body style="font:14px Segoe UI;color:#ddd;background:#1b1d22">
<h3>Другое приложение</h3><p>Нажмите здесь Ctrl+D или Shift+Space — POETH не должен их перехватить.</p><pre id="log"></pre>
<script>const { ipcRenderer } = require('electron');
const kn = (e) => e.code || (e.keyCode >= 65 && e.keyCode <= 90 ? 'Key' + String.fromCharCode(e.keyCode) : e.keyCode === 32 ? 'Space' : 'kc' + e.keyCode);
addEventListener('keydown', (e) => { if (e.keyCode >= 16 && e.keyCode <= 18) return; const k = (e.ctrlKey?'Ctrl+':'')+(e.shiftKey?'Shift+':'')+(e.altKey?'Alt+':'')+kn(e);
document.getElementById('log').textContent += k + '\\n'; ipcRenderer.send('evt', { evt: 'key', win: 'other', key: k }) })</script>`)
  )
  other.on('focus', () => emit({ evt: 'focus', win: 'other' }))
}

ipcMain.on('evt', (_e, payload) => emit(payload))
// «игра» кладёт текст предмета в буфер (в Electron 44 clipboard в renderer недоступен — пишет main)
ipcMain.handle('clipboard-write', (_e, text) => clipboard.writeText(String(text)))

const pending = new Map()
let seq = 0
ipcMain.on('state', (_e, { id, state }) => {
  const cb = pending.get(id)
  pending.delete(id)
  if (cb) cb(state)
})

function focusWindow(win) {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  // поверх всех на мгновение — иначе Windows может не отдать фокус чужому процессу
  win.setAlwaysOnTop(true)
  win.show()
  win.focus()
  setTimeout(() => !win.isDestroyed() && win.setAlwaysOnTop(false), 200)
}

function getState() {
  return new Promise((resolve) => {
    const id = ++seq
    pending.set(id, (state) => resolve({ state, bounds: game.getContentBounds() }))
    game.webContents.send('get-state', id)
  })
}

async function handleCommand(msg) {
  switch (msg.cmd) {
    case 'focus':
      focusWindow(msg.win === 'other' ? other : game)
      return { ok: true }
    case 'hover':
      game?.webContents.send('hover', msg.id ?? null)
      return { ok: true }
    case 'state':
      return getState()
    case 'clipboard': {
      const [item] = await clipboard.read()
      return { text: await clipboard.readText(), formats: item ? item.types : [] }
    }
    case 'clipboard-set':
      await clipboard.writeText(String(msg.text ?? ''))
      return { ok: true }
    case 'clipboard-save': {
      // буфер пользователя — сохранить до проверки и вернуть после (прочитать сразу: элемент read() ленивый)
      const [item] = await clipboard.read()
      savedClipboard = {}
      for (const type of ['text/plain', 'text/html', 'image/png']) {
        const has = type === 'image/png' ? item?.types.some((t) => t.startsWith('image/')) : item?.types.includes(type)
        if (!has) continue
        const blob = await item.getType(type)
        if (blob.size > 0) savedClipboard[type] = blob
      }
      return { ok: true }
    }
    case 'clipboard-restore': {
      if (!savedClipboard) return { ok: false }
      if (Object.keys(savedClipboard).length) await clipboard.write([new ClipboardItem(savedClipboard)])
      else clipboard.clear()
      return { ok: true }
    }
    case 'quit':
      setTimeout(() => app.quit(), 50)
      return { ok: true }
    default:
      return { error: `unknown cmd ${msg.cmd}` }
  }
}

function startControlServer() {
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      let out
      try {
        out = await handleCommand(JSON.parse(body || '{}'))
      } catch (e) {
        out = { error: String(e) }
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(out))
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

app.whenReady().then(async () => {
  const port = await startControlServer()
  createGame()
  if (WITH_OTHER) createOther()
  game.webContents.once('did-finish-load', () =>
    emit({ evt: 'ready', title: TITLE, port, bounds: game.getContentBounds() })
  )
})

app.on('window-all-closed', () => app.quit())
