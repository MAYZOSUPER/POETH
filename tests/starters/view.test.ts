import { describe, expect, it } from 'vitest'
import { loadStarters } from '@shared/starters/load'
import {
  NO_FILTERS,
  activeFilters,
  ascendanciesOf,
  classesOf,
  filterStarters,
  picksOf,
  simpleFilters,
  sortStarters,
  starterBadges,
  toStartersState,
  type StarterCard,
  type StarterFilters
} from '@shared/starters/view'
import { reader } from './fixtures'

// Список «Стартеров» для окна (S59, §6.2): карточки без адресов, знаки, фильтры и сортировка.

async function cards(dir = 'good'): Promise<{ list: StarterCard[]; league: string | null }> {
  const st = toStartersState(await loadStarters(reader(dir)))
  return { list: st.starters, league: st.league }
}
const ids = (list: StarterCard[]): string[] => list.map((c) => c.id)
const F = (p: Partial<StarterFilters>): StarterFilters => ({ ...NO_FILTERS, ...p })

describe('карточка для окна', () => {
  it('вместо адресов — только сайты; отпечатка нет', async () => {
    const { list } = await cards()
    const c = list.find((x) => x.id === 'test-champion-boneshatter')!
    expect(c.links).toEqual({ pob: 'pobb.in', video: 'youtu.be', channel: 'youtube.com' })
    expect(JSON.stringify(list)).not.toMatch(/https?:\/\//)
    expect(c).not.toHaveProperty('pob')
    expect(c.pobCheckedAt).toBe('2026-11-12')
  })

  it('знаки: проверено в лиге, обновлён к лиге, устарел', async () => {
    const { list, league } = await cards()
    const by = (id: string) => starterBadges(list.find((x) => x.id === id)!, league)
    expect(by('test-champion-boneshatter')).toEqual({ checked: true, fresh: true, stale: false })
    expect(by('test-hiero-brand')).toEqual({ checked: false, fresh: false, stale: true })
    expect(by('test-assassin-flurry')).toEqual({ checked: false, fresh: true, stale: false })
    expect(starterBadges(list[0], null)).toEqual({ checked: false, fresh: false, stale: false })
  })
})

describe('фильтры', () => {
  it('класс и восхождение', async () => {
    const { list, league } = await cards()
    expect(ids(filterStarters(list, F({ cls: 'Templar' }), league))).toEqual(['test-hiero-brand', 'test-guardian-dom'])
    expect(ids(filterStarters(list, F({ cls: 'Templar', asc: 'Guardian' }), league))).toEqual(['test-guardian-dom'])
    // восхождение без класса не действует
    expect(filterStarters(list, F({ asc: 'Guardian' }), league)).toHaveLength(4)
    expect(classesOf(list)).toEqual(['Duelist', 'Templar', 'Shadow'])
    expect(ascendanciesOf(list, 'Templar')).toEqual(['Guardian', 'Hierophant'])
  })

  it('бюджет и сложность — «не дороже» и «не сложнее»', async () => {
    const { list, league } = await cards()
    expect(ids(filterStarters(list, F({ budget: 'starter' }), league))).toEqual(['test-assassin-flurry'])
    expect(ids(filterStarters(list, F({ budget: 'low' }), league))).toEqual(['test-champion-boneshatter', 'test-assassin-flurry'])
    expect(filterStarters(list, F({ budget: 'high' }), league)).toHaveLength(4)
    expect(ids(filterStarters(list, F({ difficulty: 1 }), league))).toEqual(['test-champion-boneshatter'])
    expect(filterStarters(list, F({ difficulty: 2 }), league)).toHaveLength(3)
  })

  it('метки: новичку, по актам, проверено, видео RU, режим, контент', async () => {
    const { list, league } = await cards()
    const only = (p: Partial<StarterFilters>) => ids(filterStarters(list, F(p), league))
    expect(only({ newbie: true })).toEqual(['test-champion-boneshatter', 'test-assassin-flurry'])
    expect(only({ acts: true })).toEqual(['test-champion-boneshatter'])
    expect(only({ checked: true })).toEqual(['test-champion-boneshatter', 'test-guardian-dom'])
    expect(only({ ru: true })).toEqual(['test-champion-boneshatter'])
    expect(only({ mode: 'hc' })).toEqual(['test-champion-boneshatter'])
    expect(only({ mode: 'ssf' })).toEqual(['test-champion-boneshatter', 'test-assassin-flurry'])
    expect(only({ content: 'bossing' })).toEqual(['test-hiero-brand'])
    expect(only({ newbie: true, budget: 'starter' })).toEqual(['test-assassin-flurry'])
  })

  it('простой режим — только класс и бюджет; счёт включённых', () => {
    const f = F({ cls: 'Duelist', budget: 'low', newbie: true, mode: 'hc', sort: undefined } as Partial<StarterFilters>)
    expect(simpleFilters(f)).toEqual(F({ cls: 'Duelist', budget: 'low' }))
    expect(activeFilters(f)).toBe(4)
    expect(activeFilters(NO_FILTERS)).toBe(0)
  })
})

describe('сортировка и «Рекомендуем новичкам»', () => {
  it('«Рекомендуем»: выбор куратора, проверено, новичку, не устарел, проще, дешевле', async () => {
    const { list, league } = await cards()
    expect(ids(sortStarters(list, 'recommended', league))).toEqual([
      'test-champion-boneshatter', // pick, проверено
      'test-assassin-flurry', // pick
      'test-guardian-dom', // проверено
      'test-hiero-brand' // устарел
    ])
  })

  it('«Обновлённые» — по дате проверенной версии PoB, «Новые» — по дате в списке', async () => {
    const { list, league } = await cards()
    expect(ids(sortStarters(list, 'updated', league))).toEqual(['test-assassin-flurry', 'test-champion-boneshatter', 'test-hiero-brand', 'test-guardian-dom'])
    expect(ids(sortStarters(list, 'new', league))).toEqual(['test-assassin-flurry', 'test-champion-boneshatter', 'test-hiero-brand', 'test-guardian-dom'])
  })

  it('сортировка устойчивая и не меняет исходный список', async () => {
    const { list, league } = await cards()
    const before = ids(list)
    const same = list.map((c) => ({ ...c, pick: false, checked: null, tags: { ...c.tags, newbie: false, difficulty: 1 as const, budget: 'low' as const }, patch: '3.30' }))
    expect(ids(sortStarters(same, 'recommended', league))).toEqual(before)
    expect(ids(list)).toEqual(before)
  })

  it('«Рекомендуем новичкам» — только выбор куратора, не больше заданного', async () => {
    const { list, league } = await cards()
    expect(ids(picksOf(list, league))).toEqual(['test-champion-boneshatter', 'test-assassin-flurry'])
    expect(ids(picksOf(list, league, 1))).toEqual(['test-champion-boneshatter'])
  })
})
