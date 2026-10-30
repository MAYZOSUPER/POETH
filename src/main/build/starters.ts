import { shell } from 'electron'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { inflateNode } from '@shared/advisor/codecNode'
import { isAuthorLinkUrl } from '@shared/links'
import { parsePobInput } from '@shared/pob/links'
import { findStarter, loadStarters, type StartersLoad } from '@shared/starters/load'
import { importStarterCode, levelingHint, pobChanged } from '@shared/starters/play'
import { STARTER_ID, STARTER_LIMITS, STARTER_LINKS, STARTERS_DIR, type StarterLinkKind } from '@shared/starters/schema'
import { toStartersState, type StartersState } from '@shared/starters/view'
import type { StarterPlayResult } from '@shared/types/build'
import { resolveDataFile } from '../protocol'
import { fetchPobCode } from '../pob/fetch'
import { saveImported } from './buildLibrary'

// «Стартеры» лиги во вкладке «Билд» (S59). Список — файлы пакета данных poeth://data/poe1/starters/* (обновлённые
// каналом S12 из userData/data, иначе встроенные), проверка — @shared/starters (недоверенные данные). Окно знает
// только id записей: адрес PoB и ссылок автора main берёт из проверенного списка сам.
//  - «Играть по этому гайду» — один запрос за кодом PoB по нажатию (fetchPobCode S35: allowlist, UA POETH, без
//    cookies), сверка отпечатка с проверенной версией, билд — в библиотеку (открыть или только добавить);
//  - «Гайд автора», «Видео», «PoB» — системный браузер, только https и хосты автора (isAuthorLinkUrl).
// Новых адресов в сети нет: PoB — с хостов S35, ссылки открывает браузер, список приходит с пакетом данных.

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/** Файл папки starters: текст или null (нет, не прочитался, больше предела). */
async function readStartersFile(file: string): Promise<string | null> {
  const abs = await resolveDataFile('poe1', STARTERS_DIR, file)
  if (!abs) return null
  try {
    const st = await fs.stat(abs)
    if (!st.isFile() || st.size > STARTER_LIMITS.bytes) return null
    return await fs.readFile(abs, 'utf8')
  } catch {
    return null
  }
}

/** Список стартеров (читается каждый раз: файлы маленькие, а пакет данных мог обновиться на ходу). */
export async function getStarters(): Promise<StartersLoad> {
  const load = await loadStarters(readStartersFile)
  for (const f of load.failed) console.warn(`[starters] ${f.file}${f.id ? ` ${f.id}` : ''}: ${f.error}`)
  return load
}

export async function getStartersState(): Promise<StartersState> {
  return toStartersState(await getStarters())
}

const isStarterId = (id: unknown): id is string => typeof id === 'string' && STARTER_ID.test(id)

/**
 * «Играть по этому гайду»: PoB записи — одним запросом, разбор и отпечаток, билд в библиотеку.
 * mode 'replace' — билд становится открытым (прежний остаётся в «Недавних»), 'add' — только в библиотеку.
 */
export async function playStarter(id: unknown, mode: unknown): Promise<StarterPlayResult> {
  if (!isStarterId(id) || (mode !== 'replace' && mode !== 'add')) return { ok: false, error: 'unknown' }
  const load = await getStarters()
  const rec = findStarter(load, id)
  if (!rec) return { ok: false, error: 'unknown' }
  const league = load.starters.includes(rec) ? load.league : (load.previous?.league ?? null)
  const input = parsePobInput(rec.links.pob)
  if (!league || input.kind !== 'link') return { ok: false, error: 'unknown' }

  const res = await fetchPobCode(input.rawUrl)
  if (!res.ok) return res.error === 'not-found' ? { ok: false, error: 'removed' } : { ok: false, error: 'fetch', fetchError: res.error }
  const imp = importStarterCode(res.code, inflateNode, sha256)
  if (!imp.ok) return imp

  const changed = pobChanged(rec.pob.sha256, imp.fingerprint)
  const state = await saveImported(
    imp.build,
    { kind: 'link', site: input.site, pageUrl: input.pageUrl },
    { activate: mode === 'replace', starter: { id: rec.id, league, changed } }
  )
  return { ok: true, state, changed, leveling: levelingHint(imp.build) }
}

/** Ссылка записи (гайд, видео, канал, страница PoB) — в системном браузере. Адрес — только из проверенного списка. */
export async function openStarterLink(id: unknown, kind: unknown): Promise<boolean> {
  if (!isStarterId(id) || typeof kind !== 'string' || !(STARTER_LINKS as readonly string[]).includes(kind)) return false
  const rec = findStarter(await getStarters(), id)
  const url = rec?.links[kind as StarterLinkKind]
  if (!url || !isAuthorLinkUrl(url)) return false
  try {
    await shell.openExternal(url)
    return true
  } catch {
    return false
  }
}
