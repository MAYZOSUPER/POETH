import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import type { ScreenFail } from '@shared/types/screen'
import { screen } from '../../src/renderer/src/i18n/dict/screen'
import { ROOT } from './helpers'

// Строки «цен поверх окон» (S68): виджет берёт их из своего словаря (до строки в агрегаторе), поэтому полноту
// проверяем здесь — как tests/i18n-usage.test.ts для остальных: каждый ключ виджета есть в RU и EN, причины отказа —
// все, в EN нет кириллицы.

const WIDGET = readFileSync(path.join(ROOT, 'src/renderer/src/overlay/screen/widget.tsx'), 'utf8')

describe('словарь screen', () => {
  it('каждый say(…) виджета есть в RU и EN', () => {
    const keys = [...WIDGET.matchAll(/\bsay\(\s*['"]([\w.-]+)['"]/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(8)
    for (const k of keys) {
      expect(screen.ru[k], k).toBeTruthy()
      expect(screen.en[k], k).toBeTruthy()
    }
  })

  it('все причины отказа', () => {
    const fails: ScreenFail[] = ['no-game', 'not-found', 'no-icons', 'error', 'unsupported']
    for (const f of fails) {
      expect(screen.ru[`scr.fail.${f}`]).toBeTruthy()
      expect(screen.en[`scr.fail.${f}`]).toBeTruthy()
    }
  })

  it('одинаковые ключи RU и EN, в EN нет кириллицы', () => {
    expect(Object.keys(screen.en).sort()).toEqual(Object.keys(screen.ru).sort())
    for (const [k, v] of Object.entries(screen.en)) expect(/[а-яё]/i.test(v), k).toBe(false)
  })
})
