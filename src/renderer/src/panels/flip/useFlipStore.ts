import { create } from 'zustand'
import type { BookReading, FlipBookEvent, FlipFilters, FlipOptions, FlipState } from '@shared/types'
import { DEFAULT_VIEW, type FlipView, type RateRange } from './view'

// Состояние вкладки «Обмен» (компаньон, S13). Источник — main (flip:state + event:flip.state); фильтры простого
// режима, сортировка, выбранная строка, окно графика и курсы, введённые из игры, — только вид, живут до перезапуска.
// S28: стаканы из игры (хоткей bookRead → event:flip.book) — по ногам маршрута (тот же ключ, что у курса из игры);
// считанный, но ещё не разложенный по ноге — pendingBook (нога ясна по цене — раскладывает GameCheck).

interface FlipStore {
  state: FlipState | null
  busy: boolean
  view: FlipView
  selected: string | null
  range: RateRange
  /** «Цена в игре сейчас» как введена: ключ — gameKey (нога + предмет + база) */
  game: Record<string, string>
  setGame: (key: string, text: string) => void
  /** стаканы из игры по ногам: ключ — gameKey */
  books: Record<string, BookReading>
  setBook: (key: string, reading: BookReading | null) => void
  /** считан, нога ещё не выбрана */
  pendingBook: BookReading | null
  setPendingBook: (reading: BookReading | null) => void
  /** последнее событие хоткея (неудачи — подсказкой в карточке) */
  lastBook: FlipBookEvent | null
  init: () => void
  refresh: () => Promise<void>
  setFilters: (patch: Partial<FlipFilters>) => Promise<void>
  setOptions: (patch: Partial<FlipOptions>) => Promise<void>
  setView: (patch: Partial<FlipView>) => void
  pick: (id: string) => void
  setRange: (range: RateRange) => void
}

let subscribed = false

export const useFlipStore = create<FlipStore>((set) => ({
  state: null,
  busy: false,
  view: DEFAULT_VIEW,
  selected: null,
  range: '24h',
  game: {},
  books: {},
  setBook: (key, reading) =>
    set((s) => {
      const books = { ...s.books }
      if (reading) books[key] = reading
      else delete books[key]
      return { books }
    }),
  pendingBook: null,
  setPendingBook: (pendingBook) => set({ pendingBook }),
  lastBook: null,
  setGame: (key, text) =>
    set((s) => {
      const game = { ...s.game }
      if (text.trim()) game[key] = text
      else delete game[key]
      return { game }
    }),
  init: () => {
    if (subscribed) return
    subscribed = true
    const api = window.overlayApi
    api.onFlipState((state) => set({ state }))
    void api.flip.state().then((state) => set({ state }))
    const onBook = (e: FlipBookEvent | null): void => {
      if (!e) return
      set((s) => {
        // то же чтение второй раз (bookLast после события) не возвращаем в «ждёт ноги»
        const seen = (r: BookReading): boolean => s.pendingBook?.at === r.at || Object.values(s.books).some((b) => b.at === r.at)
        return {
          lastBook: e,
          pendingBook: e.result.ok && !seen(e.result.reading) ? e.result.reading : s.pendingBook
        }
      })
    }
    api.onFlipBook(onBook)
    void api.flip.bookLast().then(onBook)
  },
  refresh: async () => {
    set({ busy: true })
    try {
      set({ state: await window.overlayApi.flip.refresh() })
    } finally {
      set({ busy: false })
    }
  },
  setFilters: async (patch) => {
    set({ state: await window.overlayApi.flip.setFilters(patch) })
  },
  setOptions: async (patch) => {
    set({ state: await window.overlayApi.flip.setOptions(patch) })
  },
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  pick: (selected) => set({ selected }),
  setRange: (range) => set({ range })
}))
