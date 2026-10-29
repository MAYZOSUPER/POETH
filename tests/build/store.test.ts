import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuildImportResult, BuildState, BuildTaken, StoredBuild } from '@shared/types/build'

// стор — файл renderer (нужен DOM): импорт по строке, чтобы tsc тестов не тянул renderer (как tests/campaign/firstRun)
const STORE = '../../src/renderer/src/store/useBuildStore'

interface StoreState {
  ready: boolean
  dataError: boolean
  tree: unknown
  gems: unknown
  taken: BuildTaken | null
  state: BuildState
  input: string
  busy: string | null
  error: unknown
  view: number | null
  init(): Promise<() => void>
  setInput(text: string): void
  importText(text: string): Promise<boolean>
  setEdits(edits: StoredBuild['edits']): Promise<void>
  viewStage(index: number | null): void
}

async function loadStore(): Promise<{ getState(): StoreState }> {
  const mod = (await import(/* @vite-ignore */ STORE)) as { useBuildStore: { getState(): StoreState } }
  return mod.useBuildStore
}

// Стор вкладки «Билд» (S39, renderer): состояние из main и событие, данные S36 по poeth://, вставка с ошибкой и без,
// «смотрю этап» сбрасывается при смене билда.

const TREE = { v: 1, meta: {}, constants: { orbitRadii: [0], skillsPerOrbit: [1] }, classes: [], alt: [], groups: {}, names: [], lines: [], stats: [], masteries: {}, nodes: {} }
const GEMS = { v: 1, meta: {}, classes: [], req: [], quests: {}, npcs: {}, gems: {} }

function stored(id: string): StoredBuild {
  return { id, build: { game: 'poe1' } as StoredBuild['build'], source: { kind: 'code' }, edits: {}, addedAt: 1, openedAt: 1 }
}

function setup(over: Partial<Record<string, unknown>> = {}) {
  let onState: ((s: BuildState) => void) | null = null
  let onTaken: ((t: BuildTaken) => void) | null = null
  const offState = vi.fn()
  const build = {
    devFlag: true,
    state: vi.fn(async (): Promise<BuildState> => ({ active: null, recent: [] })),
    importPob: vi.fn(async (): Promise<BuildImportResult> => ({ ok: false, error: 'not-pob' })),
    open: vi.fn(async (id: string | null): Promise<BuildState> => ({ active: id ? stored(id) : null, recent: [] })),
    remove: vi.fn(),
    setEdits: vi.fn(async (_id: string, edits: StoredBuild['edits']) => ({ active: { ...stored('a'), edits }, recent: [] })),
    reload: vi.fn(),
    taken: vi.fn(async (): Promise<BuildTaken> => ({ character: 'Ведьма', taken: ['x'], removed: [], log: true })),
    showTree: vi.fn(),
    ...over
  }
  vi.stubGlobal('window', {
    overlayApi: {
      build,
      onBuildState: (cb: (s: BuildState) => void) => ((onState = cb), offState),
      onBuildTaken: (cb: (t: BuildTaken) => void) => ((onTaken = cb), vi.fn())
    }
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => (url.endsWith('tree.json') ? TREE : GEMS) }))
  )
  return { build, offState, emit: (s: BuildState) => onState?.(s), taken: (t: BuildTaken) => onTaken?.(t) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('useBuildStore', () => {
  it('init: состояние из main, данные S36 по poeth://data/poe1/build/…, «взято»; отписка с последним', async () => {
    const env = setup()
    const useBuildStore = await loadStore()
    const off = await useBuildStore.getState().init()
    const s = useBuildStore.getState()
    expect(s.ready).toBe(true)
    expect(s.dataError).toBe(false)
    expect(s.tree).not.toBeNull()
    expect(s.gems).not.toBeNull()
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      'poeth://data/poe1/build/tree.json',
      'poeth://data/poe1/build/gems.json'
    ])
    await vi.waitFor(() => expect(useBuildStore.getState().taken?.character).toBe('Ведьма'))
    env.taken({ character: 'Другой', taken: [], removed: [], log: true })
    expect(useBuildStore.getState().taken?.character).toBe('Другой')
    off()
    expect(env.offState).toHaveBeenCalled()
  })

  it('данные не прочитались — dataError, вкладка всё равно открывается', async () => {
    setup()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    const useBuildStore = await loadStore()
    await useBuildStore.getState().init()
    expect(useBuildStore.getState()).toMatchObject({ ready: true, dataError: true, tree: null, gems: null })
  })

  it('вставка: ошибка — текст остаётся в поле; удачно — поле пустое, билд открыт', async () => {
    const env = setup()
    const useBuildStore = await loadStore()
    await useBuildStore.getState().init()
    expect(await useBuildStore.getState().importText('привет')).toBe(false)
    expect(useBuildStore.getState()).toMatchObject({ input: 'привет', busy: null, error: { ok: false, error: 'not-pob' } })
    useBuildStore.getState().setInput('eNo…')
    expect(useBuildStore.getState().error).toBeNull()
    env.build.importPob.mockResolvedValueOnce({ ok: true, state: { active: stored('b1'), recent: [] } })
    expect(await useBuildStore.getState().importText('eNo…')).toBe(true)
    expect(useBuildStore.getState()).toMatchObject({ input: '', error: null, state: { active: { id: 'b1' } } })
  })

  it('этап на экране: смотреть вперёд; другой билд (событие main) — снова текущий', async () => {
    const env = setup()
    const useBuildStore = await loadStore()
    await useBuildStore.getState().init()
    env.emit({ active: stored('a'), recent: [] })
    useBuildStore.getState().viewStage(3)
    env.emit({ active: { ...stored('a'), edits: { current: 'spec:1' } }, recent: [] })
    expect(useBuildStore.getState().view).toBe(3)
    env.emit({ active: stored('b'), recent: [] })
    expect(useBuildStore.getState().view).toBeNull()
  })

  it('правки этапов уходят в main для открытого билда', async () => {
    const env = setup()
    const useBuildStore = await loadStore()
    await useBuildStore.getState().init()
    await useBuildStore.getState().setEdits({ current: 'spec:2' })
    expect(env.build.setEdits).not.toHaveBeenCalled()
    env.emit({ active: stored('a'), recent: [] })
    await useBuildStore.getState().setEdits({ current: 'spec:2' })
    expect(env.build.setEdits).toHaveBeenCalledWith('a', { current: 'spec:2' })
    expect(useBuildStore.getState().state.active?.edits).toEqual({ current: 'spec:2' })
  })
})
