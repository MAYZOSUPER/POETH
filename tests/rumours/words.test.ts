import { describe, expect, it } from 'vitest'
import { rumours } from '../../src/renderer/src/i18n/dict/rumours'

// Слова тира (S65, замечание дизайнера 01.11): у нескольких видимых слухов может быть одинаковый высокий тир, а «Бери»
// — один. Поэтому тир — «сильный / средний / слабый» (оценка острова вообще), а не «лучший»: «лучший» — только «Бери».

describe('слова тира', () => {
  it('RU: слабый, средний, сильный', () => {
    expect([1, 2, 3].map((n) => rumours.ru[`rumours.tier.${n}`])).toEqual(['слабый', 'средний', 'сильный'])
  })

  it('EN: weak, medium, strong', () => {
    expect([1, 2, 3].map((n) => rumours.en[`rumours.tier.${n}`])).toEqual(['weak', 'medium', 'strong'])
  })

  it('тир не называет слух лучшим — это слово только у «Бери»', () => {
    for (const n of [1, 2, 3]) {
      expect(rumours.ru[`rumours.tier.${n}`]).not.toMatch(/лучш/i)
      expect(rumours.en[`rumours.tier.${n}`]).not.toMatch(/best/i)
    }
    expect(rumours.ru['rumours.tier.hint']).toContain('«Бери»')
    expect(rumours.en['rumours.tier.hint']).toContain('“Take”')
  })
})
