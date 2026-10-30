// Слушающие сокеты собранного POETH (S49): почему Windows спрашивает про брандмауэр при первом трейд-окне.
// Запускает exe со своим профилем (как check-live: без attach к игре, хоткеи пустые, тосты выключены), через CDP
// открывает трейд-окно (сайт GGG + проверка Cloudflare), вкладку сайта poe.ninja (S43) и окно входа GGG и всё это
// время раз в 200 мс снимает таблицы TCP/UDP Windows (GetExtendedTcpTable/GetExtendedUdpTable) по дереву процессов
// POETH: browser, network, gpu, renderer, utility. Клавиатура и мышь не используются, правила брандмауэра только
// читаются (журнал событий), ничего не добавляется и не удаляется. Закрывает только свой процесс (по PID).
//
//   node tools/electron/check-sockets.mjs --exe=dist-release/win-unpacked/POETH.exe [--profile=<папка>] [--force]
//   --out=<файл> — JSON со всеми сокетами и процессами (для отчёта)
//
// Провал: у процессов POETH появился сокет «на приём» не на loopback:
//  - TCP в состоянии LISTEN на 0.0.0.0 / :: / адресе сетевой карты;
//  - UDP, привязанный к порту явно (bind на конкретный порт: mDNS 5353, SSDP 1900, кандидаты WebRTC), на 0.0.0.0 / ::
//    или адресе сетевой карты.
// Не провал: loopback (порт CDP самой проверки 127.0.0.1) и UDP с неявной привязкой при connect() — клиентские
// сокеты QUIC (HTTP/3) и DNS: они «соединены» с одним сервером, и Windows за них не спрашивает (Chrome так работает
// без правил брандмауэра). Флаг явной привязки — поле SpecificPortBind таблицы UDP_TABLE_OWNER_MODULE.
//
// Окно брандмауэра появляется только для exe, которому ещё нет правила. В момент, когда exe начинает слушать, служба
// брандмауэра сама заводит ему входящие правила «TCP/UDP Query User…» с действием «Блокировать» (журнал брандмауэра,
// событие 2097, изменяет svchost) и показывает окно; ответ человека меняет их (2099). Проверка читает эти события
// для пути exe: есть — Windows спросила. Поэтому exe для прогона — с нового пути (копия win-unpacked), без правил.
// Правила, заведённые Windows, остаются в брандмауэре: проверка их не трогает.

import { execFile, execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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
const PROFILE = opt('profile') ? path.resolve(String(opt('profile'))) : mkdtempSync(path.join(tmpdir(), 'poeth-s49-sockets-'))
const OUT = typeof opt('out') === 'string' ? path.resolve(String(opt('out'))) : path.join(PROFILE, 's49-sockets.json')
const FORCE = !!opt('force')
const CDP_PORT = 9400 + Math.floor(Math.random() * 400)
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
const ps = (command) =>
  new Promise((resolve) =>
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', maxBuffer: 32 << 20 },
      (err, out) => resolve(err ? '' : out))
  )

function idleMs() {
  const cmd = `Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Idle { [StructLayout(LayoutKind.Sequential)] public struct LII { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LII p);
public static uint Ms() { var li = new LII(); li.cbSize = (uint)Marshal.SizeOf(li); GetLastInputInfo(ref li); return unchecked((uint)Environment.TickCount - li.dwTime); } }
"@; [Idle]::Ms()`
  return Number(execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim())
}

// ---------------------------------------------------------------------------
// Снимок сокетов: один процесс PowerShell, C# через P/Invoke, строка JSON раз в 200 мс
// ---------------------------------------------------------------------------

const WATCHER_CS = String.raw`
using System; using System.Collections.Generic; using System.Net; using System.Runtime.InteropServices; using System.Text;
public static class S49Net {
  [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr t, ref int size, bool order, int af, int cls, uint r);
  [DllImport("iphlpapi.dll")] static extern uint GetExtendedUdpTable(IntPtr t, ref int size, bool order, int af, int cls, uint r);
  [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr s, ref PE pe);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr s, ref PE pe);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct PE {
    public uint dwSize; public uint cntUsage; public uint pid; public IntPtr heap; public uint module; public uint threads;
    public uint ppid; public int pri; public uint flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string exe; }
  const int AF_INET = 2, AF_INET6 = 23, TCP_OWNER_PID_LISTENER = 3, UDP_OWNER_MODULE = 2;

  static IntPtr Table(bool tcp, int af, int cls) {
    int size = 0;
    for (int i = 0; i < 6; i++) {
      IntPtr buf = size > 0 ? Marshal.AllocHGlobal(size) : IntPtr.Zero;
      uint r = tcp ? GetExtendedTcpTable(buf, ref size, false, af, cls, 0) : GetExtendedUdpTable(buf, ref size, false, af, cls, 0);
      if (r == 0 && buf != IntPtr.Zero) return buf;
      if (buf != IntPtr.Zero) Marshal.FreeHGlobal(buf);
      if (r != 122) return IntPtr.Zero;
    }
    return IntPtr.Zero;
  }
  static int Port(int p) { return ((p & 0xFF) << 8) | ((p >> 8) & 0xFF); }
  static string V4(int a) { return new IPAddress((long)(uint)a).ToString(); }
  static string V6(IntPtr p, int scope) { byte[] b = new byte[16]; Marshal.Copy(p, b, 0, 16); return new IPAddress(b, scope).ToString(); }

  public static string Snapshot(int root) {
    var parent = new Dictionary<int, int>(); var name = new Dictionary<int, string>();
    IntPtr snap = CreateToolhelp32Snapshot(2, 0);
    PE pe = new PE(); pe.dwSize = (uint)Marshal.SizeOf(typeof(PE));
    if (Process32FirstW(snap, ref pe)) do { parent[(int)pe.pid] = (int)pe.ppid; name[(int)pe.pid] = pe.exe; } while (Process32NextW(snap, ref pe));
    CloseHandle(snap);
    var tree = new HashSet<int>(); if (parent.ContainsKey(root)) tree.Add(root);
    for (bool grew = true; grew; ) { grew = false; foreach (var kv in parent) if (!tree.Contains(kv.Key) && tree.Contains(kv.Value) && kv.Key != kv.Value) { tree.Add(kv.Key); grew = true; } }
    var sb = new StringBuilder("{\"t\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + ",\"procs\":[");
    bool first = true;
    foreach (int p in tree) { sb.Append((first ? "" : ",") + "[" + p + "," + parent[p] + ",\"" + name[p] + "\"]"); first = false; }
    sb.Append("],\"tcp\":["); first = true;
    IntPtr t4 = Table(true, AF_INET, TCP_OWNER_PID_LISTENER);
    if (t4 != IntPtr.Zero) { int n = Marshal.ReadInt32(t4); for (int i = 0; i < n; i++) { IntPtr r = t4 + 4 + i * 24; int pid = Marshal.ReadInt32(r, 20);
      if (tree.Contains(pid)) { sb.Append((first ? "" : ",") + "[" + pid + ",\"" + V4(Marshal.ReadInt32(r, 4)) + "\"," + Port(Marshal.ReadInt32(r, 8)) + "]"); first = false; } } Marshal.FreeHGlobal(t4); }
    IntPtr t6 = Table(true, AF_INET6, TCP_OWNER_PID_LISTENER);
    if (t6 != IntPtr.Zero) { int n = Marshal.ReadInt32(t6); for (int i = 0; i < n; i++) { IntPtr r = t6 + 4 + i * 56; int pid = Marshal.ReadInt32(r, 52);
      if (tree.Contains(pid)) { sb.Append((first ? "" : ",") + "[" + pid + ",\"" + V6(r, Marshal.ReadInt32(r, 16)) + "\"," + Port(Marshal.ReadInt32(r, 20)) + "]"); first = false; } } Marshal.FreeHGlobal(t6); }
    sb.Append("],\"udp\":["); first = true;
    var mdns = new List<string>();
    IntPtr u4 = Table(false, AF_INET, UDP_OWNER_MODULE);
    if (u4 != IntPtr.Zero) { int n = Marshal.ReadInt32(u4); for (int i = 0; i < n; i++) { IntPtr r = u4 + 8 + i * 160; int pid = Marshal.ReadInt32(r, 8); int port = Port(Marshal.ReadInt32(r, 4));
      if (port == 5353) mdns.Add(pid + ":" + V4(Marshal.ReadInt32(r, 0)));
      if (tree.Contains(pid)) { sb.Append((first ? "" : ",") + "[" + pid + ",\"" + V4(Marshal.ReadInt32(r, 0)) + "\"," + port + "," + (Marshal.ReadInt32(r, 24) & 1) + "]"); first = false; } } Marshal.FreeHGlobal(u4); }
    IntPtr u6 = Table(false, AF_INET6, UDP_OWNER_MODULE);
    if (u6 != IntPtr.Zero) { int n = Marshal.ReadInt32(u6); for (int i = 0; i < n; i++) { IntPtr r = u6 + 8 + i * 176; int pid = Marshal.ReadInt32(r, 24); int port = Port(Marshal.ReadInt32(r, 20));
      if (port == 5353) mdns.Add(pid + ":" + V6(r, Marshal.ReadInt32(r, 16)));
      if (tree.Contains(pid)) { sb.Append((first ? "" : ",") + "[" + pid + ",\"" + V6(r, Marshal.ReadInt32(r, 16)) + "\"," + port + "," + (Marshal.ReadInt32(r, 40) & 1) + "]"); first = false; } } Marshal.FreeHGlobal(u6); }
    sb.Append("],\"mdns\":[");
    for (int i = 0; i < mdns.Count; i++) sb.Append((i > 0 ? "," : "") + "\"" + mdns[i] + "\"");
    return sb.Append("]}").ToString();
  }
}`

function startWatcher(rootPid, onSnap) {
  const script = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
${WATCHER_CS}
'@
while ($true) {
  try { [Console]::Out.WriteLine([S49Net]::Snapshot(${rootPid})) } catch { [Console]::Out.WriteLine('{"error":"' + ($_.Exception.Message -replace '["\\\\]', ' ') + '"}') }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 200
}`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const w = spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { stdio: ['ignore', 'pipe', 'pipe'] })
  let buf = ''
  w.stdout.on('data', (d) => {
    buf += String(d)
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line.startsWith('{')) {
        try {
          onSnap(JSON.parse(line))
        } catch {
          /* неполная строка */
        }
      }
    }
  })
  w.stderr.on('data', (d) => process.stderr.write(`[watcher] ${d}`))
  return w
}

// ---------------------------------------------------------------------------
// Сбор: кто, что, когда (по фазам)
// ---------------------------------------------------------------------------

let phase = 'start'
let snaps = 0
let lastError = ''
const endpoints = new Map() // key → { proto, pid, addr, port, explicit, first, last, phase }
const procs = new Map() // pid → { ppid, exe, type, first }
const mdnsOwners = new Set()

function onSnap(s) {
  if (s.error) {
    lastError = s.error
    return
  }
  snaps++
  for (const [pid, ppid, exe] of s.procs) if (!procs.has(pid)) procs.set(pid, { ppid, exe, type: '?', phase })
  const add = (proto, pid, addr, port, explicit) => {
    const key = `${proto}|${pid}|${addr}|${port}`
    const e = endpoints.get(key)
    if (e) e.last = s.t
    else endpoints.set(key, { proto, pid, addr, port, explicit: !!explicit, first: s.t, last: s.t, phase })
  }
  for (const [pid, addr, port] of s.tcp) add('tcp-listen', pid, addr, port, 1)
  for (const [pid, addr, port, explicit] of s.udp) add('udp', pid, addr, port, explicit)
  for (const m of s.mdns) mdnsOwners.add(m)
}

/** Тип процесса Chromium из командной строки (--type=…, --utility-sub-type=…). */
async function labelProcs() {
  const unknown = [...procs].filter(([, p]) => p.type === '?').map(([pid]) => pid)
  if (!unknown.length) return
  const out = await ps(`Get-CimInstance Win32_Process -Filter "${unknown.map((p) => `ProcessId=${p}`).join(' or ')}" | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`)
  for (const line of out.split(/\r?\n/)) {
    const [pid, cmd = ''] = line.split('\t')
    const p = procs.get(Number(pid))
    if (!p) continue
    const type = /--type=([\w-]+)/.exec(cmd)?.[1]
    const sub = /--utility-sub-type=([\w.]+)/.exec(cmd)?.[1]
    p.type = !type ? (/POETH\.exe/i.test(cmd) ? 'browser' : p.exe) : sub ? `${type}:${sub.replace(/\.mojom\./, '.')}` : type
  }
}

const isLoopback = (a) => a === '127.0.0.1' || a === '::1' || a.startsWith('127.')
/** Сокет «на приём» не на loopback — то, о чём спрашивает брандмауэр. */
const isInbound = (e) => !isLoopback(e.addr) && (e.proto === 'tcp-listen' || e.explicit)

/** Правила брандмауэра для этого exe (только чтение): есть — Windows уже не спросит, проверка окна неполная. */
async function firewallRules() {
  const out = await ps(`Get-NetFirewallApplicationFilter | Where-Object { $_.Program -eq '${EXE.replace(/'/g, "''")}' } | Get-NetFirewallRule | ForEach-Object { "$($_.DisplayName) $($_.Action)" }`)
  return out.split(/\r?\n/).filter(Boolean)
}

/** События журнала брандмауэра 2097/2099 с этим exe с начала прогона (только чтение): время, id, правило. */
async function firewallEvents(since) {
  const out = await ps(`$exe = '${EXE.replace(/'/g, "''")}'.ToLower()
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Windows Firewall With Advanced Security/Firewall'; Id = 2097, 2099; StartTime = [datetime]::Parse('${since.toISOString()}') } -ErrorAction SilentlyContinue |
  Where-Object { $_.Message.ToLower().Contains($exe) } |
  ForEach-Object { $id = ($_.Message -split "\`n" | Where-Object { $_ -match 'Rule ID' }) -replace '^\\s*Rule ID:\\s*', '' -replace '\\{.*', ''; "$($_.TimeCreated.ToString('HH:mm:ss.fff')) $($_.Id) $($id.Trim())" }`)
  return out.split(/\r?\n/).filter(Boolean)
}

// ---------------------------------------------------------------------------
// CDP (как check-live)
// ---------------------------------------------------------------------------

const targets = async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
const findTarget = (pred, ms) => waitFor(async () => (await targets()).find(pred), ms)

async function connect(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)))
  let id = 0
  const pend = new Map()
  ws.on('message', (d) => {
    const m = JSON.parse(String(d))
    if (m.id) {
      pend.get(m.id)?.(m)
      pend.delete(m.id)
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
  return { ws, send, ev }
}
const callIpc = (expr) => `(async () => { try { return { ok: true, value: await (${expr}) } } catch (e) { return { ok: false, error: String(e && e.message || e) } } })()`

// Сбор кандидатов WebRTC без STUN/TURN (iceServers: []) — наружу ничего не уходит; с политикой
// disable_non_proxied_udp кандидатов 0. Тот же путь, что у проверки Cloudflare: фабрика PeerConnection в renderer.
const RTC_PROBE = `(async () => {
  const pc = new RTCPeerConnection({ iceServers: [] })
  const out = []
  pc.onicecandidate = (e) => { if (e.candidate && e.candidate.candidate) out.push(e.candidate.candidate.split(' ').slice(4, 8).join(' ')) }
  pc.createDataChannel('s49')
  await pc.setLocalDescription(await pc.createOffer())
  await new Promise((r) => setTimeout(r, 3000))
  pc.close()
  return out
})()`

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
    'toggleTradeWindow', 'toggleSites', 'prevStep', 'nextStep']
  writeFileSync(settingsFile, JSON.stringify({
    schemaVersion: 2,
    game: 'poe1',
    startup: { firstRunDone: true, minimized: false, withWindows: false },
    updates: { check: false },
    hotkeys: Object.fromEntries(HOTKEYS.map((a) => [a, ''])),
    chatCommands: []
  }))
}

const started = new Date()
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
const watcher = startWatcher(poeth.pid, onSnap)
const kill = () => {
  for (const pid of [poeth.pid, watcher.pid]) {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      /* уже вышел */
    }
  }
}
process.on('exit', kill)

/** Фаза: действие, потом ждать settleMs, пока сайт делает своё (Cloudflare, WebRTC, сервис-воркеры). */
async function runPhase(name, settleMs, action) {
  phase = name
  console.log(`\n— фаза «${name}»`)
  await action()
  await sleep(settleMs)
  await labelProcs()
}

const rulesBefore = await firewallRules()

try {
  console.log(`POETH ${EXE}\nпрофиль ${PROFILE} · CDP ${CDP_PORT} · PID ${poeth.pid}`)
  check('у exe ещё нет правил брандмауэра (Windows спросит, если он начнёт слушать)', rulesBefore.length === 0,
    rulesBefore.length ? `${rulesBefore.join(', ')} — скопируйте win-unpacked на новый путь` : '')
  let comp = null
  await runPhase('start', 8000, async () => {
    const compT = await findTarget((t) => t.type === 'page' && /\/index\.html/.test(t.url), 30000)
    check('компаньон открылся', !!compT, compT?.url)
    if (!compT) throw new Error('нет компаньона')
    comp = await connect(compT)
    const ua = await waitFor(() => comp.ev('window.overlayApi ? navigator.userAgent : null'), 15000)
    check('overlayApi в компаньоне', !!ua, ua?.match(/Chrome\/[\d.]+|Electron\/[\d.]+|POETH\/[\d.]+/g)?.join(' '))
  })
  check('снимки сокетов идут', snaps > 10, `${snaps} снимков${lastError ? ` · ошибка ${lastError}` : ''}`)

  await runPhase('trade', 25000, async () => {
    await comp.ev(callIpc('window.overlayApi.tradeWindow.open()'))
    const siteT = await findTarget((t) => t.type === 'page' && /^https:\/\/(www|ru)\.pathofexile\.com\//.test(t.url), 20000)
    check('трейд-окно: сайт GGG', !!siteT, siteT?.url)
    if (siteT) {
      const site = await connect(siteT)
      const title = await waitFor(() => site.ev('document.readyState === "complete" ? document.title : null'), 30000, 500)
      check('сайт загрузился', !!title, title ?? '')
      // есть ли WebRTC на странице сайта (Cloudflare/GGG) — для отчёта, без вмешательства
      const rtc = await site.ev('typeof RTCPeerConnection').catch(() => '?')
      console.log(`  RTCPeerConnection на сайте: ${rtc}`)
      site.ws.close()
    }
  })

  await runPhase('sites', 20000, async () => {
    // первая вкладка сайта сначала показывает заметку о сайтах (noteSeen) — без неё вью не создаётся
    await comp.ev(callIpc('window.overlayApi.sites.ackNote()'))
    const r = await comp.ev(callIpc(`window.overlayApi.sites.select('ninja')`))
    const ninjaT = await findTarget((t) => t.type === 'page' && /^https:\/\/poe\.ninja\//.test(t.url), 20000)
    check('вкладка сайта poe.ninja открылась', !!ninjaT, ninjaT?.url ?? JSON.stringify(r))
  })

  await runPhase('login', 20000, async () => {
    await comp.ev(callIpc('window.overlayApi.tradeWindow.hide()'))
    await comp.ev(callIpc('window.overlayApi.auth.login()'))
    const loginT = await findTarget((t) => t.type === 'page' && /^https:\/\/(www|ru)\.pathofexile\.com\/login/.test(t.url), 20000)
    check('окно входа: страница входа GGG', !!loginT, loginT?.url)
  })

  // последней: свой RTCPeerConnection в каждой сессии (компаньон — default, сайт GGG — аккаунт, poe.ninja — сайты S43)
  await runPhase('probe', 8000, async () => {
    const list = await targets()
    const pick = (re) => list.find((t) => t.type === 'page' && re.test(t.url))
    const pages = [
      ['компаньон', comp],
      ['сайт GGG (сессия аккаунта)', pick(/^https:\/\/(www|ru)\.pathofexile\.com\/(?!login)/)],
      ['poe.ninja (сессия сайтов S43)', pick(/^https:\/\/poe\.ninja\//)]
    ]
    for (const [label, target] of pages) {
      const page = target === comp ? comp : target ? await connect(target) : null
      if (!page) {
        check(`WebRTC: ${label} — страница найдена`, false, list.map((t) => `${t.type} ${t.url.split('?')[0]}`).join(' · '))
        continue
      }
      const cands = await page.ev(RTC_PROBE).catch((e) => [`ошибка: ${e.message}`])
      check(`WebRTC: ${label} — 0 кандидатов (политика disable_non_proxied_udp)`, cands.length === 0, cands.join('; '))
      if (page !== comp) page.ws.close()
    }
  })
  comp.ws.close()
} catch (e) {
  check('прогон', false, String((e && e.stack) || e))
} finally {
  await labelProcs()
  const firstOf = (pid) => procs.get(pid)
  const rows = [...endpoints.values()].sort((a, b) => a.first - b.first)
  const fmt = (e) => {
    const p = firstOf(e.pid)
    const life = e.last - e.first
    return `  ${e.phase.padEnd(6)} ${String(e.pid).padStart(6)} ${(p?.type ?? '?').padEnd(30)} ${e.proto.padEnd(10)} ${`${e.addr.includes(':') ? `[${e.addr}]` : e.addr}:${e.port}`.padEnd(46)} ${e.explicit ? 'bind' : 'auto'} ${life >= 1000 ? `${Math.round(life / 1000)} с` : `${life} мс`}`
  }
  console.log(`\nСокеты процессов POETH (фаза появления, PID, тип, протокол, адрес, привязка, сколько жил):`)
  for (const e of rows) console.log(`${isInbound(e) ? '!' : ' '}${fmt(e)}`)
  console.log(`\nПроцессы: ${[...procs].map(([pid, p]) => `${pid} ${p.type}`).join(' · ')}`)
  const poethMdns = [...mdnsOwners].filter((m) => procs.has(Number(m.split(':')[0])))
  console.log(`mDNS 5353 у процессов POETH: ${poethMdns.length ? poethMdns.join(', ') : 'нет'}`)

  const inbound = rows.filter(isInbound)
  check('нет сокетов на приём не на loopback (TCP LISTEN / UDP с явным bind)', inbound.length === 0,
    inbound.map((e) => `${firstOf(e.pid)?.type ?? e.pid} ${e.proto} ${e.addr}:${e.port} (${e.phase})`).join('; '))
  check('нет UDP 5353 (mDNS) у процессов POETH', poethMdns.length === 0, poethMdns.join(', '))
  const tcpOk = rows.filter((e) => e.proto === 'tcp-listen').every((e) => isLoopback(e.addr))
  check('TCP LISTEN только на loopback (порт CDP проверки)', tcpOk)
  const events = await firewallEvents(started)
  check('Windows не спрашивала: в журнале брандмауэра нет правил «Query User» для этого exe', events.length === 0, events.join(', '))

  kill()
  await sleep(500)
  writeFileSync(OUT, JSON.stringify({ exe: EXE, started, endpoints: rows, procs: Object.fromEntries(procs), mdns: [...mdnsOwners], rulesBefore, events }, null, 1))
  writeFileSync(path.join(PROFILE, 's49-sockets-log.txt'), log.join(''))
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} проверок · профиль ${PROFILE} · ${OUT}`)
  process.exitCode = ok === results.length ? 0 : 1
}
