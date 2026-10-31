import { describe, expect, it } from 'vitest'
import { REGEX_LIMIT, compileSearch } from '@shared/regex'
import {
  POE2_PRESETS,
  POE2_VENDOR_KEYS,
  PRICE_FETCH,
  TABLET_TYPES,
  buildPoe2VendorRegex,
  buildTabletRegex,
  buildWaystoneRegex,
  emptyPoe2State,
  emptyPoe2VendorQuery,
  emptyTabletQuery,
  emptyWaystoneQuery,
  isPoe2TradeBody,
  modsForTypes,
  normalizePoe2State,
  numberRange,
  patchPoe2Prefs,
  poe2PresetText,
  profilePrice,
  profileRegex,
  profileTradeQuery,
  removeProfile,
  scaryWaystoneIds,
  selectable,
  upsertProfile,
  type Poe2PriceRequest
} from '@shared/regex/poe2'
import type { Poe2ModData, Poe2Profile, RegexLang } from '@shared/types'
import { LANGS, loadPoe2Data, modes, readFixture, rng, tabletTooltip, waystoneTooltip } from './helpers'

// Движок строк PoE 2: эмулятор поиска на подсказках в расширенном формате 0.5 (фикстуры EE2 и синтетические),
// лимит 250, «любой из» = каждый по отдельности, «не хочу» одним термом, профили и «Цена по профилю».

const has = (lines: string, m: Poe2ModData): boolean =>
  m.display.split('\n').every((l) => {
    const re = new RegExp(
      '^' +
        l
          .toLowerCase()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/#/g, '[\\d.()+-]+') +
        '( — .*)?$',
      'm'
    )
    return re.test(lines.toLowerCase())
  })

describe('numberRange', () => {
  it('целые a…b одной группой', () => {
    for (let a = 1; a <= 16; a++) {
      for (let b = a; b <= 16; b++) {
        const re = new RegExp(`^${numberRange(a, b)}$`)
        for (let n = 0; n <= 20; n++) expect(re.test(String(n)), `${a}–${b} на ${n}`).toBe(n >= a && n <= b)
      }
    }
  })
})

describe.each(LANGS)('путевые камни %s', (lang: RegexLang) => {
  const data = loadPoe2Data(lang)
  const ws = data.waystone
  const usable = ws.mods.filter(selectable)

  it('фикстуры EE2 (расширенный текст 0.5): моды находятся своими токенами, тир и осквернение', () => {
    for (const file of ['ee2-waystone.txt', 'ee2-waystone-all-props.txt']) {
      const text = readFixture(lang, file)
      const present = usable.filter((m) => has(text, m))
      expect(present.length, file).toBeGreaterThan(1)
      for (const m of present) {
        const r = buildWaystoneRegex(ws, {
          ...emptyWaystoneQuery(),
          want: [m.id]
        })
        for (const mode of modes(lang))
          expect(compileSearch(r.text, mode)(text), `${file}: ${m.id} ${r.text}`).toBe(true)
      }
      // «отсутствует» — ни одной строки мода в подсказке (у фикстуры EE2 бывает старая формулировка второй строки)
      const someLine = (m: Poe2ModData): boolean => m.display.split('\n').some((l) => has(text, { ...m, display: l }))
      const absent = usable.filter((m) => !someLine(m) && !present.some((p) => (m.alsoMatches ?? []).includes(p.id)))
      for (const m of absent) {
        const r = buildWaystoneRegex(ws, {
          ...emptyWaystoneQuery(),
          want: [m.id]
        })
        if (m.alsoExtra) continue
        expect(compileSearch(r.text)(text), `${file}: ${m.id} ${r.text}`).toBe(false)
      }
    }
    const t14 = readFixture(lang, 'ee2-waystone.txt')
    expect(
      compileSearch(
        buildWaystoneRegex(ws, {
          ...emptyWaystoneQuery(),
          tierMin: 14,
          tierMax: 14
        }).text
      )(t14)
    ).toBe(true)
    expect(
      compileSearch(
        buildWaystoneRegex(ws, {
          ...emptyWaystoneQuery(),
          tierMin: 15,
          tierMax: 16
        }).text
      )(t14)
    ).toBe(false)
    const t16 = readFixture(lang, 'ee2-waystone-all-props.txt')
    expect(compileSearch(buildWaystoneRegex(ws, { ...emptyWaystoneQuery(), corrupted: 'only' }).text)(t16)).toBe(true)
    expect(
      compileSearch(
        buildWaystoneRegex(ws, {
          ...emptyWaystoneQuery(),
          corrupted: 'exclude'
        }).text
      )(t16)
    ).toBe(false)
    expect(
      compileSearch(
        buildWaystoneRegex(ws, {
          ...emptyWaystoneQuery(),
          corrupted: 'exclude'
        }).text
      )(t14)
    ).toBe(true)
    // пороги свойств: Pack Size +34%, Rare Monsters +28%, Waystone Drop Chance +75%
    const th = (k: 'packSize' | 'rareMonsters' | 'dropChance', n: number): boolean =>
      compileSearch(
        buildWaystoneRegex(ws, {
          ...emptyWaystoneQuery(),
          thresholds: { [k]: n }
        }).text
      )(t14)
    expect(th('packSize', 30)).toBe(true)
    expect(th('packSize', 35)).toBe(false)
    expect(th('rareMonsters', 28)).toBe(true)
    expect(th('dropChance', 76)).toBe(false)
  })

  it.each(modes(lang))('случайные наборы: подсветка ⇔ условие (без ложных срабатываний) — %o', (mode) => {
    const rand = rng(lang === 'ru' ? 7 : 3)
    const pick = <T>(list: T[], n: number): T[] => {
      const out: T[] = []
      while (out.length < n) {
        const x = list[Math.floor(rand() * list.length)]
        if (!out.includes(x)) out.push(x)
      }
      return out
    }
    // моды без уникальной подстроки (alsoMatches / alsoExtra) честно задевают соседей — их в случайные наборы не берём
    const clean = usable.filter(
      (m) => !m.alsoMatches && !m.alsoExtra && !usable.some((o) => o !== m && o.text.includes(m.text))
    )
    for (let round = 0; round < 60; round++) {
      const want = pick(clean, 1 + Math.floor(rand() * 3))
      const avoid = pick(
        clean.filter((m) => !want.includes(m)),
        Math.floor(rand() * 4)
      )
      const wantMode = rand() < 0.5 ? 'any' : 'all'
      const r = buildWaystoneRegex(ws, {
        ...emptyWaystoneQuery(),
        want: want.map((m) => m.id),
        avoid: avoid.map((m) => m.id),
        wantMode
      })
      expect(r.ok).toBe(true)
      const match = compileSearch(r.text, mode)
      for (let k = 0; k < 12; k++) {
        const mods = pick(clean, 2 + Math.floor(rand() * 5))
        const ids = new Set(mods.map((m) => m.id))
        const wantOk = wantMode === 'all' ? want.every((m) => ids.has(m.id)) : want.some((m) => ids.has(m.id))
        const expected = wantOk && !avoid.some((m) => ids.has(m.id))
        const text = waystoneTooltip(lang, {
          mods,
          props: { packSize: 20, rareMonsters: 40 }
        })
        expect(match(text), `${r.text}\n---\n${text}`).toBe(expected)
      }
    }
  })

  it('«любой из» = каждый по отдельности; «не хочу» — один терм', () => {
    const ids = usable.slice(0, 8).map((m) => m.id)
    const any = buildWaystoneRegex(ws, {
      ...emptyWaystoneQuery(),
      want: ids,
      wantMode: 'any'
    })
    expect(any.text.startsWith('"')).toBe(true)
    for (const m of usable.slice(0, 8)) {
      const text = waystoneTooltip(lang, { mods: [m] })
      expect(compileSearch(any.text)(text), m.id).toBe(true)
    }
    const avoid = buildWaystoneRegex(ws, {
      ...emptyWaystoneQuery(),
      avoid: ids,
      corrupted: 'exclude'
    })
    expect(avoid.text.startsWith('"!')).toBe(true)
    expect(avoid.text.split('" "').length).toBe(1)
  })

  it('типовые наборы ≤ 250: все опасные + 3 порога + тир + редкость + опознан', () => {
    const scary = scaryWaystoneIds(data, [
      'maxRes',
      'recovery',
      'flasks',
      'cooldown',
      'penetration',
      'curse',
      'steal',
      'noDamage',
      'buffs'
    ])
    expect(scary.length).toBeGreaterThan(5)
    const r = buildWaystoneRegex(ws, {
      ...emptyWaystoneQuery(),
      avoid: scary,
      thresholds: { packSize: 20, rareMonsters: 40, itemRarity: 30 },
      tierMin: 13,
      tierMax: 16,
      rarity: ['rare'],
      unidentified: 'exclude'
    })
    expect(r.ok, `${r.length}: ${r.text}`).toBe(true)
    expect(r.length).toBeLessThanOrEqual(REGEX_LIMIT)
  })

  it('переполнение: что убрать', () => {
    const r = buildWaystoneRegex(ws, {
      ...emptyWaystoneQuery(),
      want: usable.map((m) => m.id),
      wantMode: 'all'
    })
    expect(r.ok).toBe(false)
    expect(r.overflow!.by).toBe(r.length - REGEX_LIMIT)
    const saved = r.overflow!.suggest.reduce((n, s) => n + s.saves, 0)
    expect(saved).toBeGreaterThanOrEqual(r.overflow!.by)
  })

  it('мод без русского текста в строку не попадает', () => {
    const noRu = ws.mods.find((m) => !selectable(m))
    if (!noRu) return
    expect(buildWaystoneRegex(ws, { ...emptyWaystoneQuery(), want: [noRu.id] }).text).toBe('')
  })
})

describe.each(LANGS)('плитки %s', (lang: RegexLang) => {
  const data = loadPoe2Data(lang)
  const tb = data.tablet
  const usable = tb.mods.filter(selectable)
  const base = (t: string): string => {
    const re = new RegExp(tb.types[t as keyof typeof tb.types], 'i')
    const hit = tb.extra.find((l) => re.test(l) && !/ — | }|^{/.test(l) && l.split(' ').length <= 3)
    if (!hit) throw new Error(`нет базы ${t}`)
    return hit
  }

  it('фикстура Sidekick (EN): моды плитки Ритуала находятся', () => {
    if (lang !== 'en') return
    const text = readFixture('en', 'sk-tablet-rare.txt')
    const present = usable.filter((m) => has(text, m))
    expect(present.length).toBeGreaterThanOrEqual(3)
    for (const m of present)
      expect(compileSearch(buildTabletRegex(tb, { ...emptyTabletQuery(), want: [m.id] }).text)(text), m.id).toBe(true)
    expect(compileSearch(buildTabletRegex(tb, { ...emptyTabletQuery(), types: ['ritual'] }).text)(text)).toBe(true)
    expect(
      compileSearch(
        buildTabletRegex(tb, {
          ...emptyTabletQuery(),
          types: ['breach', 'abyss']
        }).text
      )(text)
    ).toBe(false)
    expect(compileSearch(buildTabletRegex(tb, { ...emptyTabletQuery(), usesMin: 10 }).text)(text)).toBe(true)
    expect(compileSearch(buildTabletRegex(tb, { ...emptyTabletQuery(), usesMin: 11 }).text)(text)).toBe(false)
  })

  it.each(modes(lang))('тип, использования и моды на синтетических плитках — %o', (mode) => {
    const rand = rng(lang === 'ru' ? 11 : 5)
    for (const t of TABLET_TYPES) {
      const own = modsForTypes(tb, [t]).filter((m) => selectable(m) && !m.alsoMatches && !m.alsoExtra)
      if (own.length < 2) continue
      const m = own[Math.floor(rand() * own.length)]
      const text = tabletTooltip(lang, data, { type: t, uses: 7, mods: [m] }, base(t))
      const q = {
        ...emptyTabletQuery(),
        types: [t],
        usesMin: 5,
        want: [m.id]
      }
      expect(compileSearch(buildTabletRegex(tb, q).text, mode)(text), `${t}: ${buildTabletRegex(tb, q).text}`).toBe(
        true
      )
      expect(compileSearch(buildTabletRegex(tb, { ...q, usesMin: 8 }).text, mode)(text)).toBe(false)
      const other = TABLET_TYPES.filter((x) => x !== t)
      expect(compileSearch(buildTabletRegex(tb, { ...q, types: other }).text, mode)(text), `${t} vs ${other}`).toBe(
        false
      )
      expect(compileSearch(buildTabletRegex(tb, { ...emptyTabletQuery(), avoid: [m.id] }).text, mode)(text)).toBe(false)
    }
  })

  it('все типы + использования + 6 модов «любой из» ≤ 250', () => {
    const want = usable.slice(0, 6).map((m) => m.id)
    const r = buildTabletRegex(tb, {
      ...emptyTabletQuery(),
      types: ['ritual', 'breach', 'delirium'],
      usesMin: 5,
      want,
      wantMode: 'any',
      rarity: ['rare', 'magic']
    })
    expect(r.ok, `${r.length}: ${r.text}`).toBe(true)
  })
})

describe.each(LANGS)('торговец PoE 2 %s', (lang: RegexLang) => {
  const data = loadPoe2Data(lang)
  const v = data.vendor
  const crossbow = readFixture(lang, 'ee2-crossbow-all-types.txt')

  it('фикстура (самострел): класс, редкость, гнёзда, качество, урон', () => {
    const q = (p: Partial<ReturnType<typeof emptyPoe2VendorQuery>>): boolean =>
      compileSearch(buildPoe2VendorRegex(v, { ...emptyPoe2VendorQuery(), ...p }).text)(crossbow)
    expect(q({ itemClass: 'crossbow' })).toBe(true)
    expect(q({ itemClass: 'bow' })).toBe(false)
    expect(q({ rarity: ['rare'] })).toBe(true)
    expect(q({ rarity: ['magic', 'normal'] })).toBe(false)
    expect(q({ sockets: 2 })).toBe(true)
    expect(q({ sockets: 3 })).toBe(false)
    expect(q({ quality: 20 })).toBe(true)
    expect(q({ quality: 21 })).toBe(false)
    expect(q({ mods: { addPhys: 1 } })).toBe(true)
    expect(q({ mods: { attackSpeed: 18 } })).toBe(true)
    expect(q({ mods: { attackSpeed: 19 } })).toBe(false)
    expect(q({ mods: { resFire: 1 } })).toBe(false)
  })

  it('все свойства «любое» сразу и сопротивления — в лимите', () => {
    const res = buildPoe2VendorRegex(v, {
      ...emptyPoe2VendorQuery(),
      mods: {
        resFire: 20,
        resCold: 20,
        resLightning: 20,
        resChaos: 10,
        resAll: 10
      },
      itemClass: 'ring',
      rarity: ['magic', 'rare']
    })
    expect(res.ok, `${res.length}: ${res.text}`).toBe(true)
    const leveling = buildPoe2VendorRegex(v, {
      ...emptyPoe2VendorQuery(),
      mods: {
        moveSpeed: 10,
        life: 30,
        gemSpell: 1,
        gemMelee: 1,
        gemProjectile: 1
      }
    })
    expect(leveling.ok, `${leveling.length}: ${leveling.text}`).toBe(true)
    const all = buildPoe2VendorRegex(v, {
      ...emptyPoe2VendorQuery(),
      mods: Object.fromEntries(POE2_VENDOR_KEYS.map((k) => [k, 10]))
    })
    expect(all.ok).toBe(false)
    expect(all.overflow!.suggest.length).toBeGreaterThan(0)
  })
})

describe.each(LANGS)('готовые строки PoE 2 %s', (lang: RegexLang) => {
  it('собираются и укладываются в 250', () => {
    const data = loadPoe2Data(lang)
    for (const p of POE2_PRESETS) {
      const text = poe2PresetText(p, data)
      expect(text, p.id).toBeTruthy()
      expect(text.length, p.id).toBeLessThanOrEqual(REGEX_LIMIT)
    }
  })
})

describe('профили и состояние PoE 2', () => {
  let n = 0
  const newId = (): string => `id${++n}`

  it('битый файл → пустое состояние; лишнее отбрасывается', () => {
    expect(normalizePoe2State(null, newId)).toEqual(emptyPoe2State())
    const s = normalizePoe2State(
      {
        prefs: {
          page: 'tablet',
          waystone: {
            tierMin: 99,
            rarity: ['rare', 'bogus'],
            want: ['a', 'a', 7],
            avoid: ['a']
          },
          vendor: { mods: { life: 50, bogus: 3 }, itemClass: 'nope' }
        },
        profiles: [
          { name: '', kind: 'waystone' },
          { name: 'x', kind: 'map' },
          {
            id: 'p',
            name: '  Мой  ',
            kind: 'tablet',
            tablet: { types: ['ritual', 'x'], usesMin: 5 }
          }
        ]
      },
      newId
    )
    expect(s.prefs.page).toBe('tablet')
    expect(s.prefs.waystone.tierMin).toBe(16)
    expect(s.prefs.waystone.rarity).toEqual(['rare'])
    expect(s.prefs.waystone.want).toEqual([])
    expect(s.prefs.waystone.avoid).toEqual(['a'])
    expect(s.prefs.vendor.mods).toEqual({ life: 50 })
    expect(s.prefs.vendor.itemClass).toBe('')
    expect(s.profiles).toHaveLength(1)
    expect(s.profiles[0]).toMatchObject({
      id: 'p',
      name: 'Мой',
      kind: 'tablet',
      tablet: { types: ['ritual'], usesMin: 5 }
    })
  })

  it('профили сохраняются, меняются и удаляются; настройки страниц — отдельно', () => {
    let s = emptyPoe2State()
    s = upsertProfile(
      s,
      {
        name: 'T15+ без опасных',
        kind: 'waystone',
        waystone: { ...emptyWaystoneQuery(), tierMin: 15 }
      },
      newId
    )
    expect(s.profiles).toHaveLength(1)
    const id = s.profiles[0].id
    s = upsertProfile(
      s,
      {
        id,
        name: 'Новое имя',
        kind: 'waystone',
        waystone: { ...emptyWaystoneQuery(), tierMin: 16 }
      },
      newId
    )
    expect(s.profiles).toHaveLength(1)
    expect(s.profiles[0]).toMatchObject({
      id,
      name: 'Новое имя',
      waystone: { tierMin: 16 }
    })
    s = patchPoe2Prefs(s, { page: 'vendor' })
    expect(s.prefs.page).toBe('vendor')
    expect(s.profiles).toHaveLength(1)
    // переживает запись в файл и чтение
    const again = normalizePoe2State(JSON.parse(JSON.stringify(s)), newId)
    expect(again).toEqual(s)
    s = removeProfile(s, id)
    expect(s.profiles).toHaveLength(0)
  })

  it.each(LANGS)('строка профиля = строка страницы (%s)', (lang) => {
    const data = loadPoe2Data(lang)
    const q = {
      ...emptyWaystoneQuery(),
      tierMin: 15,
      thresholds: { packSize: 20 },
      avoid: scaryWaystoneIds(data, ['maxRes'])
    }
    const p: Poe2Profile = {
      id: 'x',
      name: 'x',
      kind: 'waystone',
      waystone: q
    }
    expect(profileRegex(data, p).text).toBe(buildWaystoneRegex(data.waystone, q).text)
  })

  it('тело запроса trade2: статус available, категория, тир, свойства, моды', () => {
    const data = loadPoe2Data('en')
    const [a, b, c] = data.waystone.mods.filter((m) => m.trade?.length)
    const p: Poe2Profile = {
      id: 'x',
      name: 'x',
      kind: 'waystone',
      waystone: {
        ...emptyWaystoneQuery(),
        tierMin: 15,
        tierMax: 16,
        rarity: ['rare'],
        corrupted: 'exclude',
        want: [a.id, b.id],
        avoid: [c.id],
        thresholds: { packSize: 20, effectiveness: 10 }
      }
    }
    const { body, skipped } = profileTradeQuery(data, p)
    expect(isPoe2TradeBody(body)).toBe(true)
    expect(body.query.status.option).toBe('available')
    expect(body.query.filters.type_filters.filters).toMatchObject({
      category: { option: 'map.waystone' },
      rarity: { option: 'rare' }
    })
    expect(body.query.filters.map_filters.filters).toMatchObject({
      map_tier: { min: 15, max: 16 },
      map_packsize: { min: 20 }
    })
    expect(body.query.filters.misc_filters.filters).toMatchObject({
      corrupted: { option: 'false' }
    })
    expect(body.query.stats.map((g) => g.type)).toEqual(['and', 'not'])
    expect(skipped).toContain('threshold:effectiveness')
    // плитка: тип — EN-название базы (сайт ищет по-английски), использования — псевдо-стат
    const t = profileTradeQuery(loadPoe2Data('ru'), {
      id: 't',
      name: 't',
      kind: 'tablet',
      tablet: { ...emptyTabletQuery(), types: ['ritual'], usesMin: 5 }
    })
    expect(t.body.query.type).toBe('Ritual Tablet')
    expect(t.body.query.filters.type_filters.filters).toMatchObject({
      category: { option: 'map.tablet' }
    })
    expect(
      isPoe2TradeBody({
        ...t.body,
        query: { ...t.body.query, status: { option: 'any' } }
      })
    ).toBe(false)
  })

  it('«Цена по профилю» — ровно один поиск и одна страница лотов, статус available', async () => {
    const data = loadPoe2Data('en')
    const { body } = profileTradeQuery(data, {
      id: 'x',
      name: 'x',
      kind: 'waystone',
      waystone: { ...emptyWaystoneQuery(), tierMin: 15 }
    })
    const calls: Poe2PriceRequest[] = []
    // id лотов trade2 — 64 hex-символа
    const ids = Array.from({ length: 40 }, (_, i) => i.toString(16).padStart(64, 'a'))
    const res = await profilePrice(
      { ...body, query: { ...body.query, status: { option: 'available' } } },
      'Runes of Aldur',
      async (r) => {
        calls.push(r)
        if (r.kind === 'search')
          return {
            ok: true,
            data: { id: 'Q1', result: ids, total: 734 } as never
          }
        return {
          ok: true,
          data: {
            result: ids.slice(0, PRICE_FETCH).map((id, i) => ({
              id,
              listing: {
                fee: i % 2 ? 12 : undefined,
                price: { amount: 2 + i, currency: 'exalted' }
              }
            }))
          } as never
        }
      },
      (id) => `https://www.pathofexile.com/trade2/search/poe2/x/${id}`
    )
    expect(calls.map((c) => c.kind)).toEqual(['search', 'fetch'])
    expect((calls[0].req.body as { query: { status: { option: string } } }).query.status.option).toBe('available')
    expect(calls[1].req.rest.split('?')[0].split(',')).toHaveLength(PRICE_FETCH)
    expect(res.ok && res.total).toBe(734)
    expect(res.ok && res.listings).toHaveLength(PRICE_FETCH)
    expect(res.ok && res.listings[1].instant).toBe(true)
    // плохое тело — ни одного запроса
    const none: Poe2PriceRequest[] = []
    const bad = await profilePrice(
      { query: { status: { option: 'any' } } },
      'L',
      async (r) => (none.push(r), { ok: false, error: { code: 'x' } }),
      () => ''
    )
    expect(bad.ok).toBe(false)
    expect(none).toHaveLength(0)
  })
})
