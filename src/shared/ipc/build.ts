// IPC домена «Билд» (S39, B3): вставка кода или ссылки PoB, библиотека билдов (userData/builds.json), правки
// этапов, «взято» по журналу, дерево поверх игры (S38). Разбор кода и сеть — только в main; вставку и загрузку
// по ссылке может звать только компаньон (политика S29, COMPANION_CHANNELS в src/main/security/policy.ts).
// Соглашение: каналы '<домен>:<метод>', события 'event:<домен>.<имя>' (уникальность — tests/ipc.test.ts).

import type { BuildImportResult, BuildState, BuildTaken, BuildTreeResult, PobStageEdits } from '../types/build'

export const buildChannels = {
  build: {
    state: 'build:state',
    importPob: 'build:importPob',
    open: 'build:open',
    remove: 'build:remove',
    setEdits: 'build:setEdits',
    reload: 'build:reload',
    taken: 'build:taken',
    showTree: 'build:showTree'
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
  }
  onBuildState(cb: (state: BuildState) => void): () => void
  onBuildTaken(cb: (taken: BuildTaken) => void): () => void
}
