import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipc'
import type { UiLang } from '@shared/types'

// Диалоги «Сохранить / Открыть» и имена по умолчанию из main (S42): на языке интерфейса (Settings.uiLang),
// а не всегда по-русски. Обработчики regex и кампании PoE 2 — с заглушками electron и сервисов.

const state = vi.hoisted(() => ({
  lang: 'en' as UiLang,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  dialogs: [] as { kind: 'save' | 'open'; title?: string }[],
  created: [] as unknown[][],
  imported: [] as unknown[][]
}))

vi.mock('electron', () => ({
  app: { getPath: () => '', getVersion: () => '0.0.0-test' },
  clipboard: { writeText: vi.fn() },
  ipcMain: { handle: (ch: string, fn: (...args: unknown[]) => unknown) => state.handlers.set(ch, fn) },
  dialog: {
    showSaveDialog: async (opts: { title?: string }) => {
      state.dialogs.push({ kind: 'save', title: opts.title })
      return { canceled: true }
    },
    showOpenDialog: async (opts: { title?: string }) => {
      state.dialogs.push({ kind: 'open', title: opts.title })
      return { canceled: false, filePaths: ['C:/x.json'] }
    }
  }
}))
vi.mock('../../src/main/services/settingsStore', () => ({
  getSettings: async () => ({ uiLang: state.lang, tailerEnabled: false, logPath: null }),
  updateSettings: async () => ({ uiLang: state.lang, tailerEnabled: false, logPath: null })
}))
vi.mock('../../src/main/windows/companionWindow', () => ({ getCompanionWindow: () => null, sendToCompanion: vi.fn() }))
vi.mock('../../src/main/services/importFile', () => ({ readImportJson: async () => ({}) }))
vi.mock('../../src/main/services/regexLibraryStore', () => ({ getPasteString: vi.fn(), getLibrary: async () => [], importLibraryData: async () => null }))
vi.mock('../../src/main/services/profileStore', () => ({
  createProfile: async (...args: unknown[]) => {
    state.created.push(args)
    return { id: 'p1', name: 'x', createdAt: 0, updatedAt: 0 }
  },
  getProfileBundle: async () => ({ profile: { name: 'Hero' } }),
  importProfileBundle: async (...args: unknown[]) => {
    state.imported.push(args)
    return null
  },
  listProfiles: async () => []
}))
vi.mock('../../src/main/services/questDataset', () => ({ loadDataset: async () => ({ acts: [] }), resourcesDir: () => '' }))
vi.mock('../../src/main/services/bossMatcher', () => ({ buildBossIndex: () => ({}) }))
vi.mock('../../src/main/services/layoutResolver', () => ({ resolveLayout: vi.fn() }))
vi.mock('../../src/main/services/logTailer', () => ({
  logTailer: { on: vi.fn(), setBossIndex: vi.fn(), start: vi.fn(), stop: vi.fn(), getStatus: vi.fn() }
}))
vi.mock('../../src/main/hotkeys', () => ({ onHotkeyAction: vi.fn() }))
vi.mock('../../src/main/gameContext', () => ({ getRunningGameDef: () => ({ features: { campaign: true } }) }))

const call = (ch: string, ...args: unknown[]): unknown => {
  const fn = state.handlers.get(ch)
  if (!fn) throw new Error(`нет обработчика ${ch}`)
  return fn({}, ...args)
}

beforeEach(async () => {
  state.handlers.clear()
  state.dialogs = []
  state.created = []
  state.imported = []
  const { regexDomain } = await import('../../src/main/ipc/regex')
  const { campaignDomain } = await import('../../src/main/ipc/campaign')
  regexDomain.register()
  campaignDomain.register()
})

afterEach(() => {
  state.lang = 'en'
})

describe('dialogTitle', () => {
  it('RU и EN — один набор заголовков; в английских нет кириллицы', async () => {
    const { dialogTitle } = await import('../../src/main/services/dialogText')
    const keys = ['regexExport', 'regexImport', 'profileExport', 'profileImport', 'clientLog', 'clientLogPoe', 'dealsExport'] as const
    for (const k of keys) {
      expect(dialogTitle('en', k)).not.toMatch(/[а-яё]/i)
      expect(dialogTitle('ru', k)).toMatch(/[а-яё]/i)
    }
    // неизвестный язык — как раньше, по-русски
    expect(dialogTitle(undefined, 'regexExport')).toBe('Экспорт regex-строк')
  })
})

describe('диалоги main на языке интерфейса', () => {
  it.each([
    ['en', ['Export regex strings', 'Import regex strings', 'Export profile', 'Import profile', 'Choose Client.txt']],
    ['ru', ['Экспорт regex-строк', 'Импорт regex-строк', 'Экспорт профиля', 'Импорт профиля', 'Выберите Client.txt']]
  ] as const)('uiLang %s', async (lang, titles) => {
    state.lang = lang
    await call(IPC.regex.exportLibrary)
    await call(IPC.regex.importLibrary)
    await call(IPC.profiles.export, 'p1')
    await call(IPC.profiles.import)
    await call(IPC.tailer.pickLogFile)
    expect(state.dialogs.map((d) => d.title)).toEqual([...titles])
  })
})

describe('имена новых персонажей PoE 2 — на языке интерфейса', () => {
  it('создание и импорт получают язык интерфейса', async () => {
    state.lang = 'en'
    await call(IPC.profiles.create, '', undefined)
    await call(IPC.profiles.import)
    expect(state.created[0]).toEqual(['', undefined, 'en'])
    expect(state.imported[0]?.[1]).toBe('en')
  })
})
