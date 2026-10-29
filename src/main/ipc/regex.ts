import { clipboard, dialog, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { IPC } from '@shared/ipc'
import type { GameId } from '@shared/games'
import type {
  PasteSlot,
  RegexEntryInput,
  RegexExportResult,
  RegexImportResult,
  RegexLang,
  RegexPrefs
} from '@shared/types'
import { exportPayload } from '@shared/regex/library'
import * as store from '../services/regexLibraryStore'
import { readImportJson } from '../services/importFile'
import { getCompanionWindow } from '../windows/companionWindow'
import type { IpcDomain } from './types'

// Домен «regex-строки» (main): данные карт для движка, библиотека строк, буфер обмена.
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
    title: 'Экспорт regex-строк',
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
    title: 'Импорт regex-строк',
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

function register(): void {
  ipcMain.handle(IPC.regex.mapData, (_e, lang: unknown) => (isLang(lang) ? store.loadMapData(lang) : null))
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
}

export const regexDomain: IpcDomain = { register }
