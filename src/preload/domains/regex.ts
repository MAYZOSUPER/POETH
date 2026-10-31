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
      copy: (text) => ipcRenderer.invoke(IPC.regex.copy, text),
      poe2Data: (lang) => ipcRenderer.invoke(IPC.regex.poe2Data, lang),
      poe2State: () => ipcRenderer.invoke(IPC.regex.poe2State),
      poe2SetPrefs: (patch) => ipcRenderer.invoke(IPC.regex.poe2SetPrefs, patch),
      poe2SaveProfile: (input) => ipcRenderer.invoke(IPC.regex.poe2SaveProfile, input),
      poe2DeleteProfile: (id) => ipcRenderer.invoke(IPC.regex.poe2DeleteProfile, id),
      poe2Price: (body) => ipcRenderer.invoke(IPC.regex.poe2Price, body)
    }
  }
}
