// Модули «Слухов журнала» (TypeScript из src/shared) для инструмента в обычном Node: собираем их esbuild во
// временный .mjs и импортируем — как tools/starters/core.mjs. Так генератор проверяет файл тем же валидатором,
// что приложение.

import esbuild from 'esbuild'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const RUMOURS_DATA_FILE = path.join(ROOT, 'resources/data/poe2/rumours/rumours.json')
/** Данные EE2 PoE 2 (items.ndjson): награды ссылаются на предметы оттуда. */
export const EE2_ITEMS = path.join(ROOT, 'resources/data/poe2/en/items.ndjson')

let cached = null

export async function loadRumoursCore() {
  if (cached) return cached
  const res = await esbuild.build({
    stdin: {
      contents: ["export * from './src/shared/rumours/schema'"].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
      sourcefile: 'rumours-core.ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
    logLevel: 'silent'
  })
  const tmp = path.join(os.tmpdir(), `poeth-rumours-core.${process.pid}.${Date.now()}.mjs`)
  await fs.writeFile(tmp, res.outputFiles[0].text)
  try {
    cached = await import(pathToFileURL(tmp).href)
  } finally {
    await fs.rm(tmp, { force: true })
  }
  return cached
}

/** Предметы EE2: ключ `ns:refName` (для проверки ссылок наград). */
export async function loadEe2ItemKeys(file = EE2_ITEMS) {
  const keys = new Set()
  const text = await fs.readFile(file, 'utf8')
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const x = JSON.parse(line)
    if (typeof x.refName === 'string' && typeof x.namespace === 'string') keys.add(`${x.namespace}:${x.refName}`)
  }
  return keys
}
