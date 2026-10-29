import { ipcRenderer } from 'electron'
import { IPC, type BuildTreeIpcApi } from '@shared/ipc'
import { buildDevFlag } from '@shared/build/flag'
import { subscribe } from '../subscribe'

export function buildTreeBridge(): BuildTreeIpcApi {
  return {
    buildTree: {
      devFlag: buildDevFlag(process.env),
      state: () => ipcRenderer.invoke(IPC.buildTree.state),
      step: (delta) => ipcRenderer.invoke(IPC.buildTree.step, delta),
      reset: () => ipcRenderer.invoke(IPC.buildTree.reset),
      hide: () => ipcRenderer.invoke(IPC.buildTree.hide),
      panel: (rect) => ipcRenderer.send(IPC.buildTree.panel, rect)
    },
    onBuildTreeState: (cb) => subscribe(IPC.events.buildTreeState, cb),
    onBuildTreeView: (cb) => subscribe(IPC.events.buildTreeView, cb)
  }
}
