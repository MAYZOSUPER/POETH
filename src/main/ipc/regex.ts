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
import { getCompanionWindow } from '../windows/companionWindow'
import type { IpcDomain } from './types'

// Домен «regex-строки» (main): данные карт для движка, библиотека строк, буфер обмена.
// Хоткеи pasteSearch1..5: текст слота даёт getPasteString(slot) — лид подключит его к
// stashSearch() из S1 (Ctrl+F → вставить в поле поиска игры) после слияния S1.

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

async function importLibrary(): Promise<RegexImportResult> {
  const win = getCompanionWindow()
  const opts = {
    title: 'Импорт regex-строк',
    properties: ['openFile' as const],
    filters: [{ name: 'POETH regex', extensions: ['json'] }]
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return { status: 'canceled' }
  let raw: unknown
  try {
    const text = await fs.readFile(result.filePaths[0], 'utf8')
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return { status: 'invalid' }
  }
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
