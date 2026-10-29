import { app } from 'electron'

// Переменные окружения разработчика (S29) действуют только в незапакованной сборке (npm run dev, electron .).
// В установленном POETH переменная окружения не должна грузить в окна с preload чужой адрес, открывать DevTools
// или складывать на диск тексты предметов и снимки экрана — так же, как fuses закрыли NODE_OPTIONS и RunAsNode.

export type DevEnvName =
  | 'ELECTRON_RENDERER_URL'
  | 'OVERLAY_DEVTOOLS'
  | 'POETH_OVERLAY_DEVTOOLS'
  | 'POETH_SAVE_CAPTURES'
  | 'POETH_OCR_FIXTURES'

/** Значение переменной разработчика; в собранной версии — всегда undefined. */
export function devEnv(name: DevEnvName): string | undefined {
  return app.isPackaged ? undefined : process.env[name]
}
