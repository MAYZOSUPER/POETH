// Модули советника (TypeScript из src/shared/advisor) для инструментов в обычном Node: собираем их esbuild
// (уже есть в зависимостях через vite, как в scripts/test-trade.mjs) во временный .mjs и импортируем.
// Так add-strategy.mjs и build-site.mjs проверяют стратегии тем же валидатором, что приложение.

import esbuild from 'esbuild'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DATA_DIR = path.join(ROOT, 'resources/data/poe1')
export const COMMUNITY_DIR = path.join(DATA_DIR, 'advisor/community')
export const SITE_DIR = path.join(ROOT, 'site/strategies')

let cached = null

/** codec (+ zlib), library, data, validate — одним модулем. */
export async function loadAdvisorCore() {
  if (cached) return cached
  const res = await esbuild.build({
    stdin: {
      contents: [
        "export * from './src/shared/advisor/codec'",
        "export * from './src/shared/advisor/codecNode'",
        "export * from './src/shared/advisor/library'",
        "export * from './src/shared/advisor/data'",
        "export * from './src/shared/advisor/validate'"
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
      sourcefile: 'advisor-core.ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
    logLevel: 'silent'
  })
  const tmp = path.join(os.tmpdir(), `poeth-advisor-core.${process.pid}.${Date.now()}.mjs`)
  await fs.writeFile(tmp, res.outputFiles[0].text)
  try {
    cached = await import(pathToFileURL(tmp).href)
  } finally {
    await fs.rm(tmp, { force: true })
  }
  return cached
}

/** Файлы каталога сообщества: [{ file, id, raw }] (имя файла без .json = id). */
export async function readCommunityFiles(dir = COMMUNITY_DIR) {
  let names = []
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort()
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const file = path.join(dir, name)
    const text = await fs.readFile(file, 'utf8')
    let raw = null
    try {
      raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    } catch {
      raw = null
    }
    out.push({ file, id: name.slice(0, -5), raw })
  }
  return out
}
