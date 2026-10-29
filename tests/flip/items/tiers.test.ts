import { describe, expect, it } from 'vitest'
import { buildRows, confidenceOf, groupTiers, isThin, liquidityOf, SELL_FACTOR, tierOf, topLiquid } from '@shared/flip/items/tiers'
import { DIVINE, sampleSnapshot } from './helpers'

const rows = buildRows(sampleSnapshot().lines, DIVINE)
const row = (id: string) => {
  const r = rows.find((x) => x.id === id)
  if (!r) throw new Error(id)
  return r
}

describe('тиры уников по цене в divine', () => {
  it('пороги T0 ≥ 10, T1 ≥ 1, T2 ≥ 0,1 div', () => {
    expect(tierOf(10)).toBe('T0')
    expect(tierOf(9.99)).toBe('T1')
    expect(tierOf(1)).toBe('T1')
    expect(tierOf(0.1)).toBe('T2')
    expect(tierOf(0.099)).toBe('low')
  })

  it('по выборке: Headhunter (3380 c) — T0, Kaom’s Heart (250 c) — T2, обычный Shavronne’s — дёшево', () => {
    expect(row('headhunter-leather-belt')).toMatchObject({ tier: 'T0', div: 3380 / DIVINE, name: 'Headhunter' })
    expect(row('kaoms-heart-glorious-plate').tier).toBe('T2')
    expect(row('shavronnes-wrappings-occultists-vestment')).toMatchObject({ tier: 'low', unlinked: true })
    expect(row('shavronnes-wrappings-occultists-vestment-6l')).toMatchObject({ tier: 'T2', links: 6 })
  })

  it('малая выборка: меньше 5 наблюдений или лотов — «мало данных»', () => {
    expect(isThin({ count: 4, listings: 100 })).toBe(true)
    expect(isThin({ count: 50, listings: 4 })).toBe(true)
    expect(isThin({ count: 5, listings: 5 })).toBe(false)
    // Foulborn Rathpith «DOT per Life, Ailment per Life»: 2 наблюдения, 2 лота — 282 div, но неточно
    expect(row('foulborn-rathpith-globe-dot-per-life-ailment-per-life-titanium-spirit-shield')).toMatchObject({ tier: 'T0', thin: true, foulborn: true })
  })

  it('ликвидность и «обычно продаётся за»: чем медленнее, тем ниже цены poe.ninja', () => {
    expect(liquidityOf({ count: 108, listings: 498 })).toBe('fast')
    expect(liquidityOf({ count: 12, listings: 50 })).toBe('normal')
    expect(liquidityOf({ count: 6, listings: 111 })).toBe('slow')
    expect(row('headhunter-leather-belt').sell).toBeCloseTo(3380 * SELL_FACTOR.fast)
    expect(row('shavronnes-wrappings-occultists-vestment-6l').sell).toBeCloseTo(318.6 * SELL_FACTOR.slow)
  })

  it('уверенность: много наблюдений — высокая; цена скачет — ниже', () => {
    expect(confidenceOf({ count: 108, listings: 498, spark: [0, 1, 2, 3] })).toBe(1)
    expect(confidenceOf({ count: 1, listings: 3 })).toBeCloseTo(0.19, 2)
    expect(confidenceOf({ count: 108, listings: 498, spark: [0, 80, -40] })).toBe(0.7)
  })

  it('варианты, которые трейд не различит (Mageblood по числу флаконов), помечены и не идут в топ', () => {
    for (const id of ['mageblood-4-flasks-heavy-belt', 'mageblood-2-flasks-heavy-belt']) expect(row(id).ambiguous).toBe(true)
    // у Foulborn Headhunter варианты различаются stat-фильтрами poe.ninja
    expect(row('foulborn-headhunter-culling-strike-leather-belt').ambiguous).toBeUndefined()
    const top = topLiquid(rows)
    expect(top).toContain('headhunter-leather-belt')
    expect(top).not.toContain('mageblood-4-flasks-heavy-belt')
    expect(row('headhunter-leather-belt').top).toBe(true)
  })

  it('фольга (рамка 9) в строки вкладки не попадает', () => {
    const snap = sampleSnapshot()
    const withFoil = [...snap.lines, { ...snap.lines[0], id: 'foil', cls: 9 }]
    expect(buildRows(withFoil, DIVINE).some((r) => r.id === 'foil')).toBe(false)
  })

  it('по имени: обычная форма и «бывает дороже» (6L)', () => {
    const g = groupTiers(rows).find((x) => x.name === "Shavronne's Wrappings")
    expect(g?.main.id).toBe('shavronnes-wrappings-occultists-vestment')
    expect(g?.top?.id).toBe('shavronnes-wrappings-occultists-vestment-6l')
    const kaom = groupTiers(rows).find((x) => x.name === "Kaom's Heart")
    expect(kaom?.top).toBeUndefined()
    // только Foulborn-версии — основная форма из них же
    const rath = groupTiers(rows).find((x) => x.name === 'Rathpith Globe')
    expect(rath?.main.id).toBe('foulborn-rathpith-globe-ailment-per-life-titanium-spirit-shield')
  })
})
