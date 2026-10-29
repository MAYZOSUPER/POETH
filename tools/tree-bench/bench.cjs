// Стенд S38: окно «Path of Exile» с упрощённым деревом пассивок — проверить наложение дерева этапа без игры.
//
//   npx electron tools/tree-bench/bench.cjs --pob=tests/fixtures/pob/pobbin-acts-all-axes.txt --stage=3
//   npx electron tools/tree-bench/bench.cjs --size=1920x1080 --frameless --zoom-step=1.25
//   npx electron tools/tree-bench/bench.cjs --image=<скриншот дерева из игры>.png   # картинка фоном, без рисунка
//
// Дерево рисуется из resources/data/poe1/build/tree.json СВОЕЙ формулой (bench-page.js, не src/shared/build) —
// независимая сверка проекции наложения. Ведёт себя как игра (по наблюдениям Exile-UI, проверяется в фазе 3):
// - открывается с кругом класса в центре окна, отдалённым до упора (точек на единицу дерева = высота / 10000);
// - левая кнопка тянет дерево 1:1 с курсором; колесо — зум вокруг курсора шагами --zoom-step, не дальше «до упора».
// Взятые ноды — этап --stage кода PoB --pob (золотые); остальные — серые; без арта GGG.
//
// Команды (для tools/tree-bench/check.mjs): POST JSON на http://127.0.0.1:<port>/ (порт — в событии ready):
//   {"cmd":"state"} → вид дерева и экранные точки нод этапа · {"cmd":"pan","dx":…,"dy":…}
//   {"cmd":"zoom","steps":±n,"x":…,"y":…} · {"cmd":"reset"} · {"cmd":"focus"} · {"cmd":"quit"}
// События — JSON-строками в stdout ({"evt":"ready"|"focus"|"blur"}).
//
// Это dev-инструмент: страница локальная, nodeIntegration включён намеренно.

const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')
const zlib = require('zlib')

function arg(name, def) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return def
  const eq = hit.indexOf('=')
  return eq === -1 ? true : hit.slice(eq + 1)
}

const ROOT = path.resolve(__dirname, '..', '..')
const TITLE = arg('title', 'Path of Exile')
const [W, H] = String(arg('size', '1600x900')).split('x').map(Number)
const FRAMELESS = !!arg('frameless', false)
const ZOOM_STEP = Number(arg('zoom-step', 1.25))
const POB = arg('pob', path.join(ROOT, 'tests/fixtures/pob/pobbin-acts-all-axes.txt'))
const STAGE = Number(arg('stage', 0))
const IMAGE = arg('image', '')

app.setPath('userData', path.join(app.getPath('temp'), 'poeth-tree-bench'))

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

/** Деревья из кода PoB: свой мини-разбор (<Spec … nodes=…>), не src/shared/pob — стенду хватает. */
function pobSpecs(file) {
  const code = fs.readFileSync(path.resolve(ROOT, file), 'utf8').trim().replace(/-/g, '+').replace(/_/g, '/')
  const xml = zlib.inflateSync(Buffer.from(code, 'base64')).toString('utf8')
  const specs = []
  for (const m of xml.matchAll(/<Spec\b([^>]*)>/g)) {
    const attr = (n) => new RegExp(`\\b${n}="([^"]*)"`).exec(m[1])?.[1] ?? ''
    specs.push({
      title: attr('title'),
      classId: Number(attr('classId') || 0),
      nodes: attr('nodes').split(',').filter(Boolean).map(Number)
    })
  }
  return specs
}

let win = null

function createWindow() {
  const specs = pobSpecs(POB)
  const spec = specs[Math.min(Math.max(0, STAGE), specs.length - 1)] ?? { title: '', classId: 3, nodes: [] }
  win = new BrowserWindow({
    title: TITLE,
    width: W || 1600,
    height: H || 900,
    useContentSize: true,
    frame: !FRAMELESS,
    backgroundColor: '#07090b',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, spellcheck: false }
  })
  win.setMenu(null)
  win.on('page-title-updated', (e) => e.preventDefault())
  win.setTitle(TITLE)
  win.loadFile(path.join(__dirname, 'bench.html'), {
    query: {
      tree: path.join(ROOT, 'resources/data/poe1/build/tree.json'),
      classId: String(spec.classId),
      nodes: spec.nodes.join(','),
      title: spec.title,
      zoomStep: String(ZOOM_STEP),
      image: IMAGE ? path.resolve(IMAGE) : ''
    }
  })
  win.on('focus', () => emit({ evt: 'focus' }))
  win.on('blur', () => emit({ evt: 'blur' }))
  win.on('closed', () => app.quit())
}

const pending = new Map()
let seq = 0
ipcMain.on('reply', (_e, { id, value }) => {
  const cb = pending.get(id)
  pending.delete(id)
  if (cb) cb(value)
})

function ask(cmd) {
  return new Promise((resolve) => {
    const id = ++seq
    pending.set(id, (value) => resolve({ ...value, bounds: win.getContentBounds() }))
    win.webContents.send('cmd', { id, ...cmd })
  })
}

async function handleCommand(msg) {
  switch (msg.cmd) {
    case 'state':
    case 'pan':
    case 'zoom':
    case 'reset':
      return ask(msg)
    case 'focus':
      if (win.isMinimized()) win.restore()
      win.setAlwaysOnTop(true)
      win.show()
      win.focus()
      setTimeout(() => !win.isDestroyed() && win.setAlwaysOnTop(false), 200)
      return { ok: true }
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
  createWindow()
  win.webContents.once('did-finish-load', () => emit({ evt: 'ready', title: TITLE, port, bounds: win.getContentBounds(), pid: process.pid }))
})
