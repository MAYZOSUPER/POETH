import { create } from 'zustand'
import { BUILD_GEMS_FILE, BUILD_TREE_FILE, parseGemsData, parseTreeData } from '@shared/build/data'
import type { GemsData, TreeData } from '@shared/build/types'
import { NO_FILTERS, type StarterFilters, type StarterSort, type StartersState } from '@shared/starters/view'
import type {
  BuildImportResult,
  BuildState,
  BuildTaken,
  PobStageEdits,
  StarterLinkKind,
  StarterPlayMode,
  StarterPlayResult
} from '@shared/types/build'

// Вкладка «Билд» (S39) в окне компаньона: библиотека билдов и открытый билд — из main (build:state + событие),
// «взято» по журналу — build:taken + событие, данные дерева и камней S36 — poeth://data/poe1/build/… (один раз
// на окно). Какой этап смотрит игрок — состояние окна: смотреть вперёд не значит менять текущий этап.
// Для S40 («Предметы этапа», «Против надетого»): активный билд — state.active, этап на экране — viewStage().
// S59: раздел «Мои билды · Стартеры», список стартеров лиги (build:starters), фильтры и сортировка — состояние окна;
// «Играть по этому гайду» и ссылки автора — по id записи (адреса знает только main).

export type ImportError = Exclude<BuildImportResult, { ok: true }>
export type StarterPlayFail = Exclude<StarterPlayResult, { ok: true }>

/** Раздел вкладки: свои билды (вставка, недавние, открытый) или стартеры лиги. */
export type BuildSection = 'mine' | 'starters'

/** Диалог «Играть по этому гайду»: подтверждение, загрузка PoB, ошибка. */
export interface StarterPlayDialog {
  id: string
  phase: 'confirm' | 'loading' | 'error'
  error?: StarterPlayFail
}

/** Итог последнего «Играть»: баннер «Автор обновил PoB…», «Добавлено в библиотеку». */
export interface StarterPlayDone {
  id: string
  mode: StarterPlayMode
  changed: boolean
  leveling: Extract<StarterPlayResult, { ok: true }>['leveling']
}

interface BuildStore {
  ready: boolean
  state: BuildState
  taken: BuildTaken | null
  tree: TreeData | null
  gems: GemsData | null
  /** данные дерева или камней не прочитались */
  dataError: boolean
  /** идёт вставка или загрузка по ссылке */
  busy: 'import' | 'reload' | null
  /** ошибка последней вставки или «Обновить по ссылке» и что было вставлено */
  error: ImportError | null
  errorFrom: 'import' | 'reload' | null
  input: string
  /** этап на экране (индекс в плане этапов); null — текущий */
  view: number | null
  section: BuildSection
  /** стартеры лиги; null — ещё не загружали */
  starters: StartersState | null
  startersLoading: boolean
  stFilters: StarterFilters
  stSort: StarterSort
  /** раскрытая карточка («Подробнее») */
  stOpen: string | null
  play: StarterPlayDialog | null
  played: StarterPlayDone | null

  init: () => Promise<() => void>
  setInput: (text: string) => void
  clearError: () => void
  importText: (text: string) => Promise<boolean>
  reload: () => Promise<boolean>
  open: (id: string | null) => Promise<void>
  remove: (id: string) => Promise<void>
  setEdits: (edits: PobStageEdits) => Promise<void>
  viewStage: (index: number | null) => void
  setSection: (section: BuildSection) => void
  loadStarters: () => Promise<void>
  setStFilters: (patch: Partial<StarterFilters>) => void
  resetStFilters: () => void
  setStSort: (sort: StarterSort) => void
  toggleStarter: (id: string) => void
  askPlay: (id: string) => void
  cancelPlay: () => void
  playStarter: (mode: StarterPlayMode) => Promise<boolean>
  clearPlayed: () => void
  openStarterLink: (id: string, kind: StarterLinkKind) => Promise<boolean>
}

const api = () => window.overlayApi.build

const DATA_BASE = 'poeth://data/poe1'

let treePromise: Promise<TreeData | null> | null = null
let gemsPromise: Promise<GemsData | null> | null = null

async function fetchJson(file: string): Promise<unknown> {
  const res = await fetch(`${DATA_BASE}/${file}`)
  if (!res.ok) throw new Error(`${file}: ${res.status}`)
  return res.json()
}

/** Камни S36 (170 КБ) — один раз на окно; нужен и оверлею (строка билда в гиде). */
export function loadBuildGems(): Promise<GemsData | null> {
  gemsPromise ??= fetchJson(BUILD_GEMS_FILE)
    .then(parseGemsData)
    .catch(() => null)
  return gemsPromise
}

/** Дерево S36 (760 КБ) — один раз на окно, только вкладке. */
export function loadBuildTree(): Promise<TreeData | null> {
  treePromise ??= fetchJson(BUILD_TREE_FILE)
    .then(parseTreeData)
    .catch(() => null)
  return treePromise
}

let subscribed: Promise<() => void> | null = null
let users = 0

export const useBuildStore = create<BuildStore>((set, get) => ({
  ready: false,
  state: { active: null, recent: [] },
  taken: null,
  tree: null,
  gems: null,
  dataError: false,
  busy: null,
  error: null,
  errorFrom: null,
  input: '',
  view: null,
  section: 'mine',
  starters: null,
  startersLoading: false,
  stFilters: NO_FILTERS,
  stSort: 'recommended',
  stOpen: null,
  play: null,
  played: null,

  init: async () => {
    users += 1
    if (!subscribed) {
      subscribed = (async () => {
        const offState = window.overlayApi.onBuildState((state) => {
          const prev = get().state.active?.id
          set({ state, ...(state.active?.id !== prev ? { view: null, error: null, errorFrom: null } : {}) })
        })
        const offTaken = window.overlayApi.onBuildTaken((taken) => set({ taken }))
        const [state, tree, gems] = await Promise.all([api().state(), loadBuildTree(), loadBuildGems()])
        set({ state, tree, gems, dataError: !tree || !gems, ready: true })
        void api()
          .taken()
          .then((taken) => set({ taken }))
          .catch(() => undefined)
        return () => {
          offState()
          offTaken()
        }
      })()
    }
    const off = await subscribed
    return () => {
      users -= 1
      if (users === 0) {
        off()
        subscribed = null
      }
    }
  },

  setInput: (input) => set({ input, error: null, errorFrom: null }),
  clearError: () => set({ error: null, errorFrom: null }),

  importText: async (text) => {
    if (get().busy) return false
    set({ busy: 'import', error: null, input: text })
    try {
      const res = await api().importPob(text)
      if (!res.ok) {
        set({ error: res, errorFrom: 'import' })
        return false
      }
      set({ state: res.state, input: '', view: null })
      return true
    } catch {
      set({ error: { ok: false, error: 'fetch', fetchError: 'network' }, errorFrom: 'import' })
      return false
    } finally {
      set({ busy: null })
    }
  },

  reload: async () => {
    const id = get().state.active?.id
    if (!id || get().busy) return false
    set({ busy: 'reload', error: null })
    try {
      const res = await api().reload(id)
      if (!res.ok) {
        set({ error: res, errorFrom: 'reload' })
        return false
      }
      set({ state: res.state })
      return true
    } finally {
      set({ busy: null })
    }
  },

  open: async (id) => {
    set({ state: await api().open(id), view: null, error: null, errorFrom: null })
  },

  remove: async (id) => {
    set({ state: await api().remove(id) })
  },

  setEdits: async (edits) => {
    const id = get().state.active?.id
    if (!id) return
    set({ state: await api().setEdits(id, edits) })
  },

  viewStage: (view) => set({ view }),

  setSection: (section) => {
    set({ section })
    if (section === 'starters') void get().loadStarters()
  },

  loadStarters: async () => {
    if (get().startersLoading) return
    set({ startersLoading: true })
    try {
      set({ starters: await api().starters() })
    } catch {
      set({ starters: { status: 'none', league: null, updatedAt: null, starters: [], previous: null, invalid: 0 } })
    } finally {
      set({ startersLoading: false })
    }
  },

  setStFilters: (patch) => {
    const next = { ...get().stFilters, ...patch }
    // восхождение — только вместе с классом
    if ('cls' in patch && patch.cls !== get().stFilters.cls) next.asc = null
    set({ stFilters: next })
  },
  resetStFilters: () => set({ stFilters: NO_FILTERS }),
  setStSort: (stSort) => set({ stSort }),
  toggleStarter: (id) => set({ stOpen: get().stOpen === id ? null : id }),

  askPlay: (id) => set({ play: { id, phase: 'confirm' } }),
  cancelPlay: () => {
    if (get().play?.phase !== 'loading') set({ play: null })
  },

  playStarter: async (mode) => {
    const play = get().play
    if (!play || play.phase === 'loading' || get().busy) return false
    set({ play: { id: play.id, phase: 'loading' }, played: null })
    let res: StarterPlayResult
    try {
      res = await api().playStarter(play.id, mode)
    } catch {
      res = { ok: false, error: 'fetch', fetchError: 'network' }
    }
    if (!res.ok) {
      set({ play: { id: play.id, phase: 'error', error: res } })
      return false
    }
    const done: StarterPlayDone = { id: play.id, mode, changed: res.changed, leveling: res.leveling }
    set({
      state: res.state,
      play: null,
      played: done,
      ...(mode === 'replace' ? { section: 'mine' as const, view: null, error: null, errorFrom: null } : {})
    })
    return true
  },
  clearPlayed: () => set({ played: null }),

  openStarterLink: async (id, kind) => {
    try {
      return await api().openStarterLink(id, kind)
    } catch {
      return false
    }
  }
}))
