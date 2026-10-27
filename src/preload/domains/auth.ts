import type { AuthIpcApi } from '@shared/ipc'

// TODO S3: мост каналов домена (ipcRenderer.invoke / send / subscribe).
export function authBridge(): AuthIpcApi {
  return {}
}
