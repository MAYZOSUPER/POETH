// «Стартеры» лиги во вкладке «Билд» (S59, ST1): запись стартера-ссылки и строгий валидатор (чистый модуль;
// tests/starters/schema.test.ts). Стартер — это код PoB, который автор выложил сам (ссылка), плюс наши метки и
// одна строка своими словами. Чужих текстов, рейтингов и картинок здесь нет. Формат — starters-research.md §2.3.
//
// Файлы: resources/data/poe1/starters/index.json и <лига>.json — приходят и пакетом данных S12 (без
// переустановки), поэтому это недоверенные данные:
//  - неизвестные поля отбрасываются (список в `dropped` — для `add-starter --check`, приложению не мешает);
//  - только простой текст: без HTML, управляющих символов, смены направления текста и адресов;
//  - лимиты длины и числа записей;
//  - ссылки — только https и хосты автора (isAuthorLinkUrl в links.ts); PoB — ещё и ссылка, которую узнаёт
//    разбор S35 (src/shared/pob/links.ts), то есть сырой код по ней можно скачать одним запросом;
//  - битая запись не ломает остальные: её нет в списке, она в `failed`.

import { isAuthorLinkUrl } from '../links'
import { parsePobInput } from '../pob/links'

export const STARTERS_SCHEMA = 1
/** Подпапка данных (DATA_SUBDIRS в src/main/protocol.ts): poeth://data/poe1/starters/<файл>. */
export const STARTERS_DIR = 'starters'
export const STARTERS_INDEX = 'index.json'

/** Классы PoE 1 (как className в PoB; classId PoB = индекс). */
export const STARTER_CLASSES = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'] as const
export type StarterClass = (typeof STARTER_CLASSES)[number]

/** Бюджет по шкале PoE Vault: без вложений · дёшево · средне · дорого. */
export const STARTER_BUDGETS = ['starter', 'low', 'medium', 'high'] as const
export type StarterBudget = (typeof STARTER_BUDGETS)[number]

/** «Ведёт по актам»: в PoB есть этапы прокачки по актам (acts), только часть (partial), только конечное дерево (none). */
export const STARTER_LEVELING = ['acts', 'partial', 'none'] as const
export type StarterLeveling = (typeof STARTER_LEVELING)[number]

export const STARTER_MODES = ['sc', 'hc', 'ssf'] as const
export type StarterMode = (typeof STARTER_MODES)[number]

export const STARTER_CONTENT = ['mapping', 'bossing'] as const
export type StarterContent = (typeof STARTER_CONTENT)[number]

export const STARTER_LANGS = ['ru', 'en'] as const
export type StarterLang = (typeof STARTER_LANGS)[number]

/** Ссылки записи: PoB автора (обязательна), его гайд, видео, канал. Открывает только main — по id записи. */
export const STARTER_LINKS = ['pob', 'guide', 'video', 'channel'] as const
export type StarterLinkKind = (typeof STARTER_LINKS)[number]

export type StarterDifficulty = 1 | 2 | 3

/** Наш текст: хотя бы один язык. */
export interface StarterText {
  ru?: string
  en?: string
}

export interface StarterTags {
  budget: StarterBudget
  difficulty: StarterDifficulty
  /** «для новичка» — выбор куратора */
  newbie: boolean
  leveling: StarterLeveling
  /** где проверен и подходит; пусто — не указано */
  modes: StarterMode[]
  content: StarterContent[]
}

export interface StarterRecord {
  /** латиница, цифры, дефис: `rf-chieftain` */
  id: string
  /** версия игры, под которую сделан PoB автора (`3.30`): «Обновлён к 3.30» или «Устарел» */
  patch: string
  class: StarterClass
  /** восхождение по-английски, как в PoB; null — без восхождения */
  ascendancy: string | null
  /** главный навык: имя как в PoB (EN) и ключ камня PoB — имя на языке клиента берётся из данных S36 */
  skill: { en: string; gem: string | null }
  /** ник автора, как он сам подписывается (не аккаунт и не персонаж) */
  author: string
  /** язык видео и гайда автора */
  lang: StarterLang
  links: { pob: string } & Partial<Record<Exclude<StarterLinkKind, 'pob'>, string>>
  tags: StarterTags
  /** «Рекомендуем новичкам» — выбор куратора, всегда с причиной в note */
  pick: boolean
  /** наша строка своими словами (причина выбора); null — нет */
  note: StarterText | null
  /** отпечаток проверенной версии PoB (sha256 канонического XML без <Import>, fingerprint.ts) и когда сняли */
  pob: { sha256: string; checkedAt: string }
  /** «Проверено POETH в <лига>» — ставит человек; null — ещё не проверяли */
  checked: { league: string; date: string } | null
  /** когда запись появилась в списке (сортировка «Новые») */
  added: string
}

export interface StartersIndex {
  schema: typeof STARTERS_SCHEMA
  /** лига, стартеры которой показываем (`3.30`) */
  current: string
  /** файлы <лига>.json, новые сверху; current — среди них */
  leagues: string[]
}

export interface StartersFile {
  schema: typeof STARTERS_SCHEMA
  league: string
  /** когда список правили последний раз */
  updatedAt: string
  starters: StarterRecord[]
}

/** Лимиты (символов и штук). */
export const STARTER_LIMITS = {
  /** файл списка лиги, байт */
  bytes: 256 * 1024,
  starters: 100,
  leagues: 10,
  id: 48,
  skill: 60,
  gem: 120,
  author: 40,
  ascendancy: 30,
  note: 140,
  url: 300
} as const

export const STARTER_ID = /^[a-z0-9][a-z0-9-]{1,47}$/
const PATCH = /^\d{1,2}\.\d{1,2}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const SHA256 = /^[0-9a-f]{64}$/
/** имя навыка PoB: буквы любого алфавита, цифры, пробел и ' , . : - ( ) */
const SKILL = /^[\p{L}\p{N}][\p{L}\p{N}' ,.:\-()]*$/u
const GEM = /^Metadata\/Items\/Gems\/[A-Za-z0-9_]{1,100}$/
const ASCENDANCY = /^[A-Z][A-Za-z' -]{2,29}$/
/** HTML-тег, управляющие символы (кроме перевода строки и табуляции), смена направления текста. */
const UNSAFE = /<\s*[a-z!/?]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/i
/** адрес внутри текста: ссылки живут только в links */
const LINKY = /https?:|www\.|\b[a-z0-9-]+\.(?:com|ru|gg|in|tv|be|me|to|net|org|io)\b/i

class Bad extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Сборщик отброшенных полей: путь к полю, которое валидатор не знает. */
type Dropped = string[]

/** Поля объекта; лишние — в dropped (не ошибка: новые поля = данные новее приложения). */
function obj(v: unknown, what: string, allowed: readonly string[], dropped: Dropped): Record<string, unknown> {
  if (!isObj(v)) throw new Bad(`${what}: не объект`)
  for (const k of Object.keys(v)) if (!allowed.includes(k)) dropped.push(`${what}.${k}`)
  return v
}

/** Простой текст: непустой, не длиннее max, без HTML, управляющих символов и адресов. */
function plain(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string') throw new Bad(`${what}: не текст`)
  const s = v.trim()
  if (!s) throw new Bad(`${what}: пусто`)
  if (s.length > max) throw new Bad(`${what}: длиннее ${max}`)
  if (UNSAFE.test(s)) throw new Bad(`${what}: HTML или служебные символы`)
  if (/[\r\n]/.test(s)) throw new Bad(`${what}: одна строка`)
  if (LINKY.test(s)) throw new Bad(`${what}: адрес в тексте — ссылки только в links`)
  return s
}

function oneOf<T extends string>(v: unknown, what: string, list: readonly T[]): T {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) throw new Bad(`${what}: одно из ${list.join(', ')}`)
  return v as T
}

function setOf<T extends string>(v: unknown, what: string, list: readonly T[]): T[] {
  if (!Array.isArray(v) || v.length > list.length) throw new Bad(`${what}: список из ${list.join(', ')}`)
  const out: T[] = []
  for (const [i, x] of v.entries()) {
    const k = oneOf(x, `${what}[${i}]`, list)
    if (out.includes(k)) throw new Bad(`${what}: «${k}» дважды`)
    out.push(k)
  }
  // порядок — как в списке допустимых: одинаковые наборы сравниваются как строки
  return list.filter((k) => out.includes(k))
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Bad(`${what}: true или false`)
  return v
}

function day(v: unknown, what: string): string {
  if (typeof v !== 'string' || !DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Bad(`${what}: дата YYYY-MM-DD`)
  return v
}

function patch(v: unknown, what: string): string {
  if (typeof v !== 'string' || !PATCH.test(v)) throw new Bad(`${what}: версия игры вида 3.30`)
  return v
}

function text(v: unknown, what: string, max: number, dropped: Dropped): StarterText {
  const o = obj(v, what, ['ru', 'en'], dropped)
  const out: StarterText = {}
  if (o.ru !== undefined) out.ru = plain(o.ru, `${what}.ru`, max)
  if (o.en !== undefined) out.en = plain(o.en, `${what}.en`, max)
  if (!out.ru && !out.en) throw new Bad(`${what}: нужен текст хотя бы на одном языке`)
  return out
}

/** Ссылка автора: https, хост из AUTHOR_LINK_HOSTS (links.ts), без логина и порта. */
function authorLink(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.length > STARTER_LIMITS.url) throw new Bad(`${what}: адрес до ${STARTER_LIMITS.url} символов`)
  if (!isAuthorLinkUrl(v)) throw new Bad(`${what}: только https и сайты авторов (links.ts, AUTHOR_LINK_HOSTS)`)
  return v
}

/** Ссылка на PoB: сайт автора и паста, с которой main может скачать сырой код (pobb.in, pob.codes, Maxroll). */
function pobLink(v: unknown, what: string): string {
  const url = authorLink(v, what)
  const input = parsePobInput(url)
  if (input.kind !== 'link') throw new Bad(`${what}: не ссылка на пасту PoB (pobb.in, pob.codes, maxroll.gg/poe/pob)`)
  return url
}

function links(v: unknown, dropped: Dropped): StarterRecord['links'] {
  const o = obj(v, 'links', STARTER_LINKS, dropped)
  const out: StarterRecord['links'] = { pob: pobLink(o.pob, 'links.pob') }
  for (const k of STARTER_LINKS) {
    if (k === 'pob' || o[k] === undefined) continue
    out[k] = authorLink(o[k], `links.${k}`)
  }
  return out
}

function tags(v: unknown, dropped: Dropped): StarterTags {
  const o = obj(v, 'tags', ['budget', 'difficulty', 'newbie', 'leveling', 'modes', 'content'], dropped)
  if (o.difficulty !== 1 && o.difficulty !== 2 && o.difficulty !== 3) throw new Bad('tags.difficulty: 1, 2 или 3')
  return {
    budget: oneOf(o.budget, 'tags.budget', STARTER_BUDGETS),
    difficulty: o.difficulty,
    newbie: bool(o.newbie, 'tags.newbie'),
    leveling: oneOf(o.leveling, 'tags.leveling', STARTER_LEVELING),
    modes: o.modes === undefined ? [] : setOf(o.modes, 'tags.modes', STARTER_MODES),
    content: o.content === undefined ? [] : setOf(o.content, 'tags.content', STARTER_CONTENT)
  }
}

function skill(v: unknown, dropped: Dropped): StarterRecord['skill'] {
  const o = obj(v, 'skill', ['en', 'gem'], dropped)
  const en = plain(o.en, 'skill.en', STARTER_LIMITS.skill)
  if (!SKILL.test(en)) throw new Bad('skill.en: имя навыка, как в PoB')
  if (o.gem !== undefined && o.gem !== null && (typeof o.gem !== 'string' || o.gem.length > STARTER_LIMITS.gem || !GEM.test(o.gem))) {
    throw new Bad('skill.gem: ключ камня PoB Metadata/Items/Gems/…')
  }
  return { en, gem: typeof o.gem === 'string' ? o.gem : null }
}

const RECORD_KEYS = ['id', 'patch', 'class', 'ascendancy', 'skill', 'author', 'lang', 'links', 'tags', 'pick', 'note', 'pob', 'checked', 'added'] as const

function record(v: unknown, dropped: Dropped): StarterRecord {
  const o = obj(v, 'starter', RECORD_KEYS, dropped)
  if (typeof o.id !== 'string' || !STARTER_ID.test(o.id)) throw new Bad('id: латиница, цифры и дефис, до 48 символов')
  const asc = o.ascendancy
  if (asc !== null && (typeof asc !== 'string' || !ASCENDANCY.test(asc))) throw new Bad('ascendancy: восхождение по-английски или null')
  const pick = bool(o.pick, 'pick')
  const note = o.note === undefined || o.note === null ? null : text(o.note, 'note', STARTER_LIMITS.note, dropped)
  if (pick && !note) throw new Bad('pick: «Рекомендуем новичкам» — только с причиной в note')
  const p = obj(o.pob, 'pob', ['sha256', 'checkedAt'], dropped)
  if (typeof p.sha256 !== 'string' || !SHA256.test(p.sha256)) throw new Bad('pob.sha256: отпечаток sha256 (64 hex)')
  let checked: StarterRecord['checked'] = null
  if (o.checked !== undefined && o.checked !== null) {
    const c = obj(o.checked, 'checked', ['league', 'date'], dropped)
    checked = { league: patch(c.league, 'checked.league'), date: day(c.date, 'checked.date') }
  }
  return {
    id: o.id,
    patch: patch(o.patch, 'patch'),
    class: oneOf(o.class, 'class', STARTER_CLASSES),
    ascendancy: asc as string | null,
    skill: skill(o.skill, dropped),
    author: plain(o.author, 'author', STARTER_LIMITS.author),
    lang: oneOf(o.lang, 'lang', STARTER_LANGS),
    links: links(o.links, dropped),
    tags: tags(o.tags, dropped),
    pick,
    note,
    pob: { sha256: p.sha256, checkedAt: day(p.checkedAt, 'pob.checkedAt') },
    checked,
    added: day(o.added, 'added')
  }
}

export type Checked<T> = { ok: true; value: T; dropped: string[] } | { ok: false; error: string }

/** Одна запись стартера. */
export function validateStarter(v: unknown): Checked<StarterRecord> {
  const dropped: Dropped = []
  try {
    const value = record(v, dropped)
    return { ok: true, value, dropped: dropped.map((d) => `${value.id}.${d.replace(/^starter\./, '')}`) }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message }
    throw e
  }
}

/** Схема новее приложения: показываем «нужна новая версия POETH», а не «битые данные». */
export function isNewerSchema(raw: unknown): boolean {
  return isObj(raw) && typeof raw.schema === 'number' && Number.isInteger(raw.schema) && raw.schema > STARTERS_SCHEMA
}

export function validateIndex(v: unknown): Checked<StartersIndex> {
  const dropped: Dropped = []
  try {
    const o = obj(v, 'index', ['schema', 'current', 'leagues'], dropped)
    if (o.schema !== STARTERS_SCHEMA) throw new Bad(`index.schema: ${STARTERS_SCHEMA}`)
    if (!Array.isArray(o.leagues) || o.leagues.length < 1 || o.leagues.length > STARTER_LIMITS.leagues) {
      throw new Bad(`index.leagues: от 1 до ${STARTER_LIMITS.leagues}`)
    }
    const leagues = o.leagues.map((l, i) => patch(l, `index.leagues[${i}]`))
    if (new Set(leagues).size !== leagues.length) throw new Bad('index.leagues: повтор')
    const current = patch(o.current, 'index.current')
    if (!leagues.includes(current)) throw new Bad('index.current: нет в leagues')
    return { ok: true, value: { schema: STARTERS_SCHEMA, current, leagues }, dropped }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message }
    throw e
  }
}

export interface StartersFileCheck {
  file: StartersFile
  /** записи, которые не прошли проверку: номер в файле, id (если читается) и причина */
  failed: { index: number; id: string | null; error: string }[]
  dropped: string[]
}

/**
 * Файл списка лиги. Шапка битая — весь файл не годится (ok: false); битая запись или повтор id — только она в failed.
 * expectLeague — лига из имени файла: файл 3.30.json со списком 3.29 не принимаем.
 */
export function validateStartersFile(v: unknown, expectLeague?: string): { ok: true; value: StartersFileCheck } | { ok: false; error: string } {
  const dropped: Dropped = []
  try {
    const o = obj(v, 'file', ['schema', 'league', 'updatedAt', 'starters'], dropped)
    if (o.schema !== STARTERS_SCHEMA) throw new Bad(`schema: ${STARTERS_SCHEMA}`)
    const league = patch(o.league, 'league')
    if (expectLeague !== undefined && league !== expectLeague) throw new Bad(`league: в файле ${league}, ждали ${expectLeague}`)
    const updatedAt = day(o.updatedAt, 'updatedAt')
    if (!Array.isArray(o.starters) || o.starters.length > STARTER_LIMITS.starters) throw new Bad(`starters: до ${STARTER_LIMITS.starters}`)
    const starters: StarterRecord[] = []
    const failed: StartersFileCheck['failed'] = []
    const seen = new Set<string>()
    o.starters.forEach((raw, index) => {
      const r = validateStarter(raw)
      const id = isObj(raw) && typeof raw.id === 'string' ? raw.id.slice(0, STARTER_LIMITS.id) : null
      if (!r.ok) failed.push({ index, id, error: r.error })
      else if (seen.has(r.value.id)) failed.push({ index, id, error: 'id: повтор' })
      else {
        seen.add(r.value.id)
        starters.push(r.value)
        dropped.push(...r.dropped)
      }
    })
    return { ok: true, value: { file: { schema: STARTERS_SCHEMA, league, updatedAt, starters }, failed, dropped } }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message }
    throw e
  }
}

/** Имя файла списка лиги: `3.30.json`. */
export function startersFileName(league: string): string {
  return `${league}.json`
}

/** Сравнить версии игры `3.29` < `3.30`: отрицательное — a старше. */
export function comparePatch(a: string, b: string): number {
  const [a1, a2] = a.split('.').map(Number)
  const [b1, b2] = b.split('.').map(Number)
  return a1 - b1 || a2 - b2
}

/** Версия дерева PoB `3_30` или данных `3.30.1` → `3.30`; не похоже — null. */
export function patchOf(version: string | null | undefined): string | null {
  const m = /^(\d{1,2})[._](\d{1,2})(?:[._]\d+)*$/.exec(String(version ?? '').trim())
  return m ? `${Number(m[1])}.${Number(m[2])}` : null
}
