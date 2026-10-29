// Живой прогон собранной версии без игры (S34, смена версии Electron): свой профиль, без attach к игре
// (POETH_OVERLAY_NO_ATTACH=1), хоткеи пустые, тосты Windows выключены; всё через CDP (--remote-debugging-port).
// Клавиатура и мышь не используются, ввод в игру не вызывается. Окна POETH показываются (компаньон, трейд-окно,
// окно входа) — запускать, когда за ПК никого (как tools/overlay/check-overlay.mjs; --force — всё равно).
//
//   node tools/electron/check-live.mjs --exe=dist-release/win-unpacked/POETH.exe
//   node tools/electron/check-live.mjs --exe=<сборка 40> --profile=<папка> --seed      # профиль «старой» версии
//   node tools/electron/check-live.mjs --exe=<сборка 44> --profile=<копия> --expect     # он же на новой
//   --shots=<папка> — снимки вкладок компаньона и трейд-окна (PNG)
//
// --seed: в трейд-окне (partition persist:poe-account) ставится тестовый cookie, через trade.setSession —
// тестовый POESESSID PoE 2 (safeStorage, secret.json); --expect: оба читаются на этой версии.
// Закрывает только свой процесс (по PID).
//
// Внимание: проверка Cloudflare на pathofexile.com открывает порт на приём (похоже, WebRTC) — для exe, который
// запускается с этого пути впервые, Windows покажет окно брандмауэра «Безопасность Windows» (так и на Electron 40).
// Отвечать на него должен человек; правило останется в брандмауэре.

import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const opt = (name) => {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`))
  return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true
}
const EXE = path.resolve(ROOT, String(opt('exe') ?? 'dist-release/win-unpacked/POETH.exe'))
const PROFILE = opt('profile') ? path.resolve(String(opt('profile'))) : mkdtempSync(path.join(tmpdir(), 'poeth-s34-live-'))
const SEED = !!opt('seed')
const EXPECT = !!opt('expect')
const SHOTS = typeof opt('shots') === 'string' ? path.resolve(String(opt('shots'))) : null
const FORCE = !!opt('force')
const CDP_PORT = 9400 + Math.floor(Math.random() * 400)
const COOKIE = { name: 'POETH_S34_MARK', value: 's34-cookie-from-old-version' }
const FAKE_SESSID = '5345535349444f4e4c5954455354ab34' // 32 hex, не настоящий
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function check(name, ok, detail = '') {
  results.push(!!ok)
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
async function waitFor(fn, ms = 15000, step = 200) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const v = await fn().catch(() => null)
    if (v) return v
    await sleep(step)
  }
  return null
}

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
// CDP
// ---------------------------------------------------------------------------

const targets = async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
const findTarget = (pred, ms) => waitFor(async () => (await targets()).find(pred), ms)

async function connect(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)))
  let id = 0
  const pend = new Map()
  const errors = []
  ws.on('message', (d) => {
    const m = JSON.parse(String(d))
    if (m.id) {
      pend.get(m.id)?.(m)
      pend.delete(m.id)
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text)
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id
      pend.set(i, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)))
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  await send('Runtime.enable')
  const shot = async (name) => {
    if (!SHOTS) return
    mkdirSync(SHOTS, { recursive: true })
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'))
  }
  return { ws, send, ev, errors, shot }
}

/** IPC-вызов из страницы: { ok, value } или { ok:false, error } (отказ main — reject промиса) */
const callIpc = (expr) => `(async () => { try { return { ok: true, value: await (${expr}) } } catch (e) { return { ok: false, error: String(e && e.message || e) } } })()`

// ---------------------------------------------------------------------------
// запуск
// ---------------------------------------------------------------------------

if (!existsSync(EXE)) throw new Error(`нет сборки: ${EXE} (npm run package:dir)`)
if (!FORCE) {
  const idle = idleMs()
  if (!(idle >= 120000)) throw new Error(`за ПК работают (ввод ${Math.round(idle / 1000)} с назад) — запустите позже или с --force`)
}

mkdirSync(PROFILE, { recursive: true })
const settingsFile = path.join(PROFILE, 'settings.json')
if (!existsSync(settingsFile)) {
  const HOTKEYS = ['priceCheck', 'overlayToggle', 'whisperLastHit', 'pasteSearch1', 'pasteSearch2', 'pasteSearch3', 'pasteSearch4',
    'pasteSearch5', 'dealInvite', 'dealTrade', 'dealDismiss', 'levelingToggle', 'bookRead', 'toggleCompanion', 'toggleLock',
    'toggleTradeWindow', 'prevStep', 'nextStep']
  writeFileSync(settingsFile, JSON.stringify({
    schemaVersion: 2,
    startup: { firstRunDone: true, minimized: false, withWindows: false },
    updates: { check: false },
    hotkeys: Object.fromEntries(HOTKEYS.map((a) => [a, ''])),
    chatCommands: []
  }))
}

const poeth = spawn(EXE, [`--remote-debugging-port=${CDP_PORT}`], {
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: '',
    POETH_USER_DATA_DIR: PROFILE,
    POETH_OVERLAY_NO_ATTACH: '1',
    POETH_NO_WINDOWS_TOASTS: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
const log = []
poeth.stdout.on('data', (d) => log.push(String(d)))
poeth.stderr.on('data', (d) => log.push(String(d)))
const kill = () => {
  try {
    execFileSync('taskkill', ['/pid', String(poeth.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* уже вышел */
  }
}
process.on('exit', kill)

try {
  console.log(`POETH ${EXE}\nпрофиль ${PROFILE} · CDP ${CDP_PORT}`)
  const compT = await findTarget((t) => t.type === 'page' && /\/index\.html/.test(t.url), 30000)
  check('компаньон открылся', !!compT, compT?.url)
  if (!compT) throw new Error('нет компаньона')
  const comp = await connect(compT)
  const versions = await waitFor(() => comp.ev('window.overlayApi ? navigator.userAgent : null'), 15000)
  check('overlayApi в компаньоне', !!versions, versions?.match(/Chrome\/[\d.]+|Electron\/[\d.]+|POETH\/[\d.]+/g)?.join(' '))
  await waitFor(() => comp.ev('document.querySelectorAll("[data-tab]").length > 0'), 15000)

  // вкладки
  const tabs = await comp.ev('[...document.querySelectorAll(".ui-rail:not(.ui-rail--drawer) [data-tab]")].map((b) => b.dataset.tab)')
  check('рельс: вкладки найдены', tabs.length >= 5, tabs.join(', '))
  for (const tab of tabs) {
    const before = comp.errors.length
    await comp.ev(`document.querySelector('.ui-rail:not(.ui-rail--drawer) [data-tab="${tab}"]').click()`)
    await sleep(700)
    const st = await comp.ev(`({ cur: document.querySelector('[data-tab="${tab}"]').className.includes('is-current'), text: (document.querySelector('main') || document.body).innerText.length })`)
    await comp.shot(`tab-${tab}`)
    check(`вкладка ${tab}: открылась, без ошибок`, st.cur && st.text > 40 && comp.errors.length === before,
      `${st.text} симв.${comp.errors.length > before ? ' · ' + comp.errors.slice(before).join(' | ').slice(0, 200) : ''}`)
  }
  // настройки — кнопка шапки (по title/aria-label), «О программе» — кнопка внизу настроек
  const pages = [
    ['настройки', 'settings', `[...document.querySelectorAll('button')].find((x) => /Настройки|Settings/.test(x.getAttribute('aria-label') || x.title || ''))`],
    ['о программе', 'about', `document.querySelector('.onb-settings-links button')`]
  ]
  for (const [name, file, find] of pages) {
    const before = comp.errors.length
    const clicked = await comp.ev(`(() => { const b = ${find}; if (!b) return false; b.click(); return true })()`)
    await sleep(700)
    await comp.shot(`page-${file}`)
    check(`${name}: открылись, без ошибок`, clicked && comp.errors.length === before, clicked ? '' : 'кнопка не найдена')
  }

  // оверлей (без attach — запасной режим)
  const ovT = await findTarget((t) => t.type === 'page' && /\/overlay\.html/.test(t.url), 10000)
  check('оверлей создан (overlay.html)', !!ovT)
  const ov = ovT ? await connect(ovT) : null
  if (ov) check('overlayApi в оверлее', await ov.ev('typeof window.overlayApi === "object"'))

  // S29: проверка отправителя — безопасные каналы (ничего не вводят в игру)
  const fromComp = await comp.ev(callIpc(`window.overlayApi.auth.pasteSession('not-a-session')`))
  check('S29: компаньону pasteSession доступен (неверный формат — отказ по формату)', fromComp.ok && fromComp.value?.error === 'invalid-format', JSON.stringify(fromComp))
  if (ov) {
    const fromOv = await ov.ev(callIpc(`window.overlayApi.auth.pasteSession('not-a-session')`))
    check('S29: оверлею pasteSession запрещён', !fromOv.ok && /untrusted sender/.test(fromOv.error), JSON.stringify(fromOv))
  }
  check('S29: window.open в компаньоне → null', (await comp.ev('window.open("https://example.com/") === null')))
  await comp.ev('location.href = "https://example.com/"').catch(() => null)
  await sleep(800)
  check('S29: переход компаньона на чужой адрес не случился', /\/index\.html/.test(await comp.ev('location.href')))
  const perms = await comp.ev(`Promise.all(['geolocation', 'camera', 'clipboard-write'].map((n) => navigator.permissions.query({ name: n }).then((p) => n + '=' + p.state, (e) => n + '=' + e.name)))`)
  check('S29: разрешения: геолокация и камера — нет, запись в буфер — да', perms.includes('geolocation=denied') && perms.includes('camera=denied') && perms.includes('clipboard-write=granted'), perms.join(' '))

  // секрет PoE 2 (safeStorage)
  if (SEED) {
    const r = await comp.ev(callIpc(`window.overlayApi.trade.setSession('${FAKE_SESSID}')`))
    check('seed: тестовый POESESSID PoE 2 сохранён (safeStorage)', r.ok && r.value === true, JSON.stringify(r))
  }
  if (EXPECT) {
    const r = await comp.ev(callIpc('window.overlayApi.trade.hasSession()'))
    check('секрет из профиля старой версии расшифрован (secret.json)', r.ok && r.value === true, JSON.stringify(r))
    const secret = JSON.parse(readFileSync(path.join(PROFILE, 'secret.json'), 'utf8'))
    check('secret.json зашифрован (нет открытого значения)', secret.encrypted === true && !String(secret.poesessid).includes(FAKE_SESSID))
  }

  // трейд-окно: сайдбар + сайт GGG
  await comp.ev(callIpc('window.overlayApi.tradeWindow.open()'))
  const sideT = await findTarget((t) => t.type === 'page' && /trade-sidebar\.html/.test(t.url), 15000)
  check('трейд-окно: сайдбар (trade-sidebar.html)', !!sideT)
  const siteT = await findTarget((t) => t.type === 'page' && /^https:\/\/(www|ru)\.pathofexile\.com\/trade/.test(t.url), 20000)
  check('трейд-окно: сайт трейда GGG открыт', !!siteT, siteT?.url)
  let site = null
  if (siteT) {
    site = await connect(siteT)
    const title = await waitFor(() => site.ev('document.readyState === "complete" ? document.title : null'), 30000, 500)
    check('сайт загрузился', !!title, title ?? `readyState=${await site.ev('document.readyState').catch(() => '?')}`)
    check('S29: на сайте GGG нет overlayApi', await site.ev('typeof window.overlayApi === "undefined" && typeof require === "undefined"'))
    await site.shot('trade-site')
    await site.send('Network.enable')
    if (SEED) {
      await site.send('Network.setCookie', { ...COOKIE, domain: 'www.pathofexile.com', path: '/', secure: true, httpOnly: true, expires: Math.floor(Date.now() / 1000) + 30 * 86400 })
      // сайт сам ставит свои cookies; запомнить их имена для --expect
      const { cookies } = await site.send('Network.getCookies', { urls: ['https://www.pathofexile.com/'] })
      writeFileSync(path.join(PROFILE, 's34-cookies-seed.json'), JSON.stringify(cookies.map((c) => ({ name: c.name, domain: c.domain, value: c.value, session: c.session }))))
      check('seed: cookies в partition аккаунта', cookies.some((c) => c.name === COOKIE.name), cookies.map((c) => c.name).join(', '))
      // Chromium пишет cookies на диск раз в ~30 с, а прогон закрывает POETH по PID (без штатного выхода) —
      // дождаться записи: имя cookie в файле открытым текстом, значение — зашифровано (v10)
      const db = path.join(PROFILE, 'Partitions/poe-account/Network/Cookies')
      const onDisk = await waitFor(async () => existsSync(db) && readFileSync(db).includes(COOKIE.name), 120000, 1000)
      check('seed: cookie записан на диск, значение не открытым текстом', onDisk && !readFileSync(db).includes(COOKIE.value))
    }
    if (EXPECT) {
      const { cookies } = await site.send('Network.getCookies', { urls: ['https://www.pathofexile.com/'] })
      const mark = cookies.find((c) => c.name === COOKIE.name)
      check('cookie из профиля старой версии прочитан (тот же value)', mark?.value === COOKIE.value, mark ? mark.value : cookies.map((c) => c.name).join(', '))
      const seedFile = path.join(PROFILE, 's34-cookies-seed.json')
      if (existsSync(seedFile)) {
        const old = JSON.parse(readFileSync(seedFile, 'utf8')).filter((c) => !c.session)
        const kept = old.filter((o) => cookies.some((c) => c.name === o.name && c.domain === o.domain))
        check('постоянные cookies сайта со старой версии на месте', kept.length === old.length, `${kept.length}/${old.length}: ${old.map((c) => c.name).join(', ')}`)
      }
    }
  }
  if (sideT) {
    const side = await connect(sideT)
    await side.shot('trade-sidebar')
    const r = await side.ev(callIpc(`window.overlayApi.auth.pasteSession('not-a-session')`))
    check('S29: сайдбару pasteSession запрещён', !r.ok && /untrusted sender/.test(r.error), JSON.stringify(r))
    side.ws.close()
  }
  await comp.ev(callIpc('window.overlayApi.tradeWindow.hide()'))

  // окно входа: открывается официальная страница GGG (сами не входим)
  await comp.ev(callIpc('window.overlayApi.auth.login()'))
  const loginT = await findTarget((t) => t.type === 'page' && /^https:\/\/(www|ru)\.pathofexile\.com\/login/.test(t.url), 20000)
  check('окно входа: страница входа GGG', !!loginT, loginT?.url)
  if (loginT) {
    const login = await connect(loginT)
    await waitFor(() => login.ev('document.readyState === "complete"'), 30000, 500)
    check('окно входа: без overlayApi и node', await login.ev('typeof window.overlayApi === "undefined" && typeof require === "undefined"'))
    await login.shot('login')
    login.ws.close()
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${loginT.id}`).catch(() => null)
  }

  const fatal = log.join('').split('\n').filter((l) => /\[security\]|uncaught|Error:/i.test(l))
  check('лог main без неожиданных ошибок', fatal.every((l) => /untrusted sender|example\.com|pasteSession/i.test(l)), fatal.slice(0, 6).join(' | '))
  check('компаньон: ошибок в консоли нет', comp.errors.length === 0, comp.errors.slice(0, 3).join(' | '))
  comp.ws.close()
  ov?.ws.close()
  site?.ws.close()
} catch (e) {
  check('прогон', false, String(e && e.stack || e))
} finally {
  kill()
  await sleep(500)
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} проверок · профиль ${PROFILE}`)
  writeFileSync(path.join(PROFILE, 's34-live-log.txt'), log.join(''))
  process.exitCode = ok === results.length ? 0 : 1
}
