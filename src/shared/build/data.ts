// Данные вкладки «Билд» (S36) — чистые загрузчики и сопоставления (main, renderer, тесты; tests/build-data/**).
//
// Дерево: hash ноды (как в коде PoB `<Spec nodes=…>`) ↔ строковый id (как в журнале игры `Successfully allocated
// passive skill id: …`) ↔ имя на языке клиента игры; разница двух наборов нод; строка поиска для игрового дерева.
// Камни: gemId PoB (`<Gem gemId=…>`) → имя и «где взять классу X на уровне Y» (награда квеста или продавец — по
// маршруту гида прокачки).
//
// Файлы: resources/data/poe1/build/{tree,gems}.json, надстройка канала обновления — userData/data/poe1/build/…
// (main читает сначала надстройку, как советник). Через poeth://data их не отдать: `build` не проходит проверку
// языка в protocol.ts — для renderer нужен IPC или правка протокола (решает лид).

import {
  GEM_FLAG,
  TREE_FLAG,
  TREE_KINDS,
  type GameLang,
  type Gem,
  type GemColor,
  type GemSource,
  type GemsData,
  type GemsDataRaw,
  type GemWhere,
  type TreeData,
  type TreeDataRaw,
  type TreeDiff,
  type TreeLine,
  type TreeMasteryEffect,
  type TreeNode,
  type TreeNodeExtraRaw
} from './types'

/** Пути внутри данных игры (resources/data/poe1, userData/data/poe1). */
export const BUILD_TREE_FILE = 'build/tree.json'
export const BUILD_GEMS_FILE = 'build/gems.json'
/** Версии формата, которые понимает приложение (новее — ждём обновления приложения). */
export const TREE_FORMAT = 1
export const GEMS_FORMAT = 1
/** Начало ключа камня в PoB: дальше — variantId (GemEffects.Id игры), у поддержек тоже. */
export const POB_GEM_PREFIX = 'Metadata/Items/Gems/SkillGem'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const numArr = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNum)

// ---------------------------------------------------------------------------
// Дерево
// ---------------------------------------------------------------------------

function calcMap(flat: number[], stats: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const id = stats[flat[i]]
    if (id) out[id] = flat[i + 1]
  }
  return out
}

/** JSON tree.json → разобранное дерево; null — не наш формат или формат новее приложения. */
export function parseTreeData(raw: unknown): TreeData | null {
  if (!isObj(raw) || raw.v !== TREE_FORMAT || !isObj(raw.nodes) || !Array.isArray(raw.names) || !Array.isArray(raw.lines)) {
    return null
  }
  const r = raw as unknown as TreeDataRaw
  const stats = Array.isArray(r.stats) ? r.stats.filter(isStr) : []
  const lines: TreeLine[] = r.lines.map((l) => ({
    en: Array.isArray(l) && isStr(l[0]) ? l[0] : '',
    ru: Array.isArray(l) && isStr(l[1]) ? l[1] : null
  }))
  const lineAt = (i: number): TreeLine => lines[i] ?? { en: '', ru: null }

  const nodes = new Map<number, TreeNode>()
  for (const [key, t] of Object.entries(r.nodes)) {
    const hash = Number(key)
    if (!Number.isInteger(hash) || !Array.isArray(t) || t.length < 10) continue
    const [id, nameIdx, kind, flags, lineIdx, calc, group, orbit, orbitIndex, edges] = t
    if (!isStr(id) || !isNum(nameIdx) || !isNum(kind) || !isNum(flags) || !numArr(lineIdx) || !numArr(calc) || !numArr(edges)) continue
    const opt = (t as unknown[])[10]
    const extra: TreeNodeExtraRaw = isObj(opt) ? (opt as TreeNodeExtraRaw) : {}
    const name = r.names[nameIdx]
    nodes.set(hash, {
      hash,
      id,
      en: name?.[0] ?? '',
      ru: name?.[1] || name?.[0] || '',
      kind: TREE_KINDS[kind] ?? 'normal',
      asc: isStr(extra.a) ? extra.a : null,
      proxy: (flags & TREE_FLAG.proxy) !== 0,
      multipleChoice: (flags & TREE_FLAG.multipleChoice) !== 0,
      multipleChoiceOption: (flags & TREE_FLAG.multipleChoiceOption) !== 0,
      bloodline: (flags & TREE_FLAG.bloodline) !== 0,
      stats: lineIdx.map(lineAt),
      calc: calcMap(calc, stats),
      group: isNum(group) ? group : 0,
      orbit: isNum(orbit) ? orbit : 0,
      orbitIndex: isNum(orbitIndex) ? orbitIndex : 0,
      links: [...edges],
      masteryEffects: numArr(extra.me) ? [...extra.me] : [],
      points: isNum(extra.pts) ? extra.pts : 0,
      clusterSize: isNum(extra.js) ? extra.js : null
    })
  }
  // рёбра в файле хранятся один раз (у ноды с меньшим hash) — соседство делаем двусторонним
  for (const n of nodes.values())
    for (const o of n.links) {
      const m = nodes.get(o)
      if (m && o > n.hash && !m.links.includes(n.hash)) m.links.push(n.hash)
    }
  for (const n of nodes.values()) n.links.sort((a, b) => a - b)

  const byId = new Map<string, TreeNode>()
  for (const n of nodes.values()) if (!byId.has(n.id)) byId.set(n.id, n)

  const masteries = new Map<number, TreeMasteryEffect>()
  if (isObj(r.masteries))
    for (const [key, m] of Object.entries(r.masteries)) {
      if (!Array.isArray(m) || !numArr(m[0]) || !numArr(m[1])) continue
      masteries.set(Number(key), { effect: Number(key), stats: m[0].map(lineAt), calc: calcMap(m[1], stats) })
    }

  const groups = new Map<number, { x: number; y: number }>()
  if (isObj(r.groups))
    for (const [key, g] of Object.entries(r.groups)) if (numArr(g) && g.length >= 2) groups.set(Number(key), { x: g[0], y: g[1] })

  return {
    version: r.v,
    meta: r.meta,
    constants: r.constants,
    classes: (Array.isArray(r.classes) ? r.classes : []).map((c, id) => ({ id, ...c, asc: c.asc ?? [] })),
    alt: Array.isArray(r.alt) ? r.alt : [],
    groups,
    nodes,
    byId,
    masteries
  }
}

export function nodeByHash(tree: TreeData, hash: number): TreeNode | null {
  return tree.nodes.get(hash) ?? null
}

/** Нода по строковому id из журнала игры; null — нода не на дереве (атлас, кластерный самоцвет). */
export function nodeById(tree: TreeData, id: string): TreeNode | null {
  return tree.byId.get(id) ?? null
}

export function nodeName(node: TreeNode, lang: GameLang): string {
  return lang === 'ru' ? node.ru : node.en
}

/** Текст строки стата на языке клиента (нет перевода — EN). */
export function lineText(line: TreeLine, lang: GameLang): string {
  return lang === 'ru' ? (line.ru ?? line.en) : line.en
}

export function nodeLines(node: TreeNode, lang: GameLang): string[] {
  return node.stats.map((l) => lineText(l, lang))
}

/** Эффект мастерства, выбранный в билде (PoB `masteryEffects="{нода,эффект}"`). */
export function masteryEffect(tree: TreeData, effect: number): TreeMasteryEffect | null {
  return tree.masteries.get(effect) ?? null
}

/** Класс по classId PoB и восхождение по ascendClassId (с 1; 0 — нет). */
export function classById(tree: TreeData, classId: number, ascendClassId = 0) {
  const cls = tree.classes[classId] ?? null
  const asc = cls && ascendClassId > 0 ? (cls.asc[ascendClassId - 1] ?? null) : null
  return { cls, asc }
}

// Углы на орбитах (как в Path of Building, PassiveTree.lua, и README skilltree-export 3.17): на орбитах по 16 и
// 40 мест — через 30°/45° и 10°/45°, на остальных — равномерно.
const ANGLES_16 = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]
const ANGLES_40 = [
  0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225,
  230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350
]

/** Угол места на орбите, градусы (0 — вверх, по часовой стрелке). */
export function orbitAngle(skillsInOrbit: number, index: number): number {
  if (skillsInOrbit === 16) return ANGLES_16[index] ?? 0
  if (skillsInOrbit === 40) return ANGLES_40[index] ?? 0
  return skillsInOrbit > 0 ? (360 * index) / skillsInOrbit : 0
}

/** Координаты ноды на дереве (для будущего SVG): центр группы + радиус орбиты под углом места. */
export function nodePosition(tree: TreeData, node: TreeNode): { x: number; y: number } | null {
  const g = tree.groups.get(node.group)
  if (!g) return null
  const r = tree.constants.orbitRadii[node.orbit] ?? 0
  const a = (orbitAngle(tree.constants.skillsPerOrbit[node.orbit] ?? 0, node.orbitIndex) * Math.PI) / 180
  return { x: g.x + Math.sin(a) * r, y: g.y - Math.cos(a) * r }
}

/**
 * Разница наборов нод: что взять и что снять при переходе from → to (этап → этап или «взято по журналу» →
 * этап). Стартовые ноды класса и восхождения не снимаются и очков сброса не стоят.
 */
export function diffNodes(from: Iterable<number>, to: Iterable<number>, tree?: TreeData | null): TreeDiff {
  const a = [...new Set(from)]
  const b = [...new Set(to)]
  const sa = new Set(a)
  const sb = new Set(b)
  const add = b.filter((h) => !sa.has(h))
  const remove = a.filter((h) => !sb.has(h))
  const isStart = (h: number) => {
    const k = tree?.nodes.get(h)?.kind
    return k === 'classStart' || k === 'ascStart'
  }
  return { add, remove, respec: remove.filter((h) => !isStart(h)).length }
}

/** Нотаблы и кейстоуны из списка по порядку (мелкие ноды и мастерства поиском по имени не выделить). */
export function keyNodes(tree: TreeData, hashes: Iterable<number>): TreeNode[] {
  const out: TreeNode[] = []
  for (const h of hashes) {
    const n = tree.nodes.get(h)
    if (n && (n.kind === 'notable' || n.kind === 'keystone')) out.push(n)
  }
  return out
}

export interface TreeSearchOptions {
  /** сколько нод взять (по умолчанию 5) */
  max?: number
  /** одна строка через «|» — только если поиск по дереву в игре это понимает (не проверено) */
  or?: boolean
  /** предел длины строки через «|» (по умолчанию 100) */
  maxLength?: number
}

export interface TreeSearch {
  /** имена на языке клиента — по одной строке на ноду */
  parts: string[]
  /** что вставить в поиск: первое имя или (or) все через «|» */
  text: string
}

/**
 * Строка поиска для игрового дерева из имён следующих нотаблов и кейстоунов этапа: игрок вставляет её в поиск
 * на дереве, игра подсвечивает ноды. Синтаксис поиска по дереву в игре не проверен (docs/check-ingame.md),
 * поэтому по умолчанию — простая строка из одного имени и список остальных; «|» — за опцией or.
 */
export function treeSearch(tree: TreeData, hashes: Iterable<number>, lang: GameLang, opts: TreeSearchOptions = {}): TreeSearch {
  const max = opts.max ?? 5
  const maxLength = opts.maxLength ?? 100
  const parts: string[] = []
  for (const n of keyNodes(tree, hashes)) {
    if (parts.length >= max) break
    const name = nodeName(n, lang).trim()
    if (!name || parts.some((p) => p.toLowerCase() === name.toLowerCase())) continue
    if (opts.or && parts.length > 0 && [...parts, name].join('|').length > maxLength) break
    parts.push(name)
  }
  return { parts, text: opts.or ? parts.join('|') : (parts[0] ?? '') }
}

// ---------------------------------------------------------------------------
// Камни
// ---------------------------------------------------------------------------

const COLORS = new Set<GemColor>(['r', 'g', 'b', 'w'])

/** JSON gems.json → разобранные камни; null — не наш формат или формат новее приложения. */
export function parseGemsData(raw: unknown): GemsData | null {
  if (!isObj(raw) || raw.v !== GEMS_FORMAT || !isObj(raw.gems) || !Array.isArray(raw.req)) return null
  const r = raw as unknown as GemsDataRaw
  const classes = Array.isArray(r.classes) ? r.classes.filter(isStr) : []
  const quests = isObj(r.quests) ? r.quests : {}
  const npcs = isObj(r.npcs) ? r.npcs : {}
  const classesOf = (mask: number) => (mask ? classes.filter((_, i) => mask & (1 << i)) : [])

  const gems = new Map<string, Gem>()
  const bySkill = new Map<string, string>()
  const byGameId = new Map<string, string>()
  for (const [gemId, t] of Object.entries(r.gems)) {
    if (!Array.isArray(t) || t.length < 5) continue
    const [en, ru, color, flags, reqIdx, from, gameId, skillId] = t as unknown[]
    if (!isStr(en) || !isStr(ru) || !isNum(flags) || !isNum(reqIdx)) continue
    const variantId = gemId.startsWith(POB_GEM_PREFIX) ? gemId.slice(POB_GEM_PREFIX.length) : gemId
    const sources: GemSource[] = []
    for (const s of Array.isArray(from) ? from : []) {
      if (!Array.isArray(s) || !isStr(s[0]) || !isStr(s[2]) || !isNum(s[3])) continue
      const q = quests[s[0]]
      if (!q) continue
      sources.push({
        kind: s[1] === 0 ? 'quest' : 'vendor',
        questId: s[0],
        act: q.act,
        level: isNum(q.lvl) ? q.lvl : null,
        questEn: q.en,
        questRu: q.ru || q.en,
        npcEn: s[2],
        npcRu: npcs[s[2]] || s[2],
        classes: classesOf(s[3])
      })
    }
    const gem: Gem = {
      gemId,
      gameId: isStr(gameId) && gameId ? gameId : gemId,
      skillId: isStr(skillId) && skillId ? skillId : variantId,
      variantId,
      en,
      ru: ru || en,
      color: COLORS.has(color as GemColor) ? (color as GemColor) : 'w',
      support: (flags & GEM_FLAG.support) !== 0,
      vaal: (flags & GEM_FLAG.vaal) !== 0,
      transfigured: (flags & GEM_FLAG.transfigured) !== 0,
      req: numArr(r.req[reqIdx]) ? [...r.req[reqIdx]] : [],
      sources
    }
    gems.set(gemId, gem)
    if (!bySkill.has(gem.skillId)) bySkill.set(gem.skillId, gemId)
    if (!gem.transfigured && !byGameId.has(gem.gameId)) byGameId.set(gem.gameId, gemId)
  }
  return { version: r.v, meta: r.meta, classes, gems, bySkill, byGameId }
}

/**
 * Камень из кода PoB: по `gemId` (ключ PoB), иначе по `skillId`. Id предмета игры сюда не подходит: ключ PoB
 * и id предмета у разных камней бывают одинаковыми (SkillGemVulnerability: в PoB — Vulnerability, а предмет с этим
 * id — Despair) — для id предмета есть gemByGameId.
 */
export function findGem(data: GemsData, id: string): Gem | null {
  const key = data.gems.has(id) ? id : data.bySkill.get(id)
  return key ? (data.gems.get(key) ?? null) : null
}

/**
 * Камень по id предмета игры (ключи камней leveling.json, данные предметов APT) — базовый, не трансфигурированный.
 * Если предмета с таким id нет, а ключ PoB такой есть (предмет сменил id: Lightning Tendrils в 3.29 —
 * SkillGemLightningTendrilsChannelled, а маршрут и PoB знают SkillGemLightningTendrils) — камень по ключу PoB,
 * как генератор привязал к нему награды маршрута.
 */
export function gemByGameId(data: GemsData, gameId: string): Gem | null {
  const key = data.byGameId.get(gameId)
  if (key) return data.gems.get(key) ?? null
  const own = data.gems.get(gameId)
  return own && !own.transfigured ? own : null
}

export function gemName(gem: Gem, lang: GameLang): string {
  return lang === 'ru' ? gem.ru : gem.en
}

/** Атрибут камня по цвету (как `attr` в leveling.json); белые — null. */
export function gemAttribute(gem: Gem): 'strength' | 'dexterity' | 'intelligence' | null {
  return gem.color === 'r' ? 'strength' : gem.color === 'g' ? 'dexterity' : gem.color === 'b' ? 'intelligence' : null
}

/** Требуемый уровень персонажа для камня уровня gemLevel (за пределами таблицы — крайнее значение). */
export function gemRequiredLevel(gem: Gem, gemLevel = 1): number {
  if (gem.req.length === 0) return 1
  const i = Math.min(Math.max(Math.trunc(gemLevel), 1), gem.req.length) - 1
  return gem.req[i]
}

/** Базовый камень трансфигурированного (по id предмета); у обычного — он сам. */
export function baseGem(data: GemsData, gem: Gem): Gem {
  if (!gem.transfigured) return gem
  const key = data.byGameId.get(gem.gameId)
  return (key && data.gems.get(key)) || gem
}

/**
 * Источники камня для базового класса (EN, как в журнале и PoB `className`): награды квестов и продавцы по ходу
 * кампании. У трансфигурированного — источники базового камня (в кампании их не выдают и не продают).
 */
export function gemSources(data: GemsData, gem: Gem, className: string): GemSource[] {
  return baseGem(data, gem).sources.filter((s) => s.classes.length === 0 || s.classes.includes(className))
}

/**
 * Где взять камень (gemId из кода PoB или найденный камень) классу X на уровне персонажа Y: первый по ходу кампании источник, уже доступный к этому
 * уровню, иначе ближайший следующий; и можно ли камень 1 уровня уже вставить.
 */
export function gemWhere(data: GemsData, id: string | Gem, className: string, level: number): GemWhere | null {
  const gem = typeof id === 'string' ? findGem(data, id) : id
  if (!gem) return null
  const base = baseGem(data, gem)
  const list = gemSources(data, gem, className)
  const ready = list.find((s) => s.level !== null && s.level <= level)
  const source = ready ?? list[0] ?? null
  const usableFrom = gemRequiredLevel(gem, 1)
  return {
    gem,
    source,
    available: !!ready,
    viaBase: base !== gem ? base : null,
    usableFrom,
    usable: level >= usableFrom
  }
}
