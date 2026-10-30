// Общие хелперы тестов PoE2: данные с диска через внедряемый fetch, фикстуры (как tests/poe1/helpers.ts).
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import type { DataFetch } from '@shared/poe1/data'
import { createPoe2DataStore, type Poe2Lang } from '@shared/poe2/data'

export const DATA_DIR = resolve(__dirname, '../../resources/data/poe2')
export const FIXTURES_DIR = resolve(__dirname, '../fixtures/poe2')

/** fetch по `poeth://data/poe2/<lang>/<file>` → файл из resources/data/poe2 (как protocol.ts в приложении). */
export const diskFetch: DataFetch = async (url) => {
  const m = /^poeth:\/\/data\/poe2\/([a-z-]+)\/([\w.-]+)$/i.exec(url)
  if (!m) return { ok: false, status: 400, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }
  let buf: Buffer
  try {
    buf = readFileSync(resolve(DATA_DIR, m[1], m[2]))
  } catch {
    return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }
  }
  return {
    ok: true,
    status: 200,
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  }
}

export const store = createPoe2DataStore({ fetch: diskFetch })

export function fixtureNames(lang: Poe2Lang): string[] {
  return readdirSync(resolve(FIXTURES_DIR, lang))
    .filter((f) => f.endsWith('.txt'))
    .map((f) => f.slice(0, -4))
    .sort()
}

export function readFixture(lang: Poe2Lang, name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, lang, `${name}.txt`), 'utf8')
}
