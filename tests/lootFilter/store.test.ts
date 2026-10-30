import { describe, expect, it, vi } from 'vitest'

// S53: lootfilter.json — всё непонятное отбрасывается, чужие имена файлов в манифест не попадают.

vi.mock('electron', () => ({ app: { getPath: () => 'C:\\nowhere' } }))

const { normalizeLootFilterData, EMPTY_DATA } = await import('../../src/main/lootFilter/store')
const { ipcAllowed } = await import('../../src/main/security/policy')
const { IPC } = await import('@shared/ipc')

const abs = process.platform === 'win32' ? 'C:\\Games\\PoE' : '/games/poe'

describe('normalizeLootFilterData', () => {
  it('мусор — значения по умолчанию', () => {
    expect(normalizeLootFilterData(null)).toEqual(EMPTY_DATA)
    expect(normalizeLootFilterData({ prefs: { level: 9, style: 'evil', autoCheck: 'yes' }, dir: 'relative\\dir' })).toEqual(EMPTY_DATA)
  })

  it('выбор игрока и релиз сохраняются', () => {
    const d = normalizeLootFilterData({
      prefs: { level: 3, style: 'abyss', autoCheck: true },
      dir: abs,
      latest: { tag: '8.20.2', name: 'x', publishedAt: '2026-10-15T11:58:25Z' },
      lastCheckAt: 123,
      notifiedTag: '8.20.2'
    })
    expect(d.prefs).toEqual({ level: 3, style: 'abyss', autoCheck: true })
    expect(d.dir).toBe(abs)
    expect(d.latest).toEqual({ tag: '8.20.2', name: 'x', publishedAt: '2026-10-15T11:58:25Z' })
    expect(d.lastCheckAt).toBe(123)
    expect(d.notifiedTag).toBe('8.20.2')
  })

  it('в манифест попадают только свои имена файлов с SHA-256 и абсолютной папкой', () => {
    const ok = { file: 'POETH-NeverSink-1-REGULAR.filter', level: 1, style: 'default', tag: '8.20.2', sha256: 'a'.repeat(64), size: 10, installedAt: 'x', dir: abs }
    const d = normalizeLootFilterData({
      installed: [
        ok,
        { ...ok, file: 'MyFilter.filter' },
        { ...ok, file: '..\\POETH-NeverSink-1-REGULAR.filter' },
        { ...ok, sha256: 'zz' },
        { ...ok, dir: 'relative' },
        { ...ok, tag: '../x' }
      ]
    })
    expect(d.installed).toHaveLength(1)
    expect(d.installed[0].file).toBe('POETH-NeverSink-1-REGULAR.filter')
  })
})

describe('каналы фильтра лута — только компаньону', () => {
  it('overlay и сайдбар трейд-окна не могут ставить фильтр', () => {
    for (const ch of Object.values(IPC.lootFilter)) {
      expect(ipcAllowed('index', ch), ch).toBe(true)
      expect(ipcAllowed('overlay', ch), ch).toBe(false)
      expect(ipcAllowed('trade-sidebar', ch), ch).toBe(false)
      expect(ipcAllowed(null, ch), ch).toBe(false)
    }
  })
})
