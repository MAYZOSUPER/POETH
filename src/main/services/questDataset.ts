import { app } from 'electron'
import path from 'path'
import type {
  Act,
  Dataset,
  DatasetMeta,
  GemCatalog,
  LayoutManifest,
  Route
} from '@shared/types'
import { readJson } from './atomicJson'

/** Absolute path to the read-only `resources/` directory in dev and packaged builds. */
export function resourcesDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(app.getAppPath(), 'resources')
}

function dataDir(): string {
  return path.join(resourcesDir(), 'data')
}

interface DatasetIndex {
  acts: { id: string; file: string }[]
}

const fallbackMeta: DatasetMeta = {
  schemaVersion: '1.0.0',
  gamePatch: 'unknown',
  gameVersionLabel: 'Unknown',
  generatedAt: '',
  sources: [],
  actCount: 0
}

let cache: Dataset | null = null

export async function loadDataset(): Promise<Dataset> {
  if (cache) return cache

  const dir = dataDir()
  const meta = await readJson<DatasetMeta>(path.join(dir, 'dataset.meta.json'), fallbackMeta)
  const index = await readJson<DatasetIndex>(path.join(dir, 'index.json'), { acts: [] })

  const acts: Act[] = []
  for (const ref of index.acts) {
    const act = await readJson<Act | null>(path.join(dir, ref.file), null)
    if (act) acts.push(act)
  }

  const layouts = await readJson<LayoutManifest>(path.join(dir, 'layouts', 'index.json'), {})
  const gems = await readJson<GemCatalog | null>(path.join(dir, 'gems.json'), null)
  const route = await readJson<Route | null>(path.join(dir, 'route.json'), null)
  const areas = await readJson<Record<string, string>>(path.join(dir, 'areas.json'), {})
  const hints = await readJson<Record<string, import('@shared/types').ZoneHint>>(
    path.join(dir, 'hints.json'),
    {}
  )

  cache = {
    meta,
    acts,
    layouts,
    gems: gems ?? undefined,
    route: route ?? undefined,
    areas,
    hints
  }
  return cache
}
