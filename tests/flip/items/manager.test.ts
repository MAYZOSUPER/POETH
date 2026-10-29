import { describe, expect, it } from 'vitest'
import type { ItemFlipConfig, ItemFlipState } from '@shared/types'
import type { TradeFetchItem } from '@shared/poe1/pricecheck/results'
import { ItemFlipManager, normalizeConfig, type NetResult, type SearchData } from '../../../src/main/games/poe1/flip/items/manager'
import type { ItemSearchBody } from '@shared/flip/items/query'
import { DIVINE, fixture, sampleSnapshot } from './helpers'

const NOW = Date.parse('2026-10-29T20:00:00Z')
const FETCH = fixture<{ result: TradeFetchItem[] }>('fetch-headhunter.json').result

function setup(opts: { search?: NetResult<SearchData>; league?: string | null; config?: unknown } = {}) {
  const searches: Array<{ league: string; body: ItemSearchBody }> = []
  const fetches: Array<{ ids: string[]; searchId: string }> = []
  const emitted: ItemFlipState[] = []
  let saved: ItemFlipConfig | null = null
  const ids = FETCH.map((r) => r.id).concat(['x1', 'x2', 'x3', 'x4'])
  const m = new ItemFlipManager({
    league: async () => (opts.league === undefined ? 'Allflame' : opts.league),
    snapshot: { load: async () => ({ snap: sampleSnapshot(), problem: null }), nextAt: () => NOW + 3_600_000 },
    feed: async () => ({
      divine: DIVINE,
      byId: new Map([
        ['Currency/CurrencyRerollSocketLinks', { chaos: 0.2 }],
        ['Currency/CurrencyRerollSocketNumbers', { chaos: 0.05 }]
      ])
    }),
    search: async (league, body) => {
      searches.push({ league, body })
      return opts.search ?? { ok: true, data: { id: 'H4sIqry', result: ids, total: 12 } }
    },
    fetch: async (list, searchId) => {
      fetches.push({ ids: list, searchId })
      return { ok: true, data: { result: FETCH } }
    },
    siteUrl: async (league, id) => `https://www.pathofexile.com/trade/search/${league}/${id}`,
    isFixer: (a) => a === 'traven77#7212',
    loadConfig: async () => opts.config ?? null,
    saveConfig: async (cfg) => void (saved = cfg),
    emit: (s) => emitted.push(s),
    now: () => NOW
  })
  return { m, searches, fetches, emitted, saved: () => saved }
}

describe('«Предметы» в main', () => {
  it('обновление: строки, курс фида, 6L по цене Fusing; поиска на трейде нет', async () => {
    const t = setup()
    await t.m.refresh()
    const s = t.m.state()
    expect(s).toMatchObject({ supported: true, league: 'Allflame', loading: false, problem: null, divine: DIVINE, fusing: 0.2, jewellers: 0.05 })
    expect(s.rows.length).toBe(33)
    expect(s.sixLinks[0].id).toBe('the-covenant-spidersilk-robe-6l')
    expect(s.config).toEqual({ k: 0.7, picks: [], list: 'top' })
    expect(t.searches.length).toBe(0)
    expect(t.emitted.at(-1)).toBe(s)
  })

  it('«Проверить сейчас»: один поиск (k × цена) и один fetch до 10 лотов, итог антискама', async () => {
    const t = setup()
    await t.m.refresh()
    const r = await t.m.check('headhunter-leather-belt')
    expect(t.searches).toHaveLength(1)
    expect(t.searches[0].league).toBe('Allflame')
    const filters = t.searches[0].body.query.filters as { trade_filters: { filters: { price: { max: number } } } }
    expect(filters.trade_filters.filters.price).toEqual({ option: 'divine', max: 7.01 })
    expect(t.fetches).toEqual([{ ids: FETCH.map((x) => x.id).concat(['x1', 'x2']), searchId: 'H4sIqry' }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r).toMatchObject({ rowId: 'headhunter-leather-belt', total: 12, maxChaos: 2366, sell: 3211, market: null })
    expect(r.siteUrl).toBe('https://www.pathofexile.com/trade/search/Allflame/H4sIqry')
    expect(r.lots.filter((l) => l.verdict === 'deal').map((l) => l.id)).toEqual(['b'])
    expect(r.lots.find((l) => l.id === 'f')?.verdict).toBe('fixer')
  })

  it('k из кнопки — без сохранения в настройки', async () => {
    const t = setup()
    await t.m.refresh()
    await t.m.check('headhunter-leather-belt', 0.5)
    const filters = t.searches[0].body.query.filters as { trade_filters: { filters: { price: { max: number } } } }
    expect(filters.trade_filters.filters.price).toEqual({ option: 'divine', max: 5.01 })
    expect(t.saved()).toBeNull()
  })

  it('ошибки шлюза: лимит с обратным отсчётом, Cloudflare; неизвестная строка — без запросов', async () => {
    const t = setup({ search: { ok: false, error: { code: 'rate-limited', retryAfterMs: 4200 } } })
    await t.m.refresh()
    expect(await t.m.check('headhunter-leather-belt')).toEqual({ ok: false, rowId: 'headhunter-leather-belt', error: 'rate-limited', retryAfterMs: 4200 })
    const b = setup({ search: { ok: false, error: { code: 'blocked', status: 403 } } })
    await b.m.refresh()
    expect(await b.m.check('headhunter-leather-belt')).toMatchObject({ ok: false, error: 'blocked' })
    expect(await b.m.check('нет-такого')).toEqual({ ok: false, rowId: 'нет-такого', error: 'no-row' })
    expect(await b.m.check(42)).toEqual({ ok: false, rowId: '', error: 'no-row' })
    expect(b.searches).toHaveLength(1)
  })

  it('пока идёт проверка того же уника — второй клик не шлёт поиск', async () => {
    const t = setup()
    await t.m.refresh()
    const [a, b] = await Promise.all([t.m.check('headhunter-leather-belt'), t.m.check('headhunter-leather-belt')])
    expect([a.ok, b.ok]).toEqual([true, false])
    expect(b).toMatchObject({ error: 'busy' })
    expect(t.searches).toHaveLength(1)
  })

  it('«Следить»: тот же запрос — адрес поиска и название для live search', async () => {
    const t = setup()
    await t.m.refresh()
    const w = await t.m.watchUrl('shavronnes-wrappings-occultists-vestment-6l')
    expect(w).toEqual({ ok: true, siteUrl: 'https://www.pathofexile.com/trade/search/Allflame/H4sIqry', title: "Shavronne's Wrappings 6L ≤ 223 c" })
    expect(t.fetches).toHaveLength(0)
    const socket = (t.searches[0].body.query.filters as Record<string, unknown>).socket_filters
    expect(socket).toEqual({ filters: { links: { min: 6 } } })
  })

  it('настройки: k в пределах, свои уники без повторов, список top/mine; сохраняются', async () => {
    expect(normalizeConfig({ k: 5, picks: ['a', 'a', 7, 'b'], list: 'x' })).toEqual({ k: 0.95, picks: ['a', 'b'], list: 'top' })
    const t = setup({ config: { k: 0.6, picks: ['headhunter-leather-belt'], list: 'mine' } })
    await t.m.refresh()
    expect(t.m.state().config).toEqual({ k: 0.6, picks: ['headhunter-leather-belt'], list: 'mine' })
    await t.m.setConfig({ k: 0.8, list: 'top' })
    expect(t.saved()).toEqual({ k: 0.8, picks: ['headhunter-leather-belt'], list: 'top' })
  })

  it('без лиги — пусто и без запросов', async () => {
    const t = setup({ league: null })
    await t.m.refresh()
    expect(t.m.state()).toMatchObject({ league: null, rows: [] })
    expect(await t.m.check('headhunter-leather-belt')).toMatchObject({ ok: false, error: 'no-row' })
  })
})
