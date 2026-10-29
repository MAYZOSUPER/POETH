import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { deflateSync } from 'zlib'
import { inflateNode } from '@shared/advisor/codecNode'
import { decodePobCode } from '@shared/pob/decode'

export const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'pob')

/** Имена фикстур без .txt (README.md не код). */
export const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.txt'))
  .map((f) => f.slice(0, -4))
  .sort()

export const POE1_FIXTURES = FIXTURES.filter((f) => !f.startsWith('poe2-'))
export const POE2_FIXTURES = FIXTURES.filter((f) => f.startsWith('poe2-'))

export function fixtureCode(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.txt`), 'utf8').trim()
}

export function fixtureXml(name: string): string {
  const res = decodePobCode(fixtureCode(name), inflateNode)
  if (!res.ok) throw new Error(`${name}: ${res.error}`)
  return res.xml
}

/** XML → код PoB (как PoB: zlib + base64url). */
export function encodePob(xml: string | Uint8Array): string {
  return deflateSync(typeof xml === 'string' ? Buffer.from(xml, 'utf8') : Buffer.from(xml))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}
