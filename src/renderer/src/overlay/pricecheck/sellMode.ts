import { create } from 'zustand'

// S50: режим окна цены «Покупаю / Продаю». Выбор — в localStorage оверлея (как свёрнутость рельса и папок избранного:
// Settings не трогаем); нет хранилища — по умолчанию «Покупаю».

export type PcMode = 'buy' | 'sell'

const KEY = 'poeth.pc1.mode'

function load(): PcMode {
  try {
    return window.localStorage.getItem(KEY) === 'sell' ? 'sell' : 'buy'
  } catch {
    return 'buy'
  }
}

export const usePcMode = create<{ mode: PcMode; setMode: (mode: PcMode) => void }>((set) => ({
  mode: load(),
  setMode: (mode) => {
    set({ mode })
    try {
      window.localStorage.setItem(KEY, mode)
    } catch {
      // нет хранилища — выбор живёт до закрытия оверлея
    }
  }
}))
