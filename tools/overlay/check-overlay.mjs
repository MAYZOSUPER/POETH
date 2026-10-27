// Автопроверка игрового оверлея без игры (S1): тестовое окно «Path of Exile»
// (fake-game.cjs) + POETH с отдельным профилем; клавиши жмёт uiohook, состояние оверлея
// читается через CDP (--remote-debugging-port), окно на переднем плане — через WinAPI
// (foreground.ps1).
//
//   npm run build && node tools/overlay/check-overlay.mjs
//   node tools/overlay/check-overlay.mjs --exe=dist-release/win-unpacked/POETH.exe   # упакованная
//   node tools/overlay/check-overlay.mjs --scale=1.5      # POETH с --force-device-scale-factor
//   node tools/overlay/check-overlay.mjs --mouse          # + клик/уход мышью от виджета (двигает курсор!)
//   node tools/overlay/check-overlay.mjs --chromium=--disable-gpu   # доп. флаги Chromium для POETH
//   node tools/overlay/check-overlay.mjs --shot=<file.png> # снимок игры с виджетом (прозрачность)
//   node tools/overlay/check-overlay.mjs --dev            # dev-сервер (electron-vite dev) вместо out/
//
// ВНИМАНИЕ: шлёт настоящие нажатия (Ctrl+D, Shift+Space, Esc), забирает фокус, а с --mouse
// двигает курсор и кликает — запускать, когда за ПК никто не работает. Перед каждым
// нажатием проверяет по WinAPI, что на переднем плане нужное тестовое окно, иначе не жмёт.
// Буфер обмена сохраняется и возвращается (если за время проверки его не сменил человек).

import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const { uIOhook, UiohookKey: K } = require('uiohook-napi')
const electronPath = require('electron')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const opt = (name) => {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`))
  return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true
}
const EXE = opt('exe')
const SCALE = opt('scale')
const MOUSE = !!opt('mouse')
const CHROMIUM = typeof opt('chromium') === 'string' ? String(opt('chromium')).split(',') : []
const SHOT = opt('shot')
const DEV = !!opt('dev')
const CDP_PORT = 9333 + Math.floor(Math.random() * 500)
const PROFILE = mkdtempSync(path.join(tmpdir(), 'poeth-s1-check-'))
const TITLE = { game: 'Path of Exile', other: 'POETH test - other app', overlay: 'POETH — overlay' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---------------------------------------------------------------------------
// WinAPI-помощник (передний план, мышь)
// ---------------------------------------------------------------------------

// текст помощника передаётся через -Command (не как файл .ps1 — политику выполнения не трогаем)
const ps = spawn('powershell', ['-NoProfile', '-Command', readFileSync(path.join(ROOT, 'tools/overlay/foreground.ps1'), 'utf8')], {
  stdio: ['pipe', 'pipe', 'inherit']
})
const psQueue = []
readline.createInterface({ input: ps.stdout }).on('line', (line) => psQueue.shift()?.(line.trim()))
function psCmd(line) {
  return new Promise((resolve) => {
    psQueue.push(resolve)
    ps.stdin.write(line + '\n')
  })
}
const foreground = () => psCmd('fg')

// ---------------------------------------------------------------------------
// тестовое окно
// ---------------------------------------------------------------------------

const fake = spawn(electronPath, [path.join(ROOT, 'tools/overlay/fake-game.cjs'), '--other'], {
  stdio: ['ignore', 'pipe', 'ignore']
})
const fakeEvents = []
const waiters = []
readline.createInterface({ input: fake.stdout }).on('line', (line) => {
  let e
  try {
    e = JSON.parse(line)
  } catch {
    return
  }
  fakeEvents.push(e)
  for (const w of [...waiters]) {
    if (w.pred(e)) {
      waiters.splice(waiters.indexOf(w), 1)
      w.resolve(e)
    }
  }
})
function waitFake(pred, ms = 3000) {
  return new Promise((resolve, reject) => {
    const w = { pred, resolve }
    waiters.push(w)
    setTimeout(() => {
      const i = waiters.indexOf(w)
      if (i !== -1) {
        waiters.splice(i, 1)
        reject(new Error('timeout waiting for a fake-game event'))
      }
    }, ms)
  })
}
let fakePort = 0
async function fakeCmd(obj) {
  const res = await fetch(`http://127.0.0.1:${fakePort}/`, { method: 'POST', body: JSON.stringify(obj) })
  return res.json()
}
const fakeState = () => fakeCmd({ cmd: 'state' })
const clipboardText = async () => (await fakeCmd({ cmd: 'clipboard' })).text

// ---------------------------------------------------------------------------
// POETH + CDP
// ---------------------------------------------------------------------------

let poeth
let poethLog = []
const MARK = 'POETH-S1-CHECK буфер 🙂'
let markSet = false
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
  throw new Error('overlay page not found via CDP')
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

const overlayState = () => evaluate('window.overlayApi.overlay.getState()')
const widgetText = () => evaluate("document.querySelector('.ov-itemtext__raw')?.textContent ?? null")
const widgetBadge = () => evaluate("document.querySelector('.ov-itemtext .ui-tag')?.textContent ?? null")

// ---------------------------------------------------------------------------
// ввод (только в проверенное окно)
// ---------------------------------------------------------------------------

async function activate(win) {
  if ((await foreground()) === TITLE[win]) return true
  await psCmd(`activate ${TITLE[win]}`)
  await sleep(300)
  return (await foreground()) === TITLE[win]
}

async function press(key, mods = [], win = 'game') {
  const fg = await foreground()
  if (fg !== TITLE[win]) throw new Error(`не жму клавиши: на переднем плане «${fg}», а не «${TITLE[win]}»`)
  uIOhook.keyTap(key, mods)
}

async function waitFor(fn, ms = 1500, step = 50) {
  const until = Date.now() + ms
  let v
  while (Date.now() < until) {
    v = await fn()
    if (v) return v
    await sleep(step)
  }
  return v
}

// ---------------------------------------------------------------------------
// сценарий
// ---------------------------------------------------------------------------

async function main() {
  fakePort = (await waitFake((e) => e.evt === 'ready', 15000)).port
  await fakeCmd({ cmd: 'clipboard-save' })

  const appArgs = [`--remote-debugging-port=${CDP_PORT}`, ...CHROMIUM]
  if (SCALE) appArgs.push(`--force-device-scale-factor=${SCALE}`)
  const env = { ...process.env, POETH_USER_DATA_DIR: PROFILE, POETH_SAVE_CAPTURES: '1' }
  if (DEV) {
    // electron-vite dev: dev-сервер renderer + hot reload; аргументы для Electron — после «--»
    poeth = spawn(process.execPath, [path.join(ROOT, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev', '--', ...appArgs], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } else {
    poeth = spawn(EXE ? path.resolve(ROOT, EXE) : electronPath, EXE ? appArgs : [ROOT, ...appArgs], {
      cwd: ROOT,
      env: { ...env, ELECTRON_RENDERER_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
  }
  poeth.stdout.on('data', (d) => poethLog.push(String(d)))
  poeth.stderr.on('data', (d) => poethLog.push(String(d)))

  await connectOverlay()
  await sleep(DEV ? 3000 : 1500) // компаньон открылся
  check('тестовое окно на переднем плане', await activate('game'))
  const st0 = await waitFor(async () => {
    const s = await overlayState()
    return s.status.attached && s.focus.game ? s : null
  }, 4000)
  const st = st0 ?? (await overlayState())
  check('оверлей прицепился к «Path of Exile»', st.status.attached && st.status.tracking, JSON.stringify(st.status))
  check('hasAccess = true (без прав администратора)', st.status.hasAccess === true)
  check('фокус игры отслеживается', st.focus.game === true)

  const fakeBounds = (await fakeState()).bounds
  const ov = await evaluate('({ x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })')
  const phys = { x: ov.x * ov.dpr, y: ov.y * ov.dpr, w: ov.w * ov.dpr, h: ov.h * ov.dpr }
  const near = (a, b) => Math.abs(a - b) <= 2 * ov.dpr
  check(
    'окно оверлея совпадает с клиентской областью игры',
    near(phys.w, fakeBounds.width) && near(phys.h, fakeBounds.height) && near(phys.x, fakeBounds.x) && near(phys.y, fakeBounds.y),
    `оверлей ${Math.round(phys.x)},${Math.round(phys.y)} ${Math.round(phys.w)}×${Math.round(phys.h)} (dpr ${ov.dpr}) · игра ${fakeBounds.x},${fakeBounds.y} ${fakeBounds.width}×${fakeBounds.height}`
  )

  // ---- Ctrl+D: EN и RU ----
  await fakeCmd({ cmd: 'clipboard-set', text: MARK })
  markSet = true

  for (const [id, lang, first] of [
    ['en-rare', 'EN', 'Item Class: Gloves'],
    ['ru-rare', 'RU', 'Класс предмета: Перчатки'],
    ['en-chaos', 'EN', 'Item Class: Stackable Currency'],
    ['ru-unique', 'RU', 'Класс предмета: Кольца']
  ]) {
    await fakeCmd({ cmd: 'hover', id })
    await sleep(100)
    const t0 = Date.now()
    await press(K.D, [K.Ctrl])
    const text = await waitFor(async () => {
      const t = await widgetText()
      return t?.startsWith(first) ? t : null
    })
    const ms = Date.now() - t0
    check(`Ctrl+D ${id}: виджет показал текст (${lang})`, !!text && !!(await widgetBadge())?.endsWith(lang), `${ms} мс`)
    if (!text) {
      const seen = fakeEvents.filter((e) => e.win === 'game' && (e.evt === 'key' || e.evt === 'copy')).slice(-6)
      console.log(`  тестовое окно получило: ${JSON.stringify(seen)}`)
    }
    await sleep(150)
    check(`Ctrl+D ${id}: буфер восстановлен`, (await clipboardText()) === MARK)
  }

  // повторный Ctrl+D по тому же предмету закрывает окно (макет «Закрытие»)
  await press(K.D, [K.Ctrl])
  check('повторный Ctrl+D по тому же предмету закрыл окно', await waitFor(async () => (await widgetText()) === null))

  // курсор не над предметом → ничего не показываем, буфер на месте
  const before = (await overlayState()).lastItem?.at
  await fakeCmd({ cmd: 'hover', id: null })
  await press(K.D, [K.Ctrl])
  await sleep(900)
  check('Ctrl+D над пустым местом: нового захвата нет', (await overlayState()).lastItem?.at === before)
  check('Ctrl+D над пустым местом: буфер восстановлен', (await clipboardText()) === MARK)

  const capDir = path.join(PROFILE, 'captures')
  const caps = ['en', 'ru'].map((l) => (existsSync(path.join(capDir, l)) ? readdirSync(path.join(capDir, l)).length : 0))
  check('POETH_SAVE_CAPTURES=1: файлы en/ru сохранены', caps[0] >= 2 && caps[1] >= 2, `en=${caps[0]} ru=${caps[1]}`)

  // ---- Shift+Space / Esc ----
  await fakeCmd({ cmd: 'hover', id: 'en-chaos' })
  await press(K.D, [K.Ctrl])
  await waitFor(async () => (await widgetText())?.startsWith('Item Class: Stackable Currency'))
  await press(K.Space, [K.Shift])
  const act = await waitFor(async () => (await overlayState()).focus.overlay && (await foreground()) === TITLE.overlay)
  const activeDom = await evaluate("document.querySelector('.ov-root')?.classList.contains('is-active')")
  check('Shift+Space: оверлей активирован', act && activeDom, `передний план: «${await foreground()}»`)
  check('Shift+Space: окно Ctrl+D осталось открытым', (await widgetText()) !== null)
  if (act) await press(K.Escape, [], 'overlay')
  const back = await waitFor(async () => !(await overlayState()).focus.overlay && (await foreground()) === TITLE.game)
  check('Esc: фокус вернулся игре', back, `передний план: «${await foreground()}»`)
  check('Esc: окно Ctrl+D закрыто', (await widgetText()) === null)

  await press(K.Space, [K.Shift])
  const act2 = await waitFor(async () => (await foreground()) === TITLE.overlay)
  if (act2) await press(K.Space, [K.Shift], 'overlay') // внутри оверлея: before-input-event
  const back2 = await waitFor(async () => (await foreground()) === TITLE.game && !(await overlayState()).focus.overlay)
  check('Shift+Space дважды: в оверлей и обратно в игру', act2 && back2)

  // ---- гейтинг: «игра» не в фокусе → Ctrl+D/Shift+Space не перехватываются ----
  if (await activate('other')) {
    await sleep(300)
    const at = (await overlayState()).lastItem?.at
    const keyEvt = waitFake((e) => e.evt === 'key' && e.win === 'other' && e.key === 'Ctrl+KeyD', 1500).catch(() => null)
    await press(K.D, [K.Ctrl], 'other')
    check('другое окно в фокусе: Ctrl+D дошёл до него, POETH не перехватил', !!(await keyEvt) && (await overlayState()).lastItem?.at === at)
    const keyEvt2 = waitFake((e) => e.evt === 'key' && e.win === 'other' && e.key === 'Shift+Space', 1500).catch(() => null)
    await press(K.Space, [K.Shift], 'other')
    check('другое окно в фокусе: Shift+Space дошёл до него', !!(await keyEvt2) && !(await overlayState()).focus.overlay)
  } else {
    check('фокус на «другое приложение»', false, `передний план: «${await foreground()}»`)
  }

  // снова игра → хоткеи вернулись
  check('снова «игра» на переднем плане', await activate('game'))
  await sleep(300)
  await fakeCmd({ cmd: 'hover', id: 'ru-chaos' })
  await press(K.D, [K.Ctrl])
  check('после возврата фокуса Ctrl+D снова работает', await waitFor(async () => (await widgetText())?.startsWith('Класс предмета: Валюта')))

  // ---- ввод в игру: typeInChat / stashSearch (как по клику в окне POETH) ----
  let r = await evaluate("window.overlayApi.overlay.typeInChat('wtb Chaos Orb', { send: false })")
  await sleep(300)
  let gst = (await fakeState()).state
  check('typeInChat (без отправки): текст в чате', r === 'ok' && gst.chatOpen && gst.chatValue === 'wtb Chaos Orb', `${r} «${gst.chatValue}»`)
  await press(K.Escape)
  await sleep(250)
  r = await evaluate("window.overlayApi.overlay.typeInChat('@TestBuyer hi', { send: true })")
  await sleep(400)
  gst = (await fakeState()).state
  check('typeInChat (send): сообщение отправлено', r === 'ok' && gst.chatLog[0] === '@TestBuyer hi', `${r} ${JSON.stringify(gst.chatLog)}`)
  check('typeInChat: буфер восстановлен', (await clipboardText()) === MARK)
  await sleep(250)
  r = await evaluate("window.overlayApi.overlay.stashSearch('chaos')")
  await sleep(400)
  gst = (await fakeState()).state
  check('stashSearch: Ctrl+F → текст в поиске стэша', r === 'ok' && gst.search === 'chaos', `${r} «${gst.search}»`)
  await sleep(150)
  check('stashSearch: буфер восстановлен', (await clipboardText()) === MARK)

  // ---- клик по виджету без активации (двигает курсор) ----
  if (MOUSE) {
    const cursor0 = await psCmd('cursor')
    await activate('game')
    await fakeCmd({ cmd: 'hover', id: 'en-unique' })
    await press(K.D, [K.Ctrl])
    await waitFor(async () => (await widgetText())?.startsWith('Item Class: Rings'))
    const btn = await evaluate(`(() => { const b = document.querySelector('.ov-itemtext .ui-panel__head .ui-btn').getBoundingClientRect();
      return { x: Math.round((window.screenX + b.left + b.width / 2) * devicePixelRatio), y: Math.round((window.screenY + b.top + b.height / 2) * devicePixelRatio) } })()`)
    // курсор над виджетом → main должен снять «сквозную» мышь, не активируя оверлей
    await psCmd(`move ${btn.x} ${btn.y}`)
    await sleep(300)
    check('курсор над виджетом: оверлей не активирован, игра в фокусе', (await foreground()) === TITLE.game && !(await overlayState()).focus.overlay)
    await psCmd(`click ${btn.x} ${btn.y}`)
    check('клик по ✕ виджета закрыл его', await waitFor(async () => (await widgetText()) === null))
    check('после клика фокус снова у игры', await waitFor(async () => (await foreground()) === TITLE.game && !(await overlayState()).focus.overlay))

    // позиция у курсора: в правой половине окна игры — слева от курсора, в левой — справа;
    // верх окна на уровне курсора (сдвиг вверх 12 px)
    const g = (await fakeState()).bounds
    const widgetRect = () =>
      evaluate(`(() => { const r = document.querySelector('.ov-itemtext').getBoundingClientRect(), d = devicePixelRatio;
        return { left: (window.screenX + r.left) * d, right: (window.screenX + r.right) * d, top: (window.screenY + r.top) * d } })()`)
    for (const [fx, side] of [[0.75, 'слева'], [0.3, 'справа']]) {
      const C = { x: g.x + Math.round(g.width * fx), y: g.y + Math.round(g.height * 0.4) }
      await psCmd(`move ${C.x} ${C.y}`)
      await fakeCmd({ cmd: 'hover', id: 'ru-rare' })
      await press(K.D, [K.Ctrl])
      await waitFor(async () => (await widgetText())?.startsWith('Класс предмета: Перчатки'))
      await sleep(150)
      const r = await widgetRect()
      const sideOk = side === 'слева' ? r.right <= C.x : r.left >= C.x
      check(`окно у курсора: ${side} от него, верх у курсора`, sideOk && Math.abs(r.top - (C.y - 12 * ov.dpr)) <= 2 * ov.dpr,
        `курсор ${C.x},${C.y} · окно ${Math.round(r.left)}…${Math.round(r.right)}, верх ${Math.round(r.top)}`)
      await press(K.D, [K.Ctrl]) // повторный Ctrl+D — закрыть
      await waitFor(async () => (await widgetText()) === null)
    }

    // клик мимо окна (оверлей пассивен) — окно закрывается, клик достаётся игре
    const Q = { x: g.x + Math.round(g.width * 0.75), y: g.y + Math.round(g.height * 0.4) }
    await psCmd(`move ${Q.x} ${Q.y}`)
    await fakeCmd({ cmd: 'hover', id: 'en-rare' })
    await press(K.D, [K.Ctrl])
    await waitFor(async () => (await widgetText())?.startsWith('Item Class: Gloves'))
    await psCmd(`click ${Q.x + 20} ${Q.y + 10}`)
    check('клик мимо окна закрыл его', await waitFor(async () => (await widgetText()) === null))
    check('клик мимо: фокус остался у игры', (await foreground()) === TITLE.game && !(await overlayState()).focus.overlay)

    // авто-скрытие: курсор ушёл от «предмета» в сторону — виджет прячется; к виджету — нет
    const P = { x: g.x + Math.round(g.width * 0.8), y: g.y + Math.round(g.height * 0.5) }
    await psCmd(`move ${P.x} ${P.y}`)
    await fakeCmd({ cmd: 'hover', id: 'en-rare' })
    await press(K.D, [K.Ctrl])
    await waitFor(async () => (await widgetText())?.startsWith('Item Class: Gloves'))
    await psCmd(`move ${P.x} ${P.y + Math.round(g.height * 0.35)}`)
    check('мышь ушла от предмета в сторону — виджет спрятался', await waitFor(async () => (await widgetText()) === null))
    await psCmd(`move ${P.x} ${P.y}`)
    await press(K.D, [K.Ctrl])
    await waitFor(async () => (await widgetText())?.startsWith('Item Class: Gloves'))
    await sleep(150)
    const box = await evaluate(`(() => { const r = document.querySelector('.ov-itemtext').getBoundingClientRect();
      return { x: Math.round((window.screenX + r.left + r.width / 2) * devicePixelRatio), y: Math.round((window.screenY + r.top + r.height / 2) * devicePixelRatio) } })()`)
    for (let i = 1; i <= 5; i++) {
      await psCmd(`move ${Math.round(P.x + ((box.x - P.x) * i) / 5)} ${Math.round(P.y + ((box.y - P.y) * i) / 5)}`)
      await sleep(80)
    }
    await sleep(200)
    check('мышь идёт от предмета к виджету — виджет остаётся', (await widgetText()) !== null)
    const [cx, cy] = cursor0.split(',')
    await psCmd(`move ${cx} ${cy}`)
    await fakeCmd({ cmd: 'hover', id: null })
  }

  if (SHOT) {
    await activate('game')
    await fakeCmd({ cmd: 'hover', id: 'ru-rare' })
    await press(K.D, [K.Ctrl])
    await waitFor(async () => (await widgetText())?.startsWith('Класс предмета'))
    await sleep(300)
    const g = (await fakeState()).bounds
    const file = path.resolve(String(SHOT))
    await psCmd(`shot ${g.x} ${g.y} ${g.width} ${g.height} ${file}`)
    console.log(`  снимок: ${file}`)
  }
}

let failed = false
try {
  await main()
} catch (e) {
  failed = true
  console.error('ОШИБКА:', e.message)
} finally {
  try {
    if (fakePort) {
      // вернуть буфер пользователя, только если там всё ещё наша метка: если человек
      // успел что-то скопировать за время проверки, его новый буфер не трогаем
      const now = await clipboardText()
      if (!markSet || now === MARK) await fakeCmd({ cmd: 'clipboard-restore' })
      else console.log('буфер изменён пользователем во время проверки — не восстанавливаю')
      await fakeCmd({ cmd: 'quit' })
    }
  } catch {
    /* окно уже закрыто */
  }
  fake.kill()
  cdp?.close()
  // electron-vite dev запускает Electron дочерним процессом — гасим всё дерево
  if (poeth?.pid) {
    try {
      execFileSync('taskkill', ['/pid', String(poeth.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      poeth.kill()
    }
  }
  ps.stdin.end()
  ps.kill()
  try {
    writeFileSync(path.join(PROFILE, 'poeth.log'), poethLog.join(''))
  } catch {
    /* нет профиля */
  }
  await sleep(500)
}

const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} проверок пройдено${failed ? ' (сценарий прерван)' : ''}`)
console.log(`профиль и лог POETH: ${PROFILE}`)
process.exit(bad.length || failed ? 1 : 0)
