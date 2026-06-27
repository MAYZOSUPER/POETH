import type { OverlayApi } from '@shared/ipc'

declare global {
  interface Window {
    overlayApi: OverlayApi
  }
}

export {}
