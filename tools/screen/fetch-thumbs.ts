// Пакет эскизов иконок для фикстур тестов распознавания (S68): каталог игры → иконки с web.poecdn.com
// (User-Agent POETH, без cookies и входа) → эскизы 24×24 → deflate → файл. Для разработки: в приложении
// эскизы собирает main из кэша иконок S18 (src/main/screen/catalog.ts).
//   node tools/screen/run.mjs tools/screen/fetch-thumbs.ts --game poe2 --tabs orbs,essence --extra 120 \
//     --out tests/fixtures/screen/poe2/thumbs.bin [--cache <папка для PNG>] [--names a,b,…]
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { deflateSync } from 'zlib'
import { parseCatalog, type CatalogEntry } from '@shared/screen/catalog'
import { makeThumb, type IconThumb } from '@shared/screen/icons'
import { parseLayoutSet } from '@shared/screen/layout'
import { encodeThumbs } from '@shared/screen/thumbs'
import { decodePng } from '../../src/main/screen/png'

const UA = 'POETH/0.1.0-rc.13 (+https://github.com/MAYZOSUPER/POETH)'

function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? def) : def
}

async function icon(e: CatalogEntry, cache: string): Promise<Uint8Array | null> {
  const u = new URL(e.icon)
  if (u.protocol !== 'https:' || u.hostname !== 'web.poecdn.com') return null
  const file = path.join(cache, `${Buffer.from(e.icon).toString('base64url').slice(-60)}.png`)
  try {
    return new Uint8Array(await fs.readFile(file))
  } catch {
    // нет в кэше — скачать
  }
  const res = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'error' })
  if (res.status !== 200) return null
  const b = new Uint8Array(await res.arrayBuffer())
  await fs.writeFile(file, b)
  return b
}

async function main(): Promise<void> {
  const game = arg('game', 'poe2') as 'poe1' | 'poe2'
  const out = arg('out')
  if (!out) throw new Error('--out <file> required')
  const cache = arg('cache', path.join(os.tmpdir(), 'poeth-screen-icons', game))
  await fs.mkdir(cache, { recursive: true })
  // запуск из корня репозитория (сборка esbuild лежит во временной папке)
  const root = process.cwd()
  const nd = await fs.readFile(path.join(root, `resources/data/${game}/en/items.ndjson`), 'utf8')
  const want = new Set<string>(arg('names') ? arg('names').split(',') : [])
  const tabs = arg('tabs') ? arg('tabs').split(',') : []
  if (tabs.length) {
    const set = parseLayoutSet(JSON.parse(await fs.readFile(path.join(root, `resources/data/${game}/screen/stash-layouts.json`), 'utf8')))
    for (const t of set?.tabs ?? []) if (tabs.includes(t.id)) for (const s of t.slots) for (const n of [s.item, ...(s.alt ?? [])]) if (n) want.add(n)
  }
  const catalog = parseCatalog(nd, game, want)
  const chosen = catalog.filter((e) => want.has(e.name))
  // отвлекающие — каждый k-й из остальных (детерминированно)
  const extra = Number(arg('extra', '0'))
  const rest = catalog.filter((e) => !want.has(e.name))
  if (extra > 0) for (let i = 0; i < rest.length && chosen.length < want.size + extra; i += Math.max(1, Math.floor(rest.length / extra))) chosen.push(rest[i])
  const thumbs: IconThumb[] = []
  let miss = 0
  for (let i = 0; i < chosen.length; i += 4) {
    const part = await Promise.all(chosen.slice(i, i + 4).map(async (e) => ({ e, b: await icon(e, cache).catch(() => null) })))
    for (const { e, b } of part) {
      if (!b) {
        miss++
        continue
      }
      try {
        thumbs.push(makeThumb(decodePng(b), e))
      } catch (err) {
        miss++
        console.warn(e.name, (err as Error).message)
      }
    }
  }
  const bin = deflateSync(encodeThumbs(thumbs), { level: 9 })
  await fs.writeFile(out, bin)
  console.log(`${out}: ${thumbs.length} эскизов (${miss} без иконки), ${bin.length} байт; не найдено в каталоге: ${[...want].filter((n) => !catalog.some((e) => e.name === n)).join(', ') || '—'}`)
}

void main()
