#!/usr/bin/env node
// Сопоставление id фида обмена GGG с английскими именами предметов (S11a).
//
//   node tools/wealth/sync-exchange-ids.mjs [--base <base_items.json>] [--hours 48]
//
// Источник имён — RePoE base_items.json (ключи — metadata-пути предметов): берём папки,
// которые бывают на обмене (Currency, DivinationCards, MapFragments, Scarabs, …), плюс все id,
// встретившиеся в фиде за последние часы. Результат — resources/data/poe1/wealth/exchange-ids.json
// (короткий id без 'Metadata/Items/' → имя). Перезапускать после выхода лиги/патча.

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'resources/data/poe1/wealth/exchange-ids.json')
const BASE_URL = 'https://repoe-fork.github.io/base_items.json'
const FEED_URL = 'https://web.poecdn.com/api/currency-exchange'
const UA = 'POETH-data-sync (+https://github.com/MAYZOSUPER/POETH)'
const FOLDERS = ['Currency', 'DivinationCards', 'MapFragments', 'Scarabs', 'AtlasExiles', 'Delve', 'Heist', 'Deepwater']
const PREFIX = 'Metadata/Items/'

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : def
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

const basePath = arg('--base')
const base = basePath ? JSON.parse(await fs.readFile(basePath, 'utf8')) : await getJson(BASE_URL)
const hours = Number(arg('--hours', '48'))

const names = {}
for (const [id, item] of Object.entries(base)) {
  if (!id.startsWith(PREFIX) || typeof item?.name !== 'string' || !item.name) continue
  if (item.release_state === 'unreleased') continue
  const short = id.slice(PREFIX.length)
  if (FOLDERS.includes(short.split('/')[0])) names[short] = item.name
}

// id из фида, которых нет в папках выше (новые категории) — тоже по base_items
let feedIds = 0
let missing = []
const now = Math.floor(Date.now() / 3_600_000) * 3600
for (let h = now - 3600; h > now - 3600 * (hours + 1); h -= 3600) {
  let feed
  try {
    feed = await getJson(`${FEED_URL}/${h}`)
  } catch {
    continue
  }
  for (const m of feed.markets ?? []) {
    for (const id of m.market_pair ?? []) {
      if (typeof id !== 'string' || !id.startsWith(PREFIX)) continue
      const short = id.slice(PREFIX.length)
      if (names[short]) continue
      const name = base[id]?.name
      if (name) {
        names[short] = name
        feedIds++
      } else missing.push(short)
    }
  }
}
missing = [...new Set(missing)]

const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b)))
await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(
  OUT,
  JSON.stringify({ version: 1, generatedAt: new Date().toISOString().slice(0, 10), names: sorted }, null, 0) + '\n'
)
console.log(`exchange-ids: ${Object.keys(sorted).length} имён (+${feedIds} из фида), без имени: ${missing.length}`)
if (missing.length) console.log(missing.slice(0, 30).join('\n'))
