// POETH: строки клиента, которых нет в client_strings APT (нужны для обычного формата / текста с трейда).
// Проверены на реальных текстах EN/RU (tests/fixtures/poe1).

import type { Poe1Lang } from '../data/interfaces'

export interface ExtraStrings {
  /** секция требований: не моды */
  REQUIREMENTS: string
  /** заметка с ценой (`Note: ~price 1 chaos`) */
  NOTE: string
  /** маркер расколотого предмета (обычный формат — без суффикса у строк) */
  FRACTURED_ITEM: string
}

export const EXTRA_STRINGS: Readonly<Record<Poe1Lang, ExtraStrings>> = {
  en: {
    REQUIREMENTS: 'Requirements:',
    NOTE: 'Note: ',
    FRACTURED_ITEM: 'Fractured Item'
  },
  ru: {
    REQUIREMENTS: 'Требования:',
    NOTE: 'Примечание: ',
    FRACTURED_ITEM: 'Расколотый предмет'
  }
}
