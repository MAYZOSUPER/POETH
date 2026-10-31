// Сайты в трейд-окне (S43, B5): реестр сайтов, закладки игрока и правила навигации вкладок. Чистый модуль
// (main, renderer, тесты), без electron.
//  - Первая вкладка «Трейд» — официальный сайт на сессии аккаунта (S5, net/siteContents.ts). Остальные — на
//    отдельной сессии SITES_PARTITION: без cookies аккаунта и отдельно от сессии API-запросов (net/session.ts).
//  - Каждая вкладка ходит только по хостам СВОЕГО сайта (siteNavDecision). Ссылка на другой сайт реестра —
//    в его вкладку, на поиск трейда — во вкладку «Трейд», на allowlist @shared/links и сайты реестра —
//    в системный браузер; остальное — никуда.
//  - Закладки игрока — только https и публичное имя хоста (validateBookmark); вкладка закладки ходит по её хосту.
// Тексты сайтов не копируем и рекламу не режем: вкладка — это сайт как в браузере.
// S64: список сайтов — по игре (sitesFor). У PoE 2 свои вкладки: poe.ninja, Maxroll и Mobalytics — разделы PoE 2
// тех же сайтов (у них свои id: хосты общие, а домашняя страница другая), poe2db, вики PoE 2, poe2.re и
// poe2-regex-ru (генераторы regex, лицензии нет — только сайт во вкладке), PoE 2 Scout. Без игры функции работают
// как в S43 — по списку PoE 1.

import { GAME_IDS, type GameId } from './games'
import type { GameLang } from './types/settings'
import { isAllowedExternalUrl } from './links'
import { parseTradeUrl } from './favorites/tradeUrl'

/** Отдельная сессия сайтов: cookies сайтов, согласие на cookies, проверки Cloudflare. Не сессия аккаунта. */
export const SITES_PARTITION = 'persist:poeth-sites'

export type SiteId =
  | 'ninja'
  | 'poedb'
  | 'wiki'
  | 'maxroll'
  | 'mobalytics'
  | 'poelab'
  | 'craft'
  | 'scout'
  // PoE 2 (S64)
  | 'ninja2'
  | 'poe2db'
  | 'wiki2'
  | 'maxroll2'
  | 'mobalytics2'
  | 'poe2re'
  | 'regexru'

/** Вкладка трейд-окна: «Трейд», сайт реестра, закладка игрока (`bm:<id>`) или страница «Сайты» (закладки, данные). */
export type SiteTabId = 'trade' | 'manage' | SiteId | `bm:${string}`

export interface SiteDef {
  id: SiteId
  /** название на вкладке и в подсказке */
  name: string
  /** буквы на вкладке (чужие favicon не грузим) */
  mark: string
  /** о чём сайт — ключ i18n */
  aboutKey: string
  /** главный фрейм ходит только по этим хостам (точное совпадение, https) */
  hosts: readonly string[]
  /** сайт только на английском (подсказка на вкладке) */
  enOnly: boolean
  /** домашняя страница по языку клиента игры */
  home(lang: GameLang): string
}

/** Сайты по умолчанию (порядок = порядок вкладок). poedb — на языке клиента игры. */
export const SITES: readonly SiteDef[] = [
  {
    id: 'ninja',
    name: 'poe.ninja',
    mark: 'N',
    aboutKey: 'sites.about.ninja',
    hosts: ['poe.ninja'],
    enOnly: true,
    home: () => 'https://poe.ninja/poe1/economy'
  },
  {
    id: 'poedb',
    name: 'poedb',
    mark: 'DB',
    aboutKey: 'sites.about.poedb',
    hosts: ['poedb.tw'],
    enOnly: false,
    home: (lang) => `https://poedb.tw/${poedbLang(lang)}/`
  },
  {
    id: 'wiki',
    name: 'PoE Wiki',
    mark: 'W',
    aboutKey: 'sites.about.wiki',
    hosts: ['www.poewiki.net', 'poewiki.net'],
    enOnly: true,
    home: () => 'https://www.poewiki.net/'
  },
  {
    id: 'maxroll',
    name: 'Maxroll',
    mark: 'M',
    aboutKey: 'sites.about.maxroll',
    hosts: ['maxroll.gg'],
    enOnly: true,
    home: () => 'https://maxroll.gg/poe'
  },
  {
    // Mobalytics: PoE 1 — /poe, PoE 2 — /poe-2 (вкладки сайтов пока только у PoE 1). www. перенаправляет сюда же.
    // Русского интерфейса не нашли (локали в адресе — de_de, fr_fr, es_es и др.). Базы предметов PoE 1 с адресом
    // у каждой вещи нет — глубоких ссылок нет. Вход (Google/Discord) — чужие хосты: только «В браузере».
    id: 'mobalytics',
    name: 'Mobalytics',
    mark: 'MB',
    aboutKey: 'sites.about.mobalytics',
    hosts: ['mobalytics.gg'],
    enOnly: true,
    home: () => 'https://mobalytics.gg/poe'
  },
  {
    id: 'poelab',
    name: 'poelab',
    mark: 'L',
    aboutKey: 'sites.about.poelab',
    hosts: ['www.poelab.com', 'poelab.com'],
    enOnly: true,
    home: () => 'https://www.poelab.com/'
  },
  {
    id: 'craft',
    name: 'Craft of Exile',
    mark: 'C',
    aboutKey: 'sites.about.craft',
    hosts: ['www.craftofexile.com', 'craftofexile.com'],
    enOnly: true,
    home: () => 'https://www.craftofexile.com/'
  },
  {
    id: 'scout',
    name: 'PoE Scout',
    mark: 'S',
    aboutKey: 'sites.about.scout',
    hosts: ['poe2scout.com'],
    enOnly: true,
    home: () => 'https://poe2scout.com/'
  }
]

/**
 * Сайты PoE 2 (S64, проверено 31.10.2026: главные страницы отвечают). Порядок = порядок вкладок. poe2db — на языке
 * клиента игры, poe2-regex-ru — генератор regex для русского клиента. Только ссылки: тексты и данные этих сайтов
 * POETH не берёт (у poe2.re и poe2-regex-ru лицензии нет).
 */
export const SITES_POE2: readonly SiteDef[] = [
  {
    id: 'ninja2',
    name: 'poe.ninja',
    mark: 'N',
    aboutKey: 'sites.about.ninja2',
    hosts: ['poe.ninja'],
    enOnly: true,
    home: () => 'https://poe.ninja/poe2/economy'
  },
  {
    id: 'poe2db',
    name: 'poe2db',
    mark: 'DB',
    aboutKey: 'sites.about.poe2db',
    hosts: ['poe2db.tw'],
    enOnly: false,
    home: (lang) => `https://poe2db.tw/${poedbLang(lang)}/`
  },
  {
    id: 'wiki2',
    name: 'PoE 2 Wiki',
    mark: 'W',
    aboutKey: 'sites.about.wiki2',
    hosts: ['www.poe2wiki.net', 'poe2wiki.net'],
    enOnly: true,
    home: () => 'https://www.poe2wiki.net/'
  },
  {
    id: 'maxroll2',
    name: 'Maxroll',
    mark: 'M',
    aboutKey: 'sites.about.maxroll2',
    hosts: ['maxroll.gg'],
    enOnly: true,
    home: () => 'https://maxroll.gg/poe2'
  },
  {
    id: 'mobalytics2',
    name: 'Mobalytics',
    mark: 'MB',
    aboutKey: 'sites.about.mobalytics2',
    hosts: ['mobalytics.gg'],
    enOnly: true,
    home: () => 'https://mobalytics.gg/poe-2'
  },
  {
    id: 'poe2re',
    name: 'poe2.re',
    mark: 'RE',
    aboutKey: 'sites.about.poe2re',
    hosts: ['poe2.re', 'www.poe2.re'],
    enOnly: true,
    home: () => 'https://poe2.re/'
  },
  {
    id: 'regexru',
    name: 'poe2-regex-ru',
    mark: 'RU',
    aboutKey: 'sites.about.regexru',
    hosts: ['vudirvp-sketch.github.io'],
    enOnly: false,
    home: () => 'https://vudirvp-sketch.github.io/poe2-regex-ru/'
  },
  {
    id: 'scout',
    name: 'PoE 2 Scout',
    mark: 'S',
    aboutKey: 'sites.about.scout',
    hosts: ['poe2scout.com'],
    enOnly: true,
    home: () => 'https://poe2scout.com/'
  }
]

/** Все сайты обеих игр (без повторов): для поиска по id — вкладка могла открыться в другом режиме. */
const ALL_SITES: readonly SiteDef[] = [...SITES, ...SITES_POE2.filter((s) => !SITES.some((x) => x.id === s.id))]

const SITE_IDS = new Set<string>(ALL_SITES.map((s) => s.id))

/** Сайты вкладок этой игры (без игры — PoE 1, как в S43). */
export function sitesFor(game: GameId = 'poe1'): readonly SiteDef[] {
  return game === 'poe2' ? SITES_POE2 : SITES
}

/** Вкладка сайта есть у этой игры. */
export function isSiteOfGame(id: SiteId, game: GameId): boolean {
  return sitesFor(game).some((s) => s.id === id)
}

/** Игра, к которой относится вкладка сайта (общий сайт — PoE 1); у «Трейда», «Сайтов» и закладок — undefined. */
export function gameOfTab(tab: SiteTabId): GameId | undefined {
  if (!isSiteId(tab)) return undefined
  return isSiteOfGame(tab, 'poe1') ? 'poe1' : 'poe2'
}

/** Сайт этой игры, на чью страницу ведёт адрес (по хосту), — вкладка для ссылки «на другой сайт». */
export function tabForUrl(url: unknown, game: GameId): SiteId | null {
  const u = parse(url)
  if (!u || u.protocol !== 'https:') return null
  return siteOfHost(u.hostname, game)?.id ?? null
}

/** Раздел poedb по языку клиента: `/ru/` или `/us/`. */
export function poedbLang(lang: GameLang): 'ru' | 'us' {
  return lang === 'ru' ? 'ru' : 'us'
}

/**
 * Разрешения страниц сессии сайтов: только запись в буфер обмена (кнопки «Скопировать код PoB / regex» на сайтах;
 * Chromium пускает её лишь по нажатию игрока). Чтение буфера, камера, микрофон, уведомления, геолокация,
 * полный экран, устройства и прочее — нет.
 */
export function isSitePermissionAllowed(permission: string): boolean {
  return permission === 'clipboard-sanitized-write'
}

/**
 * Вкладки сайтов есть у обеих игр (S64: у PoE 2 — свой список SITES_POE2). Одно место, чтобы лид мог спрятать
 * функцию для игры.
 */
export function sitesOn(game: GameId): boolean {
  return game === 'poe1' || game === 'poe2'
}

export function isSiteId(v: unknown): v is SiteId {
  return typeof v === 'string' && SITE_IDS.has(v)
}

export function siteDef(id: SiteId): SiteDef {
  return ALL_SITES.find((s) => s.id === id) as SiteDef
}

// ---------------------------------------------------------------------------
// Закладки игрока
// ---------------------------------------------------------------------------

export interface SiteBookmark {
  id: string
  title: string
  /** https-адрес, с которого открывается вкладка */
  url: string
}

export const BOOKMARK_LIMIT = 12
export const BOOKMARK_TITLE_MAX = 40
const URL_MAX = 2000

export type BookmarkError = 'url' | 'https' | 'host' | 'poe' | 'site' | 'siteOther' | 'dup' | 'limit'

function parse(url: unknown): URL | null {
  if (typeof url !== 'string' || !url || url.length > URL_MAX) return null
  try {
    return new URL(url.trim())
  } catch {
    return null
  }
}

/** Имя хоста похоже на публичный сайт: с точкой, без IP, localhost и локальных зон. */
export function isPublicHostname(host: string): boolean {
  const h = host.toLowerCase()
  if (!/^[a-z0-9.-]+$/.test(h) || !h.includes('.') || h.startsWith('.') || h.endsWith('.')) return false
  if (/^\d+(\.\d+)*$/.test(h)) return false
  if (/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(h)) return false
  return h.split('.').every((p) => p.length > 0 && p.length <= 63 && !p.startsWith('-') && !p.endsWith('-'))
}

function isPoeHostname(h: string): boolean {
  return h === 'pathofexile.com' || h.endsWith('.pathofexile.com') || h === 'poecdn.com' || h.endsWith('.poecdn.com')
}

/** Хосты вкладки закладки: её хост и он же с `www.` (или без). */
export function bookmarkHosts(url: string): string[] {
  const u = parse(url)
  if (!u) return []
  const h = u.hostname.toLowerCase()
  return h.startsWith('www.') ? [h, h.slice(4)] : [h, `www.${h}`]
}

/** Сайт этой игры по хосту (у PoE 1 и PoE 2 хосты poe.ninja, maxroll.gg, mobalytics.gg общие — сайты разные). */
function siteOfHost(host: string, game: GameId = 'poe1'): SiteDef | undefined {
  const h = host.toLowerCase()
  return sitesFor(game).find((s) => s.hosts.includes(h))
}

/**
 * Проверка новой закладки: https, публичный хост, не сайт GGG (он — во вкладке «Трейд»), не сайт реестра
 * (у него уже есть вкладка), не повтор, не больше BOOKMARK_LIMIT. Название — обрезанное, по умолчанию хост.
 * S64: с игрой режима (новая закладка игрока) — не сайт реестра этой игры ('site') и не сайт реестра другой игры
 * ('siteOther': закладки общие для обеих игр, там была бы вторая вкладка того же сайта). Без игры (чтение
 * sites.json) — только сайты PoE 1, как в S43: старые закладки не пропадают.
 */
export function validateBookmark(
  input: { title?: unknown; url?: unknown },
  existing: readonly SiteBookmark[],
  newId: () => string,
  game?: GameId
): { ok: true; bookmark: SiteBookmark } | { ok: false; reason: BookmarkError } {
  const raw = typeof input.url === 'string' ? input.url.trim() : ''
  const u = parse(raw) ?? (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw) ? parse(`https://${raw}`) : null)
  if (!u) return { ok: false, reason: 'url' }
  if (u.protocol !== 'https:') return { ok: false, reason: 'https' }
  if (u.username || u.password || u.port) return { ok: false, reason: 'host' }
  const host = u.hostname.toLowerCase()
  if (!isPublicHostname(host)) return { ok: false, reason: 'host' }
  if (isPoeHostname(host)) return { ok: false, reason: 'poe' }
  const twin = host.startsWith('www.') ? host.slice(4) : `www.${host}`
  const isSite = (g: GameId): boolean => !!(siteOfHost(host, g) || siteOfHost(twin, g))
  if (isSite(game ?? 'poe1')) return { ok: false, reason: 'site' }
  if (game && GAME_IDS.some((g) => g !== game && isSite(g))) return { ok: false, reason: 'siteOther' }
  if (existing.some((b) => bookmarkHosts(b.url).includes(host))) return { ok: false, reason: 'dup' }
  if (existing.length >= BOOKMARK_LIMIT) return { ok: false, reason: 'limit' }
  u.hash = ''
  const title = (typeof input.title === 'string' ? input.title : '').replace(/\s+/g, ' ').trim().slice(0, BOOKMARK_TITLE_MAX)
  return { ok: true, bookmark: { id: newId(), title: title || host.replace(/^www\./, ''), url: u.toString() } }
}

/** Закладки из файла: только валидные (повторно через validateBookmark), не больше лимита. */
export function normalizeBookmarks(raw: unknown): SiteBookmark[] {
  if (!Array.isArray(raw)) return []
  const out: SiteBookmark[] = []
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue
    const o = r as Record<string, unknown>
    if (typeof o.id !== 'string' || !/^[\w-]{1,40}$/.test(o.id) || out.some((b) => b.id === o.id)) continue
    const v = validateBookmark({ title: o.title, url: o.url }, out, () => o.id as string)
    if (v.ok) out.push(v.bookmark)
  }
  return out
}

// ---------------------------------------------------------------------------
// Вкладки и навигация
// ---------------------------------------------------------------------------

export function bookmarkTab(id: string): SiteTabId {
  return `bm:${id}`
}

/** Вкладка открывает чужой сайт (сессия сайтов): сайт реестра или закладка. */
export function isWebTab(tab: SiteTabId): tab is SiteId | `bm:${string}` {
  return isSiteId(tab) || tab.startsWith('bm:')
}

/**
 * Вкладка существует: «Трейд», «Сайты», сайт реестра или известная закладка. С игрой — сайт должен быть в её
 * списке (вкладку сайта другой игры в этом режиме не открываем); без игры — любой сайт реестра.
 */
export function isKnownTab(tab: unknown, bookmarks: readonly SiteBookmark[], game?: GameId): tab is SiteTabId {
  if (tab === 'trade' || tab === 'manage') return true
  if (isSiteId(tab)) return game === undefined || isSiteOfGame(tab, game)
  return typeof tab === 'string' && tab.startsWith('bm:') && bookmarks.some((b) => `bm:${b.id}` === tab)
}

/** Хосты главного фрейма вкладки ([] — у «Трейда» и «Сайтов» свои правила). */
export function tabHosts(tab: SiteTabId, bookmarks: readonly SiteBookmark[]): readonly string[] {
  if (isSiteId(tab)) return siteDef(tab).hosts
  if (tab.startsWith('bm:')) {
    const b = bookmarks.find((x) => `bm:${x.id}` === tab)
    return b ? bookmarkHosts(b.url) : []
  }
  return []
}

/** Адрес — страница этой вкладки: https и хост из её списка. */
export function isTabUrl(tab: SiteTabId, url: unknown, bookmarks: readonly SiteBookmark[]): url is string {
  const u = parse(url)
  return !!u && u.protocol === 'https:' && !u.username && !u.password && tabHosts(tab, bookmarks).includes(u.hostname.toLowerCase())
}

/** Домашняя страница вкладки сайта или закладки. */
export function tabHome(tab: SiteTabId, lang: GameLang, bookmarks: readonly SiteBookmark[]): string | null {
  if (isSiteId(tab)) return siteDef(tab).home(lang)
  const b = tab.startsWith('bm:') ? bookmarks.find((x) => `bm:${x.id}` === tab) : undefined
  return b?.url ?? null
}

const TRADE_HOSTS = ['www.pathofexile.com', 'ru.pathofexile.com', 'pathofexile.com']

/** Поиск или обмен на официальном трейде — их можно открыть во вкладке «Трейд». */
export function isTradeSearchUrl(url: unknown): url is string {
  const info = parseTradeUrl(url)
  return !!info && TRADE_HOSTS.includes(info.host)
}

/** Ссылку со страницы сайта main откроет в системном браузере: allowlist @shared/links или сайт реестра игры. */
export function isSitesExternalUrl(url: unknown, game: GameId = 'poe1'): url is string {
  if (isAllowedExternalUrl(url)) return true
  const u = parse(url)
  return !!u && u.protocol === 'https:' && !u.username && !u.password && !!siteOfHost(u.hostname, game)
}

export type SiteNav =
  /** своя страница — пусть идёт */
  | { kind: 'allow' }
  /** сайт реестра — открыть в его вкладке */
  | { kind: 'tab'; tab: SiteId }
  /** поиск трейда — во вкладке «Трейд» */
  | { kind: 'trade' }
  /** в системный браузер */
  | { kind: 'external' }
  /** никуда */
  | { kind: 'block' }

/**
 * Куда пустить переход главного фрейма вкладки сайта (will-navigate / will-redirect / window.open).
 * Своё — 'allow'. Всё прочее (другая вкладка, «Трейд», браузер) main делает только сразу после нажатия игрока
 * в этой вкладке: сам сайт по таймеру никуда не уводит.
 * Игра — чей список сайтов смотреть («другой сайт реестра»): по умолчанию игра самой вкладки, у закладок — PoE 1
 * (main переадресует во вкладку своей игры: tabForUrl в windows/siteTabs.ts).
 */
export function siteNavDecision(tab: SiteTabId, url: unknown, bookmarks: readonly SiteBookmark[], game?: GameId): SiteNav {
  if (isTabUrl(tab, url, bookmarks)) return { kind: 'allow' }
  const u = parse(url)
  if (!u || u.protocol !== 'https:' || u.username || u.password) return { kind: 'block' }
  const g = game ?? gameOfTab(tab) ?? 'poe1'
  const other = siteOfHost(u.hostname, g)
  if (other) return { kind: 'tab', tab: other.id }
  if (isTradeSearchUrl(url)) return { kind: 'trade' }
  if (isSitesExternalUrl(url, g)) return { kind: 'external' }
  return { kind: 'block' }
}

// ---------------------------------------------------------------------------
// Жизненный цикл вью
// ---------------------------------------------------------------------------

/** Живых вью сайтов одновременно (каждая — 100–300 МБ) и сколько неактивная вью живёт. */
export const SITE_VIEWS_LIVE = 3
export const SITE_VIEW_IDLE_MS = 10 * 60_000

/**
 * Какие вью закрыть: неактивные дольше idleMs и лишние сверх limit (самые давние). Активную не трогаем.
 * lastActive — когда вкладку последний раз покинули (у активной — любое).
 */
export function viewsToClose(
  views: readonly { tab: SiteTabId; lastActive: number }[],
  active: SiteTabId | null,
  now: number,
  limit = SITE_VIEWS_LIVE,
  idleMs = SITE_VIEW_IDLE_MS
): SiteTabId[] {
  const rest = views.filter((v) => v.tab !== active).sort((a, b) => b.lastActive - a.lastActive)
  const keep = Math.max(0, limit - (views.some((v) => v.tab === active) ? 1 : 0))
  return rest.filter((v, i) => i >= keep || now - v.lastActive >= idleMs).map((v) => v.tab)
}

// ---------------------------------------------------------------------------
// Состояние для сайдбара
// ---------------------------------------------------------------------------

export interface SitePageState {
  url: string
  /** хост текущей страницы (строка над сайтом) */
  host: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface SitesState {
  /** вкладки сайтов включены (PoE 1 и PoE 2) */
  on: boolean
  /** чей список сайтов на рельсе (S64); нет — PoE 1 */
  game?: GameId
  active: SiteTabId
  /** последняя вкладка сайта (хоткей «Сайты» открывает её) */
  lastSite: SiteTabId | null
  bookmarks: SiteBookmark[]
  /** заметку о приватности уже показали */
  noteSeen: boolean
  /** активная вкладка сайта ждёт «Понятно» в заметке о приватности */
  needsNote: boolean
  /** страница активной вкладки сайта (null — «Трейд», «Сайты» или вью ещё нет) */
  page: SitePageState | null
  /** вкладки с живой вью (для отметки на вкладке) */
  live: SiteTabId[]
}

/** Что открыть: вкладку (по умолчанию — последнюю вкладку сайта) и, если есть, адрес на этом сайте. */
export interface SitesTarget {
  tab?: SiteTabId
  /** страница этого сайта (main проверит хост по вкладке) */
  url?: string
}
