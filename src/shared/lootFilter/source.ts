import type { LootFilterLink, LootFilterRelease } from '../types/lootFilter'

// Откуда POETH берёт фильтр NeverSink (S53). Официальный репозиторий NeverSinkDev/NeverSink-Filter (лицензия MIT),
// у релизов нет приложенных файлов — только архив исходников тега. Поэтому:
//  1) api.github.com — последний релиз (тег) и дерево файлов тега (git-SHA каждого файла — сверка содержимого);
//  2) codeload.github.com — ZIP тега (сюда же ведёт zipball_url, адрес строим сами — без редиректов).
// Только эти два хоста, только https, без логина/порта; адреса строятся из проверенного тега.

export const NEVERSINK_OWNER = 'NeverSinkDev'
export const NEVERSINK_REPO = 'NeverSink-Filter'
const REPO_PATH = `/repos/${NEVERSINK_OWNER}/${NEVERSINK_REPO}/`
const ZIP_PATH = `/${NEVERSINK_OWNER}/${NEVERSINK_REPO}/zip/refs/tags/`

/** Хосты сети фильтра лута: API релизов и архив тега. Больше никуда. */
export const LOOT_FILTER_HOSTS: readonly string[] = ['api.github.com', 'codeload.github.com']

export const LATEST_RELEASE_URL = `https://api.github.com${REPO_PATH}releases/latest`

/** Тег релиза NeverSink: «8.20.2», «8.20.1d», «8.19.0b». Короткий, без слэшей и пробелов. */
const TAG_RE = /^[0-9][0-9A-Za-z._-]{0,39}$/

export function isSafeTag(tag: unknown): tag is string {
  return typeof tag === 'string' && TAG_RE.test(tag) && !tag.includes('..')
}

/** ZIP тега на codeload (тот же архив, что zipball_url API, без редиректа). */
export function zipUrl(tag: string): string {
  if (!isSafeTag(tag)) throw new Error('lootFilter: bad tag')
  return `https://codeload.github.com${ZIP_PATH}${encodeURIComponent(tag)}`
}

/** Дерево файлов тега: путь, размер и git-SHA каждого файла. */
export function treeUrl(tag: string): string {
  if (!isSafeTag(tag)) throw new Error('lootFilter: bad tag')
  return `https://api.github.com${REPO_PATH}git/trees/${encodeURIComponent(tag)}?recursive=1`
}

/**
 * Можно ли ходить на этот адрес: https, хост из LOOT_FILTER_HOSTS, без логина и порта, и только репозиторий
 * NeverSink (API — /repos/NeverSinkDev/NeverSink-Filter/…, архив — /NeverSinkDev/NeverSink-Filter/zip/…).
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
  if (u.hostname === 'api.github.com') return u.pathname.startsWith(REPO_PATH)
  return u.pathname.startsWith(ZIP_PATH)
}

const LINKS: Record<Exclude<LootFilterLink, 'release'>, string> = {
  repo: `https://github.com/${NEVERSINK_OWNER}/${NEVERSINK_REPO}`,
  license: `https://github.com/${NEVERSINK_OWNER}/${NEVERSINK_REPO}/blob/master/LICENSE`,
  filterblade: 'https://www.filterblade.xyz/?game=Poe1'
}

/** Точный адрес ссылки экрана (main открывает его в браузере); у 'release' — страница тега, без тега — список релизов. */
export function linkUrl(link: LootFilterLink, tag?: string | null): string | null {
  if (link === 'release') {
    const base = `https://github.com/${NEVERSINK_OWNER}/${NEVERSINK_REPO}/releases`
    return tag && isSafeTag(tag) ? `${base}/tag/${encodeURIComponent(tag)}` : base
  }
  return LINKS[link] ?? null
}

/** Ладдер фильтров GGG: подписка на фильтр NeverSink без файлов (игра качает сама). */
export function ladderUrl(siteHost: string | undefined): string {
  const host = siteHost === 'ru.pathofexile.com' ? 'ru.pathofexile.com' : 'www.pathofexile.com'
  return `https://${host}/item-filter/ladder/follower`
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
