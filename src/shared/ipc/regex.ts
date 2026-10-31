// IPC домена «regex-строки» (S7): данные карт и предметов (S46) для движка, библиотека строк, копирование.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type {
  ItemRegexData,
  MapRegexData,
  PasteSlot,
  Poe2PriceResult,
  Poe2ProfileInput,
  Poe2RegexData,
  Poe2RegexPrefs,
  Poe2RegexState,
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
    copy: 'regex:copy',
    // PoE 2 (S62): данные, настройки страниц и профили, «Цена по профилю»
    poe2Data: 'regex:poe2Data',
    poe2State: 'regex:poe2State',
    poe2SetPrefs: 'regex:poe2SetPrefs',
    poe2SaveProfile: 'regex:poe2SaveProfile',
    poe2DeleteProfile: 'regex:poe2DeleteProfile',
    poe2Price: 'regex:poe2Price'
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
    /** PoE 2 (S62): путевые камни, плитки, торговец для языка клиента (userData/data, потом bundled). */
    poe2Data(lang: RegexLang): Promise<Poe2RegexData | null>
    /** Настройки страниц PoE 2 и профили «что нужно» (regex-poe2.json). */
    poe2State(): Promise<Poe2RegexState>
    poe2SetPrefs(patch: Partial<Poe2RegexPrefs>): Promise<Poe2RegexState>
    /** Добавить (нет id) или изменить профиль. */
    poe2SaveProfile(input: Poe2ProfileInput): Promise<Poe2RegexState>
    poe2DeleteProfile(id: string): Promise<Poe2RegexState>
    /**
     * «Цена по профилю»: по клику ровно один поиск trade2 (статус available) + одна страница лотов, через шлюз.
     * body — тело из profileTradeQuery (main проверяет форму и сам ставит статус).
     */
    poe2Price(body: unknown): Promise<Poe2PriceResult>
  }
}
