import { app } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import { loadDataset, resourcesDir } from './questDataset'

// Layout images are served to the renderer through the custom `poe2img://`
// protocol (registered in main/index.ts). The protocol handler calls
// `resolveLayoutFile` which looks the image up in order:
//   1. bundled in resources/layouts (offline-first for shipped acts)
//   2. cached in %APPDATA%/layout-cache (previously fetched)
//   3. fetched from the remote base url (Exile-UI, MIT) and cached
// This keeps the install small while making visited zones available offline.

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'layout-cache')
}

function bundledDir(): string {
  return path.join(resourcesDir(), 'layouts')
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Build the renderer-facing image URLs for an area (does not fetch). */
export async function resolveLayout(areaId: string): Promise<string[]> {
  const ds = await loadDataset()
  const ref = ds.layouts[areaId]
  if (!ref || ref.files.length === 0) return []
  return ref.files.map(
    (file) => `poe2img://img/${encodeURIComponent(areaId)}/${encodeURIComponent(file)}`
  )
}

/** Resolve a single layout image to an absolute file path, fetching if needed. */
export async function resolveLayoutFile(areaId: string, file: string): Promise<string | null> {
  // 1. bundled
  const bundled = path.join(bundledDir(), file)
  if (await exists(bundled)) return bundled

  // 2. cache
  const cached = path.join(cacheDir(), areaId, file)
  if (await exists(cached)) return cached

  // 3. remote fetch + cache
  const ds = await loadDataset()
  const base = ds.meta.layoutRemoteBaseUrl
  if (!base) return null

  try {
    const res = await fetch(base + encodeURIComponent(file))
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.mkdir(path.dirname(cached), { recursive: true })
    await fs.writeFile(cached, buf)
    return cached
  } catch {
    return null
  }
}

/** Resolve a brand asset (logo, compass, icons) dropped into resources/brand/. */
export async function resolveBrandFile(file: string): Promise<string | null> {
  const p = path.join(resourcesDir(), 'brand', file)
  return (await exists(p)) ? p : null
}

export function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'image/jpeg'
  }
}
