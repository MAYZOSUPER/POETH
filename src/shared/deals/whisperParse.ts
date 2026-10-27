// Разбор строк Client.txt Path of Exile 1 для менеджера сделок (чистый TS, без electron).
//
// Источники (MIT):
//  - каналы чата и камни: CLIENT_STRINGS из данных Awakened PoE Trade
//    (SnosMe/awakened-poe-trade @ 3188208957, resources/data/poe1/{en,ru}/client_strings.json:
//    CHAT_WHISPER_FROM/TO, CHAT_WEBTRADE_GEM);
//  - регэкспы сообщений трейда EN/RU: APT renderer/src/web/client-log/client-log.ts
//    (TRADE_WHISPER, TRADE_BULK_WHISPER) © Alexander Drozdov, MIT. Отличия от APT: цена и лига
//    ленивые (лига с « in »/точкой), сообщения без цены и без «Hi, », необязательный тег гильдии у @To;
//  - события области RU: «присоединился» — PoE-Overlay (Kyusung4698, MIT) и SlimTrade
//    (zmilla93, MIT); EN-строки сверены по настоящему Client.txt.
// Не найдено в открытых источниках (проверить в RU-клиенте): RU «Trade accepted/cancelled»,
// RU «DND»; RU «покинул область» и «Режим "отошёл"» взяты из POE-Trades-Companion (это строки
// игры, кода оттуда нет) — помечены как непроверенные.
//
// Язык текста сделки не равен языку клиента: RU-клиент получает EN-сообщения с www-сайта и
// наоборот, поэтому шаблоны трейда пробуются все, а язык берётся из совпавшего шаблона.

import type { DealDir, DealGem, DealLang, DealPrice, StashPos } from '../types/deals'

// ---------------------------------------------------------------------------
// Префикс строки лога: «2026/07/26 04:15:20 74458375 cffb0658 [INFO Client 19012] текст»
// ---------------------------------------------------------------------------

export interface LogLine {
  /** локальное время из строки (мс), null — префикс не распознан */
  ts: number | null
  /** «2026/07/26» */
  date?: string
  /** «04:15:20» */
  time?: string
  /** миллисекунды с запуска клиента */
  uptimeMs?: number
  /** INFO / DEBUG / WARN… */
  level?: string
  /** PID клиента */
  pid?: number
  /** текст после «] » */
  text: string
}

// Хэш после счётчика обычно 8 hex-символов, но формат не документирован — берём любое слово.
const PREFIX = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d+)(?: \S+)? \[(\w+) Client (\d+)\] (.*)$/

/** Отрезать дату, время, счётчик, хэш и «[INFO Client N]». */
export function splitLogLine(line: string): LogLine | null {
  const s = line.replace(/[\r\n]+$/, '')
  const m = PREFIX.exec(s)
  if (m) {
    const [, y, mo, d, h, mi, sec, up, level, pid, text] = m
    return {
      ts: new Date(+y, +mo - 1, +d, +h, +mi, +sec).getTime(),
      date: `${y}/${mo}/${d}`,
      time: `${h}:${mi}:${sec}`,
      uptimeMs: Number(up),
      level,
      pid: Number(pid),
      text
    }
  }
  // старый/незнакомый префикс — как в APT: всё после первой «] »
  const i = s.indexOf('] ')
  if (i < 0) return null
  const text = s.slice(i + 2)
  return text ? { ts: null, text } : null
}

// ---------------------------------------------------------------------------
// Каналы чата
// ---------------------------------------------------------------------------

export type ChatChannel =
  | 'whisper.from'
  | 'whisper.to'
  | 'system'
  | 'global'
  | 'trade'
  | 'party'
  | 'guild'

export interface ChatLine {
  channel: ChatChannel
  /** язык клиента — известен только у whisper'ов (@From/@От кого) */
  clientLang?: DealLang
  guild?: string
  player?: string
  body: string
}

// CHAT_WHISPER_FROM/TO (APT client_strings en/ru). У @To тег гильдии в APT не предусмотрен —
// разрешаем на всякий случай.
const WHISPER_RES: { re: RegExp; channel: ChatChannel; lang: DealLang }[] = [
  { re: /^@From (?:<(?<guild>.+?)> )?(?<player>.+?): (?<body>.+)$/, channel: 'whisper.from', lang: 'en' },
  { re: /^@To (?:<(?<guild>.+?)> )?(?<player>.+?): (?<body>.+)$/, channel: 'whisper.to', lang: 'en' },
  { re: /^@От кого (?:<(?<guild>.+?)> )?(?<player>.+?): (?<body>.+)$/, channel: 'whisper.from', lang: 'ru' },
  { re: /^@Кому (?:<(?<guild>.+?)> )?(?<player>.+?): (?<body>.+)$/, channel: 'whisper.to', lang: 'ru' }
]

// CHAT_GLOBAL/TRADE/PARTY/GUILD/SYSTEM — одинаковы в en и ru.
const CHANNEL_RES: { re: RegExp; channel: ChatChannel }[] = [
  { re: /^#(?:<(?<guild>.+?)> )?(?<player>.+?): (?<body>.+)$/, channel: 'global' },
  { re: /^\$(?:<(?<guild>.+?)> )?(?<player>.+?): (?<body>.+)$/, channel: 'trade' },
  { re: /^%(?:<(?<guild>.+?)> )?(?<player>.+?): (?<body>.+)$/, channel: 'party' },
  { re: /^&(?:<(?<guild>.+?)> )?(?<player>.+?): (?<body>.+)$/, channel: 'guild' },
  { re: /^: (?<body>.+)$/, channel: 'system' }
]

/** Текст после префикса лога → канал, игрок, тег гильдии, тело. */
export function parseChat(text: string): ChatLine | null {
  for (const { re, channel, lang } of WHISPER_RES) {
    const m = re.exec(text)
    if (m?.groups) return withGroups({ channel, clientLang: lang, body: '' }, m.groups)
  }
  for (const { re, channel } of CHANNEL_RES) {
    const m = re.exec(text)
    if (m?.groups) return withGroups({ channel, body: '' }, m.groups)
  }
  return null
}

function withGroups(base: ChatLine, g: Record<string, string | undefined>): ChatLine {
  const out: ChatLine = { ...base, body: g.body ?? '' }
  if (g.player) out.player = g.player
  if (g.guild) out.guild = g.guild
  return out
}

// ---------------------------------------------------------------------------
// Сообщения трейда (обычные и bulk)
// ---------------------------------------------------------------------------

export interface TradeRequest {
  kind: 'item' | 'bulk'
  /** язык шаблона сообщения */
  lang: DealLang
  /** предмет без количества и без «level N Q%» у камней */
  item: string
  /** количество (bulk) */
  itemAmount?: number
  gem?: DealGem
  /** цена текстом; '' — сообщение без цены */
  price: string
  priceValue?: DealPrice
  league: string
  tab?: string
  pos?: StashPos
  message?: string
}

interface TradePattern {
  lang: DealLang
  kind: 'item' | 'bulk'
  re: RegExp
}

// Порядок важен: RU-bulk и RU-обычное начинаются одинаково — сначала шаблоны с координатами.
const TRADE_PATTERNS: TradePattern[] = [
  // APT TRADE_WHISPER.en (+ необязательное «Hi, », ленивая цена)
  {
    lang: 'en',
    kind: 'item',
    re: /^(?:Hi, )?I would like to buy your (?<item>.+) listed for (?<price>.+?) in (?<league>.+) \(stash tab "(?<tab>.*)"; position: left (?<left>\d+), top (?<top>\d+)\)(?<message>.*)$/
  },
  // без цены (предмет выставлен без buyout)
  {
    lang: 'en',
    kind: 'item',
    re: /^(?:Hi, )?I would like to buy your (?<item>.+) in (?<league>.+?) \(stash tab "(?<tab>.*)"; position: left (?<left>\d+), top (?<top>\d+)\)(?<message>.*)$/
  },
  // APT TRADE_WHISPER.ru
  {
    lang: 'ru',
    kind: 'item',
    re: /^Здравствуйте, хочу купить у вас (?<item>.+) за (?<price>.+?) в лиге (?<league>.+) \(секция "(?<tab>.*)"; позиция: (?<left>\d+) столбец, (?<top>\d+) ряд\)(?<message>.*)$/
  },
  {
    lang: 'ru',
    kind: 'item',
    re: /^Здравствуйте, хочу купить у вас (?<item>.+) в лиге (?<league>.+?) \(секция "(?<tab>.*)"; позиция: (?<left>\d+) столбец, (?<top>\d+) ряд\)(?<message>.*)$/
  },
  // APT TRADE_BULK_WHISPER.en / .ru (лига ленивая: точка в приписке не съедается)
  {
    lang: 'en',
    kind: 'bulk',
    re: /^(?:Hi, )?I'd like to buy your (?<item>.+) for my (?<price>.+?) in (?<league>.+?)\.(?<message>.*)$/
  },
  {
    lang: 'ru',
    kind: 'bulk',
    re: /^Здравствуйте, хочу купить у вас (?<item>.+) за (?<price>.+?) в лиге (?<league>.+?)\.(?<message>.*)$/
  }
]

// CHAT_WEBTRADE_GEM (APT client_strings en/ru)
const GEM_RES: RegExp[] = [
  /^level (?<lvl>\d+) (?<qual>\d+)% (?<name>.+)$/,
  /^уровень (?<lvl>\d+) (?<qual>\d+)% (?<name>.+)$/
]

const AMOUNT = /^(?<n>\d+(?:[.,]\d+)?) (?<rest>.+)$/

/** «5 chaos» / «1,5 divine» → {amount, currency}; без числа — undefined. */
export function parsePrice(text: string): DealPrice | undefined {
  const m = AMOUNT.exec(text.trim())
  if (!m?.groups) return undefined
  const amount = Number(m.groups.n.replace(',', '.'))
  return Number.isFinite(amount) ? { amount, currency: m.groups.rest.trim() } : undefined
}

/** Тело whisper'а → запрос на покупку (или null, если это обычный разговор). */
export function parseTradeMessage(body: string): TradeRequest | null {
  const text = body.trim()
  for (const p of TRADE_PATTERNS) {
    const m = p.re.exec(text)
    if (!m?.groups) continue
    const g = m.groups
    const req: TradeRequest = {
      kind: p.kind,
      lang: p.lang,
      item: g.item.trim(),
      price: (g.price ?? '').trim(),
      league: g.league.trim()
    }
    if (req.price) {
      const pv = parsePrice(req.price)
      if (pv) req.priceValue = pv
    }
    if (p.kind === 'bulk') {
      const a = AMOUNT.exec(req.item)
      if (a?.groups) {
        req.itemAmount = Number(a.groups.n.replace(',', '.'))
        req.item = a.groups.rest.trim()
      }
    } else {
      for (const re of GEM_RES) {
        const gm = re.exec(req.item)
        if (gm?.groups) {
          req.gem = { level: Number(gm.groups.lvl), quality: Number(gm.groups.qual) }
          req.item = gm.groups.name.trim()
          break
        }
      }
      if (g.tab !== undefined) req.tab = g.tab
      if (g.left && g.top) req.pos = { left: Number(g.left), top: Number(g.top) }
    }
    const msg = (g.message ?? '').trim()
    if (msg) req.message = msg
    return req
  }
  return null
}

// ---------------------------------------------------------------------------
// Системные события (канал «: …»)
// ---------------------------------------------------------------------------

export type SystemEvent =
  | { kind: 'joined' | 'left'; player: string; lang: DealLang }
  | { kind: 'tradeAccepted' | 'tradeCancelled'; lang: DealLang }
  | { kind: 'afk' | 'dnd'; on: boolean; lang: DealLang }

interface SystemPattern {
  re: RegExp
  lang: DealLang
  make: (g: Record<string, string>) => SystemEvent
}

const SYSTEM_PATTERNS: SystemPattern[] = [
  // EN — сверено по Client.txt
  { re: /^(?<p>.+) has joined the area\.$/, lang: 'en', make: (g) => ({ kind: 'joined', player: g.p, lang: 'en' }) },
  { re: /^(?<p>.+) has left the area\.$/, lang: 'en', make: (g) => ({ kind: 'left', player: g.p, lang: 'en' }) },
  { re: /^Trade accepted\.$/, lang: 'en', make: () => ({ kind: 'tradeAccepted', lang: 'en' }) },
  { re: /^Trade cancelled\.$/, lang: 'en', make: () => ({ kind: 'tradeCancelled', lang: 'en' }) },
  { re: /^AFK mode is now ON\b/, lang: 'en', make: () => ({ kind: 'afk', on: true, lang: 'en' }) },
  { re: /^AFK mode is now OFF\b/, lang: 'en', make: () => ({ kind: 'afk', on: false, lang: 'en' }) },
  { re: /^DND mode is now ON\b/, lang: 'en', make: () => ({ kind: 'dnd', on: true, lang: 'en' }) },
  { re: /^DND mode is now OFF\b/, lang: 'en', make: () => ({ kind: 'dnd', on: false, lang: 'en' }) },
  // RU — «присоединился.» (PoE-Overlay, SlimTrade); остальное не проверено в игре
  {
    re: /^(?<p>.+?) присоединил(?:ся|ась)(?: к области)?\.$/,
    lang: 'ru',
    make: (g) => ({ kind: 'joined', player: g.p, lang: 'ru' })
  },
  { re: /^(?<p>.+?) покинула? область\.$/, lang: 'ru', make: (g) => ({ kind: 'left', player: g.p, lang: 'ru' }) },
  { re: /^Режим "отош[её]л" включ[её]н/, lang: 'ru', make: () => ({ kind: 'afk', on: true, lang: 'ru' }) },
  { re: /^Режим "отош[её]л" выключен/, lang: 'ru', make: () => ({ kind: 'afk', on: false, lang: 'ru' }) }
]

export function parseSystemMessage(body: string): SystemEvent | null {
  for (const p of SYSTEM_PATTERNS) {
    const m = p.re.exec(body)
    if (m) return p.make((m.groups ?? {}) as Record<string, string>)
  }
  return null
}

// ---------------------------------------------------------------------------
// Строка лога целиком
// ---------------------------------------------------------------------------

export interface WhisperEvent {
  type: 'whisper'
  dir: DealDir
  player: string
  guild?: string
  body: string
  /** запрос на покупку, если сообщение — шаблон трейда */
  trade: TradeRequest | null
  clientLang: DealLang
  ts: number | null
}

export interface SystemLogEvent {
  type: 'system'
  event: SystemEvent
  ts: number | null
}

export type LogEvent = WhisperEvent | SystemLogEvent

/** Строка Client.txt → событие для менеджера сделок (whisper или системное), иначе null. */
export function parseLogLine(line: string): LogEvent | null {
  const ll = splitLogLine(line)
  if (!ll) return null
  const chat = parseChat(ll.text)
  if (!chat) return null
  if (chat.channel === 'whisper.from' || chat.channel === 'whisper.to') {
    const ev: WhisperEvent = {
      type: 'whisper',
      dir: chat.channel === 'whisper.from' ? 'in' : 'out',
      player: chat.player ?? '',
      body: chat.body,
      trade: parseTradeMessage(chat.body),
      clientLang: chat.clientLang ?? 'en',
      ts: ll.ts
    }
    if (chat.guild) ev.guild = chat.guild
    return ev
  }
  if (chat.channel === 'system') {
    const event = parseSystemMessage(chat.body)
    return event ? { type: 'system', event, ts: ll.ts } : null
  }
  return null
}
