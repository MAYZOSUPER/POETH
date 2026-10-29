import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { amountNameIn, currencyNameLang, currencyNames, parseCurrencyTable } from '@shared/currency'
import type { GameLang, UiLang } from '@shared/types'

// Названия валют на языке клиента игры, текст — на языке интерфейса (S26): все 4 сочетания интерфейс × игра.

const items = (lang: string): string => readFileSync(resolve(`resources/data/poe1/${lang}/items.ndjson`), 'utf8')
const TABLE = { ru: parseCurrencyTable(items('ru')), en: parseCurrencyTable(items('en')) }
const names = (ui: UiLang, game: GameLang) => currencyNames(TABLE[game], game, ui)
/** «1 X = 340 Y» — строка курса в простом режиме «Обмена» */
const rate = (ui: UiLang, game: GameLang): string => {
  const n = names(ui, game)
  return `1 ${n.after('divine', 1)} = 340 ${n.after('chaos', '340')}`
}

describe('интерфейс × язык клиента', () => {
  it('RU + RU: русские имена с падежами', () => {
    const n = names('ru', 'ru')
    expect(rate('ru', 'ru')).toBe('1 Божественная сфера = 340 Сфер хаоса')
    expect(n.name('divine')).toBe('Божественная сфера')
    expect(n.after('chaos', 1, 'acc')).toBe('Сферу хаоса')
    expect(n.after('chaos', 2, 'gen')).toBe('Сфер хаоса')
    expect(n.after('chaos', '1,5')).toBe('Сферы хаоса')
    expect(n.after('gold', '1 500')).toBe('золота')
  })

  it('RU + EN: английские имена как в игре — без падежей и окончаний; пояснения (золото) по-русски', () => {
    const n = names('ru', 'en')
    expect(rate('ru', 'en')).toBe('1 Divine Orb = 340 Chaos Orb')
    expect(n.name('chaos')).toBe('Chaos Orb')
    expect(n.after('chaos', 1, 'acc')).toBe('Chaos Orb')
    expect(n.after('chaos', 2, 'gen')).toBe('Chaos Orb')
    expect(n.after('alch', 5)).toBe('Orb of Alchemy')
    expect(n.name('gold')).toBe('золото')
    expect(n.after('gold', '1 500')).toBe('золота')
  })

  it('EN + EN: английские имена с множественным числом', () => {
    const n = names('en', 'en')
    expect(rate('en', 'en')).toBe('1 Divine Orb = 340 Chaos Orbs')
    expect(n.after('alch', 5)).toBe('Orbs of Alchemy')
    expect(n.after('chaos', 1, 'acc')).toBe('Chaos Orb')
    expect(n.after('gold', '1,500')).toBe('gold')
  })

  it('EN + RU: русские имена согласуются с числом, но без падежей английского текста; золото по-английски', () => {
    const n = names('en', 'ru')
    expect(rate('en', 'ru')).toBe('1 Божественная сфера = 340 Сфер хаоса')
    expect(n.after('chaos', 1, 'acc')).toBe('Сфера хаоса')
    expect(n.after('chaos', 2, 'gen')).toBe('Сферы хаоса')
    expect(n.after('divine', 5)).toBe('Божественных сфер')
    expect(n.name('gold')).toBe('gold')
  })

  it('таблица ещё грузится — короткое имя', () => {
    const n = currencyNames(null, 'en', 'ru')
    expect(n.name('divine')).toBe('div')
    expect(n.after('chaos', 5)).toBe('c')
  })
})

describe('язык названия и склонение', () => {
  it('предметы — на языке клиента, золото — на языке текста', () => {
    expect(currencyNameLang('divine', 'en', 'ru')).toBe('en')
    expect(currencyNameLang('chaos', 'ru', 'en')).toBe('ru')
    expect(currencyNameLang('gold', 'en', 'ru')).toBe('ru')
    expect(currencyNameLang('gold', 'ru', 'en')).toBe('en')
  })

  it.each([
    ['Chaos Orb', 5, 'en', 'ru', 'acc', 'Chaos Orb'],
    ['Chaos Orb', 5, 'en', 'en', 'nom', 'Chaos Orbs'],
    ['Сфера хаоса', 5, 'ru', 'en', 'acc', 'Сфер хаоса'],
    ['Сфера хаоса', 1, 'ru', 'ru', 'acc', 'Сферу хаоса']
  ] as const)('%s ×%s (имя %s, текст %s, %s) → %s', (name, n, nameLang, textLang, c, want) => {
    expect(amountNameIn(name, n, nameLang, textLang, '', c)).toBe(want)
  })
})
