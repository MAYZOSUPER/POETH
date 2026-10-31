// «Слухи журнала» PoE 2 (S65): запись слуха острова и строгий валидатор (чистый модуль; tests/rumours/schema.test.ts).
// Исследование — poe2-research.md §6 в заметках лида.
//
// Слух — строка, которую игра показывает на журнале экспедиции: в пуле до 6, видно 3. Каждый ведёт на свой остров.
// Что в записи и откуда:
//  - из файлов игры (tools/rumours/extract.mjs, pathofexile-dat): текст строки EN/RU как в клиенте (EndgameMaps),
//    остров (WorldAreas), категория, боссы, имена наград EN/RU и путь метаданных (BaseItemTypes);
//  - наше (правим руками в файле): награды (ref на предметы из данных EE2 или вид награды), опасности, сложность,
//    тир ●●● и строка своими словами. Оценки сообщества сюда не копируем — только ссылка в окне.
//
// Файл resources/data/poe2/rumours/rumours.json придёт и пакетом данных S12 — это недоверенные данные:
//  - неизвестные поля отбрасываются (список в `dropped` — для `extract --check`, приложению не мешают);
//  - только простой текст: без HTML, управляющих символов, смены направления текста и адресов;
//  - лимиты длины и числа записей;
//  - битая запись не ломает остальные: её нет в списке, она в `failed`.

export const RUMOURS_SCHEMA = 1
/** Подпапка данных (DATA_SUBDIRS в src/main/protocol.ts): poeth://data/poe2/rumours/<файл>. */
export const RUMOURS_DIR = 'rumours'
export const RUMOURS_FILE = 'rumours.json'

/** большая экспедиция · уникальная карта · босс */
export const RUMOUR_CATEGORIES = ['expedition', 'unique', 'boss'] as const
export type RumourCategory = (typeof RUMOUR_CATEGORIES)[number]

/**
 * Награда без своей цены (её нет в обмене как одного предмета): золото, опыт, редкость, редкие монстры, сундуки,
 * торговец, духи Азмири, масла, старые уникальные предметы экспедиции, бесплатные острова, веризий, клад.
 */
export const RUMOUR_REWARD_KINDS = [
  'gold',
  'xp',
  'rarity',
  'rares',
  'strongboxes',
  'merchant',
  'spirits',
  'oils',
  'expeditionUniques',
  'islands',
  'verisium',
  'treasure',
  'exiles'
] as const
export type RumourRewardKind = (typeof RUMOUR_REWARD_KINDS)[number]

/**
 * Опасности: тяжёлый босс, сильные монстры, монстры там, куда не дойти, невидимые или неуязвимые монстры,
 * предметы не падают, предметы превращаются в золото.
 */
export const RUMOUR_RISKS = ['boss', 'tough', 'unreachable', 'hidden', 'noLoot', 'goldOnly'] as const
export type RumourRisk = (typeof RUMOUR_RISKS)[number]

/** Пространства имён предметов в данных EE2 (items.ndjson: `namespace`). */
export const RUMOUR_ITEM_NS = ['ITEM', 'GEM', 'UNIQUE'] as const
export type RumourItemNs = (typeof RUMOUR_ITEM_NS)[number]

export type RumourLevel = 1 | 2 | 3

/** Строка игры: EN обязательна (по ней узнаём слух), RU — null, пока не записали с RU-клиента. */
export interface GameText {
  en: string
  ru: string | null
}

/** Наш текст: хотя бы один язык. */
export interface RumourNote {
  ru?: string
  en?: string
}

/** Ссылка на предмет из данных EE2: namespace + refName (английское имя). Цена — по ней. */
export interface RumourItemRef {
  ns: RumourItemNs
  ref: string
}

export interface RumourItemReward extends RumourItemRef {
  /** путь метаданных BaseItemTypes из файлов игры (ключ фида обмена GGG); null — не нашли */
  meta: string | null
  /** имя на языке клиента — из файлов игры (генератор) */
  name: GameText
}

export type RumourReward = { item: RumourItemReward } | { kind: RumourRewardKind }

export interface RumourRecord {
  /** наш стабильный id из английской строки: `fallen-stars` */
  id: string
  /** WorldAreas.Id острова в файлах игры: по нему генератор узнаёт запись после патча */
  area: string
  /** строка слуха как в клиенте */
  text: GameText
  /** остров, куда ведёт слух (имя области как в клиенте) */
  island: GameText
  category: RumourCategory
  /** боссы острова (имена как в клиенте), пусто — без босса */
  bosses: GameText[]
  /** ключевые награды, первая — главная (её цену показываем); пусто — ещё не оценили */
  rewards: RumourReward[]
  risks: RumourRisk[]
  /** сложность 1–3; null — ещё не оценили */
  difficulty: RumourLevel | null
  /** наш тир ●●●; null — ещё не оценили */
  tier: RumourLevel | null
  /** строка своими словами: почему такой тир; null — нет */
  note: RumourNote | null
  /** награды и опасности проверены в игре (дата); null — по вторичным источникам, проверить */
  checked: string | null
}

export interface RumoursFile {
  schema: typeof RUMOURS_SCHEMA
  /** версия патча PoE 2 на CDN GGG, из которой взяты строки (`0.5.5.5`) */
  patch: string
  /** когда файл правили последний раз */
  updatedAt: string
  rumours: RumourRecord[]
}

/** Лимиты (символов и штук). */
export const RUMOUR_LIMITS = {
  /** файл, байт */
  bytes: 128 * 1024,
  rumours: 60,
  id: 48,
  area: 80,
  /** строка игры: слух, остров, босс, имя предмета */
  game: 80,
  bosses: 5,
  rewards: 6,
  ref: 80,
  meta: 160,
  note: 140
} as const

export const RUMOUR_ID = /^[a-z0-9][a-z0-9-]{1,47}$/
const AREA = /^[A-Za-z0-9_]{2,80}$/
const META = /^Metadata\/[A-Za-z0-9_/]{1,150}$/
const PATCH = /^\d{1,2}(?:\.\d{1,3}){1,4}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
/** HTML-тег, управляющие символы (кроме перевода строки и табуляции), смена направления текста. */
const UNSAFE = /<\s*[a-z!/?]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/i
/** адрес внутри текста */
const LINKY = /https?:|www\.|\b[a-z0-9-]+\.(?:com|ru|gg|in|tv|be|me|to|net|org|io|app)\b/i

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

/** Простой текст: непустой, не длиннее max, одна строка, без HTML, управляющих символов и адресов. */
function plain(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string') throw new Bad(`${what}: не текст`)
  const s = v.trim()
  if (!s) throw new Bad(`${what}: пусто`)
  if (s.length > max) throw new Bad(`${what}: длиннее ${max}`)
  if (UNSAFE.test(s)) throw new Bad(`${what}: HTML или служебные символы`)
  if (/[\r\n]/.test(s)) throw new Bad(`${what}: одна строка`)
  if (LINKY.test(s)) throw new Bad(`${what}: адрес в тексте`)
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

function level(v: unknown, what: string): RumourLevel | null {
  if (v === null || v === undefined) return null
  if (v !== 1 && v !== 2 && v !== 3) throw new Bad(`${what}: 1, 2, 3 или null`)
  return v
}

function day(v: unknown, what: string): string {
  if (typeof v !== 'string' || !DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Bad(`${what}: дата YYYY-MM-DD`)
  return v
}

function gameText(v: unknown, what: string, dropped: Dropped): GameText {
  const o = obj(v, what, ['en', 'ru'], dropped)
  return {
    en: plain(o.en, `${what}.en`, RUMOUR_LIMITS.game),
    ru: o.ru === undefined || o.ru === null ? null : plain(o.ru, `${what}.ru`, RUMOUR_LIMITS.game)
  }
}

function note(v: unknown, dropped: Dropped): RumourNote | null {
  if (v === undefined || v === null) return null
  const o = obj(v, 'note', ['ru', 'en'], dropped)
  const out: RumourNote = {}
  if (o.ru !== undefined) out.ru = plain(o.ru, 'note.ru', RUMOUR_LIMITS.note)
  if (o.en !== undefined) out.en = plain(o.en, 'note.en', RUMOUR_LIMITS.note)
  if (!out.ru && !out.en) throw new Bad('note: нужен текст хотя бы на одном языке')
  return out
}

function reward(v: unknown, what: string, dropped: Dropped): RumourReward {
  const o = obj(v, what, ['item', 'kind'], dropped)
  if ((o.item === undefined) === (o.kind === undefined)) throw new Bad(`${what}: ровно одно из item или kind`)
  if (o.kind !== undefined) return { kind: oneOf(o.kind, `${what}.kind`, RUMOUR_REWARD_KINDS) }
  const it = obj(o.item, `${what}.item`, ['ns', 'ref', 'meta', 'name'], dropped)
  const meta = it.meta
  if (meta !== undefined && meta !== null && (typeof meta !== 'string' || meta.length > RUMOUR_LIMITS.meta || !META.test(meta))) {
    throw new Bad(`${what}.item.meta: путь Metadata/… или null`)
  }
  return {
    item: {
      ns: oneOf(it.ns, `${what}.item.ns`, RUMOUR_ITEM_NS),
      ref: plain(it.ref, `${what}.item.ref`, RUMOUR_LIMITS.ref),
      meta: typeof meta === 'string' ? meta : null,
      name: gameText(it.name, `${what}.item.name`, dropped)
    }
  }
}

const RECORD_KEYS = ['id', 'area', 'text', 'island', 'category', 'bosses', 'rewards', 'risks', 'difficulty', 'tier', 'note', 'checked'] as const

function record(v: unknown, dropped: Dropped): RumourRecord {
  const o = obj(v, 'rumour', RECORD_KEYS, dropped)
  if (typeof o.id !== 'string' || !RUMOUR_ID.test(o.id)) throw new Bad('id: латиница, цифры и дефис, до 48 символов')
  if (typeof o.area !== 'string' || !AREA.test(o.area)) throw new Bad('area: WorldAreas.Id из файлов игры')
  const bosses = o.bosses === undefined ? [] : o.bosses
  if (!Array.isArray(bosses) || bosses.length > RUMOUR_LIMITS.bosses) throw new Bad(`bosses: до ${RUMOUR_LIMITS.bosses}`)
  const rewards = o.rewards === undefined ? [] : o.rewards
  if (!Array.isArray(rewards) || rewards.length > RUMOUR_LIMITS.rewards) throw new Bad(`rewards: до ${RUMOUR_LIMITS.rewards}`)
  const rw = rewards.map((r, i) => reward(r, `rewards[${i}]`, dropped))
  const seen = new Set<string>()
  for (const r of rw) {
    const k = 'item' in r ? `item:${r.item.ns}:${r.item.ref}` : `kind:${r.kind}`
    if (seen.has(k)) throw new Bad(`rewards: «${k}» дважды`)
    seen.add(k)
  }
  return {
    id: o.id,
    area: o.area,
    text: gameText(o.text, 'text', dropped),
    island: gameText(o.island, 'island', dropped),
    category: oneOf(o.category, 'category', RUMOUR_CATEGORIES),
    bosses: bosses.map((b, i) => gameText(b, `bosses[${i}]`, dropped)),
    rewards: rw,
    risks: o.risks === undefined ? [] : setOf(o.risks, 'risks', RUMOUR_RISKS),
    difficulty: level(o.difficulty, 'difficulty'),
    tier: level(o.tier, 'tier'),
    note: note(o.note, dropped),
    checked: o.checked === undefined || o.checked === null ? null : day(o.checked, 'checked')
  }
}

export type Checked<T> = { ok: true; value: T; dropped: string[] } | { ok: false; error: string }

/** Одна запись слуха. */
export function validateRumour(v: unknown): Checked<RumourRecord> {
  const dropped: Dropped = []
  try {
    const value = record(v, dropped)
    return { ok: true, value, dropped: dropped.map((d) => `${value.id}.${d.replace(/^rumour\./, '')}`) }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message }
    throw e
  }
}

/** Схема новее приложения: показываем «нужна новая версия POETH», а не «битые данные». */
export function isNewerSchema(raw: unknown): boolean {
  return isObj(raw) && typeof raw.schema === 'number' && Number.isInteger(raw.schema) && raw.schema > RUMOURS_SCHEMA
}

export interface RumoursFileCheck {
  file: RumoursFile
  /** записи, которые не прошли проверку: номер в файле, id (если читается) и причина */
  failed: { index: number; id: string | null; error: string }[]
  dropped: string[]
}

/** Ключ сравнения строк игры: одинаковые после нормализации строки неразличимы для поиска и разбора буфера. */
const textKey = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Файл слухов. Шапка битая — весь файл не годится (ok: false); битая запись или повтор id, области или строки —
 * только она в failed.
 */
export function validateRumoursFile(v: unknown): { ok: true; value: RumoursFileCheck } | { ok: false; error: string } {
  const dropped: Dropped = []
  try {
    const o = obj(v, 'file', ['schema', 'patch', 'updatedAt', 'rumours'], dropped)
    if (o.schema !== RUMOURS_SCHEMA) throw new Bad(`schema: ${RUMOURS_SCHEMA}`)
    if (typeof o.patch !== 'string' || !PATCH.test(o.patch)) throw new Bad('patch: версия патча вида 0.5.5.5')
    const updatedAt = day(o.updatedAt, 'updatedAt')
    if (!Array.isArray(o.rumours) || o.rumours.length > RUMOUR_LIMITS.rumours) throw new Bad(`rumours: до ${RUMOUR_LIMITS.rumours}`)
    const rumours: RumourRecord[] = []
    const failed: RumoursFileCheck['failed'] = []
    const ids = new Set<string>()
    const areas = new Set<string>()
    const texts = new Set<string>()
    o.rumours.forEach((raw, index) => {
      const r = validateRumour(raw)
      const id = isObj(raw) && typeof raw.id === 'string' ? raw.id.slice(0, RUMOUR_LIMITS.id) : null
      if (!r.ok) return void failed.push({ index, id, error: r.error })
      const keys = [r.value.text.en, r.value.text.ru].filter((t): t is string => !!t).map(textKey)
      if (ids.has(r.value.id)) failed.push({ index, id, error: 'id: повтор' })
      else if (areas.has(r.value.area)) failed.push({ index, id, error: 'area: повтор' })
      else if (keys.some((k) => texts.has(k))) failed.push({ index, id, error: 'text: такая строка уже есть' })
      else {
        ids.add(r.value.id)
        areas.add(r.value.area)
        for (const k of keys) texts.add(k)
        rumours.push(r.value)
        dropped.push(...r.dropped)
      }
    })
    return { ok: true, value: { file: { schema: RUMOURS_SCHEMA, patch: o.patch, updatedAt, rumours }, failed, dropped } }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message }
    throw e
  }
}

/** id из английской строки: «Somethin' fishy...» → `somethin-fishy`, «Sulphite!» → `sulphite`. */
export function rumourIdOf(en: string): string {
  const s = en
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, RUMOUR_LIMITS.id)
    .replace(/-+$/, '')
  return s.length >= 2 ? s : `rumour-${s || 'x'}`
}

/** Ключ ссылки на предмет (карта цен): `ITEM:Perfect Flux`. */
export function itemRefKey(ref: RumourItemRef): string {
  return `${ref.ns}:${ref.ref}`
}

/** Главная награда с ценой: первая награда-предмет. */
export function mainItem(r: RumourRecord): RumourItemReward | null {
  for (const rw of r.rewards) if ('item' in rw) return rw.item
  return null
}
