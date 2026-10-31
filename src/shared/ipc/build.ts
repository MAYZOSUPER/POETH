// IPC домена «Билд» (S39, B3): вставка кода или ссылки PoB, библиотека билдов (userData/builds.json), правки
// этапов, «взято» по журналу, дерево поверх игры (S38). Разбор кода и сеть — только в main; вставку и загрузку
// по ссылке может звать только компаньон (политика S29, COMPANION_CHANNELS в src/main/security/policy.ts).
// S59: «Стартеры» лиги — список из пакета данных, «Играть по этому гайду» и ссылки автора — по id записи
// (адресов окно не передаёт: их берёт main из проверенного списка); играть и открывать ссылки — только компаньон.
// S66: экран «Билд» PoE 2 — вставка PoB2, библиотека билдов PoE 2, «Сохранить в игру» (файл `.build` в папку игрового
// планировщика — только компаньон, по кнопке, после подтверждения пути; содержимое файла собирает main).
// Соглашение: каналы '<домен>:<метод>', события 'event:<домен>.<имя>' (уникальность — tests/ipc.test.ts).

import type {
  BuildImportResult,
  BuildState,
  BuildTaken,
  BuildTreeResult,
  PobStageEdits,
  StarterLinkKind,
  StarterPlayMode,
  StarterPlayResult,
  StartersState
} from '../types/build'
import type { Build2ImportResult, Build2SaveRequest, Build2SaveResult, Build2State } from '../types/build2'

export const buildChannels = {
  build: {
    state: 'build:state',
    importPob: 'build:importPob',
    open: 'build:open',
    remove: 'build:remove',
    setEdits: 'build:setEdits',
    reload: 'build:reload',
    taken: 'build:taken',
    showTree: 'build:showTree',
    starters: 'build:starters',
    playStarter: 'build:playStarter',
    openStarterLink: 'build:openStarterLink',
    poe2State: 'build:twoState',
    poe2Import: 'build:twoImport',
    poe2Open: 'build:twoOpen',
    poe2Remove: 'build:twoRemove',
    poe2Reload: 'build:twoReload',
    poe2Save: 'build:twoSave'
  }
} as const

export const buildEvents = {
  buildState: 'event:build.state',
  buildTaken: 'event:build.taken'
} as const

export interface BuildIpcApi {
  build: {
    /** флаг разработки POETH_BUILD=1 из preload (вкладка скрыта до v0.2, src/shared/build/flag.ts) */
    devFlag: boolean
    state(): Promise<BuildState>
    /** код PoB или ссылка (по ссылке — один запрос по нажатию); удачный билд сохраняется и открывается */
    importPob(text: string): Promise<BuildImportResult>
    /** открыть сохранённый билд; null — закрыть (пустое состояние, билд остаётся в недавних) */
    open(id: string | null): Promise<BuildState>
    remove(id: string): Promise<BuildState>
    /** правки этапов игрока (текущий этап, «с уровня», «в прокачке») */
    setEdits(id: string, edits: PobStageEdits): Promise<BuildState>
    /** загрузить заново по ссылке-источнику (правки этапов сохраняются) */
    reload(id: string): Promise<BuildImportResult>
    /** ноды по журналу у персонажа текущего входа */
    taken(): Promise<BuildTaken>
    /** этап для дерева поверх игры (индекс в плане этапов; null — по уровню) */
    showTree(stage: number | null): Promise<BuildTreeResult>
    /** S59: стартеры лиги (пакет данных, проверенные; вместо адресов — сайты ссылок) */
    starters(): Promise<StartersState>
    /** S59: «Играть по этому гайду» — PoB записи одним запросом; 'replace' — открыть, 'add' — только в библиотеку */
    playStarter(id: string, mode: StarterPlayMode): Promise<StarterPlayResult>
    /** S59: ссылка записи в системном браузере (адрес — из списка в main); false — ссылки нет */
    openStarterLink(id: string, kind: StarterLinkKind): Promise<boolean>
    /** S66: билды PoE 2 (только в режиме PoE 2) */
    poe2State(): Promise<Build2State>
    /** S66: код PoB2 или ссылка (по ссылке — один запрос по нажатию); удачный билд сохраняется и открывается */
    poe2Import(text: string): Promise<Build2ImportResult>
    /** S66: открыть сохранённый билд PoE 2; null — закрыть */
    poe2Open(id: string | null): Promise<Build2State>
    poe2Remove(id: string): Promise<Build2State>
    /** S66: загрузить заново по ссылке-источнику */
    poe2Reload(id: string): Promise<Build2ImportResult>
    /**
     * S66: «Сохранить в игру». Без confirm — только «куда и есть ли такой файл» (показать игроку); с confirm и тем же
     * fileName — запись; существующий файл заменяется только с overwrite.
     */
    poe2Save(req: Build2SaveRequest): Promise<Build2SaveResult>
  }
  onBuildState(cb: (state: BuildState) => void): () => void
  onBuildTaken(cb: (taken: BuildTaken) => void): () => void
}
