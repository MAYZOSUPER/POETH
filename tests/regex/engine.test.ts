import { describe, expect, it } from 'vitest'
import type { MapLabelKey, MapModData, MapQuery } from '@shared/types'
import { buildMapRegex, compileSearch, emptyMapQuery, MAP_LABEL_KEYS, REGEX_LIMIT } from '@shared/regex'
import { hasAllLines, LANGS, loadMapData, mapTooltip, pick, rng } from './helpers'

// Движок карт: строка через эмулятор не даёт ложных срабатываний на синтетических картах
// (EN и RU), влезает в 250 символов на типовых наборах, при переполнении — подсказка.

/** Ожидание: карта с модом m попадает под выбор, если в ней есть все строки выбранного мода. */
function hits(m: MapModData, selected: MapModData[]): boolean {
  return selected.some((s) => s === m || hasAllLines(m, s))
}

describe.each(LANGS)('движок карт %s', (lang) => {
  const data = loadMapData(lang)
  const byId = new Map(data.mods.map((m) => [m.id, m]))
  const scary = data.mods.filter((m) => m.scary && !m.tags.includes('t17'))
  const regular = data.mods.filter((m) => !m.tags.includes('t17') && m.kind !== 'implicit')

  it('пусто — пустая строка', () => {
    const r = buildMapRegex(data, emptyMapQuery())
    expect(r.text).toBe('')
    expect(r.ok).toBe(true)
  })

  it('10 «плохих» модов + 3 порога ≤ 250 символов и без ложных срабатываний', () => {
    const rand = rng(lang === 'en' ? 1 : 2)
    for (let round = 0; round < 50; round++) {
      const bad = [...scary.slice(0, 6), ...pick(regular, 4, rand)].slice(0, 10)
      const q: MapQuery = {
        ...emptyMapQuery(),
        avoid: [...new Set(bad.map((m) => m.id))],
        thresholds: { quantity: 80, packSize: 25, moreScarabs: 40 }
      }
      const r = buildMapRegex(data, q)
      expect(r.length, r.text).toBeLessThanOrEqual(REGEX_LIMIT)
      expect(r.ok).toBe(true)
      const match = compileSearch(r.text)
      const side = new Set(r.sideMatches)
      const good = { quantity: 90, packSize: 30, moreScarabs: 45 }
      for (const m of data.mods) {
        if (side.has(m.id)) continue
        const expected = !hits(m, bad)
        expect(match(mapTooltip(lang, [m], good)), `${m.id} с «${r.text}»`).toBe(expected)
      }
      // порог не выполнен — карта не подсвечивается
      const clean = data.mods.find((m) => !hits(m, bad) && !side.has(m.id))!
      expect(match(mapTooltip(lang, [clean], { ...good, quantity: 79 }))).toBe(false)
      expect(match(mapTooltip(lang, [clean], { ...good, packSize: 24 }))).toBe(false)
      expect(match(mapTooltip(lang, [clean], { quantity: 90, packSize: 30 }))).toBe(false)
    }
  })

  it('случайные наборы «хочу/не хочу»: эмулятор совпадает с ожиданием', () => {
    const rand = rng(lang === 'en' ? 11 : 12)
    for (let round = 0; round < 150; round++) {
      const avoid = pick(data.mods, 1 + Math.floor(rand() * 12), rand)
      const rest = data.mods.filter((m) => !avoid.includes(m))
      const want = pick(rest, Math.floor(rand() * 5), rand)
      const q: MapQuery = { ...emptyMapQuery(), avoid: avoid.map((m) => m.id), want: want.map((m) => m.id) }
      const r = buildMapRegex(data, q)
      if (!r.ok) continue
      const match = compileSearch(r.text)
      const side = new Set(r.sideMatches)
      for (const m of data.mods) {
        if (side.has(m.id)) continue
        const excluded = hits(m, avoid)
        const included = want.length === 0 || hits(m, want)
        expect(match(mapTooltip(lang, [m])), `${m.id}: «${r.text}»`).toBe(!excluded && included)
      }
    }
  })

  it('общие подстроки: покрытие не длиннее токенов по отдельности', () => {
    const rand = rng(lang === 'en' ? 21 : 22)
    for (let round = 0; round < 100; round++) {
      const avoid = pick(data.mods, 2 + Math.floor(rand() * 20), rand)
      const r = buildMapRegex(data, { ...emptyMapQuery(), avoid: avoid.map((m) => m.id) })
      const naive = `"!${[...new Set(avoid.map((m) => m.token))].join('|')}"`
      expect(r.length).toBeLessThanOrEqual(naive.length)
    }
  })

  it('«хочу все»: подсвечивается только карта со всеми модами', () => {
    const rand = rng(lang === 'en' ? 31 : 32)
    for (let round = 0; round < 40; round++) {
      const want = pick(regular.filter((m) => !m.alsoMatches), 3, rand)
      const r = buildMapRegex(data, { ...emptyMapQuery(), want: want.map((m) => m.id), wantMode: 'all' })
      const match = compileSearch(r.text)
      expect(match(mapTooltip(lang, want))).toBe(true)
      for (let k = 0; k < want.length; k++) {
        const partial = want.filter((_, j) => j !== k)
        const fills = partial.some((p) => hasAllLines(p, want[k]))
        if (!fills) expect(match(mapTooltip(lang, partial)), r.text).toBe(false)
      }
    }
  })

  it('флаги: только осквернённые / без неопознанных', () => {
    const m = regular[0]
    const only = compileSearch(buildMapRegex(data, { ...emptyMapQuery(), corrupted: 'only' }).text)
    expect(only(mapTooltip(lang, [m], {}, { corrupted: true }))).toBe(true)
    expect(only(mapTooltip(lang, [m]))).toBe(false)
    const noUnid = compileSearch(
      buildMapRegex(data, { ...emptyMapQuery(), avoid: [regular[1].id], unidentified: 'exclude' }).text
    )
    expect(noUnid(mapTooltip(lang, [m]))).toBe(true)
    expect(noUnid(mapTooltip(lang, [m], {}, { unidentified: true }))).toBe(false)
    expect(noUnid(mapTooltip(lang, [regular[1]]))).toBe(false)
  })

  it('каждый порог отдельно: ≥ n совпадает, < n — нет', () => {
    for (const key of MAP_LABEL_KEYS) {
      for (const n of [1, 15, 70, 85, 100, 140]) {
        const r = buildMapRegex(data, { ...emptyMapQuery(), thresholds: { [key]: n } as Record<MapLabelKey, number> })
        const match = compileSearch(r.text)
        const others = Object.fromEntries(MAP_LABEL_KEYS.filter((k) => k !== key).map((k) => [k, 999]))
        expect(match(mapTooltip(lang, [], { ...others, [key]: n }))).toBe(true)
        expect(match(mapTooltip(lang, [], { ...others, [key]: n - 1 })), `${key} ≥ ${n}: «${r.text}»`).toBe(false)
      }
    }
  })

  it('«не хочу» все моды сразу всё равно влезает: общие подстроки', () => {
    const r = buildMapRegex(data, { ...emptyMapQuery(), avoid: data.mods.map((m) => m.id) })
    expect(r.ok, `${r.length}`).toBe(true)
    const match = compileSearch(r.text)
    for (const m of data.mods) expect(match(mapTooltip(lang, [m]))).toBe(false)
    expect(match(mapTooltip(lang, []))).toBe(true)
  })

  it('переполнение: понятная ошибка и что убрать', () => {
    const r = buildMapRegex(data, { ...emptyMapQuery(), want: regular.map((m) => m.id), wantMode: 'all' })
    expect(r.ok).toBe(false)
    expect(r.overflow!.by).toBe(r.length - REGEX_LIMIT)
    expect(r.overflow!.suggest.length).toBeGreaterThan(0)
    const saved = r.overflow!.suggest.reduce((n, s) => n + s.saves, 0)
    expect(saved).toBeGreaterThanOrEqual(r.overflow!.by)
    for (const s of r.overflow!.suggest) if (s.kind === 'mod') expect(byId.has(s.id)).toBe(true)
  })

  it('неизвестные id игнорируются, мод и в «хочу», и в «не хочу» — считается «не хочу»', () => {
    const m = regular[2]
    const r = buildMapRegex(data, { ...emptyMapQuery(), avoid: [m.id, 'нет-такого'], want: [m.id] })
    expect(r.text).toBe(`"!${m.token}"`)
  })
})
