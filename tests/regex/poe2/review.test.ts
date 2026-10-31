import { describe, expect, it } from 'vitest'
import { compileSearch, formatTerm } from '@shared/regex'
import {
  TABLET_TYPES,
  buildTabletRegex,
  buildWaystoneRegex,
  emptyTabletQuery,
  emptyWaystoneQuery,
  isPoe2RegexData,
  nameIndex,
  profilePrice,
  profileTradeQuery,
  selectable,
  type Poe2PriceRequest
} from '@shared/regex/poe2'
import type { Poe2ModData, RegexLang } from '@shared/types'
import { LANGS, isSuperset, loadPoe2Data, modLines, modes, rng } from './helpers'

// Ревью S62: имена редких предметов не задеваются, общие подстроки «любой из» / «не хочу» в RU — без заглавных букв
// подсказки, заголовки чужих модов не задеваются, файл данных проверяется целиком, «Цена» не пускает в путь fetch
// чужие id и не доверяет форме ответа.

const term = (body: string): string => formatTerm({ negate: false, body })

/** Имена редких предметов из слов генератора: каждое слово с несколькими соседями слева и справа (в разном регистре). */
function rareNames(words: string[], seed: number): string {
  const rand = rng(seed)
  const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1)
  const out: string[] = []
  for (const w of words) {
    for (let k = 0; k < 4; k++) {
      const o = words[Math.floor(rand() * words.length)]
      out.push(`${cap(w)} ${cap(o)}`, `${cap(o)} ${w}`)
    }
  }
  return out.join('\n')
}

describe.each(LANGS)('имена редких предметов %s', (lang: RegexLang) => {
  const data = loadPoe2Data(lang)
  const words = data.waystone.rareWords ?? []
  const names = rareNames(words, lang === 'ru' ? 17 : 13)

  it('слова имён есть в данных', () => {
    expect(words.length).toBeGreaterThan(lang === 'ru' ? 500 : 400)
    expect(data.tablet.rareWords).toEqual(words)
  })

  it.each(modes(lang))('токены модов, типы плиток и флаги не задевают имена «Gloom Path» — %o', (mode) => {
    const bodies = [
      ...data.waystone.mods.filter(selectable).map((m) => m.token),
      ...data.tablet.mods.filter(selectable).map((m) => m.token),
      ...TABLET_TYPES.map((t) => data.tablet.types[t]),
      data.waystone.flags.corrupted,
      data.waystone.flags.unidentified
    ]
    for (const b of bodies) expect(compileSearch(term(b), mode)(names), b).toBe(false)
  })

  it.each(modes(lang))('общие подстроки «любой из» и «не хочу» не задевают имена — %o', (mode) => {
    for (const section of ['waystone', 'tablet'] as const) {
      const mods = data[section].mods.filter(selectable)
      for (let i = 0; i < mods.length; i++) {
        for (let j = i + 1; j < mods.length; j += 3) {
          const ids = [mods[i].id, mods[j].id]
          const r =
            section === 'waystone'
              ? buildWaystoneRegex(data.waystone, { ...emptyWaystoneQuery(), want: ids, wantMode: 'any' })
              : buildTabletRegex(data.tablet, { ...emptyTabletQuery(), want: ids, wantMode: 'any' })
          expect(compileSearch(r.text, mode)(names), `${section}: ${r.text}`).toBe(false)
        }
      }
    }
  })

  it('nameIndex: внутри слова и на стыке слов', () => {
    const idx = nameIndex(['gloom', 'path'])
    expect(idx.hits('loo')).toBe(true)
    expect(idx.hits('m p')).toBe(true)
    expect(idx.hits('om pa')).toBe(true)
    expect(idx.hits('x p')).toBe(false)
    expect(idx.hits('ath')).toBe(true)
    expect(idx.hits('pathx')).toBe(false)
  })
})

describe.each(LANGS)('покрытие «любой из» / «не хочу» на парах модов %s', (lang: RegexLang) => {
  const data = loadPoe2Data(lang)
  // те же строки, что видит поиск: с исходным регистром, число с диапазоном тира
  const text = (m: Poe2ModData): string => modLines(m, 25).join('\n')

  for (const section of ['waystone', 'tablet'] as const) {
    it.each(modes(lang))(`${section}: каждая пара — свои моды находятся, чужие нет — %o`, (mode) => {
      const mods = data[section].mods.filter(selectable)
      const step = section === 'tablet' ? 2 : 1
      let checked = 0
      for (let i = 0; i < mods.length; i++) {
        for (let j = i + 1; j < mods.length; j += step) {
          const ids = [mods[i].id, mods[j].id]
          for (const kind of ['want', 'avoid'] as const) {
            const q = kind === 'want' ? { want: ids, wantMode: 'any' as const } : { avoid: ids }
            const r =
              section === 'waystone'
                ? buildWaystoneRegex(data.waystone, { ...emptyWaystoneQuery(), ...q })
                : buildTabletRegex(data.tablet, { ...emptyTabletQuery(), ...q })
            const match = compileSearch(r.text, mode)
            const side = new Set(r.sideMatches)
            // «не хочу» прячет свои: строка не должна их подсвечивать; «хочу» — должна
            for (const m of [mods[i], mods[j]]) expect(match(text(m)), `${r.text} на ${m.id}`).toBe(kind === 'want')
            for (const o of mods) {
              if (ids.includes(o.id) || side.has(o.id) || isSuperset(o, mods[i]) || isSuperset(o, mods[j])) continue
              expect(match(text(o)), `${r.text} задел ${o.id}`).toBe(kind === 'avoid')
            }
            checked++
          }
        }
      }
      expect(checked).toBeGreaterThan(1000)
    })
  }

  it('заголовок чужого мода («{ … "имя аффикса" … }») токен не задевает', () => {
    for (const section of ['waystone', 'tablet'] as const) {
      const mods = data[section].mods.filter(selectable)
      for (const m of mods) {
        const match = compileSearch(term(m.token))
        const allowed = new Set(m.alsoMatches ?? [])
        for (const o of mods) {
          if (o === m || allowed.has(o.id) || !o.head) continue
          expect(match(o.head), `${m.id} (${m.token}) задел заголовок ${o.id}: ${o.head}`).toBe(false)
        }
      }
    }
  })
})

describe('проверка файла данных PoE 2', () => {
  const good = loadPoe2Data('ru')
  const clone = (): Record<string, any> => JSON.parse(JSON.stringify(good))

  it('встроенные данные проходят', () => {
    expect(isPoe2RegexData(loadPoe2Data('en'))).toBe(true)
    expect(isPoe2RegexData(good)).toBe(true)
  })

  it('без любого нужного поля или с битой регуляркой — нет', () => {
    const cases: ((d: Record<string, any>) => void)[] = [
      (d) => delete d.waystone.labels,
      (d) => delete d.waystone.labels.packSize,
      (d) => delete d.waystone.tier,
      (d) => delete d.waystone.flags,
      (d) => delete d.waystone.rarity.rare,
      (d) => delete d.tablet.uses,
      (d) => delete d.tablet.types.ritual,
      (d) => delete d.tablet.names,
      (d) => delete d.tablet.tradeType,
      (d) => delete d.vendor.classes,
      (d) => delete d.vendor.classNames.boots,
      (d) => delete d.vendor.props.life,
      (d) => delete d.vendor.sockets,
      (d) => (d.waystone.mods[0].token = '(unclosed'),
      (d) => (d.waystone.mods[0].tags = 'noRu'),
      (d) => (d.tablet.mods = {}),
      (d) => (d.vendor.props.resFire.posts = []),
      (d) => delete d.meta
    ]
    for (const [i, c] of cases.entries()) {
      const d = clone()
      c(d)
      expect(isPoe2RegexData(d), `случай ${i}`).toBe(false)
    }
    expect(isPoe2RegexData(null)).toBe(false)
    expect(isPoe2RegexData([])).toBe(false)
  })
})

describe('«Цена по профилю»: id лотов и форма ответа', () => {
  const data = loadPoe2Data('en')
  const { body } = profileTradeQuery(data, {
    id: 'x',
    name: 'x',
    kind: 'waystone',
    waystone: { ...emptyWaystoneQuery(), tierMin: 15 }
  })
  const hex = (i: number): string => i.toString(16).padStart(64, '0')

  it('в путь fetch идут только hex-id; чужие отброшены', async () => {
    const calls: Poe2PriceRequest[] = []
    await profilePrice(
      body,
      'L',
      async (r) => {
        calls.push(r)
        if (r.kind === 'search') {
          return {
            ok: true,
            data: { id: 'Abc123', result: ['../../x', hex(1), 'a,b', hex(2), 'ZZ', 7], total: 6 } as never
          }
        }
        return { ok: true, data: { result: [] } as never }
      },
      () => ''
    )
    expect(calls).toHaveLength(2)
    expect(calls[1].req.rest).toBe(`${hex(1)},${hex(2)}?query=Abc123`)
  })

  it('id поиска не из букв и цифр, ответ не объект, нет списка лотов — bad-response, без fetch', async () => {
    const run = async (
      search: unknown,
      fetched: unknown = { result: [] }
    ): Promise<{ code?: string; calls: number }> => {
      let calls = 0
      const res = await profilePrice(
        body,
        'L',
        async (r) => {
          calls++
          return { ok: true, data: (r.kind === 'search' ? search : fetched) as never }
        },
        () => ''
      )
      return { code: res.ok ? undefined : res.error.code, calls }
    }
    expect(await run('строка')).toEqual({ code: 'bad-response', calls: 1 })
    expect(await run(null)).toEqual({ code: 'bad-response', calls: 1 })
    expect(await run({ id: '../x', result: [hex(1)] })).toEqual({ code: 'bad-response', calls: 1 })
    expect(await run({ id: 'Q1', result: 'x' })).toEqual({ code: 'bad-response', calls: 1 })
    expect(await run({ id: 'Q1', result: [hex(1)] }, 'строка')).toEqual({ code: 'bad-response', calls: 2 })
    expect(
      await run({ id: 'Q1', result: [hex(1)] }, { result: [null, 'x', { listing: { price: { amount: 'x' } } }] })
    ).toEqual({ code: undefined, calls: 2 })
    // нет подходящих id лотов — fetch не нужен
    expect(await run({ id: 'Q1', result: ['x', 'y'], total: 2 })).toEqual({ code: undefined, calls: 1 })
  })
})
