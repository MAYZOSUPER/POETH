import { describe, expect, it } from 'vitest'
import type { RegexLang, VendorQuery } from '@shared/types'
import { buildVendorRegex, colorLinkPattern, compileSearch, emptyVendorQuery, linkPattern } from '@shared/regex'

// Торговец: синтетические подсказки предметов EN/RU через эмулятор поиска.

const TX: Record<
  RegexLang,
  {
    sockets: string
    move: (n: number) => string
    quality: (n: number) => string
    ilvl: string
    gem: (n: number) => string
    plus: string
    life: string
  }
> = {
  en: {
    sockets: 'Sockets: ',
    move: (n) => `${n}% increased Movement Speed`,
    quality: (n) => `Quality: +${n}% (augmented)`,
    ilvl: 'Item Level: 84',
    gem: (n) => `Level: ${n}${n >= 20 ? ' (Max)' : ''}`,
    plus: '+1 to Level of Socketed Gems',
    life: '+25 to maximum Life'
  },
  ru: {
    sockets: 'Гнезда: ',
    move: (n) => `${n}% повышение скорости передвижения`,
    quality: (n) => `Качество: +${n}% (augmented)`,
    ilvl: 'Уровень предмета: 84',
    gem: (n) => `Уровень: ${n}${n >= 20 ? ' (Макс.)' : ''}`,
    plus: '+1 к уровню размещённых камней',
    life: '+25 к максимуму здоровья'
  }
}

function item(lang: RegexLang, parts: { sockets?: string; lines?: string[]; ilvl?: boolean }): string {
  const tx = TX[lang]
  const out = [lang === 'en' ? 'Rarity: Rare' : 'Редкость: Редкий', 'Doom Stride', 'Leather Boots', '--------']
  if (parts.sockets) out.push(tx.sockets + parts.sockets, '--------')
  if (parts.ilvl !== false) out.push(tx.ilvl, '--------')
  out.push(tx.life, ...(parts.lines ?? []))
  return out.join('\n')
}

const q = (p: Partial<VendorQuery>): VendorQuery => ({ ...emptyVendorQuery(), ...p })

describe('шаблоны гнёзд', () => {
  it('связи', () => {
    expect(linkPattern(3)).toBe('-\\w-')
    expect(linkPattern(4)).toBe('-\\w-.-')
    expect(linkPattern(6)).toBe('-\\w-.-.-.-')
    expect(colorLinkPattern('b', 2)).toBe('b(-\\w)*-b')
  })
})

describe.each(['en', 'ru'] as RegexLang[])('торговец %s', (lang) => {
  const tx = TX[lang]
  const run = (query: Partial<VendorQuery>): ((text: string) => boolean) => {
    const r = buildVendorRegex(lang, q(query))
    expect(r.ok).toBe(true)
    return compileSearch(r.text)
  }

  it('пусто — пустая строка', () => {
    expect(buildVendorRegex(lang, emptyVendorQuery()).text).toBe('')
  })

  it('связи: 3/4/5/6-линк', () => {
    const cases: [string, number][] = [
      ['R-G', 2],
      ['R-G-B', 3],
      ['R-G B-B', 2],
      ['R-G-B-R', 4],
      ['B R-G-B-R', 4],
      ['R-G-B-R-G', 5],
      ['R-G-B-R-G-B', 6],
      ['R-G-B R-G-B', 3],
      ['R G B R G B', 1]
    ]
    for (const n of [3, 4, 5, 6] as const) {
      const match = run({ links: n })
      for (const [s, linked] of cases) expect(match(item(lang, { sockets: s })), `${n}L на ${s}`).toBe(linked >= n)
      expect(match(item(lang, {}))).toBe(false)
    }
  })

  it('R-G-B (хроматическая сфера)', () => {
    const match = run({ rgb: true })
    expect(match(item(lang, { sockets: 'B-R-G' }))).toBe(true)
    expect(match(item(lang, { sockets: 'R R-G-B-B' }))).toBe(true)
    expect(match(item(lang, { sockets: 'R-G B' }))).toBe(false)
    expect(match(item(lang, { sockets: 'R-R-G-G' }))).toBe(false)
  })

  it('2 синих в связке', () => {
    const match = run({ colorCount: 2, color: 'b' })
    expect(match(item(lang, { sockets: 'B-B' }))).toBe(true)
    expect(match(item(lang, { sockets: 'B-R-G-B' }))).toBe(true)
    expect(match(item(lang, { sockets: 'B-R B' }))).toBe(false)
    expect(match(item(lang, { sockets: 'R-G-B' }))).toBe(false)
  })

  it('6 гнёзд', () => {
    const match = run({ sixSockets: true })
    expect(match(item(lang, { sockets: 'R-G B-B R G' }))).toBe(true)
    expect(match(item(lang, { sockets: 'R-G-B-R-G-B' }))).toBe(true)
    expect(match(item(lang, { sockets: 'R-G B-B R' }))).toBe(false)
  })

  it('скорость передвижения ≥ 10 / ≥ 15', () => {
    for (const n of [10, 15]) {
      const match = run({ mods: { moveSpeed: n } })
      for (const v of [5, 9, 10, 14, 15, 20, 25, 30, 35]) {
        expect(match(item(lang, { lines: [tx.move(v)] })), `${n} на ${v}`).toBe(v >= n)
      }
      expect(match(item(lang, {}))).toBe(false)
    }
  })

  it('качество ≥ N', () => {
    const match = run({ quality: 10 })
    for (const v of [1, 9, 10, 15, 20, 23]) expect(match(item(lang, { lines: [tx.quality(v)] }))).toBe(v >= 10)
    expect(match(item(lang, { lines: [lang === 'en' ? 'Item Quantity: +80%' : 'Количество предметов: +80%'] }))).toBe(false)
  })

  it('+ к уровню камней', () => {
    const match = run({ plusGemLevel: true })
    expect(match(item(lang, { lines: [tx.plus] }))).toBe(true)
    expect(match(item(lang, {}))).toBe(false)
  })

  it('камни уровня ≥ 20: только камни, не «уровень предмета»', () => {
    const match = run({ gemLevel: 20 })
    const gem = (lvl: number): string =>
      [lang === 'en' ? 'Rarity: Gem' : 'Редкость: Камень', 'Fireball', tx.gem(lvl), tx.quality(20)].join('\n')
    expect(match(gem(20))).toBe(true)
    expect(match(gem(21))).toBe(true)
    expect(match(gem(19))).toBe(false)
    expect(match(gem(1))).toBe(false)
    expect(match(item(lang, {}))).toBe(false)
    // у снаряжения «Level: 64» / «Уровень: 64» в требованиях — не камень (S27: в RU раньше совпадало)
    const req = lang === 'en' ? ['Requirements:', 'Level: 64'] : ['Требования:', 'Уровень: 64']
    expect(match(item(lang, { lines: req }))).toBe(false)
  })

  it('«любое из» / «всё сразу»', () => {
    const any = run({ links: 4, mods: { moveSpeed: 15 } })
    const all = run({ links: 4, mods: { moveSpeed: 15 }, mode: 'all' })
    const fourL = item(lang, { sockets: 'R-G-B-B' })
    const fast = item(lang, { lines: [tx.move(20)] })
    const both = item(lang, { sockets: 'R-G-B-B', lines: [tx.move(20)] })
    expect([any(fourL), any(fast), any(both)]).toEqual([true, true, true])
    expect([all(fourL), all(fast), all(both)]).toEqual([false, false, true])
  })
})
