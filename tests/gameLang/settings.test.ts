import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { applySettingsPatch, defaultSettings, migrateSettings } from '@shared/settings'
import { legacyRegexChoice } from '@shared/gameLang'
import type { GameLangSettings } from '@shared/types'

// Settings v2, поле gameLang (S26): дефолт, старые файлы без поля, мусор, патч; перенос regex prefs.gameLang.

const AUTO: GameLangSettings = { choice: 'auto', detected: null }
const DET = { lang: 'en', by: 'item', at: 1_700_000_000_000 } as const

describe('Settings.gameLang', () => {
  it('по умолчанию — «авто», ничего не определено', () => {
    expect(defaultSettings().gameLang).toEqual(AUTO)
  })

  it('settings.json компаса (v1) → «авто»', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/settings/v1-exile-companion.json'), 'utf8'))
    expect(migrateSettings(raw).gameLang).toEqual(AUTO)
  })

  it('v2 до S26 (поля нет) → «авто», остальное как было', () => {
    const s = migrateSettings({ schemaVersion: 2, uiLang: 'en', nameLang: 'ru', regex: { foo: 1 } })
    expect(s.gameLang).toEqual(AUTO)
    expect(s.uiLang).toBe('en')
    expect(s.nameLang).toBe('ru')
  })

  it('сохранённый выбор и определение читаются как есть', () => {
    const s = migrateSettings({ schemaVersion: 2, gameLang: { choice: 'ru', detected: DET } })
    expect(s.gameLang).toEqual({ choice: 'ru', detected: DET })
  })

  it.each([
    ['не объект', 'en'],
    ['чужой язык', { choice: 'de', detected: null }],
    ['определение с чужим языком', { choice: 'auto', detected: { ...DET, lang: 'de' } }],
    ['определение без источника', { choice: 'auto', detected: { lang: 'en', at: 1 } }],
    ['определение с неизвестным источником', { choice: 'auto', detected: { ...DET, by: 'config' } }],
    ['время — не число', { choice: 'auto', detected: { ...DET, at: '1' } }],
    ['время — NaN', { choice: 'auto', detected: { ...DET, at: Number.NaN } }],
    ['определение — строка', { choice: 'auto', detected: 'en' }]
  ])('мусор: %s → «авто» без определения', (_name, gameLang) => {
    expect(migrateSettings({ schemaVersion: 2, gameLang }).gameLang).toEqual(AUTO)
  })

  it('мусор в определении не сбрасывает ручной выбор', () => {
    expect(migrateSettings({ schemaVersion: 2, gameLang: { choice: 'en', detected: 42 } }).gameLang).toEqual({
      choice: 'en',
      detected: null
    })
  })

  it('патч выбора не стирает определение, патч определения — выбор', () => {
    const base = applySettingsPatch(defaultSettings(), { gameLang: { detected: DET } })
    expect(base.gameLang).toEqual({ choice: 'auto', detected: DET })
    const chosen = applySettingsPatch(base, { gameLang: { choice: 'ru' } })
    expect(chosen.gameLang).toEqual({ choice: 'ru', detected: DET })
    const again = applySettingsPatch(chosen, { gameLang: { detected: { ...DET, lang: 'ru', at: DET.at + 1 } } })
    expect(again.gameLang.choice).toBe('ru')
    expect(again.gameLang.detected?.lang).toBe('ru')
  })

  it('патч не может записать мусор', () => {
    const s = applySettingsPatch(defaultSettings(), { gameLang: { choice: 'de' as never } })
    expect(s.gameLang).toEqual(AUTO)
  })
})

describe('перенос prefs.gameLang вкладки Regex (до S26)', () => {
  it.each([
    // мастер ставил «как интерфейс» по умолчанию — такое не отличить от «не трогал»: остаётся «авто»
    ['ru', 'ru', null],
    ['en', 'en', null],
    // другой язык — осознанный выбор
    ['en', 'ru', 'en'],
    ['ru', 'en', 'ru'],
    // старого значения нет
    [null, 'ru', null],
    ['auto', 'ru', null],
    ['de', 'ru', null]
  ] as const)('regex %s, интерфейс %s → %s', (legacy, ui, want) => {
    expect(legacyRegexChoice(legacy, AUTO, ui)).toBe(want)
  })

  it('уже выбранный вручную язык не перезаписывается', () => {
    expect(legacyRegexChoice('en', { choice: 'ru', detected: null }, 'ru')).toBeNull()
  })
})
