// Строки домена «язык клиента игры» (S26): строка в настройках. Названия языков («Русский», «English») —
// как в списке языка интерфейса, не переводятся.

import type { DomainDict } from '../types'

export const gameLang: DomainDict = {
  ru: {
    'glang.label': 'Язык клиента игры',
    'glang.auto': 'Авто (по игре)',
    'glang.note': 'Названия предметов и валют — на языке игры, как в игре. Пояснения — на языке интерфейса.',
    'glang.detected': 'Определено: {lang} ({by}).',
    'glang.by.item': 'по последнему предмету',
    'glang.by.log': 'по журналу игры',
    'glang.unknown': 'Пока не определено, поэтому как язык интерфейса ({lang}). Наведите курсор на любой предмет в игре и нажмите {key}.',
    'glang.unknown.nokey':
      'Пока не определено, поэтому как язык интерфейса ({lang}). Назначьте клавишу прайс-чека в настройках, наведите курсор на любой предмет в игре и нажмите её.',
    'glang.mismatch': 'Похоже, игра на другом языке: {lang} ({by}).',
    'glang.toAuto': 'Определять по игре'
  },
  en: {
    'glang.label': 'Game client language',
    'glang.auto': 'Auto (from the game)',
    'glang.note': 'Item and currency names follow the game language, as in the game. Explanations use the interface language.',
    'glang.detected': 'Detected: {lang} ({by}).',
    'glang.by.item': 'from the last item',
    'glang.by.log': 'from the game log',
    'glang.unknown': 'Not detected yet, so the interface language is used ({lang}). Hover over any item in the game and press {key}.',
    'glang.unknown.nokey':
      'Not detected yet, so the interface language is used ({lang}). Set the price check hotkey in Settings, then hover over any item in the game and press it.',
    'glang.mismatch': 'The game seems to be in another language: {lang} ({by}).',
    'glang.toAuto': 'Detect from the game'
  }
}
