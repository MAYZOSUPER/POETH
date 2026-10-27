// Общие хелперы тестов PoE1: данные с диска через внедряемый fetch, фикстуры.
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createPoe1DataStore, type DataFetch, type Poe1Lang } from '@shared/poe1/data'

export const DATA_DIR = resolve(__dirname, '../../resources/data/poe1')
export const FIXTURES_DIR = resolve(__dirname, '../fixtures/poe1')

/** fetch по `poeth://data/poe1/<lang>/<file>` → файл из resources/data/poe1 (как protocol.ts в приложении). */
export const diskFetch: DataFetch = async (url) => {
  const m = /^poeth:\/\/data\/poe1\/([a-z-]+)\/([\w.-]+)$/i.exec(url)
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

export const store = createPoe1DataStore({ fetch: diskFetch })

export function fixtureNames(lang: Poe1Lang): string[] {
  return readdirSync(resolve(FIXTURES_DIR, lang))
    .filter((f) => f.endsWith('.txt'))
    .map((f) => f.slice(0, -4))
    .sort()
}

export function readFixture(lang: Poe1Lang, name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, lang, `${name}.txt`), 'utf8')
}
