// Что вставил игрок на экране «Билд» PoE 2: код PoB2 или ссылку (S66; чистый модуль, tests/pob/links2.test.ts).
// Отдельно от links.ts (PoE 1, его же собирает сайт «Стартеры») — тот не меняется.
// Ссылки — по таблице сайтов PoB-PoE2 (BuildSiteTools.lua, MIT):
//  - пасты pobb.in, pob.codes, pastebin, rentry — как у PoE 1;
//  - PoB-паста Maxroll — `maxroll.gg/poe2/pob/<id>`, сырой код — `maxroll.gg/poe2/api/pob/<id>`;
//  - poe2db — `poe2db.tw/pob/<id>` (`/<lang>/pob/<id>`), сырой код — `/pob/<id>/raw`;
//  - планнер и гайды Maxroll, Mobalytics, poe.ninja не тянем (условия сайтов, как у PoE 1) — «скопируйте код PoB»;
//  - ссылки на билды PoE 1 узнаём без сети — «это билд PoE 1».
// Загрузка — в main (src/main/pob/fetch.ts, проверка адреса — isPob2FetchUrl): https, только POB2_FETCH_HOSTS.

import { cleanPobCode } from './decode'
import { POB_FETCH_HOSTS, type PobCopySite, type PobSite } from './links'

/** Сайты, откуда берём сырой код PoB2. */
export type Pob2Site = PobSite | 'poe2db'

export type Pob2Input =
  | { kind: 'empty' }
  | { kind: 'code'; code: string }
  | { kind: 'link'; site: Pob2Site; id: string; rawUrl: string; pageUrl: string }
  | { kind: 'copy-code'; site: PobCopySite }
  /** ссылка на билд PoE 1 */
  | { kind: 'poe1' }
  /** ссылка на сайт не из списка (host — для подсказки «сайт не из списка») */
  | { kind: 'unknown-link'; host: string }
  | { kind: 'not-pob' }

/** Хосты, куда main может сходить за сырым кодом PoB2 (и куда допустимы редиректы). */
export const POB2_FETCH_HOSTS: ReadonlySet<string> = new Set([...POB_FETCH_HOSTS, 'poe2db.tw'])

/** Адрес можно загрузить: https, хост из allowlist PoE 2, без логина и нестандартного порта. */
export function isPob2FetchUrl(url: string | URL): boolean {
  let u: URL
  try {
    u = typeof url === 'string' ? new URL(url) : url
  } catch {
    return false
  }
  return u.protocol === 'https:' && POB2_FETCH_HOSTS.has(u.hostname) && !u.port && !u.username && !u.password
}

const ID = String.raw`[A-Za-z0-9_-]{4,40}`
const ALNUM = String.raw`[A-Za-z0-9]{4,40}`

type Found = { site: Pob2Site; id: string; rawUrl: string; pageUrl: string } | { copy: PobCopySite } | 'poe1'

interface Rule {
  hosts: readonly string[]
  /** путь (без хоста и query); группы — части id */
  path: RegExp
  build: (m: RegExpExecArray) => Found
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
    hosts: ['rentry.co', 'rentry.org'],
    path: new RegExp(`^/(?:paste/)?(${ID})(?:/raw)?/?$`),
    build: (m) => ({ site: 'rentry', id: m[1], rawUrl: `https://rentry.co/paste/${m[1]}/raw`, pageUrl: `https://rentry.co/${m[1]}` })
  },
  {
    hosts: ['maxroll.gg'],
    path: new RegExp(`^/poe2/(?:api/)?pob/(${ID})/?$`),
    build: (m) => ({ site: 'maxroll', id: m[1], rawUrl: `https://maxroll.gg/poe2/api/pob/${m[1]}`, pageUrl: `https://maxroll.gg/poe2/pob/${m[1]}` })
  },
  { hosts: ['maxroll.gg'], path: /^\/poe2\/(?:planner|build-guides)\//, build: () => ({ copy: 'maxroll-planner' }) },
  { hosts: ['maxroll.gg'], path: /^\/poe\//, build: () => 'poe1' },
  {
    hosts: ['poe2db.tw'],
    path: new RegExp(`^/(?:[a-z]{2}/)?pob/(${ID})(?:/raw)?/?$`),
    build: (m) => ({ site: 'poe2db', id: m[1], rawUrl: `https://poe2db.tw/pob/${m[1]}/raw`, pageUrl: `https://poe2db.tw/pob/${m[1]}` })
  },
  { hosts: ['poedb.tw'], path: /^\//, build: () => 'poe1' },
  { hosts: ['poe.ninja'], path: /^\/poe2\//, build: () => ({ copy: 'poeninja' }) },
  { hosts: ['poe.ninja'], path: /^\//, build: () => 'poe1' },
  { hosts: ['mobalytics.gg'], path: /^\/poe-2\//, build: () => ({ copy: 'mobalytics' }) },
  { hosts: ['mobalytics.gg'], path: /^\//, build: () => 'poe1' }
]

/** Первая ссылка в тексте («PoB: https://pobb.in/…»); схема не обязательна для известных хостов. */
function findUrl(text: string): string | null {
  const m = /\bhttps?:\/\/[^\s"'<>]+/i.exec(text)
  if (m) return m[0]
  const bare = /(?:^|\s)((?:www\.)?(?:pobb\.in|pastebin\.com|pob\.codes|api\.pob\.codes|poedb\.tw|poe2db\.tw|maxroll\.gg|rentry\.(?:co|org)|poe\.ninja|mobalytics\.gg)\/[^\s"'<>]*)/i.exec(text)
  return bare ? `https://${bare[1]}` : null
}

/** Ссылка → сайт; null — это не ссылка на билд. */
export function parsePob2Link(raw: string): Pob2Input | null {
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
    if (res === 'poe1') return { kind: 'poe1' }
    if ('copy' in res) return { kind: 'copy-code', site: res.copy }
    return { kind: 'link', ...res }
  }
  return { kind: 'unknown-link', host }
}

/** Разобрать вставленный текст: код, ссылка на сырой код, «скопируйте код», «это PoE 1» или «сайт не из списка». */
export function parsePob2Input(text: string): Pob2Input {
  const s = String(text ?? '').trim()
  if (!s) return { kind: 'empty' }
  // код PoB — base64url без пробелов внутри строк; ссылка в нём встретиться не может
  const code = cleanPobCode(s)
  if (code) return { kind: 'code', code: s }
  const url = s.length <= 4096 ? findUrl(s) : null
  if (url) return parsePob2Link(url) ?? { kind: 'not-pob' }
  return { kind: 'not-pob' }
}
