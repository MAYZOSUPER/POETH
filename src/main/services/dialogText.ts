import type { UiLang } from '@shared/types'
import { getSettings } from './settingsStore'

// Заголовки системных диалогов «Сохранить / Открыть» (S42) — на языке интерфейса POETH, а не всегда
// по-русски: у main нет i18n renderer (как services/notify.ts). Чистая часть — dialogTitle (тесты).

const TITLES = {
  ru: {
    regexExport: 'Экспорт regex-строк',
    regexImport: 'Импорт regex-строк',
    profileExport: 'Экспорт профиля',
    profileImport: 'Импорт профиля',
    /** кампания PoE 2 */
    clientLog: 'Выберите Client.txt',
    /** «Сделки» PoE 1 */
    clientLogPoe: 'Выберите Client.txt Path of Exile',
    dealsExport: 'Экспорт истории сделок'
  },
  en: {
    regexExport: 'Export regex strings',
    regexImport: 'Import regex strings',
    profileExport: 'Export profile',
    profileImport: 'Import profile',
    clientLog: 'Choose Client.txt',
    clientLogPoe: 'Choose the Path of Exile Client.txt',
    dealsExport: 'Export trade history'
  }
} as const

export type DialogTitle = keyof (typeof TITLES)['ru']

export function dialogTitle(lang: UiLang | undefined, key: DialogTitle): string {
  return TITLES[lang === 'en' ? 'en' : 'ru'][key]
}

/** Язык интерфейса из настроек ('ru', если настройки не прочитались). */
export async function uiLang(): Promise<UiLang> {
  try {
    return (await getSettings()).uiLang === 'en' ? 'en' : 'ru'
  } catch {
    return 'ru'
  }
}

/** Заголовок диалога на текущем языке интерфейса. */
export async function uiDialogTitle(key: DialogTitle): Promise<string> {
  return dialogTitle(await uiLang(), key)
}
