import { create } from 'zustand'
import type { GameId } from '@shared/games'
import { GUIDE_DIR, type GuideArticle } from '@shared/guide/article'
import { loadGuide, markAllSeen, markSeen, readSeen, writeSeen, type GuideLoad, type GuideSeen } from '@shared/guide/library'

// «Справочник» (S55): статьи читаются из данных приложения poeth://data/<игра>/guide/<файл> — протокол отдаёт
// обновлённый каналом данных файл (userData/data), иначе встроенный. Проверка — @shared/guide (строгий валидатор).
// Прочитанное (id → ревизия) — в localStorage окна: по нему «новое / обновлено» и число на пункте рельса.

type Status = 'idle' | 'loading' | 'ready'

interface GuideState {
  status: Status
  game: GameId | null
  articles: GuideArticle[]
  failed: GuideLoad['failed']
  newer: string[]
  noIndex: boolean
  seen: GuideSeen
  /** открытая статья и раздел, к которому прокрутить */
  open: { id: string; section: string | null; seenRev: number | undefined } | null
  query: string
  init: (game: GameId) => Promise<void>
  reload: () => Promise<void>
  openArticle: (id: string, section?: string | null) => void
  close: () => void
  setQuery: (q: string) => void
  readAll: () => void
}

const storage = (): Storage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

async function readFile(game: GameId, file: string): Promise<string | null> {
  const res = await fetch(`poeth://data/${game}/${GUIDE_DIR}/${encodeURIComponent(file)}`, { cache: 'no-store' })
  return res.ok ? res.text() : null
}

export const useGuideStore = create<GuideState>((set, get) => ({
  status: 'idle',
  game: null,
  articles: [],
  failed: [],
  newer: [],
  noIndex: false,
  seen: {},
  open: null,
  query: '',

  init: async (game) => {
    if (get().status !== 'idle' && get().game === game) return
    set({ status: 'loading', game, seen: readSeen(storage()) })
    const res = await loadGuide((file) => readFile(game, file))
    for (const f of res.failed) console.warn(`[guide] ${f.id}: ${f.error}`)
    set({ status: 'ready', articles: res.articles, failed: res.failed, newer: res.newer, noIndex: res.noIndex })
  },

  reload: async () => {
    const game = get().game
    if (!game) return
    set({ status: 'idle' })
    await get().init(game)
  },

  openArticle: (id, section = null) => {
    const a = get().articles.find((x) => x.id === id)
    if (!a) return
    const seenRev = get().seen[id]
    const seen = markSeen(get().seen, a)
    if (seen !== get().seen) writeSeen(storage(), seen)
    set({ open: { id, section, seenRev }, seen })
  },

  close: () => set({ open: null }),

  setQuery: (query) => set({ query }),

  readAll: () => {
    const seen = markAllSeen(get().seen, get().articles)
    writeSeen(storage(), seen)
    set({ seen })
  }
}))
