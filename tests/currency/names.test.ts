import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  amountName,
  currencyName,
  currencyShort,
  declineRu,
  enIsOne,
  guessCurrencyTag,
  parseCurrencyTable,
  pluralEn,
  ruCount,
  ruGender
} from '@shared/currency'

const items = (lang: string): string => readFileSync(resolve(`resources/data/poe1/${lang}/items.ndjson`), 'utf8')
const RU = parseCurrencyTable(items('ru'))
const EN = parseCurrencyTable(items('en'))

describe('ruCount — форма после числа', () => {
  it.each([
    [1, 'one'],
    [21, 'one'],
    [101, 'one'],
    [11, 'many'],
    [2, 'few'],
    [3, 'few'],
    [24, 'few'],
    [12, 'many'],
    [14, 'many'],
    [5, 'many'],
    [0, 'many'],
    [149, 'many'],
    [1.5, 'frac'],
    [-3, 'few']
  ] as const)('%s → %s', (n, form) => expect(ruCount(n)).toBe(form))

  it.each([
    ['149,2', 'frac'],
    ['1 500', 'many'],
    ['≈ 3', 'few'],
    ['−21', 'one'],
    ['0,5', 'frac'],
    ['2 160', 'many'],
    ['', 'many']
  ] as const)('«%s» → %s', (s, form) => expect(ruCount(s)).toBe(form))
})

describe('declineRu — склонения по данным', () => {
  it('прилагательное + существительное (женский род)', () => {
    const n = 'Божественная сфера'
    expect(declineRu(n, 'one')).toBe('Божественная сфера')
    expect(declineRu(n, 'few')).toBe('Божественные сферы')
    expect(declineRu(n, 'many')).toBe('Божественных сфер')
    expect(declineRu(n, 'frac')).toBe('Божественной сферы')
    expect(declineRu(n, 'one', 'acc')).toBe('Божественную сферу')
  })

  it('существительное + хвост в родительном', () => {
    const n = 'Сфера хаоса'
    expect(declineRu(n, 'one')).toBe('Сфера хаоса')
    expect(declineRu(n, 'few')).toBe('Сферы хаоса')
    expect(declineRu(n, 'many')).toBe('Сфер хаоса')
    expect(declineRu(n, 'frac')).toBe('Сферы хаоса')
    expect(declineRu(n, 'one', 'acc')).toBe('Сферу хаоса')
    expect(declineRu(n, 'few', 'acc')).toBe('Сферы хаоса')
    expect(declineRu(n, 'many', 'acc')).toBe('Сфер хаоса')
  })

  it('родительный — «от N …»', () => {
    expect(declineRu('Божественная сфера', 'one', 'gen')).toBe('Божественной сферы')
    expect(declineRu('Божественная сфера', 'few', 'gen')).toBe('Божественных сфер')
    expect(declineRu('Сфера хаоса', 'many', 'gen')).toBe('Сфер хаоса')
    expect(declineRu('Сфера хаоса', 'frac', 'gen')).toBe('Сферы хаоса')
    expect(declineRu('Осколок зеркала', 'one', 'gen')).toBe('Осколка зеркала')
    expect(declineRu('Золото', 'many', 'gen')).toBe('Золота')
  })

  it.each([
    ['Сфера возвышения', 'Сферы возвышения', 'Сфер возвышения'],
    ['Зеркало Каландры', 'Зеркала Каландры', 'Зеркал Каландры'],
    ['Осколок зеркала', 'Осколка зеркала', 'Осколков зеркала'],
    ['Осколок хаоса', 'Осколка хаоса', 'Осколков хаоса'],
    ['Призма камнереза', 'Призмы камнереза', 'Призм камнереза'],
    ['Сфера ваал', 'Сферы ваал', 'Сфер ваал'],
    ['Резец картографа', 'Резца картографа', 'Резцов картографа'],
    ['Благодатная сфера', 'Благодатные сферы', 'Благодатных сфер'],
    ['Цветная сфера', 'Цветные сферы', 'Цветных сфер'],
    ['Золотое масло', 'Золотых масла', 'Золотых масел'],
    ['Скарабей', 'Скарабея', 'Скарабеев'],
    ['Татуировка', 'Татуировки', 'Татуировок'],
    ['Предсказание', 'Предсказания', 'Предсказаний'],
    ['Астролябия', 'Астролябии', 'Астролябий'],
    ['Сущность', 'Сущности', 'Сущностей'],
    ['Ключ', 'Ключа', 'Ключей']
  ])('%s → 2 %s, 5 %s', (name, few, many) => {
    expect(declineRu(name, 'few')).toBe(few)
    expect(declineRu(name, 'many')).toBe(many)
  })

  it('мужской и средний род: 2–4 — прилагательное в родительном множественного', () => {
    expect(declineRu('Золотой осколок', 'few')).toBe('Золотых осколка')
    expect(declineRu('Зубчатое ископаемое', 'few')).toBe('Зубчатых ископаемых')
    expect(declineRu('Зубчатое ископаемое', 'many')).toBe('Зубчатых ископаемых')
    expect(declineRu('Зубчатое ископаемое', 'frac')).toBe('Зубчатого ископаемого')
  })

  it('после г/к/х/ж/ш/щ/ч — «-ие/-их»', () => {
    expect(declineRu('Великая сфера', 'few')).toBe('Великие сферы')
    expect(declineRu('Великая сфера', 'many')).toBe('Великих сфер')
    expect(declineRu('Свежая сфера', 'frac')).toBe('Свежей сферы')
  })

  it('золото — неисчисляемое', () => {
    expect(declineRu('Золото', 'one')).toBe('Золото')
    expect(declineRu('Золото', 'few')).toBe('Золота')
    expect(declineRu('Золото', 'many')).toBe('Золота')
    expect(declineRu('Золото', 'frac')).toBe('Золота')
  })

  it('регистр первой буквы сохраняется, непонятное — как есть', () => {
    expect(declineRu('сфера хаоса', 'many')).toBe('сфер хаоса')
    expect(declineRu('Таранные кристаллы', 'many')).toBe('Таранные кристаллы')
    expect(declineRu('Chaos Orb', 'many')).toBe('Chaos Orb')
    expect(declineRu('', 'many')).toBe('')
  })

  it('все обменные сферы из данных склоняются без исключений и не теряют хвост', () => {
    for (const e of RU.values()) {
      if (!e.name.startsWith('Сфера ')) continue
      expect(declineRu(e.name, 'many')).toBe(e.name.replace(/^Сфера/, 'Сфер'))
    }
  })

  it('род для глагола', () => {
    expect(ruGender('Божественная сфера')).toBe('f')
    expect(ruGender('Осколок зеркала')).toBe('m')
    expect(ruGender('Зеркало Каландры')).toBe('n')
    expect(ruGender('Золото')).toBe('n')
  })
})

describe('pluralEn', () => {
  it.each([
    ['Chaos Orb', 1, 'Chaos Orb'],
    ['Chaos Orb', 149, 'Chaos Orbs'],
    ['Chaos Orb', 1.5, 'Chaos Orbs'],
    ['Divine Orb', '1', 'Divine Orb'],
    ['Divine Orb', '≈ 2', 'Divine Orbs'],
    ['Orb of Alchemy', 5, 'Orbs of Alchemy'],
    ['Mirror of Kalandra', 2, 'Mirrors of Kalandra'],
    ["Gemcutter's Prism", 3, "Gemcutter's Prisms"],
    ['Chaos Shard', 20, 'Chaos Shards'],
    ['Essence of Greed', 2, 'Essences of Greed']
  ] as const)('%s × %s → %s', (name, n, out) => expect(pluralEn(name, n)).toBe(out))

  it('золото не меняется, «1,500» — не одна штука', () => {
    expect(pluralEn('Gold', 1500, true)).toBe('Gold')
    expect(enIsOne('1,500')).toBe(false)
    expect(enIsOne('1')).toBe(true)
    expect(enIsOne(1.0)).toBe(true)
  })
})

describe('таблица валют по языку данных', () => {
  it('имя — на языке данных, тег и иконка общие', () => {
    expect(currencyName(RU, 'divine', 'ru')).toBe('Божественная сфера')
    expect(currencyName(EN, 'divine', 'en')).toBe('Divine Orb')
    expect(currencyName(RU, 'chaos', 'ru')).toBe('Сфера хаоса')
    expect(currencyName(EN, 'exalted', 'en')).toBe('Exalted Orb')
    expect(RU.get('chaos')?.refName).toBe('Chaos Orb')
    expect(RU.get('divine')?.icon).toBe(EN.get('divine')?.icon)
    expect(RU.get('divine')?.icon).toMatch(/^https:\/\/web\.poecdn\.com\/gen\/image\//)
  })

  it('золота нет в данных — своё имя; неизвестное — null', () => {
    expect(RU.has('gold')).toBe(false)
    expect(currencyName(RU, 'gold', 'ru')).toBe('золото')
    expect(currencyName(EN, 'gold', 'en')).toBe('gold')
    expect(currencyName(EN, 'no-such-tag', 'en')).toBeNull()
    expect(currencyName(null, 'chaos', 'ru')).toBeNull()
  })

  it('битые строки пропускаются, первая запись тега главнее', () => {
    const t = parseCurrencyTable(
      ['{"name":"A","refName":"A","tradeTag":"x"}', '{oops "tradeTag":"y"', '{"name":"B","tradeTag":"x"}', '{"name":"C","tradeTag":"z","icon":"u"}'].join('\n')
    )
    expect([...t.keys()]).toEqual(['x', 'z'])
    expect(t.get('x')?.name).toBe('A')
    expect(t.get('z')).toEqual({ tag: 'z', name: 'C', refName: 'C', icon: 'u' })
  })

  it('фраза с числом', () => {
    expect(`1 ${amountName(currencyName(RU, 'divine', 'ru')!, 1, 'ru')} = 149 ${amountName(currencyName(RU, 'chaos', 'ru')!, 149, 'ru')}`).toBe(
      '1 Божественная сфера = 149 Сфер хаоса'
    )
    expect(amountName('Сфера хаоса', '2', 'ru')).toBe('Сферы хаоса')
    expect(amountName('Сфера хаоса', 1, 'ru', 'chaos', 'acc')).toBe('Сферу хаоса')
    expect(amountName('Chaos Orb', 2, 'en')).toBe('Chaos Orbs')
    expect(amountName('Gold', 1200, 'en', 'gold')).toBe('Gold')
    expect(amountName('Золото', 1200, 'ru', 'gold')).toBe('Золота')
  })

  it('короткие подписи', () => {
    expect(currencyShort('divine')).toBe('div')
    expect(currencyShort('chaos')).toBe('c')
    expect(currencyShort('alch')).toBe('alch')
  })
})

describe('guessCurrencyTag — цена из шёпота', () => {
  it.each([
    ['chaos', 'chaos'],
    ['divine', 'divine'],
    ['div', 'divine'],
    ['Сфера хаоса', 'chaos'],
    ['Сфер хаоса', 'chaos'],
    ['Божественных сфер', 'divine'],
    ['exalted', 'exalted'],
    ['Mirror of Kalandra', 'mirror'],
    ['mirror shard', 'mirror-shard'],
    ['Осколок хаоса', 'chaos-shard'],
    ['alch', 'alch'],
    ['Orb of Alchemy', 'alch'],
    ['Сфера алхимии', 'alch'],
    ['', null],
    ['beer', null]
  ] as const)('«%s» → %s', (text, tag) => expect(guessCurrencyTag(text, [RU, EN])).toBe(tag))
})
