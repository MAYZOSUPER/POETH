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
//   node tools/overlay/check-overlay.mjs --force          # не ждать, пока за ПК никого не будет
//   node tools/overlay/check-overlay.mjs --abort-on-input # прервать при первом настоящем вводе человека
//                                                         # (tools/overlay/real-input.ps1; без --mouse)
//
// Не запускается, если последние 2 минуты за ПК был ввод (клавиатура/мышь), — чтобы не
// перехватить фокус у работающего человека (--force — запустить всё равно).
//
// ВНИМАНИЕ: шлёт настоящие нажатия (Ctrl+D, Shift+Space, Esc), забирает фокус, а с --mouse
// двигает курсор и кликает — запускать, когда за ПК никто не работает. Перед каждым
// нажатием проверяет по WinAPI, что на переднем плане нужное тестовое окно, иначе не жмёт.
// Буфер обмена сохраняется и возвращается (если за время проверки его не сменил человек).

import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { appendFileSync, mkdtempSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
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
const FORCE = !!opt('force')
const ABORT_ON_INPUT = !!opt('abort-on-input') && !MOUSE
const IDLE_REQUIRED_MS = 120000
const CDP_PORT = 9333 + Math.floor(Math.random() * 500)
const PROFILE = mkdtempSync(path.join(tmpdir(), 'poeth-s1-check-'))
const GAME_LOG = path.join(PROFILE, 'Client.txt')
const LOGP = '2026/10/28 21:40:00 123456 abcd [INFO Client 4242]'
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

// сторож: первый настоящий (не injected) ввод человека → больше ничего не жмём, сценарий прерывается,
// finally возвращает буфер и закрывает свои процессы
let realInput = null
let guardProc = null
let guardReady = Promise.resolve(true)
if (ABORT_ON_INPUT) {
  guardProc = spawn('powershell', ['-NoProfile', '-Command', readFileSync(path.join(ROOT, 'tools/overlay/real-input.ps1'), 'utf8')], {
    stdio: ['ignore', 'pipe', 'inherit']
  })
  guardReady = new Promise((resolve) => {
    readline.createInterface({ input: guardProc.stdout }).on('line', (line) => {
      if (line.trim() === 'ready') resolve(true)
      else if (line.startsWith('REAL')) {
        realInput = line.trim()
        console.log(`! ввод пользователя (${realInput}) — прерываю проверку`)
      }
    })
    guardProc.on('exit', () => resolve(false))
  })
}
function guard() {
  if (realInput) throw new Error(`прервано: ввод пользователя (${realInput})`)
}

// ---------------------------------------------------------------------------
// тестовое окно
// ---------------------------------------------------------------------------

let fake = null
const fakeEvents = []
const waiters = []
function startFake() {
  fake = spawn(electronPath, [path.join(ROOT, 'tools/overlay/fake-game.cjs'), '--other'], {
    stdio: ['ignore', 'pipe', 'ignore']
  })
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
}
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
/** «другая программа», которая держит хоткей (hotkey-squatter.cjs) */
let squatter = null
const SQUAT_KEY = 'Alt+3'
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
// окно цены S4 (демо-виджет S1 удалён): текст предмета — из состояния оверлея, пока окно открыто
const widgetText = () => evaluate("window.overlayApi.overlay.getState().then(s => document.querySelector('.ov-pricecheck') ? s.lastItem?.text ?? null : null)")
/**
 * Центр элемента окна цены (экран, физ. px) — когда окно «успокоилось»: результаты загрузились (нет
 * скелетона) и два замера подряд совпали. Окно растёт с результатами и прижимается внутрь — ранний
 * замер попадал мимо кнопки (диагностика 28.10: клик по ✕ пришёлся на «Показать ещё»).
 */
async function stableCenter(sel, ms = 12000) {
  const measure = () =>
    evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: Math.round((window.screenX + r.left + r.width / 2) * devicePixelRatio), y: Math.round((window.screenY + r.top + r.height / 2) * devicePixelRatio),
        loading: !!document.querySelector('.ov-pricecheck .ui-skeleton') } })()`)
  const until = Date.now() + ms
  let last = null
  let same = 0
  while (Date.now() < until) {
    const p = await measure()
    if (!p) return null
    same = last && p.x === last.x && p.y === last.y ? same + 1 : 0
    last = p
    // загрузилось и стоит на месте — сразу; сайт трейда медленный — хватит неподвижности 3 замера подряд
    if ((!p.loading && same >= 1) || same >= 3) return { x: p.x, y: p.y }
    await sleep(200)
  }
  return last && { x: last.x, y: last.y }
}
const widgetBadge = () => evaluate("document.querySelector('.ov-pricecheck .pc-item .ui-tag')?.textContent ?? null")

// ---------------------------------------------------------------------------
// ввод (только в проверенное окно)
// ---------------------------------------------------------------------------

async function activate(win) {
  guard()
  if ((await foreground()) === TITLE[win]) return true
  await psCmd(`activate ${TITLE[win]}`)
  await sleep(300)
  return (await foreground()) === TITLE[win]
}

async function press(key, mods = [], win = 'game') {
  guard()
  const fg = await foreground()
  guard()
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
  // до любых окон: если за ПК работают — не начинать (окна и нажатия забрали бы фокус)
  const idle = Number(await psCmd('idle'))
  if (!FORCE && !(idle >= IDLE_REQUIRED_MS)) {
    throw new Error(`за ПК работают (ввод ${Math.round(idle / 1000)} с назад) — запустите позже или с --force`)
  }
  if (ABORT_ON_INPUT && !(await guardReady)) throw new Error('сторож ввода (real-input.ps1) не запустился')
  startFake()
  fakePort = (await waitFake((e) => e.evt === 'ready', 15000)).port
  // «другая программа» держит Alt+3 (хоткей «Убрать» карточки сделки) — как APT с Ctrl+D
  squatter = spawn(electronPath, [path.join(ROOT, 'tools/overlay/hotkey-squatter.cjs'), SQUAT_KEY], { stdio: ['ignore', 'pipe', 'ignore'] })
  const squatOk = await new Promise((res) => {
    let out = ''
    squatter.stdout.on('data', (d) => {
      out += String(d)
      if (/ready|fail/.test(out)) res(out.includes('ready'))
    })
    setTimeout(() => res(false), 15000)
  })
  await fakeCmd({ cmd: 'clipboard-save' })

  // команды чата: F5 → /hideout (по умолчанию) и F6 → /invite @last; лог игры — свой файл.
  // Мастер пройден и запуск свёрнутым: иначе компаньон с мастером (S9) открывается поверх тестовой
  // «игры» и клики мышью попадают в него.
  writeFileSync(
    path.join(PROFILE, 'settings.json'),
    JSON.stringify({
      schemaVersion: 2,
      startup: { firstRunDone: true, minimized: true, withWindows: false },
      chatCommands: [
        { id: 'hideout', text: '/hideout', hotkey: 'F5', send: true, enabled: true },
        { id: 'invite', text: '/invite @last', hotkey: 'F6', send: true, enabled: true }
      ]
    })
  )
  writeFileSync(GAME_LOG, `${LOGP} : You have entered Lioneye's Watch.
`)

  const appArgs = [`--remote-debugging-port=${CDP_PORT}`, ...CHROMIUM]
  if (SCALE) appArgs.push(`--force-device-scale-factor=${SCALE}`)
  // без тостов Windows: Electron при первом тосте ставит в «Пуск» ярлык и COM-ключ на exe проверки
  const env = { ...process.env, POETH_USER_DATA_DIR: PROFILE, POETH_SAVE_CAPTURES: '1', POETH_GAME_LOG: GAME_LOG, POETH_NO_WINDOWS_TOASTS: '1' }
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

  // хоткеи, которыми пользуется проверка, держит кто-то ещё (второй POETH другой сессии, APT…) —
  // дальше всё было бы ложными провалами: прервать с понятной причиной
  const busy = (await evaluate('window.overlayApi.overlay.hotkeyConflicts()')).filter((c) =>
    ['priceCheck', 'overlayToggle', 'chat:hideout', 'chat:invite'].includes(c.action)
  )
  if (busy.length) {
    throw new Error(`хоткеи проверки заняты другой программой (${busy.map((c) => c.accel).join(', ')}) — закройте второй POETH / APT / Sidekick и запустите снова`)
  }

  // ---- хоткей занят другой программой: предупреждение поверх игры и список для настроек ----
  if (squatOk) {
    const conf = await waitFor(async () => {
      const list = await evaluate('window.overlayApi.overlay.hotkeyConflicts()')
      return list.find((c) => c.accel === SQUAT_KEY) ? list : null
    }, 3000)
    check(`${SQUAT_KEY} занят другой программой — POETH это видит`, !!conf, JSON.stringify(conf))
    const notice = await waitFor(
      () => evaluate(`(() => { const n = [...document.querySelectorAll('.ov-notice')].find((e) => e.textContent.includes('${SQUAT_KEY}'));
        return n ? { text: n.textContent, button: !!n.querySelector('.ov-notice__action') } : null })()`),
      3000
    )
    check('предупреждение поверх игры с кнопкой «Сменить клавишу»', !!notice?.button, notice?.text?.slice(0, 90))
  } else check(`не удалось занять ${SQUAT_KEY} для проверки конфликта`, false)

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

  // «другую программу» закрыли — при возврате в игру POETH займёт сочетание сам
  if (squatter?.pid) {
    try {
      execFileSync('taskkill', ['/pid', String(squatter.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      /* уже нет */
    }
    squatter = null
  }

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
  const freed = await waitFor(async () => !(await evaluate('window.overlayApi.overlay.hotkeyConflicts()')).some((c) => c.accel === SQUAT_KEY), 2000)
  check(`другую программу закрыли — ${SQUAT_KEY} снова у POETH, предупреждение снято`, freed)

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

  // ---- команды чата по хоткеям ----
  await sleep(300)
  await press(K.F5)
  await sleep(500)
  gst = (await fakeState()).state
  check('F5 → /hideout отправлен в чат', gst.chatLog[0] === '/hideout' && !gst.chatOpen, JSON.stringify(gst.chatLog.slice(0, 2)))
  check('команда чата: буфер восстановлен', (await clipboardText()) === MARK)
  await sleep(200)
  await press(K.F6)
  const noticeShown = await waitFor(async () => evaluate("document.querySelector('.ov-notice')?.textContent ?? null"))
  gst = (await fakeState()).state
  check('F6 /invite @last без собеседника — не отправлено, тост', !!noticeShown && gst.chatLog[0] === '/hideout', noticeShown ?? 'нет тоста')
  appendFileSync(GAME_LOG, `${LOGP} @From <GLD> Buyer_One: Hi, I would like to buy your Chaos Orb
`)
  await sleep(1600)
  await press(K.F6)
  await sleep(500)
  gst = (await fakeState()).state
  check('F6 после whisper → /invite Buyer_One', gst.chatLog[0] === '/invite Buyer_One', JSON.stringify(gst.chatLog.slice(0, 2)))

  // ---- клик по виджету без активации (двигает курсор) ----
  if (MOUSE) {
    const cursor0 = await psCmd('cursor')
    await activate('game')
    await fakeCmd({ cmd: 'hover', id: 'en-unique' })
    await press(K.D, [K.Ctrl])
    await waitFor(async () => (await widgetText())?.startsWith('Item Class: Rings'))
    const btn = await stableCenter('.ov-pricecheck .ui-panel__head button:last-of-type')
    // курсор над виджетом → main должен снять «сквозную» мышь, не активируя оверлей
    await psCmd(`move ${btn.x} ${btn.y}`)
    await sleep(300)
    check('курсор над виджетом: оверлей не активирован, игра в фокусе', (await foreground()) === TITLE.game && !(await overlayState()).focus.overlay)
    // диагностика: какие события мыши дошли до страницы оверлея при клике
    await evaluate(`(() => { window.__ev = []; for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click'])
      document.addEventListener(t, (e) => __ev.push(t + ':' + (e.target?.closest?.('button')?.getAttribute('aria-label') ?? String(e.target?.className ?? '?'))), true); return 1 })()`)
    await psCmd(`click ${btn.x} ${btn.y}`)
    const closed = await waitFor(async () => (await widgetText()) === null)
    check('клик по ✕ виджета закрыл его', closed, closed ? '' : `события: ${JSON.stringify(await evaluate('window.__ev'))} · фокус ${JSON.stringify((await overlayState()).focus)} · передний план «${await foreground()}»`)
    check('после клика фокус снова у игры', await waitFor(async () => (await foreground()) === TITLE.game && !(await overlayState()).focus.overlay))

    // позиция у курсора: в правой половине окна игры — слева от курсора, в левой — справа;
    // верх окна на уровне курсора (сдвиг вверх 12 px)
    const g = (await fakeState()).bounds
    const widgetRect = () =>
      evaluate(`(() => { const r = document.querySelector('.ov-pricecheck').getBoundingClientRect(), d = devicePixelRatio;
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
    const box = await evaluate(`(() => { const r = document.querySelector('.ov-pricecheck').getBoundingClientRect();
      return { x: Math.round((window.screenX + r.left + r.width / 2) * devicePixelRatio), y: Math.round((window.screenY + r.top + r.height / 2) * devicePixelRatio) } })()`)
    for (let i = 1; i <= 5; i++) {
      await psCmd(`move ${Math.round(P.x + ((box.x - P.x) * i) / 5)} ${Math.round(P.y + ((box.y - P.y) * i) / 5)}`)
      await sleep(80)
    }
    await sleep(200)
    check('мышь идёт от предмета к виджету — виджет остаётся', (await widgetText()) !== null)

    // ---- с окном цены работают (баг 28.10: окно пропадало при клике по галочкам) ----
    const center = (sel) => stableCenter(sel)
    const CHK = '.ov-pricecheck [role="checkbox"]'
    const before = await evaluate(`document.querySelector('${CHK}')?.getAttribute('aria-checked') ?? null`)
    const chk = await center(CHK)
    if (chk) await psCmd(`click ${chk.x} ${chk.y}`)
    await sleep(400)
    const after = await evaluate(`document.querySelector('${CHK}')?.getAttribute('aria-checked') ?? null`)
    check('клик по галочке: окно на месте, галочка переключилась', !!chk && (await widgetText()) !== null && before !== null && after !== before, `${before} → ${after}`)
    const fAfter = (await overlayState()).focus
    const dimmed = await evaluate("!!document.querySelector('.ov-root.is-dim')")
    check('после клика фокус у окна цены (оверлей активен), экран не затемнён', fAfter.overlay && (await foreground()) === TITLE.overlay && !dimmed)
    // курсор уходит далеко за край окна — окно не закрывается (с ним уже работают)
    await psCmd(`move ${P.x} ${P.y + Math.round(g.height * 0.35)}`)
    await sleep(600)
    check('курсор ушёл далеко после работы с окном — окно на месте', (await widgetText()) !== null)
    // кнопка в шапке (обновить) — окно и фокус остаются
    const refresh = await center('.ov-pricecheck .ui-panel__head button:has(use[href="#i-refresh"])')
    if (refresh) await psCmd(`click ${refresh.x} ${refresh.y}`)
    await sleep(500)
    check('кнопка в окне нажата — окно и фокус остались', !!refresh && (await widgetText()) !== null && (await overlayState()).focus.overlay)

    // ---- перетаскивание за шапку, «где оставил», «вернуть к курсору» ----
    const rectOf = () =>
      evaluate(`(() => { const r = document.querySelector('.ov-pricecheck').getBoundingClientRect(), d = devicePixelRatio;
        return { left: Math.round((window.screenX + r.left) * d), top: Math.round((window.screenY + r.top) * d) } })()`)
    const r0 = await rectOf()
    const title = await center('.ov-pricecheck .ui-panel__title')
    const DX = -Math.round(g.width * 0.2)
    const DY = Math.round(g.height * 0.08)
    await psCmd(`down ${title.x} ${title.y}`)
    for (let i = 1; i <= 6; i++) {
      await psCmd(`move ${title.x + Math.round((DX * i) / 6)} ${title.y + Math.round((DY * i) / 6)}`)
      await sleep(40)
    }
    await psCmd(`up ${title.x + DX} ${title.y + DY}`)
    await sleep(400)
    const r1 = await rectOf()
    const s1 = (await evaluate('window.overlayApi.settings.get()')).overlay
    // по вертикали высокое окно может упереться в низ окна игры — тогда сдвиг меньше (прижато внутрь)
    const dy = r1.top - r0.top
    check('окно перетащили за шапку', Math.abs(r1.left - r0.left - DX) <= 3 && dy >= -3 && dy <= DY + 3,
      `сдвиг ${r1.left - r0.left},${dy} из ${DX},${DY}`)
    check('позиция запомнилась: «где оставил»', s1.pricePosition === 'saved' && !!s1.priceWindowPos, JSON.stringify(s1))
    await press(K.Escape, [], 'overlay')
    check('Esc закрыл окно, фокус у игры', await waitFor(async () => (await widgetText()) === null && (await foreground()) === TITLE.game))
    // следующий Ctrl+D — окно там же, где оставили (курсор в другом месте)
    await psCmd(`move ${P.x - 40} ${P.y + 30}`)
    await press(K.D, [K.Ctrl])
    await waitFor(async () => (await widgetText())?.startsWith('Item Class: Gloves'))
    await sleep(200)
    const r2 = await rectOf()
    check('Ctrl+D открыл окно там же, где оставили', Math.abs(r2.left - r1.left) <= 2 && Math.abs(r2.top - r1.top) <= 2, `${r2.left},${r2.top} / ${r1.left},${r1.top}`)
    // «вернуть к курсору» (кнопка видна только у перетащенного окна)
    const home = await center('.ov-pricecheck [data-popup-home]')
    if (home) await psCmd(`click ${home.x} ${home.y}`)
    await sleep(400)
    const s2 = (await evaluate('window.overlayApi.settings.get()')).overlay
    const r3 = await rectOf()
    check('«Вернуть к курсору»: окно снова у курсора, настройка «у курсора»', s2.pricePosition === 'cursor' && (r3.left !== r2.left || r3.top !== r2.top), JSON.stringify(s2))
    // повторный Ctrl+D при активном оверлее (после клика в окно) — закрывает
    const fgHome = await foreground()
    if (fgHome === TITLE.overlay) await press(K.D, [K.Ctrl], 'overlay')
    check('повторный Ctrl+D в активном окне закрыл его, фокус у игры',
      await waitFor(async () => (await widgetText()) === null && (await foreground()) === TITLE.game), `до нажатия передний план «${fgHome}»`)
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
  fake?.kill()
  if (squatter?.pid) {
    try {
      execFileSync('taskkill', ['/pid', String(squatter.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      /* уже нет */
    }
  }
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
  guardProc?.kill()
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
if (realInput) console.log('прервано вводом пользователя — повторить при простое')
process.exit(realInput ? 2 : bad.length || failed ? 1 : 0)
