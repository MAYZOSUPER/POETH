// «Стартеры» для окна (S59, ST2; чистый модуль, tests/starters/view.test.ts): карточка без адресов, знаки
// («Проверено POETH в 3.30», «Обновлён к 3.30», «Устарел»), фильтры и сортировка списка (starters-research.md §6.2).
// Адресов ссылок в окне нет — только сайт («откроется youtube.com»); открыть ссылку или скачать PoB окно просит
// у main по id записи (build:openStarterLink, build:playStarter), и main берёт адрес из проверенных данных.
// Мест «№1, №2» нет: это чужие билды. «Рекомендуем» — выбор куратора с причиной одной строкой.

import type { StartersLoad, StartersStatus } from './load'
import {
  STARTER_BUDGETS,
  STARTER_CLASSES,
  STARTER_LINKS,
  comparePatch,
  type StarterBudget,
  type StarterClass,
  type StarterContent,
  type StarterDifficulty,
  type StarterLinkKind,
  type StarterRecord
} from './schema'

/** Запись стартера для окна: вместо адресов — сайты ссылок. */
export interface StarterCard extends Omit<StarterRecord, 'links' | 'pob'> {
  /** сайт каждой ссылки (`youtube.com`, `pobb.in`) — подпись «откроется …» */
  links: Partial<Record<StarterLinkKind, string>>
  /** когда сняли отпечаток PoB (дата проверенной версии) */
  pobCheckedAt: string
}

export interface StartersState {
  status: StartersStatus
  league: string | null
  updatedAt: string | null
  starters: StarterCard[]
  previous: { league: string; starters: StarterCard[] } | null
  /** сколько записей не прошло проверку (данные битые частично) */
  invalid: number
}

export const NO_STARTERS: StartersState = { status: 'none', league: null, updatedAt: null, starters: [], previous: null, invalid: 0 }

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^(?:www|m)\./, '')
  } catch {
    return ''
  }
}

export function toCard(r: StarterRecord): StarterCard {
  const links: StarterCard['links'] = {}
  for (const k of STARTER_LINKS) {
    const url = r.links[k]
    if (url) links[k] = hostOf(url)
  }
  const { links: _links, pob, ...rest } = r
  return { ...rest, links, pobCheckedAt: pob.checkedAt }
}

export function toStartersState(load: StartersLoad): StartersState {
  return {
    status: load.status,
    league: load.league,
    updatedAt: load.updatedAt,
    starters: load.starters.map(toCard),
    previous: load.previous ? { league: load.previous.league, starters: load.previous.starters.map(toCard) } : null,
    invalid: load.failed.filter((f) => f.id !== null).length
  }
}

// ---------------------------------------------------------------------------- знаки карточки

export interface StarterBadges {
  /** «Проверено POETH в <лига>» */
  checked: boolean
  /** «Обновлён к <лига>»: PoB сделан под текущую версию игры */
  fresh: boolean
  /** «Устарел»: PoB под прошлую версию игры */
  stale: boolean
}

export function starterBadges(c: Pick<StarterCard, 'patch' | 'checked'>, league: string | null): StarterBadges {
  if (!league) return { checked: false, fresh: false, stale: false }
  return { checked: c.checked?.league === league, fresh: c.patch === league, stale: comparePatch(c.patch, league) < 0 }
}

// ---------------------------------------------------------------------------- фильтры

export interface StarterFilters {
  cls: StarterClass | null
  /** восхождение (только вместе с классом) */
  asc: string | null
  /** не дороже */
  budget: StarterBudget | null
  /** не сложнее */
  difficulty: StarterDifficulty | null
  newbie: boolean
  /** ведёт по актам: в PoB есть этапы прокачки */
  acts: boolean
  /** проверено POETH в текущей лиге */
  checked: boolean
  /** видео или гайд на русском */
  ru: boolean
  mode: 'hc' | 'ssf' | null
  content: StarterContent | null
}

export const NO_FILTERS: StarterFilters = {
  cls: null,
  asc: null,
  budget: null,
  difficulty: null,
  newbie: false,
  acts: false,
  checked: false,
  ru: false,
  mode: null,
  content: null
}

/** Простой режим: только класс и бюджет (остальное, выбранное в экспертном, не действует). */
export function simpleFilters(f: StarterFilters): StarterFilters {
  return { ...NO_FILTERS, cls: f.cls, budget: f.budget }
}

/** Сколько фильтров включено — для «Сбросить фильтры (N)». */
export function activeFilters(f: StarterFilters): number {
  return (Object.keys(NO_FILTERS) as (keyof StarterFilters)[]).filter((k) => f[k] !== NO_FILTERS[k]).length
}

const budgetRank = (b: StarterBudget): number => STARTER_BUDGETS.indexOf(b)

export function matchesFilters(c: StarterCard, f: StarterFilters, league: string | null): boolean {
  if (f.cls && c.class !== f.cls) return false
  if (f.cls && f.asc && c.ascendancy !== f.asc) return false
  if (f.budget && budgetRank(c.tags.budget) > budgetRank(f.budget)) return false
  if (f.difficulty && c.tags.difficulty > f.difficulty) return false
  if (f.newbie && !c.tags.newbie) return false
  if (f.acts && c.tags.leveling !== 'acts') return false
  if (f.checked && !starterBadges(c, league).checked) return false
  if (f.ru && c.lang !== 'ru') return false
  if (f.mode && !c.tags.modes.includes(f.mode)) return false
  if (f.content && !c.tags.content.includes(f.content)) return false
  return true
}

export function filterStarters(list: readonly StarterCard[], f: StarterFilters, league: string | null): StarterCard[] {
  return list.filter((c) => matchesFilters(c, f, league))
}

// ---------------------------------------------------------------------------- сортировка

/** Рекомендуем (по умолчанию), недавно обновлённые (новый отпечаток PoB), новые в списке. «Популярное» — с голосами (G5). */
export const STARTER_SORTS = ['recommended', 'updated', 'new'] as const
export type StarterSort = (typeof STARTER_SORTS)[number]

/**
 * «Рекомендуем»: выбор куратора, проверено в этой лиге, «для новичка», не устарел, проще, дешевле; при равенстве —
 * порядок в списке куратора (сортировка устойчивая).
 */
function recommendedKey(c: StarterCard, league: string | null): number[] {
  const b = starterBadges(c, league)
  return [c.pick ? 0 : 1, b.checked ? 0 : 1, c.tags.newbie ? 0 : 1, b.stale ? 1 : 0, c.tags.difficulty, budgetRank(c.tags.budget)]
}

const byKeys = (a: number[], b: number[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

export function sortStarters(list: readonly StarterCard[], sort: StarterSort, league: string | null): StarterCard[] {
  const rows = list.map((c, i) => ({ c, i }))
  const cmp =
    sort === 'updated'
      ? (a: StarterCard, b: StarterCard) => (b.pobCheckedAt < a.pobCheckedAt ? -1 : b.pobCheckedAt > a.pobCheckedAt ? 1 : 0)
      : sort === 'new'
        ? (a: StarterCard, b: StarterCard) => (b.added < a.added ? -1 : b.added > a.added ? 1 : 0)
        : (a: StarterCard, b: StarterCard) => byKeys(recommendedKey(a, league), recommendedKey(b, league))
  return rows.sort((x, y) => cmp(x.c, y.c) || x.i - y.i).map((r) => r.c)
}

/** «Рекомендуем новичкам» (простой режим): выбор куратора, не больше max, в порядке «Рекомендуем». */
export function picksOf(list: readonly StarterCard[], league: string | null, max = 6): StarterCard[] {
  return sortStarters(
    list.filter((c) => c.pick),
    'recommended',
    league
  ).slice(0, max)
}

/** Классы, которые есть в списке (для фильтра), в порядке PoB. */
export function classesOf(list: readonly StarterCard[]): StarterClass[] {
  return STARTER_CLASSES.filter((k) => list.some((c) => c.class === k))
}

/** Восхождения класса, которые есть в списке. */
export function ascendanciesOf(list: readonly StarterCard[], cls: StarterClass): string[] {
  const out: string[] = []
  for (const c of list) if (c.class === cls && c.ascendancy && !out.includes(c.ascendancy)) out.push(c.ascendancy)
  return out.sort()
}
