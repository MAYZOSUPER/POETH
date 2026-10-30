// Библиотека билдов вкладки «Билд» (S39; чистый модуль: main, tests/build/library.test.ts).
// Файл userData/builds.json: { v, active, builds[] } — только на этом компьютере, запись атомарная (main).
// Билд хранится разобранной моделью PoB (без <Import> и без исходного кода), с источником и правками этапов.
// Файл с диска — недоверенные данные: каждое поле проверяется здесь (типы, пределы), лишнее отбрасывается.

import { parsePobInput, type PobCopySite, type PobSite } from '../pob/links'
import { POB_GEM_PREFIX } from './data'
import type { PobSource } from '../pob/import'
import {
  POB_CONFIG_OPTIONS_MAX,
  POB_GEM_EXTRA,
  POB_ITEM_EXTRA,
  cleanExtra,
  cleanOverride,
  POB_ITEM_TEXT_MAX,
  POB_NOTES_MAX,
  POB_SLOTS,
  cleanConfigOption,
  type PobBandit,
  type PobBuild,
  type PobConfig,
  type PobGem,
  type PobItem,
  type PobItemSet,
  type PobSkillGroup,
  type PobSkillSet,
  type PobSlot,
  type PobSpec
} from '../pob/model'
import type { PobStageEdit, PobStageEdits } from '../pob/stages'
import type { BuildRecent, BuildState, StoredBuild } from '../types/build'

export const BUILDS_FILE = 'builds.json'
export const BUILDS_FORMAT = 1
/** Сколько билдов помнить: старые (кроме открытого) уходят из списка. */
export const BUILDS_MAX = 10

export interface BuildLibrary {
  v: typeof BUILDS_FORMAT
  active: string | null
  builds: StoredBuild[]
}

export function emptyLibrary(): BuildLibrary {
  return { v: BUILDS_FORMAT, active: null, builds: [] }
}

// ---------------------------------------------------------------------------- проверка полей

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '')
const strOrNull = (v: unknown, max = 200): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null)
const int = (v: unknown, min: number, max: number, fallback: number): number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fallback
const intOrNull = (v: unknown, min: number, max: number): number | null =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const list = <T>(v: unknown, max: number, each: (x: unknown) => T | null): T[] => {
  if (!Array.isArray(v)) return []
  const out: T[] = []
  for (const x of v.slice(0, max)) {
    const r = each(x)
    if (r !== null) out.push(r)
  }
  return out
}

const NODES_MAX = 4000
const BANDITS: readonly PobBandit[] = ['None', 'Oak', 'Kraityn', 'Alira']
const SLOT_SET: ReadonlySet<string> = new Set(POB_SLOTS)
const STAT_RE = /^[A-Za-z][A-Za-z0-9:]{0,63}$/

/** S44: атрибуты расчёта PoB с диска — тем же белым списком, что при разборе XML. */
function extraOf<K extends string>(v: unknown, keys: readonly K[]): { extra?: Partial<Record<K, string>> } {
  const extra = isObj(v) ? cleanExtra((k) => v[k], keys) : undefined
  return extra ? { extra } : {}
}

function cleanSpec(v: unknown): PobSpec | null {
  if (!isObj(v)) return null
  const nodes: number[] = []
  const seen = new Set<number>()
  for (const n of Array.isArray(v.nodes) ? v.nodes.slice(0, NODES_MAX) : []) {
    if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff && !seen.has(n)) {
      seen.add(n)
      nodes.push(n)
    }
  }
  return {
    title: str(v.title),
    treeVersion: str(v.treeVersion, 16),
    classId: int(v.classId, 0, 255, 0),
    ascendClassId: int(v.ascendClassId, 0, 255, 0),
    secondaryAscendClassId: intOrNull(v.secondaryAscendClassId, 0, 255),
    nodes,
    masteryEffects: list(v.masteryEffects, NODES_MAX, (m) =>
      isObj(m) && Number.isInteger(m.node) && Number.isInteger(m.effect) ? { node: m.node as number, effect: m.effect as number } : null
    ),
    sockets: list(v.sockets, 200, (s) =>
      isObj(s) && Number.isInteger(s.nodeId) && Number.isInteger(s.itemId) ? { nodeId: s.nodeId as number, itemId: s.itemId as number } : null
    ),
    // S44: татуировки для движка PoB
    ...(Array.isArray(v.overrides) ? { overrides: list(v.overrides, 200, (o) => (isObj(o) ? cleanOverride(o.nodeId, o.dn) : null)) } : {}),
    ...(intOrNull(v.clusterHashFormat, 1, 99) !== null ? { clusterHashFormat: intOrNull(v.clusterHashFormat, 1, 99) as number } : {})
  }
}

function cleanGem(v: unknown): PobGem | null {
  if (!isObj(v)) return null
  return {
    nameSpec: str(v.nameSpec, 100),
    gemId: strOrNull(v.gemId),
    skillId: strOrNull(v.skillId, 64),
    variantId: strOrNull(v.variantId, 64),
    level: int(v.level, 0, 40, 1),
    quality: int(v.quality, -100, 100, 0),
    enabled: bool(v.enabled, true),
    count: int(v.count, 1, 100, 1),
    ...extraOf(v.extra, POB_GEM_EXTRA)
  }
}

function cleanGroup(v: unknown): PobSkillGroup | null {
  if (!isObj(v)) return null
  return {
    slot: strOrNull(v.slot, 64),
    label: str(v.label),
    enabled: bool(v.enabled, true),
    includeInFullDPS: bool(v.includeInFullDPS, false),
    mainActiveSkill: intOrNull(v.mainActiveSkill, 1, 100),
    source: strOrNull(v.source, 64),
    gems: list(v.gems, 40, cleanGem),
    ...(intOrNull(v.groupCount, 1, 100) !== null ? { groupCount: intOrNull(v.groupCount, 1, 100) as number } : {})
  }
}

function cleanSkillSet(v: unknown, i: number): PobSkillSet | null {
  if (!isObj(v)) return null
  return { id: int(v.id, 1, 1e6, i + 1), title: str(v.title), groups: list(v.groups, 300, cleanGroup) }
}

function cleanItem(v: unknown): PobItem | null {
  if (!isObj(v) || !Number.isInteger(v.id) || typeof v.text !== 'string' || v.text.length > POB_ITEM_TEXT_MAX) return null
  return { id: v.id as number, text: v.text, ...extraOf(v.extra, POB_ITEM_EXTRA) }
}

function cleanItemSet(v: unknown, i: number): PobItemSet | null {
  if (!isObj(v)) return null
  const slots: Partial<Record<PobSlot, number>> = {}
  if (isObj(v.slots))
    for (const [k, id] of Object.entries(v.slots)) if (SLOT_SET.has(k) && Number.isInteger(id)) slots[k as PobSlot] = id as number
  return {
    id: int(v.id, 1, 1e6, i + 1),
    title: str(v.title),
    useSecondWeaponSet: bool(v.useSecondWeaponSet, false),
    slots,
    otherSlots: list(v.otherSlots, 100, (s) =>
      isObj(s) && typeof s.name === 'string' && Number.isInteger(s.itemId) ? { name: s.name.slice(0, 64), itemId: s.itemId as number } : null
    ),
    // S44: включённые флаконы для движка PoB
    ...(Array.isArray(v.active) ? { active: list(v.active, POB_SLOTS.length, (s) => (typeof s === 'string' && SLOT_SET.has(s) ? (s as PobSlot) : null)) } : {})
  }
}

function cleanConfig(v: unknown): PobConfig {
  const c = isObj(v) ? v : {}
  const p = c.resistancePenalty
  return {
    resistancePenalty: p === 0 ? 0 : p === -30 ? -30 : -60,
    enemyIsBoss: strOrNull(c.enemyIsBoss, 64),
    inputs: int(c.inputs, 0, 1e6, 0),
    // S44: опции автора для движка PoB; у билдов, сохранённых до S44, их нет
    ...(Array.isArray(c.options) ? { options: list(c.options, POB_CONFIG_OPTIONS_MAX, (o) => (isObj(o) ? cleanConfigOption(o) : null)) } : {})
  }
}

/** Модель PoB с диска → проверенная модель; null — не билд PoE 1. */
export function cleanPobBuild(v: unknown): PobBuild | null {
  if (!isObj(v) || v.game !== 'poe1') return null
  const specs = list(v.specs, 200, cleanSpec)
  const skillSets = list(v.skillSets, 200, (s) => cleanSkillSet(s, 0))
  const itemSets = list(v.itemSets, 200, (s) => cleanItemSet(s, 0))
  const stats: Array<[string, number]> = []
  if (isObj(v.stats))
    for (const [k, n] of Object.entries(v.stats)) if (STAT_RE.test(k) && typeof n === 'number' && Number.isFinite(n)) stats.push([k, n])
  const bandit = BANDITS.find((b) => b === v.bandit) ?? null
  return {
    game: 'poe1',
    targetVersion: str(v.targetVersion, 16),
    level: int(v.level, 1, 100, 1),
    className: str(v.className, 40),
    ascendClassName: strOrNull(v.ascendClassName, 64),
    bandit,
    pantheonMajor: strOrNull(v.pantheonMajor, 64),
    pantheonMinor: strOrNull(v.pantheonMinor, 64),
    mainSocketGroup: intOrNull(v.mainSocketGroup, 1, 1000),
    stats: Object.fromEntries(stats),
    specs,
    activeSpec: int(v.activeSpec, 0, Math.max(0, specs.length - 1), 0),
    skillSets,
    activeSkillSet: int(v.activeSkillSet, 0, Math.max(0, skillSets.length - 1), 0),
    items: list(v.items, 2000, cleanItem),
    itemSets,
    activeItemSet: int(v.activeItemSet, 0, Math.max(0, itemSets.length - 1), 0),
    config: cleanConfig(v.config),
    notes: str(v.notes, POB_NOTES_MAX),
    warnings: list(v.warnings, 50, (w) => (typeof w === 'string' ? w.slice(0, 200) : null))
  }
}

const SITES: readonly PobSite[] = ['pobbin', 'pastebin', 'pobcodes', 'poedb', 'maxroll', 'rentry']

/** Источник с диска: ссылка — только страница сайта, которую узнаёт разбор ввода (allowlist S35). */
export function cleanSource(v: unknown): PobSource {
  if (!isObj(v) || v.kind !== 'link' || typeof v.pageUrl !== 'string') return { kind: 'code' }
  const input = parsePobInput(v.pageUrl.slice(0, 300))
  if (input.kind !== 'link') return { kind: 'code' }
  return { kind: 'link', site: SITES.find((s) => s === input.site), pageUrl: input.pageUrl }
}

const EDIT_KEYS = ['spec', 'skills', 'items', 'leveling', 'from'] as const

/**
 * Правки этапов (от окна или с диска): только известные поля с простыми значениями. Индексы наборов
 * проверяет resolveStages по самому билду — здесь форма.
 */
export function cleanEdits(v: unknown): PobStageEdits {
  if (!isObj(v)) return {}
  const out: PobStageEdits = {}
  if (typeof v.current === 'string' && v.current.length <= 64) out.current = v.current
  if (isObj(v.stages)) {
    const stages: Record<string, PobStageEdit> = {}
    for (const [key, e] of Object.entries(v.stages).slice(0, 300)) {
      if (key.length > 64 || !/^[a-z]+(?::\d{1,4}){1,2}$/.test(key) || !isObj(e)) continue
      const edit: Record<string, unknown> = {}
      for (const k of EDIT_KEYS) {
        if (!(k in e)) continue
        const x = e[k]
        if (k === 'skills') {
          if (x === null) edit.skills = null
          else if (isObj(x) && Number.isInteger(x.set) && (x.section === null || Number.isInteger(x.section)))
            edit.skills = { set: x.set, section: x.section }
        } else if (k === 'leveling') {
          if (typeof x === 'boolean') edit.leveling = x
        } else if (x === null || Number.isInteger(x)) edit[k] = x
      }
      if (Object.keys(edit).length) stages[key] = edit as PobStageEdit
    }
    if (Object.keys(stages).length) out.stages = stages
  }
  // S40: ручные метки «ключевой» у предметов: `u:<имя уника>` или `i:<id предмета PoB>` → true / false
  if (isObj(v.marks)) {
    const marks: Record<string, boolean> = {}
    for (const [key, x] of Object.entries(v.marks).slice(0, MARKS_MAX)) {
      if (typeof x === 'boolean' && MARK_KEY_RE.test(key)) marks[key] = x
    }
    if (Object.keys(marks).length) out.marks = marks
  }
  return out
}

const MARKS_MAX = 200
/** Ключ метки: имя уника (без управляющих символов, ≤ 100) или id предмета PoB. */
const MARK_KEY_RE = /^(?:u:[^\u0000-\u001f\u007f]{1,100}|i:\d{1,9})$/

const ID_RE = /^[A-Za-z0-9_-]{4,40}$/

function cleanStored(v: unknown): StoredBuild | null {
  if (!isObj(v) || typeof v.id !== 'string' || !ID_RE.test(v.id)) return null
  const build = cleanPobBuild(v.build)
  if (!build) return null
  const now = Date.now()
  const addedAt = typeof v.addedAt === 'number' && Number.isFinite(v.addedAt) ? v.addedAt : now
  return {
    id: v.id,
    build,
    source: cleanSource(v.source),
    edits: cleanEdits(v.edits),
    addedAt,
    openedAt: typeof v.openedAt === 'number' && Number.isFinite(v.openedAt) ? v.openedAt : addedAt
  }
}

/** builds.json → библиотека (битый файл или чужой формат — пустая). */
export function parseLibrary(raw: unknown): BuildLibrary {
  if (!isObj(raw) || raw.v !== BUILDS_FORMAT) return emptyLibrary()
  const seen = new Set<string>()
  const builds = list(raw.builds, BUILDS_MAX * 2, cleanStored).filter((b) => !seen.has(b.id) && !!seen.add(b.id))
  const active = typeof raw.active === 'string' && seen.has(raw.active) ? raw.active : null
  return limit({ v: BUILDS_FORMAT, active, builds })
}

// ---------------------------------------------------------------------------- изменения

/** Не больше BUILDS_MAX: уходят давно не открытые, открытый — никогда. */
function limit(lib: BuildLibrary): BuildLibrary {
  if (lib.builds.length <= BUILDS_MAX) return lib
  const keep = [...lib.builds]
    .sort((a, b) => (a.id === lib.active ? -1 : b.id === lib.active ? 1 : b.openedAt - a.openedAt))
    .slice(0, BUILDS_MAX)
  const ids = new Set(keep.map((b) => b.id))
  return { ...lib, builds: lib.builds.filter((b) => ids.has(b.id)) }
}

/** Отпечаток билда: тот же код или та же ссылка второй раз не плодят записи (и сохраняют правки этапов). */
export function buildFingerprint(build: PobBuild): string {
  const parts = [
    build.className,
    build.ascendClassName ?? '',
    build.specs.map((s) => `${s.title}:${s.nodes.length}:${s.nodes.slice(0, 8).join('.')}`).join('|'),
    build.skillSets.map((s) => `${s.title}:${s.groups.map((g) => g.gems.map((x) => x.gemId ?? x.nameSpec).join(',')).join(';')}`).join('|'),
    build.itemSets.length,
    build.notes.slice(0, 4000)
  ]
  let h = 2166136261
  for (const ch of parts.join('#')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(36)
}

function sameBuild(a: StoredBuild, build: PobBuild, source: PobSource): boolean {
  if (source.kind === 'link' && a.source.kind === 'link' && source.pageUrl && a.source.pageUrl === source.pageUrl) return true
  return buildFingerprint(a.build) === buildFingerprint(build)
}

/** Вставленный билд: новый — в начало и открыть; уже был (та же ссылка или тот же код) — обновить, правки сохранить. */
export function addBuild(lib: BuildLibrary, build: PobBuild, source: PobSource, now: number, newId: () => string): BuildLibrary {
  const old = lib.builds.find((b) => sameBuild(b, build, source))
  const entry: StoredBuild = old
    ? { ...old, build, source: source.kind === 'link' ? source : old.source, openedAt: now }
    : { id: newId(), build, source, edits: {}, addedAt: now, openedAt: now }
  const rest = lib.builds.filter((b) => b.id !== entry.id)
  return limit({ v: BUILDS_FORMAT, active: entry.id, builds: [entry, ...rest] })
}

/** Перезагрузка по ссылке: заменить модель у того же билда, правки этапов оставить. */
export function replaceBuild(lib: BuildLibrary, id: string, build: PobBuild, now: number): BuildLibrary {
  return { ...lib, builds: lib.builds.map((b) => (b.id === id ? { ...b, build, openedAt: now } : b)) }
}

export function openBuild(lib: BuildLibrary, id: string | null, now: number): BuildLibrary {
  if (id === null) return { ...lib, active: null }
  if (!lib.builds.some((b) => b.id === id)) return lib
  return { ...lib, active: id, builds: lib.builds.map((b) => (b.id === id ? { ...b, openedAt: now } : b)) }
}

export function removeBuild(lib: BuildLibrary, id: string): BuildLibrary {
  return { ...lib, active: lib.active === id ? null : lib.active, builds: lib.builds.filter((b) => b.id !== id) }
}

export function setBuildEdits(lib: BuildLibrary, id: string, edits: unknown): BuildLibrary {
  const clean = cleanEdits(edits)
  return { ...lib, builds: lib.builds.map((b) => (b.id === id ? { ...b, edits: clean } : b)) }
}

// ---------------------------------------------------------------------------- для окон

/** Ключ камня PoB (`SkillGem` + variantId, как строит сам PoB); у старых кодов без variantId — gemId из кода. */
export function pobGemKey(g: Pick<PobGem, 'gemId' | 'variantId'>): string | null {
  return g.variantId ? POB_GEM_PREFIX + g.variantId : g.gemId
}

/**
 * Главный навык: группа mainSocketGroup активного набора камней и её mainActiveSkill-й активный камень;
 * иначе — первый активный камень первой включённой группы со связкой. gemId — ключ PoB (pobGemKey).
 */
export function mainSkill(build: PobBuild): { name: string; gemId: string | null } {
  const set = build.skillSets[build.activeSkillSet] ?? build.skillSets[0]
  const groups = set?.groups ?? []
  const active = (g: PobSkillGroup): PobGem[] =>
    g.gems.filter((x) => x.enabled && !(x.gemId ?? '').includes('Support') && !/ Support$/.test(x.nameSpec))
  const main = build.mainSocketGroup ? groups[build.mainSocketGroup - 1] : undefined
  if (main) {
    const gems = active(main)
    const gem = gems[(main.mainActiveSkill ?? 1) - 1] ?? gems[0]
    if (gem) return { name: gem.nameSpec, gemId: pobGemKey(gem) }
  }
  for (const g of groups) {
    if (!g.enabled || g.source) continue
    const gem = active(g)[0]
    if (gem) return { name: gem.nameSpec, gemId: pobGemKey(gem) }
  }
  return { name: '', gemId: null }
}

export function recentOf(b: StoredBuild): BuildRecent {
  const spec = b.build.specs[b.build.activeSpec] ?? b.build.specs[0]
  const main = mainSkill(b.build)
  return {
    id: b.id,
    mainSkill: main.name,
    mainGemId: main.gemId,
    classId: spec?.classId ?? 0,
    ascendClassId: spec?.ascendClassId ?? 0,
    className: b.build.className,
    ascendClassName: b.build.ascendClassName,
    source: b.source,
    addedAt: b.addedAt,
    openedAt: b.openedAt
  }
}

export function stateOf(lib: BuildLibrary): BuildState {
  const recent = [...lib.builds].sort((a, b) => b.openedAt - a.openedAt).map(recentOf)
  return { active: lib.builds.find((b) => b.id === lib.active) ?? null, recent }
}

/** Сайт ссылки на билд (для подписи «pobb.in» в шапке и в недавних). */
export function sourceHost(source: PobSource): string | null {
  if (source.kind !== 'link' || !source.pageUrl) return null
  try {
    const u = new URL(source.pageUrl)
    return `${u.hostname}${u.pathname}`.replace(/\/$/, '')
  } catch {
    return null
  }
}

export type { PobCopySite }
