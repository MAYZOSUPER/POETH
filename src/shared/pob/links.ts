// Что вставил игрок во вкладку «Билд»: код PoB или ссылку (S35; чистый модуль, tests/pob/links.test.ts).
// Ссылки — по таблице сайтов PoB (BuildSiteTools.lua, MIT) и docs/pob.md:
//  - сырой код берём только с сайтов, где это допустимо разово по клику игрока: pobb.in, pastebin,
//    pob.codes, poedb, PoB-паста Maxroll, rentry;
//  - планнер и гайды Maxroll, Mobalytics, poe.ninja не тянем (условия сайтов) — «скопируйте код PoB»;
//  - ссылки на билды PoE 2 узнаём без сети — «это билд PoE 2».
// Загрузка — в main (src/main/pob/fetch.ts): https, только хосты POB_FETCH_HOSTS, редиректы внутри них.

import { cleanPobCode } from './decode'

/** Сайты, откуда берём сырой код. */
export type PobSite = 'pobbin' | 'pastebin' | 'pobcodes' | 'poedb' | 'maxroll' | 'rentry'
/** Сайты, где код надо скопировать кнопкой на странице (UI показывает, где кнопка). */
export type PobCopySite = 'maxroll-planner' | 'mobalytics' | 'poeninja'

export type PobInput =
  | { kind: 'empty' }
  | { kind: 'code'; code: string }
  | { kind: 'link'; site: PobSite; id: string; rawUrl: string; pageUrl: string }
  | { kind: 'copy-code'; site: PobCopySite }
  | { kind: 'poe2' }
  /** ссылка на сайт не из списка (host — для подсказки «сайт не из списка») */
  | { kind: 'unknown-link'; host: string }
  | { kind: 'not-pob' }

/** Хосты, куда main может сходить за сырым кодом (и куда допустимы редиректы). */
export const POB_FETCH_HOSTS: ReadonlySet<string> = new Set([
  'pobb.in',
  'pastebin.com',
  'api.pob.codes',
  'poedb.tw',
  'maxroll.gg',
  'rentry.co'
])

/** Адрес можно загрузить: https, хост из allowlist, без логина и нестандартного порта. */
export function isPobFetchUrl(url: string | URL): boolean {
  let u: URL
  try {
    u = typeof url === 'string' ? new URL(url) : url
  } catch {
    return false
  }
  return u.protocol === 'https:' && POB_FETCH_HOSTS.has(u.hostname) && !u.port && !u.username && !u.password
}

const ID = String.raw`[A-Za-z0-9_-]{4,40}`
const ALNUM = String.raw`[A-Za-z0-9]{4,40}`

interface Rule {
  hosts: readonly string[]
  /** путь (без хоста и query); группы — части id */
  path: RegExp
  build: (m: RegExpExecArray) => { site: PobSite; id: string; rawUrl: string; pageUrl: string } | { copy: PobCopySite } | 'poe2'
}

const RULES: readonly Rule[] = [
  {
    hosts: ['pobb.in'],
    path: new RegExp(`^/(?:pob/)?(?:u/(${ID})/)?(${ID})(?:/raw)?/?$`),
    build: (m) => {
      const id = m[1] ? `u/${m[1]}/${m[2]}` : m[2]
      return { site: 'pobbin', id, rawUrl: `https://pobb.in/${id}/raw`, pageUrl: `https://pobb.in/${id}` }
    }
  },
  {
    hosts: ['pastebin.com'],
    path: new RegExp(`^/(?:raw/)?(${ALNUM})/?$`),
    build: (m) => ({ site: 'pastebin', id: m[1], rawUrl: `https://pastebin.com/raw/${m[1]}`, pageUrl: `https://pastebin.com/${m[1]}` })
  },
  {
    hosts: ['pob.codes'],
    path: new RegExp(`^/b/(${ID})/?$`),
    build: (m) => ({ site: 'pobcodes', id: m[1], rawUrl: `https://api.pob.codes/${m[1]}/raw`, pageUrl: `https://pob.codes/b/${m[1]}` })
  },
  {
    hosts: ['api.pob.codes'],
    path: new RegExp(`^/(${ID})/raw/?$`),
    build: (m) => ({ site: 'pobcodes', id: m[1], rawUrl: `https://api.pob.codes/${m[1]}/raw`, pageUrl: `https://pob.codes/b/${m[1]}` })
  },
  {
    hosts: ['poedb.tw'],
    path: new RegExp(`^/(?:[a-z]{2}/)?pob/(${ID})(?:/raw)?/?$`),
    build: (m) => ({ site: 'poedb', id: m[1], rawUrl: `https://poedb.tw/pob/${m[1]}/raw`, pageUrl: `https://poedb.tw/pob/${m[1]}` })
  },
  {
    hosts: ['maxroll.gg'],
    path: new RegExp(`^/poe/(?:api/)?pob/(${ID})/?$`),
    build: (m) => ({ site: 'maxroll', id: m[1], rawUrl: `https://maxroll.gg/poe/api/pob/${m[1]}`, pageUrl: `https://maxroll.gg/poe/pob/${m[1]}` })
  },
  { hosts: ['maxroll.gg'], path: /^\/poe2\//, build: () => 'poe2' },
  { hosts: ['maxroll.gg'], path: /^\/poe\/(?:planner|build-guides)\//, build: () => ({ copy: 'maxroll-planner' }) },
  {
    hosts: ['rentry.co', 'rentry.org'],
    path: new RegExp(`^/(?:paste/)?(${ID})(?:/raw)?/?$`),
    build: (m) => ({ site: 'rentry', id: m[1], rawUrl: `https://rentry.co/paste/${m[1]}/raw`, pageUrl: `https://rentry.co/${m[1]}` })
  },
  { hosts: ['poe2db.tw'], path: /^\//, build: () => 'poe2' },
  { hosts: ['poe.ninja'], path: /^\/poe2\//, build: () => 'poe2' },
  { hosts: ['poe.ninja'], path: /^\//, build: () => ({ copy: 'poeninja' }) },
  { hosts: ['mobalytics.gg'], path: /^\/poe-2\//, build: () => 'poe2' },
  { hosts: ['mobalytics.gg'], path: /^\//, build: () => ({ copy: 'mobalytics' }) }
]

/** Первая ссылка в тексте («PoB: https://pobb.in/…»); схема не обязательна для известных хостов. */
function findUrl(text: string): string | null {
  const m = /\bhttps?:\/\/[^\s"'<>]+/i.exec(text)
  if (m) return m[0]
  const bare = /(?:^|\s)((?:www\.)?(?:pobb\.in|pastebin\.com|pob\.codes|api\.pob\.codes|poedb\.tw|poe2db\.tw|maxroll\.gg|rentry\.(?:co|org)|poe\.ninja|mobalytics\.gg)\/[^\s"'<>]*)/i.exec(text)
  return bare ? `https://${bare[1]}` : null
}

/** Ссылка → сайт; null — это не ссылка на билд. */
export function parsePobLink(raw: string): PobInput | null {
  let u: URL
  try {
    u = new URL(raw.replace(/[).,;!?]+$/, ''))
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { kind: 'unknown-link', host: '' }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (u.username || u.password || u.port) return { kind: 'unknown-link', host }
  for (const r of RULES) {
    if (!r.hosts.includes(host)) continue
    const m = r.path.exec(u.pathname)
    if (!m) continue
    const res = r.build(m)
    if (res === 'poe2') return { kind: 'poe2' }
    if ('copy' in res) return { kind: 'copy-code', site: res.copy }
    return { kind: 'link', ...res }
  }
  return { kind: 'unknown-link', host }
}

/** Разобрать вставленный текст: код, ссылка на сырой код, «скопируйте код» или «сайт не из списка». */
export function parsePobInput(text: string): PobInput {
  const s = String(text ?? '').trim()
  if (!s) return { kind: 'empty' }
  // код PoB — base64url без пробелов внутри строк; ссылка в нём встретиться не может
  const code = cleanPobCode(s)
  if (code) return { kind: 'code', code: s }
  const url = s.length <= 4096 ? findUrl(s) : null
  if (url) return parsePobLink(url) ?? { kind: 'not-pob' }
  return { kind: 'not-pob' }
}
