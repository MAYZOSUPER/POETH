import { create } from 'zustand'
import type { CompanionPage } from '@shared/types'

// Оболочка компаньона (S9): какая служебная страница открыта поверх вкладок (настройки,
// «О программе») и показан ли мастер первого запуска по просьбе пользователя.
// Сам «первый запуск» решает settings.startup.firstRunDone; здесь — только повторный показ.

type Page = Exclude<CompanionPage, 'wizard'>

interface ShellState {
  page: Page | null
  /** мастер открыт вручную (из настроек / «О программе» / трея) */
  wizard: boolean
  setPage: (page: Page | null) => void
  openWizard: () => void
  closeWizard: () => void
  /** страница по запросу main (трей): about / settings / wizard */
  show: (page: CompanionPage) => void
}

export const useShellStore = create<ShellState>((set) => ({
  page: null,
  wizard: false,
  setPage: (page) => set({ page }),
  openWizard: () => set({ wizard: true }),
  closeWizard: () => set({ wizard: false }),
  show: (page) => (page === 'wizard' ? set({ wizard: true }) : set({ page }))
}))
