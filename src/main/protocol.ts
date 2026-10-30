import { app, protocol } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { resolveLayoutFile, resolveBrandFile, contentTypeFor } from './services/layoutResolver'
import { resourcesDir } from './services/questDataset'
import { iconResponse } from './services/iconCache'

// Privileged scheme `poeth://` for serving local files to the renderer (works in
// both the dev http origin and the packaged file origin, unlike raw file:// URLs
// which are blocked by webSecurity). Routes:
//   poeth://brand/<file>                -> resources/brand/<file>
//   poeth://img/<areaId>/<file>         -> PoE2 layout image (bundled/cached/remote)
//   poeth://data/<game>/<lang>/<file>   -> userData/data/... (updates without reinstall),
//                                          then bundled resources/data/...
//   poeth://data/poe1/build/<file>      -> то же для данных вкладки «Билд» (S36: tree.json, gems.json; S39)
//   poeth://data/poe1/guide/<file>      -> то же для статей «Справочника» (S55: index.json, <id>.json)
//   poeth://icon/?u=<https://web.poecdn.com/…> -> userData/icons (S18, services/iconCache.ts)
export const SCHEME = 'poeth'

/** Must run before app `ready`. */
export function registerPoethScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      // corsEnabled + ACAO header: renderer pages (file:// / dev http origin) can fetch() data files
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

const GAME_RE = /^poe[12]$/
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/
/** Подпапки данных, которые не язык: только перечисленные (`build` — дерево и камни «Билда», S36; `guide` — статьи «Справочника», S55). */
const DATA_SUBDIRS: ReadonlySet<string> = new Set(['build', 'guide'])
// a single plain file name — no separators, no "..", no leading dot
const FILE_RE = /^[\w][\w.-]*$/

/** Layout/brand names may contain spaces ("g1_2 1.jpg") — only forbid path tricks. */
function isSafeName(s: string): boolean {
  return !!s && !s.startsWith('.') && !s.includes('..') && !/[\\/:*?"<>|\u0000]/.test(s)
}

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const p of candidates) {
    try {
      await fs.access(p)
      return p
    } catch {
      // try the next one
    }
  }
  return null
}

/** Resolve `poeth://data/<game>/<lang>/<file>`; null when invalid or missing. */
export async function resolveDataFile(
  game: string,
  lang: string,
  file: string
): Promise<string | null> {
  if (!GAME_RE.test(game) || !(LANG_RE.test(lang) || DATA_SUBDIRS.has(lang)) || !FILE_RE.test(file) || file.includes('..')) {
    return null
  }
  return firstExisting([
    path.join(app.getPath('userData'), 'data', game, lang, file),
    path.join(resourcesDir(), 'data', game, lang, file)
  ])
}

async function fileResponse(abs: string | null, file: string): Promise<Response> {
  if (!abs) return new Response('Not found', { status: 404 })
  const data = await fs.readFile(abs)
  return new Response(new Uint8Array(data), {
    headers: { 'Content-Type': contentTypeFor(file), 'Access-Control-Allow-Origin': '*' }
  })
}

/** Must run after app `ready`. */
export function handlePoethProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

      if (url.host === 'brand') {
        const file = segments[0]
        if (!file || !isSafeName(file)) return new Response('Bad request', { status: 400 })
        return fileResponse(await resolveBrandFile(file), file)
      }

      if (url.host === 'img') {
        const [areaId, file] = segments
        if (!areaId || !file || !isSafeName(areaId) || !isSafeName(file)) {
          return new Response('Bad request', { status: 400 })
        }
        return fileResponse(await resolveLayoutFile(areaId, file), file)
      }

      if (url.host === 'icon') return iconResponse(url.searchParams.get('u'))

      if (url.host === 'data') {
        const [game, lang, file] = segments
        if (!game || !lang || !file || segments.length !== 3) {
          return new Response('Bad request', { status: 400 })
        }
        return fileResponse(await resolveDataFile(game, lang, file), file)
      }

      return new Response('Not found', { status: 404 })
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}
