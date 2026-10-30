import { describe, expect, it, vi } from 'vitest'
import {
  BOOKMARK_LIMIT,
  SITES,
  bookmarkHosts,
  isKnownTab,
  isPublicHostname,
  isSitePermissionAllowed,
  isTabUrl,
  isWebTab,
  normalizeBookmarks,
  sitesOn,
  tabHome,
  tabHosts,
  validateBookmark,
  viewsToClose,
  type SiteBookmark
} from '@shared/sites'

vi.mock('electron', () => ({ app: { getPath: () => '.' } }))
const { normalizeSitesData } = await import('../../src/main/services/sitesStore')

// S43: реестр сайтов трейд-окна, закладки игрока, жизненный цикл вью.

let n = 0
const id = (): string => `b${++n}`

describe('реестр сайтов', () => {
  it('сайты по умолчанию — те, что в брифе, id и буквы не повторяются', () => {
    expect(SITES.map((s) => s.id)).toEqual(['ninja', 'poedb', 'wiki', 'maxroll', 'poelab', 'craft', 'scout'])
    expect(new Set(SITES.map((s) => s.mark)).size).toBe(SITES.length)
  })

  it('хосты — точные имена без схемы, ни один не принадлежит двум сайтам и GGG', () => {
    const all = SITES.flatMap((s) => s.hosts)
    expect(new Set(all).size).toBe(all.length)
    for (const h of all) {
      expect(h).toMatch(/^[a-z0-9.-]+\.[a-z]+$/)
      expect(h).not.toMatch(/pathofexile|poecdn/)
    }
  })

  it.each(['ru', 'en'] as const)('домашняя страница (%s) — https и страница своей вкладки', (lang) => {
    for (const s of SITES) {
      const home = s.home(lang)
      expect(home.startsWith('https://'), s.id).toBe(true)
      expect(isTabUrl(s.id, home, []), s.id).toBe(true)
      expect(tabHome(s.id, lang, [])).toBe(home)
    }
  })

  it('poedb — на языке клиента игры: /ru/ или /us/', () => {
    const poedb = SITES.find((s) => s.id === 'poedb')!
    expect(poedb.home('ru')).toBe('https://poedb.tw/ru/')
    expect(poedb.home('en')).toBe('https://poedb.tw/us/')
  })

  it('вики, poe.ninja, Maxroll и прочие — английские (подсказка EN на вкладке)', () => {
    expect(SITES.filter((s) => !s.enOnly).map((s) => s.id)).toEqual(['poedb'])
  })

  it('вкладки сайтов — только у PoE 1', () => {
    expect(sitesOn('poe1')).toBe(true)
    expect(sitesOn('poe2')).toBe(false)
  })

  it('вкладки: «Трейд» и «Сайты» — не сайты; закладка известна, только если есть', () => {
    const bm: SiteBookmark[] = [{ id: 'x1', title: 'Wiki RU', url: 'https://example.org/' }]
    expect(isWebTab('trade')).toBe(false)
    expect(isWebTab('manage')).toBe(false)
    expect(isWebTab('poedb')).toBe(true)
    expect(isWebTab('bm:x1')).toBe(true)
    expect(isKnownTab('bm:x1', bm)).toBe(true)
    expect(isKnownTab('bm:nope', bm)).toBe(false)
    expect(isKnownTab('evil', bm)).toBe(false)
    expect(isKnownTab(42, bm)).toBe(false)
    expect(tabHosts('trade', bm)).toEqual([])
    expect(tabHosts('bm:x1', bm)).toEqual(['example.org', 'www.example.org'])
  })

  it('разрешения страниц сайтов: только запись в буфер обмена', () => {
    expect(isSitePermissionAllowed('clipboard-sanitized-write')).toBe(true)
    for (const p of ['clipboard-read', 'media', 'geolocation', 'notifications', 'fullscreen', 'openExternal', 'hid', 'usb', 'storage-access'])
      expect(isSitePermissionAllowed(p), p).toBe(false)
  })
})

describe('закладки игрока', () => {
  it('https-адрес — закладка; название по умолчанию — хост без www', () => {
    const r = validateBookmark({ url: 'https://www.pathofexile-guide.org/a?b=1#top' }, [], id)
    expect(r.ok && r.bookmark.title).toBe('pathofexile-guide.org')
    expect(r.ok && r.bookmark.url).toBe('https://www.pathofexile-guide.org/a?b=1')
    expect(bookmarkHosts('https://www.site.org/')).toEqual(['www.site.org', 'site.org'])
  })

  it('адрес без схемы дополняется https://', () => {
    const r = validateBookmark({ url: 'poe-vault.com', title: '  Vault  ' }, [], id)
    expect(r.ok && r.bookmark).toMatchObject({ title: 'Vault', url: 'https://poe-vault.com/' })
  })

  it.each([
    ['http://example.org/', 'https'],
    ['ftp://example.org/', 'https'],
    ['javascript:alert(1)', 'https'],
    ['file:///C:/x', 'https'],
    ['https://localhost/', 'host'],
    ['https://127.0.0.1/', 'host'],
    ['https://192.168.1.1/', 'host'],
    ['https://[::1]/', 'host'],
    ['https://router.local/', 'host'],
    ['https://intranet/', 'host'],
    ['https://user:pass@example.org/', 'host'],
    ['https://example.org:8443/', 'host'],
    ['https://www.pathofexile.com/forum', 'poe'],
    ['https://ru.pathofexile.com/', 'poe'],
    ['https://web.poecdn.com/x', 'poe'],
    ['https://poedb.tw/us/', 'site'],
    ['https://www.poe.ninja/', 'site'],
    ['https://poewiki.net/', 'site'],
    ['не адрес', 'url'],
    ['', 'url']
  ])('%s — отказ (%s)', (url, reason) => {
    const r = validateBookmark({ url }, [], id)
    expect(r).toEqual({ ok: false, reason })
  })

  it('повтор хоста (и с www) и больше лимита — отказ', () => {
    const one = [{ id: 'a', title: 'A', url: 'https://site.org/' }]
    expect(validateBookmark({ url: 'https://www.site.org/x' }, one, id)).toEqual({ ok: false, reason: 'dup' })
    const many = Array.from({ length: BOOKMARK_LIMIT }, (_, i) => ({ id: `k${i}`, title: 'x', url: `https://s${i}.org/` }))
    expect(validateBookmark({ url: 'https://new.org/' }, many, id)).toEqual({ ok: false, reason: 'limit' })
  })

  it('из файла — только валидные закладки (http, чужой id, повтор — выброшены)', () => {
    const list = normalizeBookmarks([
      { id: 'a1', title: 'Ok', url: 'https://ok.org/' },
      { id: 'a2', title: 'Http', url: 'http://bad.org/' },
      { id: 'a1', title: 'Same id', url: 'https://other.org/' },
      { id: '../x', title: 'Bad id', url: 'https://other2.org/' },
      { id: 'a3', title: 'Poe', url: 'https://www.pathofexile.com/' },
      'мусор',
      null
    ])
    expect(list).toEqual([{ id: 'a1', title: 'Ok', url: 'https://ok.org/' }])
  })

  it('sites.json: неизвестная последняя вкладка забывается, «Трейд» последней вкладкой сайта не бывает', () => {
    expect(normalizeSitesData({ lastSite: 'poedb', noteSeen: true })).toEqual({ bookmarks: [], lastSite: 'poedb', noteSeen: true })
    expect(normalizeSitesData({ lastSite: 'bm:gone' }).lastSite).toBeNull()
    expect(normalizeSitesData({ lastSite: 'trade' }).lastSite).toBeNull()
    expect(normalizeSitesData({ noteSeen: 'yes' }).noteSeen).toBe(false)
    expect(normalizeSitesData(null)).toEqual({ bookmarks: [], lastSite: null, noteSeen: false })
  })

  it('имя хоста: публичное — с точкой, без IP и локальных зон', () => {
    expect(isPublicHostname('poe-vault.com')).toBe(true)
    expect(isPublicHostname('a.b.c.org')).toBe(true)
    for (const h of ['localhost', 'printer', '10.0.0.1', 'x.local', 'x.localhost', 'a..b', '-a.org', 'a_b.org', 'x.onion'])
      expect(isPublicHostname(h), h).toBe(false)
  })
})

describe('жизненный цикл вью', () => {
  const MIN = 60_000
  it('живых не больше трёх: закрываются самые давние, активная — никогда', () => {
    const now = 100 * MIN
    const views = [
      { tab: 'ninja' as const, lastActive: now - 1 * MIN },
      { tab: 'poedb' as const, lastActive: now - 2 * MIN },
      { tab: 'wiki' as const, lastActive: now - 3 * MIN },
      { tab: 'maxroll' as const, lastActive: now - 4 * MIN }
    ]
    expect(viewsToClose(views, 'maxroll', now)).toEqual(['wiki'])
    expect(viewsToClose(views, null, now)).toEqual(['maxroll'])
  })

  it('неактивная дольше 10 минут закрывается, активная — нет', () => {
    const now = 100 * MIN
    const views = [
      { tab: 'ninja' as const, lastActive: now - 11 * MIN },
      { tab: 'poedb' as const, lastActive: now - 2 * MIN }
    ]
    expect(viewsToClose(views, 'poedb', now)).toEqual(['ninja'])
    expect(viewsToClose(views, 'ninja', now)).toEqual([])
  })
})
