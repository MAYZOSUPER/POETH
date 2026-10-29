import { create } from 'zustand'
import { BUILD_GEMS_FILE, BUILD_TREE_FILE, parseGemsData, parseTreeData } from '@shared/build/data'
import type { GemsData, TreeData } from '@shared/build/types'
import type { BuildImportResult, BuildState, BuildTaken, PobStageEdits } from '@shared/types/build'

// Вкладка «Билд» (S39) в окне компаньона: библиотека билдов и открытый билд — из main (build:state + событие),
// «взято» по журналу — build:taken + событие, данные дерева и камней S36 — poeth://data/poe1/build/… (один раз
// на окно). Какой этап смотрит игрок — состояние окна: смотреть вперёд не значит менять текущий этап.
// Для S40 («Предметы этапа», «Против надетого»): активный билд — state.active, этап на экране — viewStage().

export type ImportError = Exclude<BuildImportResult, { ok: true }>

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
  /** ошибка последней вставки и что было вставлено */
  error: ImportError | null
  input: string
  /** этап на экране (индекс в плане этапов); null — текущий */
  view: number | null

  init: () => Promise<() => void>
  setInput: (text: string) => void
  importText: (text: string) => Promise<boolean>
  reload: () => Promise<boolean>
  open: (id: string | null) => Promise<void>
  remove: (id: string) => Promise<void>
  setEdits: (edits: PobStageEdits) => Promise<void>
  viewStage: (index: number | null) => void
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
  input: '',
  view: null,

  init: async () => {
    users += 1
    if (!subscribed) {
      subscribed = (async () => {
        const offState = window.overlayApi.onBuildState((state) => {
          const prev = get().state.active?.id
          set({ state, ...(state.active?.id !== prev ? { view: null } : {}) })
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

  setInput: (input) => set({ input, error: null }),

  importText: async (text) => {
    if (get().busy) return false
    set({ busy: 'import', error: null, input: text })
    try {
      const res = await api().importPob(text)
      if (!res.ok) {
        set({ error: res })
        return false
      }
      set({ state: res.state, input: '', view: null })
      return true
    } catch {
      set({ error: { ok: false, error: 'fetch', fetchError: 'network' } })
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
        set({ error: res })
        return false
      }
      set({ state: res.state })
      return true
    } finally {
      set({ busy: null })
    }
  },

  open: async (id) => {
    set({ state: await api().open(id), view: null, error: null })
  },

  remove: async (id) => {
    set({ state: await api().remove(id) })
  },

  setEdits: async (edits) => {
    const id = get().state.active?.id
    if (!id) return
    set({ state: await api().setEdits(id, edits) })
  },

  viewStage: (view) => set({ view })
}))
