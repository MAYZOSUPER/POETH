import { clipboard, dialog, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { IPC } from '@shared/ipc'
import { GAMES, siteUrl, type GameId } from '@shared/games'
import type {
  PasteSlot,
  Poe2PriceResult,
  Poe2ProfileInput,
  Poe2RegexPrefs,
  RegexEntryInput,
  RegexExportResult,
  RegexImportResult,
  RegexLang,
  RegexPrefs
} from '@shared/types'
import { exportPayload } from '@shared/regex/library'
import { profilePrice, type Poe2PriceTransport } from '@shared/regex/poe2/price'
import * as store from '../services/regexLibraryStore'
import { readImportJson } from '../services/importFile'
import { getCompanionWindow } from '../windows/companionWindow'
import { uiDialogTitle } from '../services/dialogText'
import { getEffectiveLeague, tradeRequest } from '../net'
import { getRunningGame } from '../gameContext'
import type { IpcDomain } from './types'

// Домен «regex-строки» (main): данные карт и предметов для движка, библиотека строк, буфер обмена.
// Хоткеи pasteSearch1..5: текст слота даёт getPasteString(slot), вставку в поле поиска игры
// (Ctrl+F → вставить) делает stashSearch() S1 в ipc/overlay.ts.

export { getPasteString } from '../services/regexLibraryStore'

const isLang = (v: unknown): v is RegexLang => v === 'en' || v === 'ru'
const isSlot = (v: unknown): v is PasteSlot => v === 1 || v === 2 || v === 3 || v === 4 || v === 5
const isGame = (v: unknown): v is GameId => v === 'poe1' || v === 'poe2'

function toInput(raw: unknown): RegexEntryInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string' || typeof r.text !== 'string' || !isGame(r.game)) return null
  const input: RegexEntryInput = { name: r.name, text: r.text, game: r.game }
  if (typeof r.id === 'string') input.id = r.id
  if (typeof r.presetId === 'string') input.presetId = r.presetId
  return input
}

async function exportLibrary(): Promise<RegexExportResult> {
  const win = getCompanionWindow()
  const opts = {
    title: await uiDialogTitle('regexExport'),
    defaultPath: 'poeth-regex.json',
    filters: [{ name: 'POETH regex', extensions: ['json'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return { status: 'canceled' }
  try {
    const payload = exportPayload(await store.getLibrary())
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
  } catch {
    return { status: 'error' }
  }
  return { status: 'saved', path: result.filePath }
}

/** Файл библиотеки regex: сотни строк по ≤250 символов — это десятки КБ (S29). */
const REGEX_IMPORT_MAX_BYTES = 2 * 1024 * 1024

async function importLibrary(): Promise<RegexImportResult> {
  const win = getCompanionWindow()
  const opts = {
    title: await uiDialogTitle('regexImport'),
    properties: ['openFile' as const],
    filters: [{ name: 'POETH regex', extensions: ['json'] }]
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return { status: 'canceled' }
  const raw = await readImportJson(result.filePaths[0], REGEX_IMPORT_MAX_BYTES)
  if (raw === undefined) return { status: 'invalid' }
  const res = await store.importLibraryData(raw)
  if (!res) return { status: 'invalid' }
  return { status: 'imported', added: res.added, library: res.library }
}

/** Профиль от renderer: имя, вид и запрос (нормализует @shared/regex/poe2/profiles). */
function toProfileInput(raw: unknown): Poe2ProfileInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string' || (r.kind !== 'waystone' && r.kind !== 'tablet')) return null
  const input: Poe2ProfileInput = { name: r.name, kind: r.kind }
  if (typeof r.id === 'string') input.id = r.id
  if (r.kind === 'waystone') input.waystone = r.waystone as Poe2ProfileInput['waystone']
  else input.tablet = r.tablet as Poe2ProfileInput['tablet']
  return input
}

/** Тело запроса trade2 разумного размера (как у окна цены: 64 КБ). */
const MAX_PRICE_BODY = 64 * 1024

/**
 * «Цена по профилю» (S62): только в режиме PoE 2 и только по клику — ровно один поиск trade2 + одна страница лотов
 * через шлюз S3 (лимиты, кэш 5 мин). Статус — available (выкуп + онлайн); хост — www (запросы на английских именах).
 */
async function poe2Price(body: unknown): Promise<Poe2PriceResult> {
  if (getRunningGame() !== 'poe2') return { ok: false, error: { code: 'bad-request', message: 'game' } }
  if (JSON.stringify(body ?? null).length > MAX_PRICE_BODY) return { ok: false, error: { code: 'bad-request', message: 'body' } }
  const league = await getEffectiveLeague()
  const request: Poe2PriceTransport = async (r) => {
    const res = await tradeRequest(r)
    return res.ok ? { ok: true, data: res.data as never } : { ok: false, error: res.error }
  }
  return profilePrice(body, league, request, (id) => siteUrl(GAMES.poe2, 'www.pathofexile.com', league, id))
}

function register(): void {
  ipcMain.handle(IPC.regex.mapData, (_e, lang: unknown) => (isLang(lang) ? store.loadMapData(lang) : null))
  ipcMain.handle(IPC.regex.itemData, (_e, lang: unknown) => (isLang(lang) ? store.loadItemData(lang) : null))
  ipcMain.handle(IPC.regex.library, () => store.getLibrary())
  ipcMain.handle(IPC.regex.saveEntry, async (_e, raw: unknown) => {
    const input = toInput(raw)
    return input ? store.saveEntry(input) : store.getLibrary()
  })
  ipcMain.handle(IPC.regex.deleteEntry, (_e, id: unknown) =>
    typeof id === 'string' ? store.deleteEntry(id) : store.getLibrary()
  )
  ipcMain.handle(IPC.regex.setSlot, (_e, id: unknown, slot: unknown) =>
    typeof id === 'string' ? store.setSlot(id, isSlot(slot) ? slot : null) : store.getLibrary()
  )
  ipcMain.handle(IPC.regex.setPrefs, (_e, patch: unknown) =>
    typeof patch === 'object' && patch !== null
      ? store.setPrefs(patch as Partial<RegexPrefs>)
      : store.getLibrary()
  )
  ipcMain.handle(IPC.regex.exportLibrary, () => exportLibrary())
  ipcMain.handle(IPC.regex.importLibrary, () => importLibrary())
  ipcMain.handle(IPC.regex.copy, (_e, text: unknown) => {
    if (typeof text === 'string') clipboard.writeText(text)
  })
  // PoE 2 (S62)
  ipcMain.handle(IPC.regex.poe2Data, (_e, lang: unknown) => (isLang(lang) ? store.loadPoe2Data(lang) : null))
  ipcMain.handle(IPC.regex.poe2State, () => store.getPoe2State())
  ipcMain.handle(IPC.regex.poe2SetPrefs, (_e, patch: unknown) =>
    typeof patch === 'object' && patch !== null
      ? store.setPoe2Prefs(patch as Partial<Poe2RegexPrefs>)
      : store.getPoe2State()
  )
  ipcMain.handle(IPC.regex.poe2SaveProfile, (_e, raw: unknown) => {
    const input = toProfileInput(raw)
    return input ? store.savePoe2Profile(input) : store.getPoe2State()
  })
  ipcMain.handle(IPC.regex.poe2DeleteProfile, (_e, id: unknown) =>
    typeof id === 'string' ? store.deletePoe2Profile(id) : store.getPoe2State()
  )
  ipcMain.handle(IPC.regex.poe2Price, (_e, body: unknown) => poe2Price(body))
}

export const regexDomain: IpcDomain = { register }
