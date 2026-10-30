import { describe, expect, it } from 'vitest'
import { isSitesExternalUrl, isTabUrl, isTradeSearchUrl, siteNavDecision, type SiteBookmark } from '@shared/sites'

// S43: куда пускать главный фрейм вкладки сайта — только свой сайт; другой сайт реестра — в его вкладку,
// поиск трейда — во вкладку «Трейд», allowlist — в системный браузер, остальное — никуда.

const BM: SiteBookmark[] = [{ id: 'v1', title: 'Vault', url: 'https://www.poe-vault.com/guides' }]

describe('навигация вкладки сайта', () => {
  it.each([
    ['ninja', 'https://poe.ninja/poe1/economy/allflame/currency'],
    ['poedb', 'https://poedb.tw/ru/Headhunter'],
    ['wiki', 'https://www.poewiki.net/wiki/Headhunter'],
    ['wiki', 'https://poewiki.net/'],
    ['maxroll', 'https://maxroll.gg/poe/build-guides/x'],
    ['mobalytics', 'https://mobalytics.gg/poe'],
    ['mobalytics', 'https://mobalytics.gg/poe/builds/some-build'],
    ['poelab', 'https://www.poelab.com/'],
    ['craft', 'https://craftofexile.com/?game=poe1'],
    ['scout', 'https://poe2scout.com/'],
    ['bm:v1', 'https://poe-vault.com/x'],
    ['bm:v1', 'https://www.poe-vault.com/y']
  ] as const)('%s → свой сайт %s: можно', (tab, url) => {
    expect(siteNavDecision(tab, url, BM)).toEqual({ kind: 'allow' })
  })

  it('похожие хосты и поддомены — не свой сайт', () => {
    for (const url of [
      'https://poe.ninja.evil.com/',
      'https://evilpoe.ninja/',
      'https://ads.poe.ninja/',
      'https://poedb.tw.attacker.net/us/',
      'https://xpoedb.tw/'
    ]) {
      expect(isTabUrl('ninja', url, []), url).toBe(false)
      expect(siteNavDecision('poedb', url, []).kind, url).toBe('block')
    }
  })

  it('не https, логин в адресе, file:, data:, javascript: — никуда', () => {
    for (const url of [
      'http://poe.ninja/',
      'https://user:pw@poe.ninja/',
      'file:///C:/Windows/win.ini',
      'data:text/html,<b>x</b>',
      'javascript:alert(1)',
      'poeth://brand/x',
      'chrome://settings',
      'about:blank',
      '',
      'не адрес'
    ]) {
      expect(siteNavDecision('ninja', url, []), url).toEqual({ kind: 'block' })
    }
  })

  it('ссылка на другой сайт реестра — в его вкладку', () => {
    expect(siteNavDecision('ninja', 'https://poedb.tw/us/Headhunter', [])).toEqual({ kind: 'tab', tab: 'poedb' })
    expect(siteNavDecision('poedb', 'https://www.poewiki.net/wiki/Mirror', [])).toEqual({ kind: 'tab', tab: 'wiki' })
    expect(siteNavDecision('bm:v1', 'https://maxroll.gg/poe', BM)).toEqual({ kind: 'tab', tab: 'maxroll' })
  })

  it('поиск трейда — во вкладку «Трейд»; прочий pathofexile.com — в браузер', () => {
    const search = 'https://www.pathofexile.com/trade/search/Allflame?q=%7B%7D'
    expect(isTradeSearchUrl(search)).toBe(true)
    expect(siteNavDecision('ninja', search, [])).toEqual({ kind: 'trade' })
    expect(siteNavDecision('ninja', 'https://ru.pathofexile.com/trade/exchange/Allflame/abc123', [])).toEqual({ kind: 'trade' })
    // поддомен вне трейда не идёт в сессию аккаунта
    expect(siteNavDecision('ninja', 'https://evil.pathofexile.com/trade/search/Allflame', []).kind).not.toBe('trade')
    expect(siteNavDecision('ninja', 'https://www.pathofexile.com/forum/view-thread/1', [])).toEqual({ kind: 'external' })
    expect(siteNavDecision('ninja', 'https://www.pathofexile.com/logout', [])).toEqual({ kind: 'external' })
  })

  it('системный браузер — только allowlist @shared/links и сайты реестра', () => {
    expect(isSitesExternalUrl('https://boosty.to/x')).toBe(true)
    expect(isSitesExternalUrl('https://poe.ninja/')).toBe(true)
    expect(isSitesExternalUrl('https://www.youtube.com/watch?v=1')).toBe(false)
    expect(isSitesExternalUrl('https://accounts.google.com/o/oauth2')).toBe(false)
    expect(isSitesExternalUrl('http://poe.ninja/')).toBe(false)
    expect(siteNavDecision('maxroll', 'https://accounts.google.com/o/oauth2', [])).toEqual({ kind: 'block' })
    expect(siteNavDecision('poelab', 'https://doubleclick.net/ad', [])).toEqual({ kind: 'block' })
  })

  it('Mobalytics: только mobalytics.gg; вход через Google и Discord — не во вкладке и не в браузер (не allowlist)', () => {
    expect(siteNavDecision('mobalytics', 'https://app.mobalytics.gg/', []).kind).toBe('block')
    expect(siteNavDecision('mobalytics', 'https://mobalytics.gg.evil.com/poe', []).kind).toBe('block')
    expect(siteNavDecision('mobalytics', 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x', [])).toEqual({ kind: 'block' })
    expect(siteNavDecision('mobalytics', 'https://discord.com/oauth2/authorize?client_id=x', [])).toEqual({ kind: 'block' })
    // ссылки на сайты реестра — в их вкладки, на Mobalytics с poe.ninja — во вкладку Mobalytics
    expect(siteNavDecision('mobalytics', 'https://poe.ninja/poe1/builds', [])).toEqual({ kind: 'tab', tab: 'ninja' })
    expect(siteNavDecision('ninja', 'https://mobalytics.gg/poe/builds', [])).toEqual({ kind: 'tab', tab: 'mobalytics' })
    // «В браузере» и закладки: Mobalytics — сайт реестра
    expect(isSitesExternalUrl('https://mobalytics.gg/poe')).toBe(true)
  })

  it('чужая закладка вкладке закладки не своя', () => {
    expect(siteNavDecision('bm:v1', 'https://example.org/', BM)).toEqual({ kind: 'block' })
    expect(siteNavDecision('bm:gone', 'https://poe-vault.com/', BM)).toEqual({ kind: 'block' })
  })

  it('«Трейд» и «Сайты» этими правилами не ходят никуда сами', () => {
    expect(siteNavDecision('trade', 'https://www.pathofexile.com/trade', []).kind).not.toBe('allow')
    expect(siteNavDecision('manage', 'https://poe.ninja/', []).kind).not.toBe('allow')
  })
})
