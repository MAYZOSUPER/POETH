import { ipcRenderer } from 'electron'
import { IPC, type AuthIpcApi } from '@shared/ipc'
import { subscribe } from '../subscribe'

// Мост домена «вход в аккаунт и сеть». Только статус — cookies сюда не приходят.
export function authBridge(): AuthIpcApi {
  return {
    auth: {
      status: () => ipcRenderer.invoke(IPC.auth.status),
      login: () => ipcRenderer.invoke(IPC.auth.login),
      logout: () => ipcRenderer.invoke(IPC.auth.logout),
      recheck: () => ipcRenderer.invoke(IPC.auth.recheck),
      pasteSession: (poesessid) => ipcRenderer.invoke(IPC.auth.pasteSession, poesessid),
      poe2Notice: () => ipcRenderer.invoke(IPC.auth.poe2Notice),
      poe2NoticeDismiss: () => ipcRenderer.invoke(IPC.auth.poe2NoticeDismiss)
    },
    leagues: {
      get: () => ipcRenderer.invoke(IPC.leagues.get),
      refresh: () => ipcRenderer.invoke(IPC.leagues.refresh)
    },
    onAuthStatus: (cb) => subscribe(IPC.events.authStatus, cb),
    onLeagues: (cb) => subscribe(IPC.events.authLeagues, cb)
  }
}
