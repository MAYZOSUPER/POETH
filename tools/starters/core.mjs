// Модули «Стартеров» (TypeScript из src/shared) для инструмента лида в обычном Node: собираем их esbuild во
// временный .mjs и импортируем — как tools/advisor/core.mjs. Так add-starter.mjs проверяет записи тем же
// валидатором и считает отпечаток PoB тем же кодом, что приложение.

import esbuild from 'esbuild'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DATA_DIR = path.join(ROOT, 'resources/data/poe1')
export const STARTERS_DATA_DIR = path.join(DATA_DIR, 'starters')

let cached = null

/** schema, load, play, fingerprint + разбор ссылок PoB, allowlist ссылок автора, zlib, данные дерева и камней. */
export async function loadStartersCore() {
  if (cached) return cached
  const res = await esbuild.build({
    stdin: {
      contents: [
        "export * from './src/shared/starters/schema'",
        "export * from './src/shared/starters/load'",
        "export * from './src/shared/starters/play'",
        "export * from './src/shared/starters/fingerprint'",
        "export { parsePobInput, isPobFetchUrl } from './src/shared/pob/links'",
        "export { POB_CODE_MAX_CHARS } from './src/shared/pob/decode'",
        "export { isAuthorLinkUrl } from './src/shared/links'",
        "export { inflateNode } from './src/shared/advisor/codecNode'",
        "export { parseTreeData, parseGemsData, findGem, gemName } from './src/shared/build/data'"
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
      sourcefile: 'starters-core.ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
    logLevel: 'silent'
  })
  const tmp = path.join(os.tmpdir(), `poeth-starters-core.${process.pid}.${Date.now()}.mjs`)
  await fs.writeFile(tmp, res.outputFiles[0].text)
  try {
    cached = await import(pathToFileURL(tmp).href)
  } finally {
    await fs.rm(tmp, { force: true })
  }
  return cached
}
