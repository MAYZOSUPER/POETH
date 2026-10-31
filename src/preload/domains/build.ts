import { ipcRenderer } from 'electron'
import { IPC, type BuildIpcApi } from '@shared/ipc'
import { buildDevFlag } from '@shared/build/flag'
import { subscribe } from '../subscribe'

// Мост домена «Билд» (S39): вставка и библиотека билдов, правки этапов, «взято» по журналу. Разбор кода PoB,
// сеть и диск — только в main; окну приходит готовая модель (строки и числа).
export function buildBridge(): BuildIpcApi {
  const b = IPC.build
  return {
    build: {
      devFlag: buildDevFlag(process.env),
      state: () => ipcRenderer.invoke(b.state),
      importPob: (text) => ipcRenderer.invoke(b.importPob, text),
      open: (id) => ipcRenderer.invoke(b.open, id),
      remove: (id) => ipcRenderer.invoke(b.remove, id),
      setEdits: (id, edits) => ipcRenderer.invoke(b.setEdits, id, edits),
      reload: (id) => ipcRenderer.invoke(b.reload, id),
      taken: () => ipcRenderer.invoke(b.taken),
      showTree: (stage) => ipcRenderer.invoke(b.showTree, stage),
      starters: () => ipcRenderer.invoke(b.starters),
      playStarter: (id, mode) => ipcRenderer.invoke(b.playStarter, id, mode),
      openStarterLink: (id, kind) => ipcRenderer.invoke(b.openStarterLink, id, kind),
      // S66: экран «Билд» PoE 2
      poe2State: () => ipcRenderer.invoke(b.poe2State),
      poe2Import: (text) => ipcRenderer.invoke(b.poe2Import, text),
      poe2Open: (id) => ipcRenderer.invoke(b.poe2Open, id),
      poe2Remove: (id) => ipcRenderer.invoke(b.poe2Remove, id),
      poe2Reload: (id) => ipcRenderer.invoke(b.poe2Reload, id),
      poe2Save: (req) => ipcRenderer.invoke(b.poe2Save, req)
    },
    onBuildState: (cb) => subscribe(IPC.events.buildState, cb),
    onBuildTaken: (cb) => subscribe(IPC.events.buildTaken, cb)
  }
}
