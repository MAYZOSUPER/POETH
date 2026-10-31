import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { GameId } from '@shared/games'
import type { SiteBookmark, SiteTabId } from '@shared/sites'

// S64 (ревью): вкладка закладки ссылается на сайт реестра — во вкладку сайта ИГРЫ РЕЖИМА. Игру даёт siteTabs
// (опция game в hardenSitesContents); без неё — как в S43 (закладки по списку PoE 1).

const opened: string[] = []
vi.mock('electron', () => ({
  app: { isPackaged: true },
  shell: {
    openExternal: (url: string) => {
      opened.push(url)
      return Promise.resolve()
    }
  }
}))
vi.mock('../../src/main/net/session', () => ({ getSitesSession: () => ({}) }))
vi.mock('../../src/main/net/siteContents', () => ({ WEBRTC_IP_POLICY: 'disable_non_proxied_udp' }))
vi.mock('../../src/main/net/http', () => ({ netLog: () => undefined }))

const { hardenSitesContents } = await import('../../src/main/net/sitesContents')

class FakeWc extends EventEmitter {
  setWebRTCIPHandlingPolicy(): void {}
  setWindowOpenHandler(): void {}
  nav(url: string): boolean {
    let prevented = false
    this.emit('will-navigate', { url, isMainFrame: true, preventDefault: () => (prevented = true) })
    return prevented
  }
  click(): void {
    this.emit('input-event', {}, { type: 'mouseDown' })
  }
}

const BM: SiteBookmark[] = [{ id: 'v1', title: 'Vault', url: 'https://www.poe-vault.com/guides' }]

function setup(tab: SiteTabId, game?: GameId) {
  const wc = new FakeWc()
  const routed: { kind: string; tab?: string }[] = []
  const blocked: string[] = []
  hardenSitesContents(wc as never, {
    tab,
    bookmarks: () => BM,
    game: game ? () => game : undefined,
    onRoute: (nav) => routed.push(nav),
    onOpenHere: () => undefined,
    onBlocked: (url) => blocked.push(url)
  })
  return { wc, routed, blocked }
}

describe('ссылки из закладки в режиме PoE 2', () => {
  it.each([
    ['https://poe2db.tw/ru/Waystones', 'poe2db'],
    ['https://www.poe2wiki.net/wiki/Waystone', 'wiki2'],
    ['https://poe2.re/', 'poe2re'],
    ['https://poe.ninja/poe2/economy', 'ninja2']
  ])('%s → вкладка %s', (url, tab) => {
    const { wc, routed, blocked } = setup('bm:v1', 'poe2')
    wc.click()
    expect(wc.nav(url)).toBe(true)
    expect(routed).toEqual([{ kind: 'tab', tab }])
    expect(blocked).toEqual([])
  })

  it('без игры — как в S43: сайты PoE 2 для закладки не реестр (никуда), poe.ninja — вкладка PoE 1', () => {
    const a = setup('bm:v1')
    a.wc.click()
    a.wc.nav('https://poe2db.tw/ru/')
    expect(a.routed).toEqual([])
    const b = setup('bm:v1')
    b.wc.click()
    b.wc.nav('https://poe.ninja/poe1/economy')
    expect(b.routed).toEqual([{ kind: 'tab', tab: 'ninja' }])
  })

  it('в режиме PoE 1 закладка ведёт на сайты PoE 1', () => {
    const { wc, routed } = setup('bm:v1', 'poe1')
    wc.click()
    wc.nav('https://poedb.tw/us/Headhunter')
    expect(routed).toEqual([{ kind: 'tab', tab: 'poedb' }])
  })
})
