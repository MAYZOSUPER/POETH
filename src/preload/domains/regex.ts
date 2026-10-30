import { ipcRenderer } from 'electron'
import { IPC, type RegexIpcApi } from '@shared/ipc'

// Мост домена «regex-строки» (S7).
export function regexBridge(): RegexIpcApi {
  return {
    regex: {
      mapData: (lang) => ipcRenderer.invoke(IPC.regex.mapData, lang),
      itemData: (lang) => ipcRenderer.invoke(IPC.regex.itemData, lang),
      library: () => ipcRenderer.invoke(IPC.regex.library),
      saveEntry: (input) => ipcRenderer.invoke(IPC.regex.saveEntry, input),
      deleteEntry: (id) => ipcRenderer.invoke(IPC.regex.deleteEntry, id),
      setSlot: (id, slot) => ipcRenderer.invoke(IPC.regex.setSlot, id, slot),
      setPrefs: (patch) => ipcRenderer.invoke(IPC.regex.setPrefs, patch),
      exportLibrary: () => ipcRenderer.invoke(IPC.regex.exportLibrary),
      importLibrary: () => ipcRenderer.invoke(IPC.regex.importLibrary),
      copy: (text) => ipcRenderer.invoke(IPC.regex.copy, text)
    }
  }
}
