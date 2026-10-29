import { pathToFileURL } from 'url'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { IPC } from '@shared/ipc'
import {
  appNavigationAllowed,
  appPageOf,
  appPermissionAllowed,
  ipcAllowed,
  isAppUrl,
  GAME_INPUT_CHANNELS,
  SECRET_CHANNELS
} from '../../src/main/security/policy'

// Чьи страницы и какие каналы IPC им можно (S29, src/main/security/policy.ts).

const RENDERER = resolve('C:/Users/Игрок/AppData/Local/Programs/POETH/resources/app.asar/out/renderer')
const PACKED = { rendererDir: RENDERER }
const DEV = { rendererDir: RENDERER, devServerUrl: 'http://localhost:5173' }
const page = (name: string, query = ''): string => pathToFileURL(resolve(RENDERER, name)).href + query

describe('appPageOf — наши страницы', () => {
  it('собранные страницы из папки renderer (с пробелами и кириллицей в пути)', () => {
    expect(appPageOf(page('index.html'), PACKED)).toBe('index')
    expect(appPageOf(page('index.html', '?view=update'), PACKED)).toBe('index')
    expect(appPageOf(page('overlay.html'), PACKED)).toBe('overlay')
    expect(appPageOf(page('trade-sidebar.html'), PACKED)).toBe('trade-sidebar')
    const spaced = resolve('H:/POE Trade Helper/out/renderer')
    expect(appPageOf(pathToFileURL(resolve(spaced, 'index.html')).href, { rendererDir: spaced })).toBe('index')
  })

  it('dev-сервер — только в dev (адрес задан)', () => {
    expect(appPageOf('http://localhost:5173/overlay.html', DEV)).toBe('overlay')
    expect(appPageOf('http://localhost:5173/overlay.html', PACKED)).toBeNull()
    expect(appPageOf('http://localhost:5174/overlay.html', DEV)).toBeNull()
  })

  it.each([
    ['сайт GGG', 'https://www.pathofexile.com/trade/search/Mercenaries'],
    ['страница входа', 'https://www.pathofexile.com/login'],
    ['чужой сайт с тем же именем файла', 'https://evil.example/index.html'],
    ['file:// вне папки renderer', pathToFileURL(resolve('C:/Users/Игрок/Downloads/index.html')).href],
    ['обход папки через ..', page('../renderer-evil/index.html')],
    ['соседняя папка с похожим именем', pathToFileURL(resolve(`${RENDERER}-evil`, 'index.html')).href],
    ['неизвестная страница', page('other.html')],
    ['about:blank', 'about:blank'],
    ['пусто', ''],
    ['не строка', null]
  ])('%s — не наша страница', (_name, url) => {
    expect(appPageOf(url, DEV)).toBeNull()
  })

  it('isAppUrl: папка renderer — да, файл вне неё — нет', () => {
    expect(isAppUrl(page('assets/index-abc.js'), PACKED)).toBe(true)
    expect(isAppUrl(pathToFileURL('C:/Windows/win.ini').href, PACKED)).toBe(false)
  })
})

describe('ipcAllowed — какие каналы может звать страница', () => {
  it('чужой отправитель (сайт GGG, неизвестный адрес) — ни одного канала', () => {
    for (const ch of [IPC.settings.get, IPC.overlay.typeInChat, IPC.auth.status, IPC.fav.importBt]) {
      expect(ipcAllowed(null, ch)).toBe(false)
    }
  })

  it('ввод в игру — компаньон и оверлей, но не сайдбар трейд-окна', () => {
    for (const ch of GAME_INPUT_CHANNELS) {
      expect(ipcAllowed('index', ch)).toBe(true)
      expect(ipcAllowed('overlay', ch)).toBe(true)
      expect(ipcAllowed('trade-sidebar', ch), ch).toBe(false)
    }
    expect([...GAME_INPUT_CHANNELS]).toEqual(
      expect.arrayContaining([IPC.overlay.typeInChat, IPC.overlay.stashSearch, IPC.deals.action, IPC.live.whisper])
    )
  })

  it('вставка POESESSID — только компаньон', () => {
    for (const ch of SECRET_CHANNELS) {
      expect(ipcAllowed('index', ch)).toBe(true)
      expect(ipcAllowed('overlay', ch)).toBe(false)
      expect(ipcAllowed('trade-sidebar', ch)).toBe(false)
    }
  })

  it('сайдбару — то, что он использует: избранное, вход/выход, настройки, трейд-окно', () => {
    for (const ch of [IPC.fav.importBt, IPC.fav.saveSearch, IPC.auth.login, IPC.auth.logout, IPC.settings.get, IPC.settings.set]) {
      expect(ipcAllowed('trade-sidebar', ch), ch).toBe(true)
    }
  })
})

describe('appNavigationAllowed — куда может уйти наша страница сама', () => {
  it('только свои страницы и devtools', () => {
    expect(appNavigationAllowed(page('index.html', '?view=splash'), PACKED)).toBe(true)
    expect(appNavigationAllowed('devtools://devtools/bundled/inspector.html', PACKED)).toBe(true)
  })

  it.each([
    'https://www.pathofexile.com/',
    'https://boosty.to/twistedthreadstudios',
    'http://localhost:5173/index.html',
    pathToFileURL('C:/Users/Игрок/Desktop/evil.html').href,
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'steam://run/238960',
    'ms-settings:privacy'
  ])('%s — нельзя (в собранной версии)', (url) => {
    expect(appNavigationAllowed(url, PACKED)).toBe(false)
  })
})

describe('appPermissionAllowed — разрешения своих страниц', () => {
  it('буфер обмена — своим страницам', () => {
    expect(appPermissionAllowed('clipboard-sanitized-write', page('index.html'), PACKED)).toBe(true)
    expect(appPermissionAllowed('clipboard-read', page('index.html'), PACKED)).toBe(true)
  })

  it.each(['media', 'geolocation', 'notifications', 'openExternal', 'hid', 'usb', 'serial', 'fullscreen', 'pointerLock'])(
    '%s — нет даже своим страницам',
    (perm) => {
      expect(appPermissionAllowed(perm, page('index.html'), PACKED)).toBe(false)
    }
  )

  it('чужому адресу — ничего', () => {
    expect(appPermissionAllowed('clipboard-sanitized-write', 'https://www.pathofexile.com/', PACKED)).toBe(false)
    expect(appPermissionAllowed('clipboard-read', undefined, PACKED)).toBe(false)
  })
})
