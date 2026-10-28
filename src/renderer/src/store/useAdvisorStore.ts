import { create } from 'zustand'
import type { AdvisorFarmResult, AdvisorState, AdvisorStrategy } from '@shared/types'
import { draftFromStrategy, emptyDraft, parseDraft, type AdvisorDraft, type DraftLang } from '@shared/advisor/draft'
import { DEFAULT_ADVISOR_VIEW, type AdvisorView } from '../panels/advisor/view'
import { useAppStore } from './useAppStore'

// Состояние вкладки «Что фармить» (компаньон, S16 + S17). Источник — main (advisor:state + event:advisor.state);
// сортировка, фильтры, раскрытая карточка, редактор и диалоги — только вид. Черновик редактора хранит main
// (userData, сохраняется сам). «Открыть в POETH» с сайта (event:advisor.link) — переключает на вкладку и
// открывает «Импорт» с кодом: предпросмотр, без автодобавления.

export type AdvisorDialog = { kind: 'share'; id: string } | { kind: 'import'; text: string } | null

interface AdvisorStore {
  state: AdvisorState | null
  busy: boolean
  view: AdvisorView
  /** раскрытая карточка */
  open: string | null
  /** ответ на «Начать сессию фарма» по стратегии (подпись под кнопкой) */
  farm: Record<string, AdvisorFarmResult>
  /** редактор открыт: черновик; null — список */
  draft: AdvisorDraft | null
  /** шаг мастера 1…6 */
  step: number
  /** когда черновик записан (мс) */
  draftSavedAt: number | null
  dialog: AdvisorDialog
  init: () => void
  refresh: () => Promise<void>
  startFarm: (id: string) => Promise<void>
  setView: (patch: Partial<AdvisorView>) => void
  toggle: (id: string) => void
  reveal: (id: string) => void
  /** «Новая стратегия»: незаконченный черновик или пустой */
  newStrategy: (lang: DraftLang) => Promise<void>
  /** «Изменить» свою / «Копия» нашей или из каталога */
  editStrategy: (s: AdvisorStrategy, mine: boolean) => void
  setDraft: (d: AdvisorDraft) => void
  setStep: (n: number) => void
  /** закрыть редактор; discard — удалить черновик */
  closeEditor: (discard: boolean) => void
  openShare: (id: string) => void
  openImport: (text?: string) => void
  closeDialog: () => void
  remove: (id: string) => Promise<void>
}

let subscribed = false
let draftTimer: ReturnType<typeof setTimeout> | null = null

export const useAdvisorStore = create<AdvisorStore>((set, get) => ({
  state: null,
  busy: false,
  view: DEFAULT_ADVISOR_VIEW,
  open: null,
  farm: {},
  draft: null,
  step: 1,
  draftSavedAt: null,
  dialog: null,
  init: () => {
    if (subscribed) return
    subscribed = true
    const api = window.overlayApi
    api.onAdvisorState((state) => set({ state }))
    void api.advisor.state().then((state) => set({ state }))
  },
  refresh: async () => {
    if (get().busy) return
    set({ busy: true })
    try {
      set({ state: await window.overlayApi.advisor.refresh() })
    } finally {
      set({ busy: false })
    }
  },
  startFarm: async (id) => {
    const res = await window.overlayApi.advisor.startFarm(id)
    set((s) => ({ farm: { ...s.farm, [id]: res } }))
  },
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  toggle: (id) => set((s) => ({ open: s.open === id ? null : id })),
  reveal: (id) => set({ open: id, draft: null, dialog: null }),
  newStrategy: async (lang) => {
    const saved = parseDraft(await window.overlayApi.advisor.getDraft().catch(() => null))
    set({ draft: saved && !saved.editId ? saved : emptyDraft(lang), step: 1, draftSavedAt: null, dialog: null })
  },
  editStrategy: (s, mine) => {
    const draft = draftFromStrategy(s, mine ? s.id : null)
    set({ draft, step: 1, draftSavedAt: null, dialog: null })
    void window.overlayApi.advisor.setDraft(draft)
  },
  setDraft: (draft) => {
    set({ draft })
    // черновик сохраняется сам — не чаще раза в 0,8 с
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      draftTimer = null
      void window.overlayApi.advisor.setDraft(draft).then(() => set({ draftSavedAt: Date.now() }))
    }, 800)
  },
  setStep: (step) => set({ step: Math.min(6, Math.max(1, step)) }),
  closeEditor: (discard) => {
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = null
    const d = get().draft
    if (discard) void window.overlayApi.advisor.setDraft(null)
    else if (d) void window.overlayApi.advisor.setDraft(d)
    set({ draft: null, step: 1 })
  },
  openShare: (id) => set({ dialog: { kind: 'share', id } }),
  openImport: (text = '') => set({ dialog: { kind: 'import', text } }),
  closeDialog: () => set({ dialog: null }),
  remove: async (id) => {
    await window.overlayApi.advisor.remove(id)
    set((s) => ({ open: s.open === id ? null : s.open }))
  }
}))

/**
 * «Открыть в POETH» с сайта: подписка на всё окно (вкладка может быть не открыта) — переключить на «Что
 * фармить» и открыть «Импорт» с кодом. Ничего не добавляется без кнопки.
 */
const companion = typeof window !== 'undefined' && !new URLSearchParams(window.location.search).get('view') // не служебные окна
if (companion && window.overlayApi?.onAdvisorLink) {
  const show = (code: string): void => {
    useAppStore.getState().setAppTab('advisor')
    useAdvisorStore.getState().openImport(code)
  }
  // сначала подписка, потом «забрать» ссылку, пришедшую до загрузки окна: ни одна не теряется и не дублируется
  window.overlayApi.onAdvisorLink((code) => {
    void window.overlayApi.advisor.takeLink()
    show(code)
  })
  void window.overlayApi.advisor.takeLink().then((code) => code && show(code))
}
