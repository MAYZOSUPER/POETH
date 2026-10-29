import { describe, expect, it } from 'vitest'
import { atLeast } from '@shared/regex'

// atLeast(n) проверяем перебором: для каждого n = 0…999 и каждого значения v = 0…999
// строка свойства «…: +v%» должна совпадать ровно тогда, когда v ≥ n. Для n < 100
// дополнительно — длинные числа (до 9999): они совпадают «хвостом».

function check(n: number, v: number, re: RegExp, text: string): void {
  if (re.test(text) !== v >= n) throw new Error(`atLeast(${n}) = ${atLeast(n)} на «${text}»`)
}

describe('atLeast', () => {
  it('примеры из ТЗ', () => {
    expect(atLeast(80)).toBe('([89].|\\d..)')
    expect(atLeast(85)).toBe('(8[5-9]|9.|\\d..)')
    expect(atLeast(100)).toBe('[1-9]..')
    expect(atLeast(0)).toBe('\\d')
  })

  it('«<метка>.*<atLeast>%» верно для всех n 0–999 и v 0–999', () => {
    for (let n = 0; n <= 999; n++) {
      const re = new RegExp(`tity:.*${atLeast(n)}%`, 'i')
      for (let v = 0; v <= 999; v++) check(n, v, re, `Item Quantity: +${v}% (augmented)`)
    }
  })

  it('n < 100: длинные числа до 9999 тоже верно', () => {
    for (let n = 0; n < 100; n++) {
      const re = new RegExp(`tity:.*${atLeast(n)}%`, 'i')
      for (let v = 1000; v <= 9999; v += 7) check(n, v, re, `Item Quantity: +${v}%`)
    }
  })

  it('без «+» и с соседними строками: «.» не перескакивает через строку', () => {
    for (const n of [1, 9, 10, 50, 80, 85, 99, 100, 150, 999]) {
      const re = new RegExp(`tity:.*${atLeast(n)}%`, 'im')
      for (let v = 0; v <= 999; v++) {
        check(n, v, re, `Item Quantity: ${v}%\nItem Rarity: +999%\nMonster Pack Size: +999%`)
      }
    }
  })

  it('вариант с \\d (после числа нет «%»: «Level: 20 (Max)») — n 1–999, v 0–999', () => {
    for (let n = 1; n <= 999; n++) {
      const re = new RegExp(`evel: ${atLeast(n, { digit: '\\d' })}`, 'i')
      for (let v = 0; v <= 999; v++) check(n, v, re, `Level: ${v}${v % 2 ? ' (Max)' : ''}`)
    }
  })

  it('whole: число целиком между контекстом слева и справа («\\+…% to fire») — n 0–999, v 0–999', () => {
    for (const digit of ['.', '\\d'] as const) {
      for (let n = 0; n <= 999; n++) {
        const re = new RegExp(`\\+${atLeast(n, { digit, whole: true })}% to fire r`, 'i')
        for (let v = 0; v <= 999; v++) check(n, v, re, `+${v}% to Fire Resistance\n-${v + 50}% to Fire Resistance`)
      }
    }
    expect(atLeast(5, { whole: true })).toBe('([5-9]|\\d.|\\d..)')
    expect(atLeast(0, { whole: true })).toBe('\\d+')
  })

  it('вне диапазона — ошибка', () => {
    expect(() => atLeast(-1)).toThrow()
    expect(() => atLeast(1000)).toThrow()
    expect(() => atLeast(1.5)).toThrow()
  })
})
