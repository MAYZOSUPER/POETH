import type { GameId } from '../games'
import type { LootFilterLink, LootFilterRelease } from '../types/lootFilter'

// Откуда POETH берёт фильтр NeverSink (S53). Официальный репозиторий NeverSinkDev/NeverSink-Filter (лицензия MIT),
// у релизов нет приложенных файлов — только архив исходников тега. Поэтому:
//  1) api.github.com — последний релиз (тег) и дерево файлов тега (git-SHA каждого файла — сверка содержимого);
//  2) codeload.github.com — ZIP тега (сюда же ведёт zipball_url, адрес строим сами — без редиректов).
// Только эти два хоста, только https, без логина/порта; адреса строятся из проверенного тега.
// S64: у PoE 2 свой репозиторий того же автора — NeverSinkDev/NeverSink-Filter-for-PoE2 (MIT, Copyright (c) 2026
// NeverSink; проверено 31.10.2026: релиз 0.10.4a от 15.10, файлы `NeverSink's filter 2 - <уровень>.filter`).
// Всё, что отличает игры, — в FILTER_SOURCES (данные): к PoE 2 1.0 (11.12) поменять можно здесь.

export interface FilterSource {
  owner: string
  repo: string
  /** ветка по умолчанию — ссылка на лицензию */
  branch: string
  /** начало имени файла уровня в релизе: `NeverSink's filter` / `NeverSink's filter 2` */
  fileBase: string
  /** папка фильтров внутри «Документов» */
  docsDir: readonly string[]
  /** файлы настроек игры в папке фильтров — признак «это папка игры» */
  configFiles: readonly string[]
  /** шапка файла должна называть игру (защита от фильтра другой игры); null — не проверяем (PoE 1, как в S53) */
  headerGame: RegExp | null
  filterblade: string
  /** ладдер фильтров на сайте игры (подписка без файлов): EN и RU */
  ladder: { en: string; ru: string }
}

export const FILTER_SOURCES: Record<GameId, FilterSource> = {
  poe1: {
    owner: 'NeverSinkDev',
    repo: 'NeverSink-Filter',
    branch: 'master',
    fileBase: "NeverSink's filter",
    docsDir: ['My Games', 'Path of Exile'],
    configFiles: ['production_Config.ini'],
    headerGame: null,
    filterblade: 'https://www.filterblade.xyz/?game=Poe1',
    ladder: {
      en: 'https://www.pathofexile.com/item-filter/ladder/follower',
      ru: 'https://ru.pathofexile.com/item-filter/ladder/follower'
    }
  },
  poe2: {
    owner: 'NeverSinkDev',
    repo: 'NeverSink-Filter-for-PoE2',
    branch: 'main',
    fileBase: "NeverSink's filter 2",
    docsDir: ['My Games', 'Path of Exile 2'],
    // у PoE 2 файл настроек — poe2_production_Config.ini (форум GGG); старое имя тоже считаем
    configFiles: ['poe2_production_Config.ini', 'production_Config.ini'],
    headerGame: /Path of Exile 2/i,
    filterblade: 'https://www.filterblade.xyz/?game=Poe2',
    // ладдер фильтров PoE 2 — на сайте pathofexile2.com (RU — раздел /ru/); что там фильтр NeverSink — проверка в игре (S64)
    ladder: {
      en: 'https://pathofexile2.com/item-filter/ladder/follower',
      ru: 'https://pathofexile2.com/ru/item-filter/ladder/follower'
    }
  }
}

export function filterSource(game: GameId = 'poe1'): FilterSource {
  return FILTER_SOURCES[game] ?? FILTER_SOURCES.poe1
}

const repoPath = (s: FilterSource): string => `/repos/${s.owner}/${s.repo}/`
const zipPath = (s: FilterSource): string => `/${s.owner}/${s.repo}/zip/refs/tags/`

export const NEVERSINK_OWNER = FILTER_SOURCES.poe1.owner
export const NEVERSINK_REPO = FILTER_SOURCES.poe1.repo

/** Хосты сети фильтра лута: API релизов и архив тега. Больше никуда. */
export const LOOT_FILTER_HOSTS: readonly string[] = ['api.github.com', 'codeload.github.com']

/** Последний релиз фильтра игры (без игры — PoE 1). */
export function latestReleaseUrl(game: GameId = 'poe1'): string {
  return `https://api.github.com${repoPath(filterSource(game))}releases/latest`
}

export const LATEST_RELEASE_URL = latestReleaseUrl('poe1')

/** Тег релиза NeverSink: «8.20.2», «8.20.1d», «8.19.0b», у PoE 2 — «0.10.4a». Короткий, без слэшей и пробелов. */
const TAG_RE = /^[0-9][0-9A-Za-z._-]{0,39}$/

export function isSafeTag(tag: unknown): tag is string {
  return typeof tag === 'string' && TAG_RE.test(tag) && !tag.includes('..')
}

/** ZIP тега на codeload (тот же архив, что zipball_url API, без редиректа). */
export function zipUrl(tag: string, game: GameId = 'poe1'): string {
  if (!isSafeTag(tag)) throw new Error('lootFilter: bad tag')
  return `https://codeload.github.com${zipPath(filterSource(game))}${encodeURIComponent(tag)}`
}

/** Дерево файлов тега: путь, размер и git-SHA каждого файла. */
export function treeUrl(tag: string, game: GameId = 'poe1'): string {
  if (!isSafeTag(tag)) throw new Error('lootFilter: bad tag')
  return `https://api.github.com${repoPath(filterSource(game))}git/trees/${encodeURIComponent(tag)}?recursive=1`
}

/**
 * Можно ли ходить на этот адрес: https, хост из LOOT_FILTER_HOSTS, без логина и порта, и только репозитории
 * NeverSink из FILTER_SOURCES (API — /repos/<владелец>/<репозиторий>/…, архив — /<владелец>/<репозиторий>/zip/…).
 */
export function isLootFilterUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 512) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password || u.hash) return false
  if (!LOOT_FILTER_HOSTS.includes(u.hostname)) return false
  if (u.pathname.includes('..') || u.pathname.includes('%2e') || u.pathname.includes('%2E')) return false
  const sources = Object.values(FILTER_SOURCES)
  if (u.hostname === 'api.github.com') return sources.some((s) => u.pathname.startsWith(repoPath(s)))
  return sources.some((s) => u.pathname.startsWith(zipPath(s)))
}

/** Точный адрес ссылки экрана (main открывает его в браузере); у 'release' — страница тега, без тега — список релизов. */
export function linkUrl(link: LootFilterLink, tag?: string | null, game: GameId = 'poe1', siteHost?: string): string | null {
  const s = filterSource(game)
  const repo = `https://github.com/${s.owner}/${s.repo}`
  switch (link) {
    case 'release':
      return tag && isSafeTag(tag) ? `${repo}/releases/tag/${encodeURIComponent(tag)}` : `${repo}/releases`
    case 'repo':
      return repo
    case 'license':
      return `${repo}/blob/${s.branch}/LICENSE`
    case 'filterblade':
      return s.filterblade
    case 'ladder':
      return ladderUrl(siteHost, game)
    default:
      return null
  }
}

/** Ладдер фильтров GGG: подписка на фильтр NeverSink без файлов (игра качает сама). RU — по хосту сайта игры. */
export function ladderUrl(siteHost: string | undefined, game: GameId = 'poe1'): string {
  const l = filterSource(game).ladder
  return siteHost === 'ru.pathofexile.com' ? l.ru : l.en
}

/** Ответ releases/latest → релиз; черновики, pre-release и подозрительный тег — null. */
export function parseRelease(json: unknown): LootFilterRelease | null {
  if (typeof json !== 'object' || json === null) return null
  const r = json as Record<string, unknown>
  if (r.draft === true || r.prerelease === true) return null
  if (!isSafeTag(r.tag_name)) return null
  const published = typeof r.published_at === 'string' && !Number.isNaN(Date.parse(r.published_at)) ? r.published_at : ''
  if (!published) return null
  const name = typeof r.name === 'string' ? r.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160) : ''
  return { tag: r.tag_name, name: name || r.tag_name, publishedAt: published }
}

export interface TreeBlob {
  path: string
  size: number
  /** git-SHA-1 содержимого: sha1("blob <size>\0" + байты) */
  sha: string
}

/** Файл из ответа git/trees: только blob с 40-значным SHA; обрезанное дерево (truncated) — null. */
export function findTreeBlob(json: unknown, path: string): TreeBlob | null {
  if (typeof json !== 'object' || json === null) return null
  const r = json as Record<string, unknown>
  if (r.truncated === true || !Array.isArray(r.tree)) return null
  for (const e of r.tree as unknown[]) {
    if (typeof e !== 'object' || e === null) continue
    const x = e as Record<string, unknown>
    if (x.path !== path || x.type !== 'blob') continue
    if (typeof x.sha !== 'string' || !/^[0-9a-f]{40}$/.test(x.sha)) return null
    if (typeof x.size !== 'number' || !Number.isInteger(x.size) || x.size < 0) return null
    return { path, size: x.size, sha: x.sha }
  }
  return null
}

/** «8.20.1d» → [8, 20, 1, 'd']; другой вид — null. */
function parseTag(tag: string): [number, number, number, string] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)([a-z]*)$/i.exec(tag)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4].toLowerCase()] : null
}

/** Новее ли тег `latest` установленного `installed` (8.20.2 > 8.20.1d > 8.20.1). Непонятный вид — просто «другой». */
export function isNewerTag(latest: string, installed: string): boolean {
  if (latest === installed) return false
  const a = parseTag(latest)
  const b = parseTag(installed)
  if (!a || !b) return true
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) > (b[i] as number)
  return a[3] > b[3]
}
