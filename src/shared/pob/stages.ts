// Этапы прокачки билда PoB (S35; чистый модуль, tests/pob/stages.test.ts).
// Отдельной сущности «этап» в PoB нет: это тройка Spec (дерево) + набор камней + набор предметов
// с похожими названиями — «Act 3», «A3», «Acts 1&2», «Акт 3», «Level 12-22», «Lvl 44», «12-22», «Early Maps»,
// «Endgame», «… Swap». Бывает и иначе: один набор камней на всю прокачку, внутри которого этапы — группы-
// разделители без камней («----- Act 1 Leveling Gems -----», «Level 1-8»); такие разделы тоже считаются этапами.
// Набор «Leveling» без чисел — на всю кампанию: годится любому этапу прокачки, но сам этапом не выбирается.
//
// Порядок: у каждого названия — догадка (guessStage) и «с какого уровня» (stageFrom). Ось с наибольшим числом
// узнанных названий — основная (по ней этапы), для двух других осей на этап берётся точное совпадение
// названия, иначе набор, действующий на начало этапа. Эндгейм — не прокачка: такие этапы есть в списке,
// но в подборе текущего этапа по уровню и акту не участвуют. Игрок может поправить всё руками:
// правки хранятся отдельно (PobStageEdits), у этапа видно и автоматическое значение, и правку.
//
// Идея сопоставления по названиям и таблица уровней конца актов — из Piety (sethryder/piety,
// src/shared/trees.ts, MIT, Copyright (c) 2026 Seth Ryder); код свой. Атрибуция — NOTICE.md.

import { stripPobColors, type PobBuild, type PobSkillSet } from './model'

export type StageKind = 'act' | 'level' | 'maps' | 'endgame' | 'unknown'

export interface StageGuess {
  kind: StageKind
  /** акты 1–10 из названия («Act 3», «Acts 1-2», «Акт 5») */
  actFrom?: number
  actTo?: number
  /** уровни из названия («Level 12-22», «Lvl 44», «65+», «38 - …») */
  levelFrom?: number
  levelTo?: number
  /** ранние карты (сразу после кампании) — ещё прокачка */
  early?: boolean
  /** набор на всю кампанию («Leveling», «Pre-Maps»): годится этапам, но сам этапом не считается */
  campaign?: boolean
  /** этап смены навыка или экипировки («Swap») */
  swap: boolean
}

/**
 * Типичный уровень персонажа к концу акта 1–10 (Piety, trees.ts): этап «Level N» относится к акту,
 * где игрок достигает N; акт N начинается со следующего уровня после конца акта N−1.
 */
export const ACT_END_LEVELS: readonly number[] = [13, 23, 33, 40, 45, 50, 54, 60, 64, 69]
/** С какого уровня этап «ранние карты» и прочие карты/эндгейм (для порядка этапов). */
export const MAPS_LEVEL = 70
const ENDGAME_LEVEL = 90

/** Первый уровень акта (1–10). */
export function actStartLevel(act: number): number {
  return act <= 1 ? 1 : ACT_END_LEVELS[Math.min(act, 10) - 2] + 1
}

const n = (s: string | undefined): number | undefined => (s === undefined ? undefined : Number(s))
const validAct = (a: number | undefined): a is number => a !== undefined && a >= 1 && a <= 10
const validLevel = (l: number | undefined): l is number => l !== undefined && l >= 1 && l <= 100

// Границы слова для латиницы и кириллицы (\b в JS — только ASCII).
const B = String.raw`(?<![\p{L}\p{N}_])`
const E = String.raw`(?![\p{L}\p{N}_])`
const RANGE = String.raw`\s*(?:-|–|—|to|до)\s*`
/** у актов ещё «Acts 1&2», «Acts 1 and 2», «Акты 1 и 2» */
const ACT_RANGE = String.raw`\s*(?:-|–|—|to|до|&|and|и)\s*`
const re = (s: string): RegExp => new RegExp(s, 'iu')
const ACT_RE = re(String.raw`${B}(?:acts?|акт\p{L}*)\s*(\d{1,2})(?:${ACT_RANGE}(\d{1,2})(?!\d))?`)
/** короткая запись «A1»…«A10», «A1-A2» (но не «A3ArmBrandSwap») */
const ACT_SHORT_RE = re(String.raw`${B}a(\d{1,2})(?:${RANGE}a?(\d{1,2}))?${E}`)
const LEVEL_RE = re(String.raw`${B}(?:level(?:l?ing)?|lvl|lv|ур(?:овень|овни|\.)?|лвл)\s*\.?\s*(\d{1,3})(?:${RANGE}(\d{1,3})(?!\d))?`)
/** «12-22», «12 - 22» без слова «уровень» */
const BARE_RANGE_RE = re(String.raw`(?<![\p{L}\p{N}_.%+])(\d{1,3})${RANGE}(\d{1,3})(?![\p{L}\p{N}_%])`)
/** «65+», «38 - …»: открытый диапазон уровней (но не «5-link») */
const BARE_FROM_RE = re(String.raw`(?<![\p{L}\p{N}_.%+])(\d{1,3})(?:\s*\+|\s*[-–—](?:\s+|$)(?!\d))`)
const PRE_MAPS_RE = re(String.raw`${B}pre[\s-]*maps?${E}|${B}before\s+maps${E}|${B}до\s+карт`)
const EARLY_MAPS_RE = re(String.raw`${B}early\s*map(?:s|ping)?${E}|${B}ранн\p{L}*\s+карт`)
const MAPS_RE = re(String.raw`${B}(?:map(?:s|ping)?|atlas|атлас\p{L}*|карт[ыа]?|t\d{1,2})${E}`)
const ENDGAME_RE = re(
  String.raw`end\s*-?\s*game|${B}(?:min[\s-]*max|final|budget|mirror|bis|uber|pinnacle)${E}|\$\$\$|эндгейм|финал|конечн`
)
const SWAP_RE = re(String.raw`${B}(?:swap|смена|замена)${E}`)
/** «Leveling», «Lvling Gems…», «Прокачка» без чисел — набор на всю кампанию */
const LEVELING_WORD_RE = re(String.raw`${B}(?:level(?:l?ing)|lvl?ing|прокачк\p{L}*)${E}`)

/** Догадка по названию набора или разделителя (цветокоды убираются). */
export function guessStage(rawTitle: string): StageGuess {
  const t = stripPobColors(rawTitle ?? '').replace(/\s+/g, ' ').trim()
  const g: StageGuess = { kind: 'unknown', swap: SWAP_RE.test(t) }

  // акт вырезается из строки, чтобы «Acts 1-2» не прочитался ещё и как уровни 1–2
  let rest = t
  const act = ACT_RE.exec(t) ?? ACT_SHORT_RE.exec(t)
  if (act && validAct(n(act[1]))) {
    g.kind = 'act'
    g.actFrom = n(act[1])
    const to = n(act[2])
    if (validAct(to) && to >= (g.actFrom as number)) g.actTo = to
    rest = `${t.slice(0, act.index)} | ${t.slice(act.index + act[0].length)}`
  }

  const range = LEVEL_RE.exec(rest) ?? BARE_RANGE_RE.exec(rest)
  const from = range ? n(range[1]) : undefined
  const to = range ? n(range[2]) : undefined
  if (range && validLevel(from)) {
    const single = !validLevel(to)
    const plus = /^\s*\+/.test(rest.slice(range.index + range[0].length))
    // «Act 1 - Level 12», «Lvl 13 (Act 1)»: один уровень рядом с актом — уровень к концу акта, а не начало
    if (g.kind === 'act' && single && !plus) g.levelTo = from
    else {
      g.levelFrom = from
      if (validLevel(to) && to >= from) g.levelTo = to
    }
  } else {
    // «65+», «38 - Untill Cruel Lab»: число в начале открытого диапазона
    const open = BARE_FROM_RE.exec(rest)
    if (open && validLevel(n(open[1]))) g.levelFrom = n(open[1])
  }
  if (g.kind === 'unknown' && g.levelFrom !== undefined) g.kind = 'level'
  if (g.kind !== 'unknown') return g

  if (PRE_MAPS_RE.test(t)) return { ...g, kind: 'act', actFrom: 1, actTo: 10, campaign: true }
  if (EARLY_MAPS_RE.test(t)) return { ...g, kind: 'maps', early: true }
  if (ENDGAME_RE.test(t)) return { ...g, kind: 'endgame' }
  if (MAPS_RE.test(t)) return { ...g, kind: 'maps', early: false }
  if (LEVELING_WORD_RE.test(t)) return { ...g, kind: 'act', actFrom: 1, actTo: 10, campaign: true }
  return g
}

/** С какого уровня этап (для порядка и подбора по уровню); null — не узнан. */
export function stageFrom(g: StageGuess): number | null {
  if (g.levelFrom !== undefined) return g.levelFrom
  if (g.actFrom !== undefined) return actStartLevel(g.actFrom)
  if (g.kind === 'maps') return MAPS_LEVEL
  if (g.kind === 'endgame') return ENDGAME_LEVEL
  return null
}

/** Этап — прокачка: акты, уровни до карт и ранние карты. Эндгейм и неузнанное — нет. */
export function isLevelingGuess(g: StageGuess): boolean {
  if (g.kind === 'act') return true
  if (g.kind === 'level') return (g.levelFrom ?? 0) < MAPS_LEVEL
  if (g.kind === 'maps') return !!g.early
  return false
}

/** Узнанный этап (для выбора основной оси и разделов): акт, уровни, карты; «вся кампания» — нет. */
const recognized = (g: StageGuess): boolean => (g.kind === 'act' && !g.campaign) || g.kind === 'level' || g.kind === 'maps'

// ---------------------------------------------------------------------------- разделы набора камней

export interface PobSkillSection {
  /** подпись разделителя без цветокодов; '' — группы до первого разделителя */
  label: string
  guess: StageGuess
  /** группы раздела: [groupFrom, groupTo) в PobSkillSet.groups */
  groupFrom: number
  groupTo: number
}

/** Группа-разделитель: без камней, с подписью из букв или цифр (не просто «-----»). */
function isSeparator(g: { label: string; gems: unknown[] }): boolean {
  return g.gems.length === 0 && /[\p{L}\p{N}]/u.test(g.label)
}

/**
 * Разделы набора камней по группам-разделителям. Если узнанных этапов среди разделителей меньше двух —
 * один раздел на весь набор (разделители там — просто подписи).
 */
export function skillSections(set: PobSkillSet): PobSkillSection[] {
  const cuts: number[] = []
  set.groups.forEach((g, i) => isSeparator(g) && cuts.push(i))
  const whole: PobSkillSection[] = [{ label: '', guess: guessStage(set.title), groupFrom: 0, groupTo: set.groups.length }]
  if (cuts.filter((i) => recognized(guessStage(set.groups[i].label))).length < 2) return whole
  const out: PobSkillSection[] = []
  if (cuts[0] > 0 && set.groups.slice(0, cuts[0]).some((g) => g.gems.length)) {
    out.push({ label: '', guess: guessStage(''), groupFrom: 0, groupTo: cuts[0] })
  }
  cuts.forEach((at, k) => {
    const label = set.groups[at].label
    out.push({ label, guess: guessStage(label), groupFrom: at + 1, groupTo: cuts[k + 1] ?? set.groups.length })
  })
  return out
}

// ---------------------------------------------------------------------------- этапы

export type StageAxis = 'spec' | 'skills' | 'items'

/** Набор камней этапа: набор и раздел внутри него (null — весь набор). */
export interface StageSkills {
  set: number
  section: number | null
}

/** Что сопоставлено с этапом: индексы в PobBuild.specs / skillSets (+ раздел) / itemSets. */
export interface StageLinks {
  spec: number | null
  skills: StageSkills | null
  items: number | null
  /** этап прокачки (иначе эндгейм или вариант билда) */
  leveling: boolean
  /** с какого уровня этап; null — не узнан (такой этап по уровню не выбирается) */
  from: number | null
}

export interface PobStage extends StageLinks {
  /** стабильный ключ этапа для правок: `spec:3`, `skills:1`, `skills:1:2`, `items:0` */
  key: string
  /** название (основная ось), без цветокодов */
  title: string
  guess: StageGuess
  /** что выбрал бы автомат (до правок игрока) */
  auto: StageLinks
  /** поля, заданные игроком */
  edited: Array<keyof StageLinks>
}

export interface PobStageEdit {
  spec?: number | null
  skills?: StageSkills | null
  items?: number | null
  leveling?: boolean
  from?: number | null
}

/** Ручные правки игрока (хранит UI рядом с билдом; недоверенные данные с диска — проверяются здесь). */
export interface PobStageEdits {
  /** этап, выбранный игроком как текущий; нет — по уровню и акту */
  current?: string | null
  stages?: Record<string, PobStageEdit>
}

export interface PobStagePlan {
  /** по какой оси построены этапы; 'none' — названия не узнаны, этапы по деревьям, всё — не прокачка */
  primary: StageAxis | 'none'
  stages: PobStage[]
}

interface Unit {
  key: string
  title: string
  guess: StageGuess
  from: number | null
  index: number
  skills?: StageSkills
}

function norm(title: string): string {
  return stripPobColors(title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function unitsOf(build: PobBuild): Record<StageAxis, Unit[]> {
  const unit = (key: string, title: string, index: number, skills?: StageSkills): Unit => {
    const guess = guessStage(title)
    return { key, title, guess, from: stageFrom(guess), index, skills }
  }
  const skills: Unit[] = []
  build.skillSets.forEach((set, i) => {
    const sections = skillSections(set)
    if (sections.length === 1 && sections[0].groupFrom === 0) {
      skills.push(unit(`skills:${i}`, set.title, skills.length, { set: i, section: null }))
      return
    }
    // неузнанный раздел после узнанного идёт с тем же уровнем (порядок важнее: «Cruel Lab» после «Level 38»)
    let last: number | null = null
    sections.forEach((sec, k) => {
      const u = unit(`skills:${i}:${k}`, sec.label || set.title, skills.length, { set: i, section: k })
      if (u.from === null && last !== null && sec.guess.kind === 'unknown') u.from = last
      else if (u.from !== null) last = u.from
      skills.push(u)
    })
  })
  return {
    spec: build.specs.map((s, i) => unit(`spec:${i}`, s.title, i)),
    skills,
    items: build.itemSets.map((s, i) => unit(`items:${i}`, s.title, i))
  }
}

/**
 * Ключ для сравнения «действует на начало этапа»: если в названии есть акт — начало акта (акт с актом,
 * «Act 3 Lv 23-32» с «---- ACT 3 ----»), иначе уровень.
 */
function startKey(u: Unit): number | null {
  return u.guess.actFrom !== undefined ? actStartLevel(u.guess.actFrom) : u.from
}

/**
 * Единица оси для этапа: то же название → для эндгейма — эндгейм-набор или активный (финальный у автора),
 * если он не из прокачки → набор, действующий на начало этапа → тот же вид → активный.
 */
function pick(units: Unit[], stage: Unit, activeIndex: number, leveling: boolean): Unit | null {
  if (!units.length) return null
  const title = norm(stage.title)
  if (title) {
    const same = units.find((u) => norm(u.title) === title)
    if (same) return same
  }
  if (stage.guess.kind === 'endgame') {
    const active = units.find((u) => u.index === activeIndex)
    const endgame = units.filter((u) => u.guess.kind === 'endgame')
    if (endgame.length) return endgame.find((u) => u === active) ?? endgame[0]
    if (active && !isLevelingGuess(active.guess)) return active
  }
  const at = startKey(stage)
  if (at !== null) {
    const ranked = units.filter((u) => startKey(u) !== null && u.guess.kind !== 'unknown')
    let best: Unit | null = null
    for (const u of ranked) {
      const k = startKey(u) as number
      if (k <= at && (!best || k > (startKey(best) as number))) best = u
    }
    if (best) return best
    // этап раньше всех наборов оси — самый ранний набор прокачки
    const early = ranked.filter((u) => isLevelingGuess(u.guess))
    if (leveling && early.length) return early.reduce((a, b) => ((startKey(a) as number) <= (startKey(b) as number) ? a : b))
  }
  const sameKind = units.find((u) => u.guess.kind === stage.guess.kind && stage.guess.kind !== 'unknown')
  if (sameKind) return sameKind
  if (units.length === 1) return units[0]
  return units.find((u) => u.index === activeIndex) ?? units[0]
}

/** Активный набор камней как единица оси: если он разбит на разделы — последний (самый поздний) раздел. */
function activeSkillsUnit(build: PobBuild, units: Unit[]): number {
  const own = units.filter((x) => x.skills?.set === build.activeSkillSet)
  return own.length ? own[own.length - 1].index : 0
}

function validEdit(build: PobBuild, e: unknown): PobStageEdit {
  const out: PobStageEdit = {}
  if (!e || typeof e !== 'object') return out
  const r = e as Record<string, unknown>
  const idx = (v: unknown, len: number): number | null | undefined =>
    v === null ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) < len ? (v as number) : undefined
  if ('spec' in r) out.spec = idx(r.spec, build.specs.length)
  if ('items' in r) out.items = idx(r.items, build.itemSets.length)
  if ('skills' in r) {
    const s = r.skills as Record<string, unknown> | null
    if (s === null) out.skills = null
    else if (s && typeof s === 'object') {
      const set = idx(s.set, build.skillSets.length)
      const sections = typeof set === 'number' ? skillSections(build.skillSets[set]).length : 0
      const section = s.section === null ? null : idx(s.section, sections)
      if (typeof set === 'number' && section !== undefined) out.skills = { set, section }
    }
  }
  if (typeof r.leveling === 'boolean') out.leveling = r.leveling
  if ('from' in r) out.from = r.from === null ? null : Number.isInteger(r.from) && (r.from as number) >= 1 && (r.from as number) <= 100 ? (r.from as number) : undefined
  for (const k of Object.keys(out) as Array<keyof PobStageEdit>) if (out[k] === undefined) delete out[k]
  return out
}

/** Этапы билда (+ правки игрока). Порядок — по уровню начала, неузнанные — в конце, как в PoB. */
export function resolveStages(build: PobBuild, edits?: PobStageEdits | null): PobStagePlan {
  const axes = unitsOf(build)
  const score = (a: StageAxis): number => axes[a].filter((u) => recognized(u.guess)).length
  const best = (['spec', 'skills', 'items'] as const).reduce((a, b) => (score(b) > score(a) ? b : a))
  const primary: StageAxis | 'none' = score(best) > 0 ? best : 'none'

  const base: Unit[] = primary === 'none' ? axes.spec.length ? axes.spec : axes.skills.length ? axes.skills : axes.items : axes[primary]
  const baseAxis: StageAxis = primary === 'none' ? (axes.spec.length ? 'spec' : axes.skills.length ? 'skills' : 'items') : primary
  const actives: Record<StageAxis, number> = { spec: build.activeSpec, skills: activeSkillsUnit(build, axes.skills), items: build.activeItemSet }

  const stages: PobStage[] = base.map((u) => {
    const leveling = primary !== 'none' && isLevelingGuess(u.guess)
    const linkOf = (axis: StageAxis): Unit | null => (axis === baseAxis ? u : pick(axes[axis], u, actives[axis], leveling))
    const spec = linkOf('spec')
    const skills = linkOf('skills')
    const items = linkOf('items')
    const auto: StageLinks = {
      spec: spec ? spec.index : null,
      skills: skills?.skills ? { ...skills.skills } : null,
      items: items ? items.index : null,
      leveling,
      from: u.from
    }
    const edit = validEdit(build, edits?.stages && Object.prototype.hasOwnProperty.call(edits.stages, u.key) ? edits.stages[u.key] : null)
    const edited = Object.keys(edit) as Array<keyof StageLinks>
    return { key: u.key, title: stripPobColors(u.title).trim(), guess: u.guess, ...auto, ...edit, auto, edited }
  })

  const order = (s: PobStage): number => (s.from === null ? 1000 : s.from)
  const indexed = stages.map((s, i) => ({ s, i }))
  indexed.sort((a, b) => order(a.s) - order(b.s) || a.i - b.i)
  return { primary, stages: indexed.map((x) => x.s) }
}

// ---------------------------------------------------------------------------- текущий этап

export interface StageProgress {
  /** уровень персонажа (Client.txt) */
  level?: number | null
  /** акт 1–10 по текущей зоне (Client.txt) */
  act?: number | null
  /** кампания пройдена (зашёл в эпилог или на карты) */
  campaignDone?: boolean
}

export interface CurrentStage {
  /** индекс в plan.stages; null — этапов прокачки нет */
  index: number | null
  /** 'manual' — выбран игроком, 'auto' — по уровню и акту */
  source: 'auto' | 'manual'
}

/**
 * Текущий этап: выбранный игроком, иначе последний пройденный этап прокачки по акту (если у этапа акт
 * в названии) или по уровню. После кампании — ранние карты, иначе последний этап прокачки, иначе первый этап эндгейма.
 */
export function currentStage(plan: PobStagePlan, progress: StageProgress, edits?: PobStageEdits | null): CurrentStage {
  const manual = edits?.current ? plan.stages.findIndex((s) => s.key === edits.current) : -1
  if (manual >= 0) return { index: manual, source: 'manual' }

  const all = plan.stages.map((s, i) => ({ s, i })).filter((x) => x.s.leveling && x.s.from !== null)
  // «вся кампания» («Recommended Leveling Tree») — только если этапов по актам и уровням нет
  const specific = all.filter((x) => !x.s.guess.campaign || x.s.edited.includes('from'))
  const leveling = specific.length ? specific : all
  const level = Number.isInteger(progress.level) && (progress.level as number) >= 1 ? (progress.level as number) : null
  const act = Number.isInteger(progress.act) && (progress.act as number) >= 1 ? (progress.act as number) : null
  const done = !!progress.campaignDone || (act !== null && act > 10)

  if (done) {
    const maps = plan.stages.findIndex((s) => s.guess.kind === 'maps' && s.leveling)
    if (maps >= 0) return { index: maps, source: 'auto' }
    if (leveling.length) return { index: leveling[leveling.length - 1].i, source: 'auto' }
    const end = plan.stages.findIndex((s) => !s.leveling)
    return { index: end >= 0 ? end : null, source: 'auto' }
  }
  if (!leveling.length) return { index: null, source: 'auto' }

  const reached = (s: PobStage): boolean => {
    if (s.guess.kind === 'maps') return false // ранние карты — только после кампании
    if (act !== null && s.guess.actFrom !== undefined && !s.edited.includes('from')) return act >= s.guess.actFrom
    if (level !== null) return level >= (s.from as number)
    if (act !== null) return actStartLevel(act) >= (s.from as number)
    return false
  }
  let found = leveling[0].i
  for (const x of leveling) if (reached(x.s)) found = x.i
  return { index: found, source: 'auto' }
}
