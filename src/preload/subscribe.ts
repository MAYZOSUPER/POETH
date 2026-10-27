import { ipcRenderer, type IpcRendererEvent } from 'electron'

/** Subscribe to a main → renderer event; returns the unsubscribe function. */
export function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
