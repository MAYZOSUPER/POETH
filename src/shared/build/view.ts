// Вид этапа вкладки «Билд» (S39; чистый модуль: renderer, main, tests/build/view.test.ts). Из модели PoB (S35),
// плана этапов и данных S36 (дерево, камни) — то, что показывают разделы этапа и строка билда в гиде прокачки:
//  - «Камни сейчас»: взять за квест / купить у NPC / уже есть, копии, «не меняй связку, пока не дорос»;
//  - «Связки» по слотам; «Дерево: следующие ноды» — разница с прошлым этапом и «взято» по журналу;
//  - «Проверка» — светофор по посчитанным статам автора (<PlayerStat>), чек-лист этапа;
//  - строка для поиска у продавца (кратчайшие уникальные подстроки имён камней).
// Ключ камня — gemId PoB (findGem S36), не id предмета: они расходятся у поддержек и части умений.
// Имена — на языке клиента игры (GameLang), подписи окна — на языке интерфейса (их собирает окно).

import { escapeRegex, formatTerm, REGEX_LIMIT } from '../regex/format'
import type { PobBuild, PobGem, PobSkillGroup } from '../pob/model'
import { actStartLevel, skillSections, type PobStage, type PobStagePlan, type StageSkills } from '../pob/stages'
import {
  POB_GEM_PREFIX,
  diffNodes,
  findGem,
  gemName,
  gemRequiredLevel,
  gemSources,
  lineText,
  masteryEffect,
  nodeName,
  treeSearch,
  type TreeSearch
} from './data'
import type { GameLang, Gem, GemColor, GemSource, GemsData, TreeData, TreeNode } from './types'

// ---------------------------------------------------------------------------- этапы

export interface StageChip {
  index: number
  stage: PobStage
  /** этап прокачки уже позади (раньше текущего) */
  past: boolean
  /** текущий по уровню персонажа (или выбранный игроком) */
  now: boolean
}

/** Чипы этапов: сначала прокачка, затем остальное (эндгейм, варианты) — в порядке плана. */
export function stageChips(plan: PobStagePlan, current: number | null): StageChip[] {
  const chips = plan.stages.map((stage, index) => ({
    index,
    stage,
    past: current !== null && stage.leveling && index < current && plan.stages[current].leveling,
    now: index === current
  }))
  return [...chips.filter((c) => c.stage.leveling), ...chips.filter((c) => !c.stage.leveling)]
}

/** Уровни этапа: с какого и до какого (до начала следующего этапа прокачки); null — не узнан. */
export function stageRange(plan: PobStagePlan, index: number): { from: number; to: number } | null {
  const s = plan.stages[index]
  if (!s || s.from === null) return null
  const next = plan.stages.find((x, i) => i > index && x.leveling && x.from !== null && x.from > (s.from as number))
  return { from: s.from, to: next ? (next.from as number) - 1 : 100 }
}

/** Уровень персонажа для расчётов этапа: свой — у текущего этапа, иначе начало этапа. */
export function stageLevel(plan: PobStagePlan, index: number, current: number | null, level: number | null): number {
  const from = plan.stages[index]?.from ?? null
  if (index === current && level !== null) return Math.max(level, from ?? 1)
  return from ?? level ?? 1
}

/** Ближайший раньше этап прокачки, у которого по оси другой набор (у соседей набор бывает общий). */
function prevIndex(plan: PobStagePlan, index: number, differs: (a: PobStage, b: PobStage) => boolean): number | null {
  const cur = plan.stages[index]
  if (!cur) return null
  for (let i = index - 1; i >= 0; i--) {
    const s = plan.stages[i]
    if (s.leveling && differs(s, cur)) return i
  }
  return null
}

const sameSkills = (a: StageSkills | null, b: StageSkills | null): boolean =>
  a === b || (!!a && !!b && a.set === b.set && a.section === b.section)

/** Индекс этапа плана → индекс в этапах с деревом (TreeBuild.stages S38): последний этап с деревом не позже. */
export function treeStageIndex(plan: PobStagePlan, planIndex: number): number | null {
  let n = -1
  let found: number | null = null
  plan.stages.forEach((s, i) => {
    if (s.spec === null) return
    n++
    if (i <= planIndex) found = n
  })
  return found
}

// ---------------------------------------------------------------------------- камни этапа

/** Группы камней этапа (без разделителей, отключённых групп и камней от предметов). */
export function stageGroups(build: PobBuild, skills: StageSkills | null): PobSkillGroup[] {
  if (!skills) return []
  const set = build.skillSets[skills.set]
  if (!set) return []
  let groups = set.groups
  if (skills.section !== null) {
    const sec = skillSections(set)[skills.section]
    groups = sec ? set.groups.slice(sec.groupFrom, sec.groupTo) : []
  }
  return groups.filter((g) => g.enabled && !g.source && g.gems.some((x) => x.enabled))
}

/**
 * Камень из кода PoB. В коде `gemId` бывает и ключом PoB, и id предмета (у поддержек — `SupportGem…`, у части
 * умений id предмета совпадает с ключом другого камня: SkillGemVulnerability), поэтому сначала ключ из variantId
 * (`SkillGem` + variantId — так строит ключ сам PoB), затем skillId, и только потом gemId.
 */
export function resolvePobGem(data: GemsData | null, g: Pick<PobGem, 'gemId' | 'skillId' | 'variantId'>): Gem | null {
  if (!data) return null
  return (
    (g.variantId && findGem(data, POB_GEM_PREFIX + g.variantId)) ||
    (g.skillId && findGem(data, g.skillId)) ||
    (g.gemId && findGem(data, g.gemId)) ||
    null
  )
}

const resolveGem = resolvePobGem

/** Ключ камня в этапе: ключ PoB найденного камня, иначе что есть в коде. */
function keyOf(data: GemsData | null, g: PobGem): string {
  return resolveGem(data, g)?.gemId ?? (g.variantId ? POB_GEM_PREFIX + g.variantId : (g.gemId ?? g.skillId ?? g.nameSpec))
}

/** Копии камней в группах: ключ → сколько раз встречается. */
function copies(data: GemsData | null, groups: PobSkillGroup[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const grp of groups)
    for (const g of grp.gems) {
      if (!g.enabled) continue
      const k = keyOf(data, g)
      out.set(k, (out.get(k) ?? 0) + 1)
    }
  return out
}

export type GemStatus = 'buy' | 'quest' | 'have' | 'none'

export interface GemRow {
  key: string
  gem: Gem | null
  /** имя на языке клиента игры (нет в данных — как в PoB) */
  name: string
  color: GemColor | null
  support: boolean
  status: GemStatus
  /** нужно копий на этапе и было на прошлых этапах */
  need: number
  have: number
  /** откуда: награда квеста или продавец (на языке клиента — в source.*Ru/*En) */
  source: GemSource | null
  /** продавец для остальных копий (квест даёт одну) */
  vendor: GemSource | null
  /** источник уже доступен к этому уровню */
  available: boolean
  /** трансфигурированный: в кампании — только базовый камень */
  viaBase: Gem | null
  /** с какого уровня персонажа камень можно вставить */
  usableFrom: number
  usable: boolean
  /** камни прошлого этапа, которые он заменяет в той же связке (имена) */
  replaces: string[]
  /** главное действие сейчас (подсветка строки) */
  next: boolean
}

export interface StageGems {
  rows: GemRow[]
  buy: number
  quest: number
}

const STATUS_ORDER: Record<GemStatus, number> = { buy: 0, quest: 1, none: 2, have: 3 }

function isSupportGem(gem: Gem | null, g: PobGem): boolean {
  return gem ? gem.support : (g.gemId ?? '').includes('Support')
}

/** Что было до этапа: копии камней и награды квестов, уже взятые на прошлых этапах. */
interface GemPast {
  had: Map<string, number>
  quests: Set<string>
}

/**
 * «Камни сейчас»: камни набора этапа, где их взять классу на уровне этапа и что уже было на прошлых этапах.
 * Награда квеста — одна на квест на всю кампанию: если её уже взяли на прошлом этапе (или другим камнем этого
 * этапа), камень — у продавца. Прошлые этапы с тем же набором камней не считаются (один набор на несколько актов).
 * Сначала то, что сделать (купить, взять за квест), «уже есть» — в конце.
 */
export function stageGems(
  build: PobBuild,
  plan: PobStagePlan,
  index: number,
  data: GemsData | null,
  lang: GameLang,
  level: number
): StageGems {
  const stage = plan.stages[index]
  if (!stage) return { rows: [], buy: 0, quest: 0 }
  const past: GemPast = { had: new Map(), quests: new Set() }
  const seen: StageSkills[] = []
  for (let i = 0; i < index; i++) {
    const s = plan.stages[i]
    if (!s.leveling || !s.skills || sameSkills(s.skills, stage.skills) || seen.some((x) => sameSkills(x, s.skills))) continue
    seen.push(s.skills)
    const rows = gemRows(build, plan, i, data, lang, s.from ?? 1, past)
    for (const r of rows) {
      past.had.set(r.key, Math.max(past.had.get(r.key) ?? 0, r.need))
      if (r.status === 'quest' && r.source) past.quests.add(r.source.questId)
    }
  }
  const rows = gemRows(build, plan, index, data, lang, level, past)
  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  const next = rows.find((r) => (r.status === 'buy' || r.status === 'quest') && r.available)
  if (next) next.next = true
  return {
    rows,
    buy: rows.filter((r) => r.status === 'buy').length,
    quest: rows.filter((r) => r.status === 'quest').length
  }
}

function gemRows(
  build: PobBuild,
  plan: PobStagePlan,
  index: number,
  data: GemsData | null,
  lang: GameLang,
  level: number,
  past: GemPast
): GemRow[] {
  const stage = plan.stages[index]
  const groups = stageGroups(build, stage.skills)
  const need = copies(data, groups)
  const gemKey = (g: PobGem): string => keyOf(data, g)
  // что заменено в той же связке: в прошлом этапе одна группа этого слота, и старого камня в этапе больше нет
  const prev = prevIndex(plan, index, (a, b) => !sameSkills(a.skills, b.skills))
  const prevGroups = prev === null ? [] : stageGroups(build, plan.stages[prev].skills)

  const first = new Map<string, PobGem>()
  for (const grp of groups) for (const g of grp.gems) if (g.enabled && !first.has(gemKey(g))) first.set(gemKey(g), g)

  const used = new Set(past.quests)
  const rows: GemRow[] = []
  // активные раньше поддержек: награду квеста лучше отдать умению
  const entries = [...first.entries()].sort(
    (a, b) => Number(isSupportGem(resolveGem(data, a[1]), a[1])) - Number(isSupportGem(resolveGem(data, b[1]), b[1]))
  )
  for (const [key, g] of entries) {
    const gem = resolveGem(data, g)
    const n = need.get(key) ?? 1
    const have = Math.min(past.had.get(key) ?? 0, n)
    const list = gem && data ? gemSources(data, gem, build.className) : []
    const quests = list.filter((s) => s.kind === 'quest')
    const quest = quests.find((s) => !used.has(s.questId)) ?? null
    const vendor = list.find((s) => s.kind === 'vendor') ?? null
    let status: GemStatus = 'have'
    let source: GemSource | null = null
    if (have < n) {
      if (quest && have === 0) {
        status = 'quest'
        source = quest
        used.add(quest.questId)
      } else if (vendor) {
        status = 'buy'
        source = vendor
      } else if (quests.length) {
        status = 'quest'
        source = quests[0]
      } else status = 'none'
    }
    const usableFrom = gem ? gemRequiredLevel(gem, 1) : 1
    const replaces: string[] = []
    if (!past.had.has(key) && prevGroups.length) {
      const own = groups.find((grp) => grp.gems.some((x) => gemKey(x) === key))
      const slotNow = own?.slot ? groups.filter((grp) => grp.slot === own.slot) : []
      const before = own?.slot ? prevGroups.filter((p) => p.slot === own.slot) : []
      if (own && slotNow.length === 1 && before.length === 1) {
        const inStage = new Set(groups.flatMap((grp) => grp.gems.map(gemKey)))
        for (const x of before[0].gems)
          if (x.enabled && !inStage.has(gemKey(x)) && isSupportGem(resolveGem(data, x), x) === isSupportGem(gem, g)) {
            const xg = resolveGem(data, x)
            replaces.push(xg ? gemName(xg, lang) : x.nameSpec)
          }
      }
    }
    rows.push({
      key,
      gem,
      name: gem ? gemName(gem, lang) : g.nameSpec,
      color: gem?.color ?? null,
      support: isSupportGem(gem, g),
      status,
      need: n,
      have,
      source,
      vendor: status === 'quest' && n - have > 1 ? vendor : null,
      available: !!source && source.level !== null && source.level <= level,
      viaBase: gem && gem.transfigured && data ? findBase(data, gem) : null,
      usableFrom,
      usable: level >= usableFrom,
      replaces: replaces.slice(0, 2),
      next: false
    })
  }
  return rows
}

function findBase(data: GemsData, gem: Gem): Gem | null {
  const key = data.byGameId.get(gem.gameId)
  const base = key ? data.gems.get(key) : undefined
  return base && base !== gem ? base : null
}

// ---------------------------------------------------------------------------- строка для продавца

const fold = (s: string): string => s.toLowerCase().replace(/ё/g, 'е')

export interface VendorSearch {
  /** что вставить в поиск окна продавца; '' — нечего */
  text: string
  /** камни, которые в строку не влезли (250 символов) */
  dropped: string[]
}

/**
 * Строка поиска у продавца камней: для каждого имени — кратчайшая подстрока с начала слова, которой нет в других
 * именах камней, которые продают в кампании (трансфигурированных, Vaal, пробуждённых и «великих» у продавцов нет); нет такой — имя целиком с «$» (конец
 * строки подсказки). Регистр — как в имени: на RU-клиенте поиск может различать регистр кириллицы.
 */
export function vendorSearch(names: string[], data: GemsData, lang: GameLang): VendorSearch {
  const universe: string[] = []
  // в окне продавца — только то, что выдают и продают в кампании (у таких камней есть источники)
  for (const g of data.gems.values()) if (g.sources.length) universe.push(fold(gemName(g, lang)))
  const parts: string[] = []
  const dropped: string[] = []
  for (const name of [...new Set(names.filter(Boolean))]) {
    const own = fold(name)
    const others = universe.filter((u) => u !== own)
    let pick: string | null = null
    for (let len = 3; len <= name.length && !pick; len++) {
      for (let at = 0; at + len <= name.length; at++) {
        if (at > 0 && !/[\s:-]/.test(name[at - 1])) continue
        const sub = name.slice(at, at + len)
        if (/^\s|\s$/.test(sub)) continue
        const f = fold(sub)
        if (!others.some((o) => o.includes(f))) {
          pick = escapeRegex(sub)
          break
        }
      }
    }
    if (!pick) pick = others.some((o) => o.endsWith(own)) ? escapeRegex(name) : `${escapeRegex(name)}$`
    const text = formatTerm({ negate: false, body: [...parts, pick].join('|') })
    if (text.length > REGEX_LIMIT) dropped.push(name)
    else parts.push(pick)
  }
  return { text: parts.length ? formatTerm({ negate: false, body: parts.join('|') }) : '', dropped }
}

// ---------------------------------------------------------------------------- связки

export interface LinkGem {
  name: string
  color: GemColor | null
  support: boolean
  /** камень можно вставить только с этого уровня (позже начала этапа); null — сразу */
  from: number | null
}

export interface LinkRow {
  /** слот PoB («Body Armour»…); null — без слота */
  slot: string | null
  label: string
  main: boolean
  gems: LinkGem[]
}

/** «Связки» этапа по слотам; главная — с главным камнем билда. */
export function stageLinks(
  build: PobBuild,
  plan: PobStagePlan,
  index: number,
  data: GemsData | null,
  lang: GameLang,
  mainGemId: string | null
): LinkRow[] {
  const stage = plan.stages[index]
  if (!stage) return []
  const from = stage.from ?? 1
  // главный камень на прокачке бывает ещё не трансфигурированным — тот же базовый камень (id предмета)
  const mainGem = data && mainGemId ? findGem(data, mainGemId) : null
  const isMain = (g: PobGem): boolean =>
    !!mainGemId && (keyOf(data, g) === mainGemId || (!!mainGem && resolveGem(data, g)?.gameId === mainGem.gameId))
  return stageGroups(build, stage.skills).map((grp) => {
    const gems = grp.gems.filter((g) => g.enabled)
    return {
      slot: grp.slot,
      label: grp.label,
      main: gems.some(isMain),
      gems: gems.map((g) => {
        const gem = resolveGem(data, g)
        const req = gem ? gemRequiredLevel(gem, 1) : 1
        return { name: gem ? gemName(gem, lang) : g.nameSpec, color: gem?.color ?? null, support: isSupportGem(gem, g), from: req > from ? req : null }
      })
    }
  })
}

// ---------------------------------------------------------------------------- дерево этапа

export type NodeRowKind = 'notable' | 'keystone' | 'mastery' | 'jewel' | 'asc' | 'small'
export type NodeRowState = 'done' | 'next' | 'todo' | 'drop'

export interface NodeRow {
  kind: NodeRowKind
  /** hash ноды; у сводной строки малых нод — null */
  hash: number | null
  /** имя на языке клиента (у малых — пусто, подпись собирает окно) */
  name: string
  /** эффект мастерства, выбранный автором (строки на языке клиента) */
  detail: string | null
  state: NodeRowState
  /** малые: сколько нод и сколько из них взято */
  count?: number
  done?: number
}

export interface LogNodes {
  taken: ReadonlySet<string>
  removed: ReadonlySet<string>
}

export interface StageTree {
  rows: NodeRow[]
  /** нод взять на этапе (без стартовых) и сколько из них взято по журналу */
  add: number
  taken: number
  /** снять при переходе и сколько очков сброса это стоит */
  remove: number
  respec: number
  /** с каким этапом сравнивали (null — первый этап, всё дерево этапа) */
  prev: number | null
  /** строка поиска по игровому дереву — следующие нотаблы и кейстоуны */
  search: TreeSearch
  /** журнал знает ноды этого персонажа */
  log: boolean
}

const isStart = (n: TreeNode): boolean => n.kind === 'classStart' || n.kind === 'ascStart'

function sameNodes(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((h) => s.has(h))
}

function nodeKind(n: TreeNode): NodeRowKind | null {
  if (n.asc) return n.kind === 'notable' ? 'asc' : null
  if (n.kind === 'keystone') return 'keystone'
  if (n.kind === 'notable') return 'notable'
  if (n.kind === 'mastery') return 'mastery'
  if (n.kind === 'jewel') return 'jewel'
  return 'small'
}

/**
 * «Дерево: следующие ноды»: что взять и что снять при переходе с прошлого этапа (ближайшего раньше с другим
 * деревом), «взято» — по журналу игры. Малые ноды — одной строкой со счётчиком; мастерства — с эффектом автора;
 * восхождение — отдельно (лабиринт). Прокси кластерных самоцветов и стартовые ноды не показываются.
 */
export function stageTree(
  build: PobBuild,
  plan: PobStagePlan,
  index: number,
  tree: TreeData | null,
  lang: GameLang,
  log: LogNodes | null
): StageTree {
  const empty: StageTree = { rows: [], add: 0, taken: 0, remove: 0, respec: 0, prev: null, search: { parts: [], text: '' }, log: false }
  const stage = plan.stages[index]
  const spec = stage && stage.spec !== null ? build.specs[stage.spec] : undefined
  if (!tree || !spec) return empty
  const prev = prevIndex(plan, index, (a, b) => a.spec !== null && b.spec !== null && !sameNodes(build.specs[a.spec]?.nodes ?? [], build.specs[b.spec]?.nodes ?? []))
  const base = prev !== null ? (build.specs[plan.stages[prev].spec as number]?.nodes ?? []) : []
  const diff = diffNodes(base, spec.nodes, tree)
  const hasLog = !!log && (log.taken.size > 0 || log.removed.size > 0)
  const done = (n: TreeNode): boolean => hasLog && log!.taken.has(n.id) && !log!.removed.has(n.id)
  const effects = new Map(spec.masteryEffects.map((m) => [m.node, m.effect]))
  // малые ноды восхождения — путь к его нотаблам (очки восхождения), в список и счёт не идут
  const visible = (n: TreeNode | undefined): n is TreeNode => !!n && !n.proxy && !isStart(n) && nodeKind(n) !== null

  const rows: NodeRow[] = []
  const add = diff.add.map((h) => tree.nodes.get(h)).filter(visible)
  let small = 0
  let smallDone = 0
  for (const n of add) {
    const kind = nodeKind(n) as NodeRowKind
    if (kind === 'small') {
      small++
      if (done(n)) smallDone++
      continue
    }
    const eff = kind === 'mastery' ? effects.get(n.hash) : undefined
    const me = eff !== undefined ? masteryEffect(tree, eff) : null
    rows.push({
      kind,
      hash: n.hash,
      name: nodeName(n, lang),
      detail: me ? me.stats.map((l) => lineText(l, lang)).join('; ') : null,
      state: done(n) ? 'done' : 'todo'
    })
  }
  const next = rows.find((r) => r.state === 'todo' && (r.kind === 'notable' || r.kind === 'keystone'))
  if (next) next.state = 'next'
  if (small) rows.push({ kind: 'small', hash: null, name: '', detail: null, state: small === smallDone ? 'done' : 'todo', count: small, done: smallDone })

  const remove = diff.remove.map((h) => tree.nodes.get(h)).filter(visible)
  let smallDrop = 0
  for (const n of remove) {
    const kind = nodeKind(n) as NodeRowKind
    if (kind === 'small') smallDrop++
    else rows.push({ kind, hash: n.hash, name: nodeName(n, lang), detail: null, state: 'drop' })
  }
  if (smallDrop) rows.push({ kind: 'small', hash: null, name: '', detail: null, state: 'drop', count: smallDrop })

  const pending = add.filter((n) => !done(n)).map((n) => n.hash)
  return {
    rows,
    add: add.length,
    taken: add.filter(done).length,
    remove: remove.length,
    respec: diff.respec,
    prev,
    search: treeSearch(tree, pending, lang),
    log: hasLog
  }
}

// ---------------------------------------------------------------------------- проверка

export type LightLevel = 'good' | 'warn' | 'bad' | 'off'
export type CheckId = 'fire' | 'cold' | 'lightning' | 'chaos' | 'life' | 'maxHit' | 'str' | 'dex' | 'int' | 'mana'

export interface CheckRow {
  id: CheckId
  level: LightLevel
  /** значение (для жизни — жизнь и энергощит) */
  value: number
  value2?: number
  /** до капа или нехватка атрибута */
  gap?: number
}

export interface BuildChecks {
  rows: CheckRow[]
  /** набор дерева, для которого автор посчитал статы (активный в PoB) */
  specTitle: string
  /** штраф сопротивлений в конфигурации автора */
  penalty: 0 | -30 | -60
}

const RES_CAP = 75

/**
 * Светофор по <PlayerStat> — расчёт автора гайда в PoB для его активного набора и конфигурации (штраф
 * сопротивлений уже учтён). Нет статов — null («статы не посчитаны автором»). Жизнь и самый сильный удар —
 * без оценки (серым): порог зависит от этапа.
 */
export function buildChecks(build: PobBuild): BuildChecks | null {
  const st = build.stats
  if (!Object.keys(st).length) return null
  const rows: CheckRow[] = []
  const res = (id: 'fire' | 'cold' | 'lightning', stat: string): void => {
    const v = st[`${stat}Resist`]
    if (v === undefined) return
    const cap = st[`${stat}ResistMax`] ?? RES_CAP
    const gap = Math.max(0, Math.round(cap - v))
    rows.push({ id, level: gap === 0 ? 'good' : gap <= 15 ? 'warn' : 'bad', value: Math.round(v), gap })
  }
  res('fire', 'Fire')
  res('cold', 'Cold')
  res('lightning', 'Lightning')
  if (st.ChaosResist !== undefined) rows.push({ id: 'chaos', level: st.ChaosResist >= 0 ? 'good' : 'off', value: Math.round(st.ChaosResist) })
  if (st.Life !== undefined || st.EnergyShield !== undefined)
    rows.push({ id: 'life', level: 'off', value: Math.round(st.Life ?? 0), value2: Math.round(st.EnergyShield ?? 0) })
  if (st.PhysicalMaximumHitTaken !== undefined) rows.push({ id: 'maxHit', level: 'off', value: Math.round(st.PhysicalMaximumHitTaken) })
  for (const [id, stat] of [['str', 'Str'], ['dex', 'Dex'], ['int', 'Int']] as const) {
    const have = st[stat]
    const need = st[`Req${stat}`]
    if (have !== undefined && need !== undefined && need > have) rows.push({ id, level: 'bad', value: Math.round(have), gap: Math.round(need - have) })
  }
  if (st.ManaUnreserved !== undefined && st.ManaUnreserved < 0) rows.push({ id: 'mana', level: 'bad', value: Math.round(st.ManaUnreserved) })
  const spec = build.specs[build.activeSpec] ?? build.specs[0]
  return { rows, specTitle: spec?.title ?? '', penalty: build.config.resistancePenalty }
}

export type CheckItem =
  | { id: 'bandit'; bandit: 'None' | 'Oak' | 'Kraityn' | 'Alira' }
  | { id: 'lab'; lab: 'normal' | 'cruel' | 'merciless' | 'eternal'; level: number }
  | { id: 'pantheon'; major: string | null; minor: string | null }

/** Примерный уровень лабиринтов (испытания по ходу актов). */
const LABS: { lab: 'normal' | 'cruel' | 'merciless' | 'eternal'; level: number }[] = [
  { lab: 'normal', level: 33 },
  { lab: 'cruel', level: 55 },
  { lab: 'merciless', level: 68 },
  { lab: 'eternal', level: 75 }
]

/** Чек-лист этапа: бандиты во 2 акте, лабиринты в диапазоне уровней этапа, пантеон с 4 акта. */
export function stageChecklist(build: PobBuild, plan: PobStagePlan, index: number): CheckItem[] {
  const range = stageRange(plan, index)
  if (!range || !plan.stages[index].leveling) return []
  const out: CheckItem[] = []
  const act2 = actStartLevel(2)
  const act3 = actStartLevel(3)
  if (range.from < act3 && range.to >= act2) out.push({ id: 'bandit', bandit: build.bandit ?? 'None' })
  for (const l of LABS) if (l.level >= range.from && l.level <= range.to) out.push({ id: 'lab', lab: l.lab, level: l.level })
  if ((build.pantheonMajor || build.pantheonMinor) && range.to >= actStartLevel(4) && range.from < actStartLevel(5))
    out.push({ id: 'pantheon', major: build.pantheonMajor, minor: build.pantheonMinor })
  return out
}

// ---------------------------------------------------------------------------- строка билда в гиде

export interface GuideBuildLine {
  kind: 'quest' | 'buy'
  gem: Gem
  name: string
  /** NPC на языке клиента */
  npc: string
  questId: string
}

/**
 * Строка «Билд: …» в текущем шаге гида прокачки: камни этапа, которые берутся за квесты этого шага или
 * покупаются после них. Одна главная строка; вторая — только у того же NPC. Без билда — пусто.
 */
export function guideBuildLines(gems: StageGems, questIds: readonly string[], lang: GameLang): GuideBuildLine[] {
  if (!questIds.length) return []
  const qs = new Set(questIds)
  const lines: GuideBuildLine[] = []
  for (const r of gems.rows) {
    if (!r.gem || !r.source || !qs.has(r.source.questId)) continue
    if (r.status !== 'quest' && r.status !== 'buy') continue
    lines.push({
      kind: r.status,
      gem: r.gem,
      name: r.name,
      npc: lang === 'ru' ? r.source.npcRu : r.source.npcEn,
      questId: r.source.questId
    })
  }
  lines.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'quest' ? -1 : 1))
  return lines.filter((l, i) => i === 0 || l.npc === lines[0].npc).slice(0, 2)
}

/** Ключи камней (id предмета игры) всех этапов прокачки билда — чтобы гид показывал камни билда, а не все. */
export function buildGemGameIds(build: PobBuild, plan: PobStagePlan, data: GemsData): Set<string> {
  const out = new Set<string>()
  for (const s of plan.stages) {
    if (!s.leveling) continue
    for (const grp of stageGroups(build, s.skills))
      for (const g of grp.gems) {
        const gem = g.enabled ? resolveGem(data, g) : null
        if (gem) out.add((gem.transfigured && findBase(data, gem)?.gameId) || gem.gameId)
      }
  }
  return out
}
