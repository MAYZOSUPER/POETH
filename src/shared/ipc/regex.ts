// IPC домена «regex-строки» (S7): данные карт и предметов (S46) для движка, библиотека строк, копирование.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type {
  ItemRegexData,
  MapRegexData,
  PasteSlot,
  RegexEntryInput,
  RegexExportResult,
  RegexImportResult,
  RegexLang,
  RegexLibrary,
  RegexPrefs
} from '../types'

export const regexChannels = {
  regex: {
    mapData: 'regex:mapData',
    itemData: 'regex:itemData',
    library: 'regex:library',
    saveEntry: 'regex:saveEntry',
    deleteEntry: 'regex:deleteEntry',
    setSlot: 'regex:setSlot',
    setPrefs: 'regex:setPrefs',
    exportLibrary: 'regex:exportLibrary',
    importLibrary: 'regex:importLibrary',
    copy: 'regex:copy'
  }
} as const

export const regexEvents = {} as const

export interface RegexIpcApi {
  regex: {
    /** Данные карт для языка клиента (userData/data — обновление без переустановки, потом bundled). */
    mapData(lang: RegexLang): Promise<MapRegexData | null>
    /** Данные «Предметов» (S46): строки модов, базы, классы, влияние — так же, как данные карт. */
    itemData(lang: RegexLang): Promise<ItemRegexData | null>
    library(): Promise<RegexLibrary>
    /** Добавить (нет id) или изменить запись; строка длиннее 250 не сохраняется. */
    saveEntry(input: RegexEntryInput): Promise<RegexLibrary>
    deleteEntry(id: string): Promise<RegexLibrary>
    /** Назначить хоткей вставки pasteSearch1..5 (null — снять). */
    setSlot(id: string, slot: PasteSlot | null): Promise<RegexLibrary>
    /** Запомнить состояние страниц и язык клиента. */
    setPrefs(patch: Partial<RegexPrefs>): Promise<RegexLibrary>
    exportLibrary(): Promise<RegexExportResult>
    importLibrary(): Promise<RegexImportResult>
    /** Скопировать строку в буфер обмена. */
    copy(text: string): Promise<void>
  }
}
