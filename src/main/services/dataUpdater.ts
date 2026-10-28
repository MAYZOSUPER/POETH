import { app } from 'electron'
import path from 'path'
import { DATA_MANIFEST_URL, isAllowedDataUrl } from '@shared/links'
import { loopbackUrl, validateDataManifest } from '@shared/updates'
import { applyDataUpdate } from './dataUpdate'
import { getSettings } from './settingsStore'
import { resourcesDir } from './questDataset'
import { notifyUser } from './notify'
import { getAnonSession, getUserAgent } from '../net/session'

// Обновление данных без переустановки (S10a): при запуске и раз в сутки (если включено
// «Проверять обновления») читаем манифест пакета данных (links.DATA_MANIFEST_URL), качаем
// изменившиеся файлы сессией без cookies, проверяем sha256 и атомарно подменяем надстройку
// userData/data/<game> (ядро — dataUpdate.ts). Применили — тост «Данные обновлены (…)».
// Ошибки сети и битые пакеты — тихо в лог, данные не трогаются.
//
// Проверка без публикации: POETH_DATA_MANIFEST_URL=http://127.0.0.1:<порт>/manifest.json (только loopback).

const CHECK_EVERY_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 30000
const MAX_BYTES = 64 * 1024 * 1024

let busy = false
let timer: NodeJS.Timeout | null = null

function manifestUrl(): string {
  return loopbackUrl(process.env.POETH_DATA_MANIFEST_URL) ?? DATA_MANIFEST_URL
}

function allowed(url: string): boolean {
  return isAllowedDataUrl(url) || loopbackUrl(url) !== null
}

/** GET без cookies и без редиректов; только https-хосты из allowlist (или loopback для теста). */
async function getBytes(url: string): Promise<Buffer> {
  if (!allowed(url)) throw new Error(`host not allowed: ${new URL(url).host}`)
  const res = await getAnonSession().fetch(url, {
    credentials: 'omit',
    redirect: 'error',
    headers: { 'User-Agent': getUserAgent(), 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) throw new Error('too large')
  return buf
}

export type DataCheckResult = 'applied' | 'unchanged' | 'skipped' | 'failed' | 'busy'

/** Проверить и применить пакет данных. */
export async function checkDataUpdate(force = false): Promise<DataCheckResult> {
  if (busy) return 'busy'
  if (!force && !(await getSettings()).updates.check) return 'skipped'
  busy = true
  try {
    const url = manifestUrl()
    const raw: unknown = JSON.parse((await getBytes(url)).toString('utf8'))
    const v = validateDataManifest(raw, app.getVersion())
    if (!v.ok) {
      console.warn(`[data] manifest skipped: ${v.error}`)
      return 'skipped'
    }
    const m = v.manifest
    const res = await applyDataUpdate(m, {
      root: path.join(app.getPath('userData'), 'data'),
      bundledDir: path.join(resourcesDir(), 'data', m.game),
      fetchFile: (rel) => getBytes(new URL(`${m.game}/${rel}`, url).toString())
    })
    if (res.status === 'applied') {
      console.log(`[data] ${m.game} ${m.version}: ${res.changed} files, ${res.downloaded} downloaded`)
      void notifyUser('dataUpdated', { version: m.version })
      return 'applied'
    }
    if (res.status === 'failed') {
      console.warn(`[data] update ${m.version} rolled back: ${res.error}`)
      return 'failed'
    }
    // проверка дошла до манифеста: данные совпадают с встроенными или уже применёнными
    console.log(`[data] ${m.game} ${m.version}: up to date`)
    return 'unchanged'
  } catch (e) {
    console.warn('[data] update check failed:', e instanceof Error ? e.message : e)
    return 'failed'
  } finally {
    busy = false
  }
}

/** Запуск: первая проверка через delayMs, дальше раз в сутки. */
export function startDataUpdates(delayMs = 15000): void {
  if (timer) return
  setTimeout(() => void checkDataUpdate(), delayMs)
  timer = setInterval(() => void checkDataUpdate(), CHECK_EVERY_MS)
}
