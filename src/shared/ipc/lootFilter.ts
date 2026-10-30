// IPC домена «Фильтр лута» (S53): фильтр NeverSink для PoE 1 — состояние экрана, проверка новой версии,
// установка в папку фильтров игры, выбор папки, ссылки на источник. Сеть и диск — только в main; renderer
// передаёт уровень/стиль/галочку «Перезаписать», путей и адресов не передаёт (кроме выбора папки — системный
// диалог в main). Каналы — только компаньону (COMPANION_CHANNELS в src/main/security/policy.ts).

import type {
  LootFilterInstallRequest,
  LootFilterInstallResult,
  LootFilterLink,
  LootFilterPrefs,
  LootFilterState
} from '../types/lootFilter'

export const lootFilterChannels = {
  lootFilter: {
    state: 'lootFilter:state',
    screenOpened: 'lootFilter:screenOpened',
    install: 'lootFilter:install',
    setPrefs: 'lootFilter:setPrefs',
    pickFolder: 'lootFilter:pickFolder',
    resetFolder: 'lootFilter:resetFolder',
    openFolder: 'lootFilter:openFolder',
    openLink: 'lootFilter:openLink'
  }
} as const

export const lootFilterEvents = {
  lootFilterState: 'event:lootFilter.state'
} as const

export interface LootFilterIpcApi {
  lootFilter: {
    state(): Promise<LootFilterState>
    /** экран открыт: проверить новую версию, если с прошлой проверки прошли сутки */
    screenOpened(): Promise<LootFilterState>
    /** «Установить» / «Обновить»: свежий релиз с GitHub, запись своего файла уровня */
    install(req: LootFilterInstallRequest): Promise<LootFilterInstallResult>
    setPrefs(prefs: Partial<LootFilterPrefs>): Promise<LootFilterState>
    /** системный диалог выбора папки фильтров */
    pickFolder(): Promise<LootFilterState>
    /** папка снова по умолчанию (Документы/My Games/Path of Exile) */
    resetFolder(): Promise<LootFilterState>
    /** открыть папку фильтров в Проводнике */
    openFolder(): Promise<void>
    /** открыть страницу NeverSink / лицензию / релиз / FilterBlade в браузере (точные адреса в main) */
    openLink(link: LootFilterLink): Promise<void>
  }
  onLootFilterState(cb: (state: LootFilterState) => void): () => void
}
