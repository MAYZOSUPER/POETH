import { describe, expect, it } from 'vitest'
import {
  buildUserAgent,
  isAccountUrl,
  isBlockedApiResponse,
  isCloudflareChallenge,
  isPoeHost,
  isSiteNavigationAllowed,
  isTrustedAppUrl,
  isValidPoesessid,
  maskHeaders,
  maskSecrets,
  parseAccountName,
  stripPartitioned
} from '../../src/main/net/guards'

// Сокращённая копия реального ответа www.pathofexile.com/trade/search/Standard для curl
// (2026-10-28): managed challenge Cloudflare. Токены вырезаны.
const CF_PAGE = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="robots" content="noindex,nofollow"></head><body><div class="main-wrapper" role="main">
<div class="main-content"><noscript><div class="h2"><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></div></noscript></div></div>
<script>(function(){window._cf_chl_opt = {cType: 'managed',cZone: 'www.pathofexile.com'};var a = document.createElement('script');
a.src = '/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=x';}());</script></body></html>`

const html = (status: number, body: string, extra: Record<string, string> = {}) => ({
  status,
  headers: { 'content-type': 'text/html; charset=UTF-8', ...extra },
  body
})
const json = (status: number, body: string) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body
})

describe('allowlist хостов сессии аккаунта', () => {
  it('только https и точные хосты GGG', () => {
    expect(isAccountUrl('https://www.pathofexile.com/api/trade/search/Standard')).toBe(true)
    expect(isAccountUrl('https://ru.pathofexile.com/api/trade/data/leagues')).toBe(true)
    expect(isAccountUrl('https://pathofexile.com/login')).toBe(true)
    expect(isAccountUrl('https://web.poecdn.com/image/x.png')).toBe(true)
    expect(isAccountUrl('http://www.pathofexile.com/api/trade/search/Standard')).toBe(false)
  })

  it('похожие и чужие хосты — нет', () => {
    for (const url of [
      'https://pathofexile.com.evil.com/api',
      'https://www.pathofexile.com.evil.com/',
      'https://evilpathofexile.com/',
      'https://www.pathofexile.com@evil.com/',
      'https://poe.ninja/api/data',
      'https://api.pathofexile.com/leagues', // поддомен не из списка — без cookies
      'wss://www.pathofexile.com/api/trade/live/x/y',
      'javascript:alert(1)',
      'not a url',
      42
    ]) {
      expect(isAccountUrl(url), String(url)).toBe(false)
    }
  })

  it('isPoeHost: сам домен и поддомены', () => {
    expect(isPoeHost('pathofexile.com')).toBe(true)
    expect(isPoeHost('WWW.PathOfExile.com')).toBe(true)
    expect(isPoeHost('pathofexile.com.evil.com')).toBe(false)
    expect(isPoeHost('xpathofexile.com')).toBe(false)
  })
})

describe('навигация окна сайта', () => {
  it('внутри pathofexile.com и проверка Cloudflare', () => {
    expect(isSiteNavigationAllowed('https://www.pathofexile.com/login')).toBe(true)
    expect(isSiteNavigationAllowed('https://ru.pathofexile.com/trade/search/Standard')).toBe(true)
    expect(isSiteNavigationAllowed('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x')).toBe(true)
  })

  it('всё остальное — нельзя', () => {
    for (const url of [
      'https://pathofexile.com.evil.com/login',
      'https://steamcommunity.com/openid/login',
      'http://www.pathofexile.com/login',
      'https://cloudflare.com/',
      'file:///C:/Windows/win.ini',
      'about:blank',
      'poeth://brand/logo.png'
    ]) {
      expect(isSiteNavigationAllowed(url), url).toBe(false)
    }
  })
})

describe('доверенные страницы приложения (IPC входа)', () => {
  it('file:// сборки и dev-сервер', () => {
    expect(isTrustedAppUrl('file:///C:/app/out/renderer/index.html')).toBe(true)
    expect(isTrustedAppUrl('http://localhost:5173/index.html', 'http://localhost:5173')).toBe(true)
  })
  it('сайт GGG и чужие — нет', () => {
    expect(isTrustedAppUrl('https://www.pathofexile.com/login')).toBe(false)
    expect(isTrustedAppUrl('http://localhost:5173/index.html')).toBe(false)
    expect(isTrustedAppUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false)
    expect(isTrustedAppUrl(undefined)).toBe(false)
  })
})

describe('детект Cloudflare / HTML', () => {
  it('«Just a moment…» (403) — челлендж', () => {
    expect(isCloudflareChallenge(html(403, CF_PAGE))).toBe(true)
    expect(isBlockedApiResponse(html(403, CF_PAGE))).toBe(true)
  })

  it('заголовок cf-mitigated: challenge — челлендж даже без тела', () => {
    expect(isCloudflareChallenge({ status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '' })).toBe(true)
  })

  it('обычная страница GGG (401 /my-account) со следами Cloudflare — не челлендж', () => {
    // реальные фрагменты: Turnstile формы входа и скрипт Bot Management на всех страницах
    const loginPage = html(
      401,
      '<!DOCTYPE html><html><head><title>Path of Exile</title>' +
        '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head>' +
        '<body><form action="/login"><input type="password"></form>' +
        "<script>(function(){var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';" +
        "document.getElementsByTagName('head')[0].appendChild(a);})();</script></body></html>"
    )
    expect(isCloudflareChallenge(loginPage)).toBe(false)
  })

  it('локализованный челлендж («Один момент…») узнаётся по служебным маркерам', () => {
    const ru = CF_PAGE.replace('Just a moment...', 'Один момент…')
    expect(isCloudflareChallenge(html(403, ru))).toBe(true)
    const onlyOrchestrate = html(
      403,
      "<html><head><title>x</title></head><script>a.src='/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=1'</script></html>"
    )
    expect(isCloudflareChallenge(onlyOrchestrate)).toBe(true)
  })

  it('HTML 403 без маркеров — не челлендж, но для API это blocked', () => {
    const page = html(403, '<!DOCTYPE html><html><title>Forbidden</title></html>')
    expect(isCloudflareChallenge(page)).toBe(false)
    expect(isBlockedApiResponse(page)).toBe(true)
  })

  it('HTML без content-type распознаётся по телу', () => {
    expect(isBlockedApiResponse({ status: 200, headers: {}, body: '  <html><body>oops</body></html>' })).toBe(true)
  })

  it('JSON-ответы API — не blocked', () => {
    expect(isBlockedApiResponse(json(200, '{"id":"abc","result":[]}'))).toBe(false)
    expect(isBlockedApiResponse(json(403, '{"error":{"code":6,"message":"Forbidden"}}'))).toBe(false)
    expect(isBlockedApiResponse(json(429, '{"error":{"code":3,"message":"Rate limit exceeded"}}'))).toBe(false)
  })
})

describe('маскирование секретов', () => {
  const sid = '0123456789abcdef0123456789abcdef'

  it('значения cookie и всё, похожее на POESESSID', () => {
    const out = maskSecrets(`Cookie: POESESSID=${sid}; cf_clearance=abc.def-123`)
    expect(out).not.toContain(sid)
    expect(out).not.toContain('abc.def-123')
    expect(maskSecrets(`POESESSID=${sid}`)).toBe('POESESSID=***')
    expect(maskSecrets(`cf_clearance=xyz; path=/`)).toBe('cf_clearance=***; path=/')
    expect(maskSecrets(`paste ${sid} failed`)).toBe('paste *** failed')
    expect(maskSecrets(`{"cookie":"POESESSID=${sid}"}`)).not.toContain(sid)
  })

  it('id предметов (64 hex) и обычный текст не трогаются', () => {
    const itemId = 'a'.repeat(64)
    expect(maskSecrets(`fetch/${itemId}?query=Ab3dE`)).toBe(`fetch/${itemId}?query=Ab3dE`)
    expect(maskSecrets('search Standard → 200')).toBe('search Standard → 200')
  })

  it('maskHeaders: cookie/set-cookie/authorization → ***', () => {
    expect(
      maskHeaders({
        Cookie: `POESESSID=${sid}`,
        'set-cookie': [`POESESSID=${sid}; path=/`],
        Authorization: 'Bearer x',
        'x-rate-limit-ip': '5:10:60'
      })
    ).toEqual({ Cookie: '***', 'set-cookie': '***', Authorization: '***', 'x-rate-limit-ip': '5:10:60' })
  })
})

describe('cookies и User-Agent', () => {
  it('Partitioned снимается только у Set-Cookie', () => {
    const h = {
      'Set-Cookie': ['POESESSID=x; path=/; domain=.pathofexile.com; secure; HttpOnly; SameSite=None; Partitioned'],
      'Content-Type': ['application/json']
    }
    expect(stripPartitioned(h)).toEqual({
      'Set-Cookie': ['POESESSID=x; path=/; domain=.pathofexile.com; secure; HttpOnly; SameSite=None'],
      'Content-Type': ['application/json']
    })
    const plain = { 'set-cookie': ['a=b; path=/'] }
    expect(stripPartitioned(plain)).toBe(plain)
    expect(stripPartitioned(undefined)).toBeUndefined()
  })

  it('UA: Chromium без Electron/имени приложения + POETH/<версия>', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) poeth/0.1.0 Chrome/144.0.7559.236 Electron/40.10.6 Safari/537.36'
    expect(buildUserAgent(ua, '0.1.0', ['poeth'])).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.7559.236 Safari/537.36 POETH/0.1.0'
    )
  })

  it('формат POESESSID', () => {
    expect(isValidPoesessid('0123456789abcdef0123456789ABCDEF')).toBe(true)
    expect(isValidPoesessid('0123456789abcdef0123456789abcde')).toBe(false)
    expect(isValidPoesessid('0123456789abcdef0123456789abcdeg')).toBe(false)
    expect(isValidPoesessid('POESESSID=0123456789abcdef0123456789abcdef')).toBe(false)
    expect(isValidPoesessid(undefined)).toBe(false)
  })

  it('имя аккаунта из ссылки на профиль', () => {
    expect(parseAccountName('https://www.pathofexile.com/account/view-profile/Some_Name-1234', '')).toBe(
      'Some_Name-1234'
    )
    expect(
      parseAccountName(
        'https://www.pathofexile.com/my-account',
        '<a href="/account/view-profile/%D0%98%D0%BC%D1%8F%231234/characters">x</a>'
      )
    ).toBe('Имя#1234')
    expect(parseAccountName('https://www.pathofexile.com/my-account', '<html></html>')).toBeUndefined()
  })
})
