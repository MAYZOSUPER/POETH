// Типизированная модель билда Path of Building (S35; чистый модуль, tests/pob/model.test.ts).
// XML (xml.ts) → только то, что нужно вкладке «Билд»: <Build> и посчитанные статы, этапы дерева (<Spec>),
// наборы камней, предметы по слотам, штраф резистов из <Config>, заметки без цветокодов.
// В модель не попадают <Import> (хэши аккаунта и персонажа, ссылка импорта), <Calcs>, <TreeView>, <Party>,
// <TradeSearchWeights>, URL дерева и прочие данные персонажа. Код PoE 2 распознаётся и не разбирается.
// Все строки — обычный текст для показа как текст (никакого innerHTML). Формат — docs/pob.md.

import { child, childrenOf, parseXml, XmlError, type XmlElement } from './xml'

/** Слоты экипировки PoB (ItemsTab.lua). Прочие слоты (абисс-гнёзда) — в otherSlots. */
export const POB_SLOTS = [
  'Weapon 1',
  'Weapon 2',
  'Weapon 1 Swap',
  'Weapon 2 Swap',
  'Helmet',
  'Body Armour',
  'Gloves',
  'Boots',
  'Amulet',
  'Ring 1',
  'Ring 2',
  'Ring 3',
  'Belt',
  'Graft 1',
  'Graft 2',
  'Flask 1',
  'Flask 2',
  'Flask 3',
  'Flask 4',
  'Flask 5'
] as const
export type PobSlot = (typeof POB_SLOTS)[number]
const SLOT_SET: ReadonlySet<string> = new Set(POB_SLOTS)

export type PobBandit = 'None' | 'Oak' | 'Kraityn' | 'Alira'

export interface PobGem {
  /** имя камня, как его показывает PoB (EN) */
  nameSpec: string
  /** `Metadata/Items/Gems/...` — тот же ключ, что `gems` в leveling.json; у очень старых билдов нет */
  gemId: string | null
  skillId: string | null
  /** трансфигурированные и альтернативные варианты */
  variantId: string | null
  level: number
  quality: number
  enabled: boolean
  /** сколько копий (PoB: count) */
  count: number
}

export interface PobSkillGroup {
  /** слот связки: «Body Armour», «Helmet»… null — без слота */
  slot: string | null
  /** подпись группы без цветокодов; у групп-разделителей этапов («Level 1-12») камней нет */
  label: string
  enabled: boolean
  includeInFullDPS: boolean
  /** номер главного навыка группы (с 1), null — нет */
  mainActiveSkill: number | null
  /** камень дан предметом (PoB: source), а не вставлен игроком */
  source: string | null
  gems: PobGem[]
}

export interface PobSkillSet {
  id: number
  /** название без цветокодов; '' — без названия (PoB покажет «Default») */
  title: string
  groups: PobSkillGroup[]
}

export interface PobMastery {
  node: number
  effect: number
}

export interface PobJewelSocket {
  nodeId: number
  itemId: number
}

export interface PobSpec {
  title: string
  /** версия дерева: `3_27` */
  treeVersion: string
  classId: number
  ascendClassId: number
  secondaryAscendClassId: number | null
  /** взятые ноды: hash (как ключи `nodes` в skilltree-export), без повторов, в порядке PoB */
  nodes: number[]
  masteryEffects: PobMastery[]
  /** джуэлы в гнёздах дерева: id предмета из PobBuild.items */
  sockets: PobJewelSocket[]
}

export interface PobItem {
  id: number
  /** текст предмета как в PoB (почти как в игре, EN), с его служебными строками {range:…}, Prefix: … */
  text: string
}

export interface PobItemSet {
  id: number
  title: string
  useSecondWeaponSet: boolean
  /** слот экипировки → id предмета (пустые слоты не пишутся) */
  slots: Partial<Record<PobSlot, number>>
  /** прочие слоты (абисс-гнёзда и т. п.) */
  otherSlots: Array<{ name: string; itemId: number }>
}

export interface PobConfig {
  /** штраф резистов: 0 (до 5 акта), −30 (6–10 акт), −60 (после 10 акта, по умолчанию в PoB) */
  resistancePenalty: 0 | -30 | -60
  /** «враг — босс»: None / Boss / Pinnacle / Uber; null — не задано */
  enemyIsBoss: string | null
  /** сколько опций включено автором (условия, бафы, заряды) — повод подписать «конфигурация автора» */
  inputs: number
}

export interface PobBuild {
  game: 'poe1'
  /** targetVersion из <Build> (`3_0`) */
  targetVersion: string
  level: number
  className: string
  /** null — без асцендантa */
  ascendClassName: string | null
  /** null — не указан (PoB по умолчанию — None, убить всех) */
  bandit: PobBandit | null
  pantheonMajor: string | null
  pantheonMinor: string | null
  /** главная группа камней активного набора (с 1), null — нет */
  mainSocketGroup: number | null
  /**
   * Посчитанные PoB статы (<PlayerStat>): снимок активного Spec/ItemSet/навыка и конфигурации автора.
   * Пусто — код собран не в PoB (сайт) или старый.
   */
  stats: Record<string, number>
  specs: PobSpec[]
  /** индекс активного Spec в specs */
  activeSpec: number
  skillSets: PobSkillSet[]
  /** индекс активного набора в skillSets */
  activeSkillSet: number
  items: PobItem[]
  itemSets: PobItemSet[]
  /** индекс активного набора в itemSets */
  activeItemSet: number
  config: PobConfig
  /** заметки автора без цветокодов */
  notes: string
  /** что пришлось пропустить или обрезать (длинный текст предмета, заметки) — для отладки и тестов */
  warnings: string[]
}

export type PobParseError =
  | 'not-pob' // не XML или корень не PathOfBuilding (detail — код ошибки XML)
  | 'too-large' // предел глубины, числа элементов, длины атрибута или текста
  | 'poe2' // это билд Path of Exile 2

export type PobParseResult = { ok: true; build: PobBuild } | { ok: false; error: PobParseError; detail?: string }

// ---------------------------------------------------------------------------- пределы модели

/** Текст одного предмета: Forbidden Flame со всеми вариантами — 31 тыс. символов; больше — предмет пропускается. */
export const POB_ITEM_TEXT_MAX = 64 * 1024
/** Заметки автора: длиннее — обрезаются. */
export const POB_NOTES_MAX = 64 * 1024
/** Названия этапов, подписи групп, имена камней и слотов. */
const SHORT_MAX = 200
/** Нод в одном Spec: в дереве PoE1 ~3,4 тыс. нод вообще. */
const NODES_MAX = 4000

// ---------------------------------------------------------------------------- текст

/** Убрать цветокоды PoB: `^0…^9` и `^xRRGGBB`. */
export function stripPobColors(s: string): string {
  return s.replace(/\^(?:x[0-9A-Fa-f]{6}|[0-9])/g, '')
}

/** Короткая строка из атрибута: без цветокодов и управляющих символов, без крайних пробелов, с пределом длины. */
function short(v: string | undefined | null, max = SHORT_MAX): string {
  if (!v) return ''
  const s =stripPobColors(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return s.length > max ? s.slice(0, max) : s
}

/** Строка без «пустых» значений PoB (nil, None, пусто). */
function opt(v: string | undefined | null): string | null {
  const s = short(v, 64)
  return !s || s === 'nil' || s === 'None' ? null : s
}

function int(v: string | undefined | null, fallback: number, min = -Infinity, max = Infinity): number {
  if (v == null || !/^\s*-?\d+(?:\.\d+)?\s*$/.test(v)) return fallback
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

function intOrNull(v: string | undefined | null, min = 0, max = 1e9): number | null {
  const n = int(v, Number.NaN, min, max)
  return Number.isNaN(n) ? null : n
}

const bool = (v: string | undefined | null, fallback: boolean): boolean => (v === 'true' ? true : v === 'false' ? false : fallback)

/** Многострочный текст элемента: переводы строк Windows → \n, отступы PoB в начале строк убраны. */
function block(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''))
    .join('\n')
    .trim()
}

// ---------------------------------------------------------------------------- разделы

function parseStats(build: XmlElement): Record<string, number> {
  const pairs: Array<[string, number]> = []
  for (const s of childrenOf(build, 'PlayerStat')) {
    const name = s.attrs.get('stat') ?? ''
    const value = Number(s.attrs.get('value'))
    // имена статов PoB — латиница, цифры и «:» (Spec:LifeInc — % жизни с дерева);
    // Object.fromEntries кладёт ключ как собственное свойство (никакого __proto__)
    if (/^[A-Za-z][A-Za-z0-9:]{0,63}$/.test(name) && Number.isFinite(value)) pairs.push([name, value])
  }
  return Object.fromEntries(pairs)
}

function numberList(v: string | undefined, max: number): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  for (const part of (v ?? '').split(',')) {
    const n = int(part, -1, 0, 0xffffffff)
    if (n < 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= max) break
  }
  return out
}

function parseSpec(el: XmlElement): PobSpec {
  const masteryEffects: PobMastery[] = []
  for (const m of (el.attrs.get('masteryEffects') ?? '').matchAll(/\{\s*(\d{1,10})\s*,\s*(\d{1,10})\s*\}/g)) {
    if (masteryEffects.length >= NODES_MAX) break
    masteryEffects.push({ node: Number(m[1]), effect: Number(m[2]) })
  }
  const sockets: PobJewelSocket[] = []
  for (const s of childrenOf(child(el, 'Sockets'), 'Socket')) {
    const nodeId = intOrNull(s.attrs.get('nodeId'))
    const itemId = intOrNull(s.attrs.get('itemId'))
    if (nodeId !== null && itemId) sockets.push({ nodeId, itemId })
  }
  return {
    title: short(el.attrs.get('title')),
    treeVersion: short(el.attrs.get('treeVersion'), 16),
    classId: int(el.attrs.get('classId'), 0, 0, 255),
    ascendClassId: int(el.attrs.get('ascendClassId'), 0, 0, 255),
    secondaryAscendClassId: intOrNull(el.attrs.get('secondaryAscendClassId'), 0, 255),
    nodes: numberList(el.attrs.get('nodes'), NODES_MAX),
    masteryEffects,
    sockets
  }
}

function parseGem(el: XmlElement): PobGem {
  return {
    nameSpec: short(el.attrs.get('nameSpec'), 100),
    gemId: short(el.attrs.get('gemId')) || null,
    skillId: opt(el.attrs.get('skillId')),
    variantId: opt(el.attrs.get('variantId')),
    level: int(el.attrs.get('level'), 1, 0, 40),
    quality: int(el.attrs.get('quality'), 0, -100, 100),
    enabled: bool(el.attrs.get('enabled'), true),
    count: int(el.attrs.get('count'), 1, 1, 100)
  }
}

function parseSkillGroup(el: XmlElement): PobSkillGroup {
  return {
    slot: opt(el.attrs.get('slot')),
    label: short(el.attrs.get('label')),
    enabled: bool(el.attrs.get('enabled'), true),
    includeInFullDPS: bool(el.attrs.get('includeInFullDPS'), false),
    mainActiveSkill: intOrNull(el.attrs.get('mainActiveSkill'), 1, 100),
    source: opt(el.attrs.get('source')),
    gems: childrenOf(el, 'Gem').map(parseGem)
  }
}

function parseSkills(el: XmlElement | null): { sets: PobSkillSet[]; active: number } {
  if (!el) return { sets: [], active: 0 }
  const sets: PobSkillSet[] = childrenOf(el, 'SkillSet').map((s, i) => ({
    id: int(s.attrs.get('id'), i + 1, 1, 1e6),
    title: short(s.attrs.get('title')),
    groups: childrenOf(s, 'Skill').map(parseSkillGroup)
  }))
  // старый формат (до наборов камней): <Skill> прямо в <Skills> — один набор без названия
  const loose = childrenOf(el, 'Skill')
  if (!sets.length && loose.length) sets.push({ id: 1, title: '', groups: loose.map(parseSkillGroup) })
  const activeId = int(el.attrs.get('activeSkillSet'), 1)
  return { sets, active: Math.max(0, sets.findIndex((s) => s.id === activeId)) }
}

function parseItemSet(el: XmlElement, id: number): PobItemSet {
  const slots: Partial<Record<PobSlot, number>> = {}
  const otherSlots: Array<{ name: string; itemId: number }> = []
  for (const s of childrenOf(el, 'Slot')) {
    const name = short(s.attrs.get('name'), 64)
    const itemId = int(s.attrs.get('itemId'), 0, 0, 1e9)
    if (!name || !itemId) continue
    if (SLOT_SET.has(name)) slots[name as PobSlot] = itemId
    else otherSlots.push({ name, itemId })
  }
  return { id, title: short(el.attrs.get('title')), useSecondWeaponSet: bool(el.attrs.get('useSecondWeaponSet'), false), slots, otherSlots }
}

function parseItems(el: XmlElement | null, warnings: string[]): { items: PobItem[]; sets: PobItemSet[]; active: number } {
  if (!el) return { items: [], sets: [], active: 0 }
  const items: PobItem[] = []
  for (const it of childrenOf(el, 'Item')) {
    const id = int(it.attrs.get('id'), 0, 1, 1e9)
    if (!id) continue
    if (it.text.length > POB_ITEM_TEXT_MAX) {
      warnings.push(`item ${id}: text too long`)
      continue
    }
    items.push({ id, text: block(it.text) })
  }
  const sets = childrenOf(el, 'ItemSet').map((s, i) => parseItemSet(s, int(s.attrs.get('id'), i + 1, 1, 1e6)))
  // старый формат: <Slot> прямо в <Items> — один набор
  if (!sets.length && childrenOf(el, 'Slot').length) sets.push(parseItemSet(el, 1))
  const activeId = int(el.attrs.get('activeItemSet'), 1)
  return { items, sets, active: Math.max(0, sets.findIndex((s) => s.id === activeId)) }
}

function parseConfig(el: XmlElement | null): { config: PobConfig; pantheonMajor: string | null; pantheonMinor: string | null } {
  // новый формат: <ConfigSet> внутри <Config activeConfigSet>; старый — <Input> прямо в <Config>
  const sets = childrenOf(el, 'ConfigSet')
  const activeId = el?.attrs.get('activeConfigSet')
  const set = sets.find((s) => s.attrs.get('id') === activeId) ?? sets[0] ?? el
  const inputs = childrenOf(set, 'Input')
  const input = (name: string): XmlElement | undefined => inputs.find((i) => i.attrs.get('name') === name)
  const penalty = int(input('resistancePenalty')?.attrs.get('number'), -60)
  return {
    config: {
      resistancePenalty: penalty === 0 ? 0 : penalty === -30 ? -30 : -60,
      enemyIsBoss: opt(input('enemyIsBoss')?.attrs.get('string')),
      inputs: inputs.length
    },
    pantheonMajor: opt(input('pantheonMajorGod')?.attrs.get('string')),
    pantheonMinor: opt(input('pantheonMinorGod')?.attrs.get('string'))
  }
}

function parseNotes(el: XmlElement | null, warnings: string[]): string {
  let s = block(stripPobColors(el?.text ?? ''))
  if (s.length > POB_NOTES_MAX) {
    warnings.push('notes truncated')
    s = s.slice(0, POB_NOTES_MAX)
  }
  return s
}

const BANDITS: readonly PobBandit[] = ['None', 'Oak', 'Kraityn', 'Alira']

/** Билд PoE 2: корень PathOfBuilding2 или версии `0_x` (у PoE 1 — `3_x`). */
function isPoe2(root: XmlElement, build: XmlElement | null): boolean {
  if (root.name === 'PathOfBuilding2') return true
  if (/^0_/.test(build?.attrs.get('targetVersion') ?? '')) return true
  return childrenOf(child(root, 'Tree'), 'Spec').some((s) => /^0_/.test(s.attrs.get('treeVersion') ?? ''))
}

/** XML PoB → модель. Ошибки XML и пределов — результат, а не исключение. */
export function parsePobXml(xml: string): PobParseResult {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch (e) {
    if (e instanceof XmlError) {
      const big = e.code === 'too-deep' || e.code === 'too-many-elements' || e.code === 'too-long' || e.code === 'too-many-attrs'
      return { ok: false, error: big ? 'too-large' : 'not-pob', detail: e.code }
    }
    throw e
  }
  if (root.name !== 'PathOfBuilding' && root.name !== 'PathOfBuilding2') return { ok: false, error: 'not-pob', detail: 'root' }
  const b = child(root, 'Build')
  if (isPoe2(root, b)) return { ok: false, error: 'poe2' }
  if (!b) return { ok: false, error: 'not-pob', detail: 'no Build' }

  const warnings: string[] = []
  const tree = child(root, 'Tree')
  const specs = childrenOf(tree, 'Spec').map(parseSpec)
  const skills = parseSkills(child(root, 'Skills'))
  const items = parseItems(child(root, 'Items'), warnings)
  const cfg = parseConfig(child(root, 'Config'))
  const bandit = b.attrs.get('bandit')

  return {
    ok: true,
    build: {
      game: 'poe1',
      targetVersion: short(b.attrs.get('targetVersion'), 16),
      level: int(b.attrs.get('level'), 1, 1, 100),
      className: short(b.attrs.get('className'), 40),
      ascendClassName: opt(b.attrs.get('ascendClassName')),
      bandit: BANDITS.find((x) => x === bandit) ?? null,
      pantheonMajor: opt(b.attrs.get('pantheonMajorGod')) ?? cfg.pantheonMajor,
      pantheonMinor: opt(b.attrs.get('pantheonMinorGod')) ?? cfg.pantheonMinor,
      mainSocketGroup: intOrNull(b.attrs.get('mainSocketGroup'), 1, 1000),
      stats: parseStats(b),
      specs,
      activeSpec: specs.length ? int(tree?.attrs.get('activeSpec'), 1, 1, specs.length) - 1 : 0,
      skillSets: skills.sets,
      activeSkillSet: skills.active,
      items: items.items,
      itemSets: items.sets,
      activeItemSet: items.active,
      config: cfg.config,
      notes: parseNotes(child(root, 'Notes'), warnings),
      warnings
    }
  }
}

/** Предмет по id (из слота набора или гнезда дерева). */
export function pobItem(build: PobBuild, id: number | undefined | null): PobItem | null {
  if (!id) return null
  return build.items.find((i) => i.id === id) ?? null
}
