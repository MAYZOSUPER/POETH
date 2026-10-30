// «Справочник» (S55): статья — данные, а не разметка (чистый модуль; tests/guide/article.test.ts).
// Статьи лежат в resources/data/<игра>/guide/<id>.json, список и порядок — guide/index.json; обновляются каналом
// данных без переустановки (S12: userData/data главнее встроенных, poeth://data/<игра>/guide/<файл>).
// Файл статьи может прийти не из сборки, поэтому проверка строгая:
//  - неизвестные поля на любом уровне — ошибка (новые поля и блоки = новая версия схемы `schema`);
//  - только свои простые блоки (текст, список, заметка, ссылка, переход в приложение, термины, «появится позже»);
//  - текст простой: без HTML-тегов, управляющих символов (и перевода строки) и смены направления текста;
//    из разметки — только **жирный** и `клавиша` (parseInline), пары должны закрываться;
//  - лимиты длины текстов и числа разделов, блоков и пунктов, размер файла;
//  - ссылки — только https на сайты реестра трейд-окна (S43, @shared/sites) или на сайт GGG;
//  - RU и EN обязательны оба: статья одна на два языка.

import { SITES, isSiteId, type SiteId } from '../sites'

/** Версия схемы статьи, которую понимает это приложение. Новее — «обновите POETH», статья не показывается. */
export const GUIDE_SCHEMA = 1

/** Подпапка данных игры: poeth://data/<игра>/guide/<файл>. */
export const GUIDE_DIR = 'guide'
export const GUIDE_INDEX = 'index.json'

export const ARTICLE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/
const SECTION_ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const PATCH = /^\d{1,2}\.\d{1,2}$/
/** Переход внутри приложения: вкладка или вкладка/страница («regex/vendor», «guide/glossary»). */
const APP_TO = /^[a-z][A-Za-z]{1,19}(\/[a-z0-9][a-z0-9-]{0,39})?$/

/** Сайт GGG: открывается в системном браузере (allowlist @shared/links). */
export const GGG_HOSTS: readonly string[] = ['www.pathofexile.com', 'ru.pathofexile.com', 'pathofexile.com']

/** Лимиты (символов и штук). */
export const GUIDE_LIMITS = {
  bytes: 96 * 1024,
  title: 80,
  summary: 240,
  sectionTitle: 80,
  text: 900,
  item: 400,
  label: 80,
  term: 60,
  def: 400,
  url: 300,
  sections: 16,
  blocks: 24,
  items: 16,
  terms: 40,
  patches: 4,
  articles: 60
} as const

export type GuideLang = 'ru' | 'en'
export interface GuideText {
  ru: string
  en: string
}

/** Ссылка: адрес одинаковый или свой для каждого языка (форумы GGG у RU-сайта свои). */
export type GuideUrl = string | GuideText

export type GuideSite = SiteId | 'ggg'
export type GuideTone = 'tip' | 'warn' | 'bad'

interface BlockBase {
  /** только в экспертном режиме (в простом — под «Для опытных») */
  expert?: boolean
}

export type GuideBlock =
  | (BlockBase & { kind: 'text'; text: GuideText })
  | (BlockBase & { kind: 'list'; ordered?: boolean; items: GuideText[] })
  | (BlockBase & { kind: 'note'; tone: GuideTone; text: GuideText })
  /** сайт реестра — во вкладке трейд-окна (без url — главная), ggg — в браузере (url обязателен) */
  | (BlockBase & { kind: 'link'; site: GuideSite; url?: GuideUrl; label: GuideText; text?: GuideText })
  /** вкладка приложения; нет её в этой версии или игре — блок не показывается (renderer: panels/guide/links.ts) */
  | (BlockBase & { kind: 'app'; to: string; label: GuideText; text?: GuideText })
  /** словарь: термин на обоих языках и объяснение */
  | (BlockBase & { kind: 'terms'; items: { term: GuideText; def: GuideText }[] })
  /** «появится позже» (например, после патчноутов) — пустой каркас раздела */
  | (BlockBase & { kind: 'pending'; text: GuideText })

export type GuideBlockKind = GuideBlock['kind']

export interface GuideSection {
  id: string
  title: GuideText
  /** ревизия статьи, в которой раздел последний раз менялся: «обновлено» у раздела */
  rev?: number
  expert?: boolean
  blocks: GuideBlock[]
}

export interface GuideArticle {
  schema: number
  id: string
  /** растёт при каждом изменении текста: по ней «новое / обновлено» */
  rev: number
  /** дата правки, ГГГГ-ММ-ДД */
  updated: string
  /** «актуально для 3.29 / 3.30» */
  patch: string[]
  title: GuideText
  summary: GuideText
  sections: GuideSection[]
}

export interface GuideIndex {
  schema: number
  /** id статей в порядке списка; файл статьи — <id>.json */
  articles: string[]
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Разметка внутри текста: **жирный** и `клавиша`
// ---------------------------------------------------------------------------

export type InlinePart = { kind: 'text' | 'bold' | 'key'; text: string }

/**
 * Текст → части. Только две пары: **…** — жирный, `…` — клавиша (Ctrl+D). Вложенности нет;
 * незакрытая пара или пустая пара — null (валидатор такой текст не пропускает).
 */
export function parseInline(s: string): InlinePart[] | null {
  const out: InlinePart[] = []
  let i = 0
  let buf = ''
  const flush = (): void => {
    if (buf) out.push({ kind: 'text', text: buf })
    buf = ''
  }
  while (i < s.length) {
    const bold = s.startsWith('**', i)
    if (bold || s[i] === '`') {
      const mark = bold ? '**' : '`'
      const end = s.indexOf(mark, i + mark.length)
      if (end < 0) return null
      const inner = s.slice(i + mark.length, end)
      if (!inner.trim() || inner.includes('`') || inner.includes('**')) return null
      flush()
      out.push({ kind: bold ? 'bold' : 'key', text: inner })
      i = end + mark.length
      continue
    }
    buf += s[i]
    i++
  }
  flush()
  return out
}

/** Текст без разметки — для поиска и подсказок. */
export function plainText(s: string): string {
  return (parseInline(s) ?? [{ kind: 'text', text: s }]).map((p) => p.text).join('')
}

// ---------------------------------------------------------------------------
// Проверка
// ---------------------------------------------------------------------------

/** HTML-тег, управляющие символы (и перевод строки), смена направления текста. */
const UNSAFE = /<\s*[a-z!/?]|[\u0000-\u001f\u007f‪-‮⁦-⁩]/i

class Bad extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Объект только с разрешёнными полями. */
function obj(v: unknown, what: string, allowed: readonly string[]): Record<string, unknown> {
  if (!isObj(v)) throw new Bad(`${what}: не объект`)
  const extra = Object.keys(v).filter((k) => !allowed.includes(k))
  if (extra.length) throw new Bad(`${what}: неизвестные поля ${extra.join(', ')}`)
  return v
}

/** Простой текст: непустой, не длиннее max, без HTML и служебных символов, разметка закрыта. */
function plain(v: unknown, what: string, max: number, inline = true): string {
  if (typeof v !== 'string') throw new Bad(`${what}: не текст`)
  const s = v.trim()
  if (!s) throw new Bad(`${what}: пусто`)
  if (s.length > max) throw new Bad(`${what}: длиннее ${max}`)
  if (UNSAFE.test(s)) throw new Bad(`${what}: HTML или служебные символы`)
  if (inline ? parseInline(s) === null : /\*\*|`/.test(s)) throw new Bad(`${what}: незакрытая разметка`)
  return s
}

/** Текст на обоих языках. */
function text(v: unknown, what: string, max: number, inline = true): GuideText {
  const o = obj(v, what, ['ru', 'en'])
  return { ru: plain(o.ru, `${what}.ru`, max, inline), en: plain(o.en, `${what}.en`, max, inline) }
}

function bool(v: unknown, what: string): boolean | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'boolean') throw new Bad(`${what}: true или false`)
  return v
}

function int(v: unknown, what: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Bad(`${what}: целое ${min}…${max}`)
  return v
}

function list<T>(v: unknown, what: string, min: number, max: number, each: (x: unknown, w: string) => T): T[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Bad(`${what}: от ${min} до ${max}`)
  return v.map((x, i) => each(x, `${what}[${i}]`))
}

function day(v: unknown, what: string): string {
  if (typeof v !== 'string' || !DAY.test(v)) throw new Bad(`${what}: дата ГГГГ-ММ-ДД`)
  const d = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new Bad(`${what}: нет такой даты`)
  return v
}

/** Хосты сайта ссылки: реестр трейд-окна или GGG. */
export function siteHosts(site: GuideSite): readonly string[] {
  return site === 'ggg' ? GGG_HOSTS : (SITES.find((s) => s.id === site)?.hosts ?? [])
}

/** Адрес ссылки: https, хост сайта, без логина и порта. */
function oneUrl(v: unknown, what: string, site: GuideSite): string {
  if (typeof v !== 'string' || v.length > GUIDE_LIMITS.url) throw new Bad(`${what}: адрес до ${GUIDE_LIMITS.url}`)
  let u: URL
  try {
    u = new URL(v)
  } catch {
    throw new Bad(`${what}: не адрес`)
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Bad(`${what}: только https`)
  if (!siteHosts(site).includes(u.hostname)) throw new Bad(`${what}: адрес не сайта ${site}`)
  return v
}

function url(v: unknown, what: string, site: GuideSite): GuideUrl {
  if (typeof v === 'string') return oneUrl(v, what, site)
  const o = obj(v, what, ['ru', 'en'])
  return { ru: oneUrl(o.ru, `${what}.ru`, site), en: oneUrl(o.en, `${what}.en`, site) }
}

function block(v: unknown, what: string): GuideBlock {
  if (!isObj(v)) throw new Bad(`${what}: не объект`)
  const L = GUIDE_LIMITS
  const withExpert = <T extends GuideBlock>(b: T, o: Record<string, unknown>): T => {
    const expert = bool(o.expert, `${what}.expert`)
    return expert ? { ...b, expert } : b
  }
  switch (v.kind) {
    case 'text': {
      const o = obj(v, what, ['kind', 'expert', 'text'])
      return withExpert({ kind: 'text', text: text(o.text, `${what}.text`, L.text) }, o)
    }
    case 'list': {
      const o = obj(v, what, ['kind', 'expert', 'ordered', 'items'])
      const ordered = bool(o.ordered, `${what}.ordered`)
      const items = list(o.items, `${what}.items`, 1, L.items, (x, w) => text(x, w, L.item))
      return withExpert({ kind: 'list', ...(ordered ? { ordered } : {}), items }, o)
    }
    case 'note': {
      const o = obj(v, what, ['kind', 'expert', 'tone', 'text'])
      if (o.tone !== 'tip' && o.tone !== 'warn' && o.tone !== 'bad') throw new Bad(`${what}.tone: tip, warn или bad`)
      return withExpert({ kind: 'note', tone: o.tone, text: text(o.text, `${what}.text`, L.text) }, o)
    }
    case 'link': {
      const o = obj(v, what, ['kind', 'expert', 'site', 'url', 'label', 'text'])
      const site = o.site
      if (site !== 'ggg' && !isSiteId(site)) throw new Bad(`${what}.site: сайт реестра или ggg`)
      if (site === 'ggg' && o.url === undefined) throw new Bad(`${what}.url: у ссылки на GGG нужен адрес`)
      const b: GuideBlock = { kind: 'link', site, label: text(o.label, `${what}.label`, L.label, false) }
      if (o.url !== undefined) b.url = url(o.url, `${what}.url`, site)
      if (o.text !== undefined) b.text = text(o.text, `${what}.text`, L.item)
      return withExpert(b, o)
    }
    case 'app': {
      const o = obj(v, what, ['kind', 'expert', 'to', 'label', 'text'])
      if (typeof o.to !== 'string' || !APP_TO.test(o.to)) throw new Bad(`${what}.to: вкладка или вкладка/страница`)
      const b: GuideBlock = { kind: 'app', to: o.to, label: text(o.label, `${what}.label`, L.label, false) }
      if (o.text !== undefined) b.text = text(o.text, `${what}.text`, L.item)
      return withExpert(b, o)
    }
    case 'terms': {
      const o = obj(v, what, ['kind', 'expert', 'items'])
      const items = list(o.items, `${what}.items`, 1, L.terms, (x, w) => {
        const t = obj(x, w, ['term', 'def'])
        return { term: text(t.term, `${w}.term`, L.term, false), def: text(t.def, `${w}.def`, L.def) }
      })
      return withExpert({ kind: 'terms', items }, o)
    }
    case 'pending': {
      const o = obj(v, what, ['kind', 'text'])
      return { kind: 'pending', text: text(o.text, `${what}.text`, L.text) }
    }
    default:
      throw new Bad(`${what}.kind: неизвестный блок`)
  }
}

function section(v: unknown, what: string, articleRev: number): GuideSection {
  const o = obj(v, what, ['id', 'title', 'rev', 'expert', 'blocks'])
  if (typeof o.id !== 'string' || !SECTION_ID.test(o.id)) throw new Bad(`${what}.id`)
  const s: GuideSection = {
    id: o.id,
    title: text(o.title, `${what}.title`, GUIDE_LIMITS.sectionTitle, false),
    blocks: list(o.blocks, `${what}.blocks`, 1, GUIDE_LIMITS.blocks, block)
  }
  if (o.rev !== undefined) s.rev = int(o.rev, `${what}.rev`, 1, articleRev)
  const expert = bool(o.expert, `${what}.expert`)
  if (expert) s.expert = expert
  return s
}

function run<T>(f: () => T): Checked<T> {
  try {
    return { ok: true, value: f() }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message }
    throw e
  }
}

/** Схема новее, чем понимает приложение (не ошибка данных: нужна новая версия POETH). */
export function isNewerSchema(raw: unknown): boolean {
  return isObj(raw) && typeof raw.schema === 'number' && Number.isInteger(raw.schema) && raw.schema > GUIDE_SCHEMA
}

/** Строгая проверка статьи (см. шапку файла). */
export function validateArticle(raw: unknown): Checked<GuideArticle> {
  return run(() => {
    const o = obj(raw, 'статья', ['schema', 'id', 'rev', 'updated', 'patch', 'title', 'summary', 'sections'])
    if (o.schema !== GUIDE_SCHEMA) throw new Bad(`schema: ${GUIDE_SCHEMA}`)
    if (typeof o.id !== 'string' || !ARTICLE_ID.test(o.id)) throw new Bad('id: латиница, цифры и дефис')
    const rev = int(o.rev, 'rev', 1, 9999)
    const sections = list(o.sections, 'sections', 1, GUIDE_LIMITS.sections, (x, w) => section(x, w, rev))
    const ids = new Set(sections.map((s) => s.id))
    if (ids.size !== sections.length) throw new Bad('sections: id разделов повторяются')
    const patch = list(o.patch, 'patch', 1, GUIDE_LIMITS.patches, (x, w) => {
      if (typeof x !== 'string' || !PATCH.test(x)) throw new Bad(`${w}: версия игры вида 3.29`)
      return x
    })
    return {
      schema: GUIDE_SCHEMA,
      id: o.id,
      rev,
      updated: day(o.updated, 'updated'),
      patch,
      title: text(o.title, 'title', GUIDE_LIMITS.title, false),
      summary: text(o.summary, 'summary', GUIDE_LIMITS.summary),
      sections
    }
  })
}

/** Строгая проверка списка статей. */
export function validateIndex(raw: unknown): Checked<GuideIndex> {
  return run(() => {
    const o = obj(raw, 'index', ['schema', 'articles'])
    if (o.schema !== GUIDE_SCHEMA) throw new Bad(`schema: ${GUIDE_SCHEMA}`)
    const articles = list(o.articles, 'articles', 0, GUIDE_LIMITS.articles, (x, w) => {
      if (typeof x !== 'string' || !ARTICLE_ID.test(x)) throw new Bad(`${w}: id статьи`)
      return x
    })
    if (new Set(articles).size !== articles.length) throw new Bad('articles: id повторяются')
    return { schema: GUIDE_SCHEMA, articles }
  })
}

/** Текст на языке интерфейса. */
export function gt(t: GuideText, lang: GuideLang): string {
  return t[lang]
}

/** Адрес ссылки на языке интерфейса. */
export function guideUrl(u: GuideUrl, lang: GuideLang): string {
  return typeof u === 'string' ? u : u[lang]
}
