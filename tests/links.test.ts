import { describe, expect, it } from 'vitest'
import { BOOSTY_URL, isAllowedExternalUrl, isSiteExternalUrl } from '@shared/links'

describe('isAllowedExternalUrl', () => {
  it('пропускает https на официальный сайт и Boosty', () => {
    expect(isAllowedExternalUrl(BOOSTY_URL)).toBe(true)
    expect(isAllowedExternalUrl('https://www.pathofexile.com/trade/search/Standard/abc')).toBe(true)
    expect(isAllowedExternalUrl('https://ru.pathofexile.com/trade')).toBe(true)
  })

  it('не пропускает http, чужие хосты, похожие домены и мусор', () => {
    expect(isAllowedExternalUrl('http://boosty.to/twistedthreadstudios')).toBe(false)
    expect(isAllowedExternalUrl('https://evil.example.com/')).toBe(false)
    expect(isAllowedExternalUrl('https://boosty.to.evil.com/')).toBe(false)
    expect(isAllowedExternalUrl('https://notboosty.to/')).toBe(false)
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl(42)).toBe(false)
  })
})

describe('isSiteExternalUrl (переходы из окна сайта)', () => {
  it('allowlist и прочий Steam — в системный браузер', () => {
    expect(isSiteExternalUrl(BOOSTY_URL)).toBe(true)
    expect(isSiteExternalUrl('https://store.steampowered.com/join/')).toBe(true)
    expect(isSiteExternalUrl('https://help.steampowered.com/wizard/HelpWithLogin')).toBe(true)
    expect(isSiteExternalUrl('https://steamcommunity.com/id/someone')).toBe(true)
  })

  it('renderer Steam не открывает; чужие и http — никуда', () => {
    expect(isAllowedExternalUrl('https://store.steampowered.com/')).toBe(false)
    expect(isSiteExternalUrl('http://store.steampowered.com/')).toBe(false)
    expect(isSiteExternalUrl('https://store.steampowered.com.evil.com/')).toBe(false)
    expect(isSiteExternalUrl('https://evil.example.com/')).toBe(false)
    expect(isSiteExternalUrl(42)).toBe(false)
  })
})
