import { describe, expect, it } from 'vitest'
import { compileSearch, formatTerm } from '@shared/regex'
import {
  POE2_ITEM_CLASSES,
  POE2_RARITIES,
  POE2_VENDOR_KEYS,
  TABLET_TYPES,
  WAYSTONE_LABEL_KEYS,
  poe2VendorPattern,
  tierTerm,
  usesTerm,
  waystoneThreshold
} from '@shared/regex/poe2'
import type { Poe2ModData, RegexLang } from '@shared/types'
import { LANGS, fillLine, isSuperset, loadCorpus, loadPoe2Data, modLines, modes, num } from './helpers'

// Данные генератора PoE 2: каждый токен находит свой мод (числа — в расширенном формате 0.5, с диапазоном тира, и
// без него), не задевает чужие моды (кроме «надмножеств» и помеченных alsoMatches) и строки подсказки (кроме
// alsoExtra); метки свойств, тир, редкость, флаги, типы плиток, «использований» однозначны. RU — и при регистровой
// кириллице, и при ё=е.

const term = (body: string): string => formatTerm({ negate: false, body })

describe.each(LANGS)('данные PoE 2 %s', (lang: RegexLang) => {
  const data = loadPoe2Data(lang)

  it('собраны: мета, путевые камни, плитки, торговец', () => {
    expect(data.meta.lang).toBe(lang)
    expect(data.meta.patch).toMatch(/^\d+\.\d+/)
    expect(data.waystone.mods.length).toBeGreaterThan(40)
    expect(data.tablet.mods.length).toBeGreaterThan(60)
    for (const k of WAYSTONE_LABEL_KEYS) expect(data.waystone.labels[k]).toBeTruthy()
    for (const t of TABLET_TYPES) expect(data.tablet.types[t]).toBeTruthy()
    for (const k of POE2_VENDOR_KEYS) expect(data.vendor.props[k]).toBeTruthy()
    for (const c of POE2_ITEM_CLASSES) expect(data.vendor.classes[c]).toBeTruthy()
  })

  it('id модов одинаковые в EN и RU', () => {
    const other = loadPoe2Data(lang === 'en' ? 'ru' : 'en')
    expect(data.waystone.mods.map((m) => m.id)).toEqual(other.waystone.mods.map((m) => m.id))
    expect(data.tablet.mods.map((m) => m.id)).toEqual(other.tablet.mods.map((m) => m.id))
  })

  for (const section of ['waystone', 'tablet'] as const) {
    describe(section, () => {
      const mods = data[section].mods
      const usable = mods.filter((m) => !m.tags.includes('noRu'))

      it('токены короткие, без кавычек и !', () => {
        for (const m of mods) {
          expect(m.token.length, m.id).toBeGreaterThanOrEqual(2)
          expect(m.token, m.id).not.toMatch(/["!]/)
          expect(m.token, m.id).not.toMatch(/^ | $/)
        }
        const short = mods.filter((m) => m.token.length <= 12).length
        // у плиток много похожих строк («… in Map»): токены длиннее
        expect(short / mods.length).toBeGreaterThan(section === 'tablet' ? 0.8 : 0.9)
      })

      it.each(modes(lang))('токен находит свой мод (с диапазоном тира и без) — %o', (mode) => {
        for (const m of usable) {
          const match = compileSearch(term(m.token), mode)
          for (const advanced of [true, false]) {
            expect(match(modLines(m, 25, advanced).join('\n')), `${m.id}: ${m.token}`).toBe(true)
            expect(match(modLines(m, 7, advanced).join('\n')), `${m.id}: ${m.token}`).toBe(true)
          }
        }
      })

      it.each(modes(lang))('токен не задевает чужие моды и строки подсказки — %o', (mode) => {
        for (const m of usable) {
          const match = compileSearch(term(m.token), mode)
          const allowed = new Set(m.alsoMatches ?? [])
          for (const o of mods) {
            if (o === m || allowed.has(o.id) || isSuperset(o, m)) continue
            expect(match(modLines(o, 25).join('\n')), `${m.id} (${m.token}) задел ${o.id}`).toBe(false)
          }
          const extraHits = data[section].extra.filter((l) => match(fillLine(l)))
          expect(extraHits.length, `${m.id} (${m.token}): ${extraHits.slice(0, 3).join(' | ')}`).toBeLessThanOrEqual(
            m.alsoExtra ?? 0
          )
        }
      })
    })
  }

  it('без русского текста — единицы (RU), в EN — ни одного', () => {
    const noRu = [...data.waystone.mods, ...data.tablet.mods].filter((m: Poe2ModData) => m.tags.includes('noRu'))
    expect(noRu.length).toBeLessThanOrEqual(lang === 'ru' ? 10 : 0)
  })

  it.each(modes(lang))('пороги свойств путевого камня: ≥ N и только своя строка — %o', (mode) => {
    const lines = data.waystone.extra
    for (const k of WAYSTONE_LABEL_KEYS) {
      for (const n of [1, 9, 10, 20, 35, 80, 100, 150]) {
        const match = compileSearch(term(waystoneThreshold(data.waystone, k, n)), mode)
        const own = lines.filter((l) => compileSearch(term(data.waystone.labels[k]), mode)(l))
        expect(own.length, k).toBeGreaterThan(0)
        for (const v of [1, 5, 9, 10, 19, 20, 34, 35, 79, 80, 99, 100, 149, 150, 230]) {
          for (const l of own) expect(match(l.replace('#', String(v))), `${k} ≥ ${n} на ${v}: ${l}`).toBe(v >= n)
        }
        // чужие строки подсказки и моды не задевает
        for (const l of lines.filter((x) => !own.includes(x))) expect(match(fillLine(l, 200)), `${k}: ${l}`).toBe(false)
        for (const m of data.waystone.mods) expect(match(modLines(m, 200).join('\n')), `${k}: ${m.id}`).toBe(false)
      }
    }
  })

  it.each(modes(lang))('тир по названию базы — %o', (mode) => {
    const base = lang === 'ru' ? (t: number) => `Путевой камень (Ур. ${t})` : (t: number) => `Waystone (Tier ${t})`
    for (const [a, b] of [
      [15, 16],
      [13, 16],
      [1, 5],
      [5, 12],
      [10, 10],
      [1, 9],
      [9, 16]
    ]) {
      const t = tierTerm(data.waystone, a, b)!
      const match = compileSearch(term(t), mode)
      for (let tier = 1; tier <= 16; tier++) expect(match(base(tier)), `${t} на ${tier}`).toBe(tier >= a && tier <= b)
      // строки «(Tier: 1)» заголовков модов и «Unidentified (Tier 3)» не задевает
      const baseLine = base(1).toLowerCase().replace('1', '#')
      for (const l of data.waystone.extra.filter((x) => x !== baseLine))
        expect(match(fillLine(l, 3, false)), `${t}: ${l}`).toBe(false)
    }
    expect(tierTerm(data.waystone, 0, 0)).toBeNull()
    expect(tierTerm(data.waystone, 1, 16)).toBeNull()
  })

  it.each(modes(lang))('редкость, осквернён, неопознан — %o', (mode) => {
    const name =
      lang === 'ru'
        ? {
            normal: 'Обычный',
            magic: 'Волшебный',
            rare: 'Редкий',
            unique: 'Уникальный'
          }
        : { normal: 'Normal', magic: 'Magic', rare: 'Rare', unique: 'Unique' }
    const label = lang === 'ru' ? 'Редкость: ' : 'Rarity: '
    for (const r of POE2_RARITIES) {
      for (const sec of [data.waystone, data.tablet]) {
        const match = compileSearch(term(sec.rarity[r]), mode)
        for (const o of POE2_RARITIES) expect(match(label + name[o]), `${r} на ${o}`).toBe(o === r)
      }
    }
    const corrupted = compileSearch(term(data.waystone.flags.corrupted), mode)
    expect(corrupted(lang === 'ru' ? 'Осквернено' : 'Corrupted')).toBe(true)
    expect(corrupted(lang === 'ru' ? 'Дважды осквернено' : 'Twice Corrupted')).toBe(true)
    const unid = compileSearch(term(data.waystone.flags.unidentified), mode)
    expect(unid(lang === 'ru' ? 'Неопознано' : 'Unidentified')).toBe(true)
    for (const m of data.waystone.mods) {
      expect(corrupted(modLines(m).join('\n')), m.id).toBe(false)
      expect(unid(modLines(m).join('\n')), m.id).toBe(false)
    }
  })

  it.each(modes(lang))('плитки: тип по базе и «использований ≥ N» — %o', (mode) => {
    const extra = data.tablet.extra
    for (const t of TABLET_TYPES) {
      const match = compileSearch(term(data.tablet.types[t]), mode)
      const own = extra.filter((l) => match(l))
      expect(own.length, t).toBeGreaterThan(0)
      // свой тип находится; моды плиток и путевых камней не задевает
      for (const m of [...data.tablet.mods, ...data.waystone.mods])
        expect(match(modLines(m).join('\n')), `${t}: ${m.id}`).toBe(false)
    }
    const usesLine = lang === 'ru' ? (v: number) => `Осталось зарядов - ${v}` : (v: number) => `${v} uses remaining`
    for (const n of [1, 2, 5, 9, 10, 12, 20]) {
      const match = compileSearch(term(usesTerm(data.tablet, n)), mode)
      for (const v of [2, 3, 5, 8, 9, 10, 11, 12, 15, 20, 25]) expect(match(usesLine(v)), `≥ ${n} на ${v}`).toBe(v >= n)
      for (const m of data.tablet.mods) expect(match(modLines(m, 30).join('\n')), `uses: ${m.id}`).toBe(false)
    }
  })
})

describe.each(LANGS)('торговец PoE 2 %s', (lang: RegexLang) => {
  const data = loadPoe2Data(lang)
  const corpus = loadCorpus(lang)
  const v = data.vendor
  const keys = POE2_VENDOR_KEYS.filter((k) => !v.props[k].noRu)

  it('свойства без русского текста — нет (RU данные EE2 полные для снаряжения)', () => {
    expect(POE2_VENDOR_KEYS.length - keys.length).toBe(0)
  })

  it.each(modes(lang))('свойство находит свои строки и не задевает чужие (корпус ~6–8 тыс. строк) — %o', (mode) => {
    for (const k of keys) {
      const own = corpus.own[k]
      const thresholds = v.props[k].token === undefined ? [1, 10, 25, 80] : [1]
      for (const n of thresholds) {
        const match = compileSearch(term(poe2VendorPattern(v, k, n)), mode)
        for (const l of own) {
          for (const val of [1, 9, 10, 24, 25, 79, 80, 99, 150]) {
            for (const advanced of [true, false]) {
              const text = l.replace(/#/g, () => num(val, advanced))
              const expected = v.props[k].token !== undefined || val >= n
              expect(match(text), `${k} ≥ ${n} на ${text}`).toBe(expected)
            }
          }
        }
        const bad = corpus.lines.filter((l) => !own.some((o) => l.includes(o)) && match(fillLine(l, 150)))
        expect(bad.length, `${k} ≥ ${n}: ${bad.slice(0, 3).join(' | ')}`).toBeLessThanOrEqual(v.props[k].alsoLines ?? 0)
      }
    }
  })

  it.each(modes(lang))('класс и редкость — только своя строка — %o', (mode) => {
    const classLines = corpus.lines.filter((l) => /^(item class|класс предмета): /.test(l))
    for (const c of POE2_ITEM_CLASSES) {
      const match = compileSearch(term(v.classes[c]), mode)
      const hits = corpus.lines.filter((l) => match(l))
      expect(hits.length, `${c}: ${hits.join(' | ')}`).toBe(1)
      expect(classLines).toContain(hits[0])
    }
    for (const r of POE2_RARITIES) {
      const match = compileSearch(term(v.rarity[r]), mode)
      expect(corpus.lines.filter((l) => match(l)).length, r).toBe(1)
    }
  })
})
