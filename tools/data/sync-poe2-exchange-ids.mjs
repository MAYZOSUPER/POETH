#!/usr/bin/env node
// S61: id фида обмена GGG для PoE 2 (realm poe2) → имена предметов — для «цены у Ange» и курса ex ↔ div.
//
//   node tools/data/sync-poe2-exchange-ids.mjs [--base <base_items.json>] [--feed <папка с часами *.json>] [--hours 6]
//   node tools/data/sync-poe2-exchange-ids.mjs --check     # только проверить, что все имена есть в данных EE2
//
// Английское имя — RePoE PoE 2 base_items.json (ключи — metadata-пути предметов). Берём классы предметов, которые
// встречаются на обмене (по часам фида), и все id из этих часов. Русское имя — из данных EE2
// (resources/data/poe2/ru/items.ndjson: name по refName = английскому имени). Окно цены ищет предмет по
// info.refName — поэтому английское имя обязано совпадать с refName EE2 (проверка ниже).
// Результат — resources/data/poe2/exchange/exchange-ids.json (короткий id без 'Metadata/Items/' → имя). Пересобирать
// вместе с данными EE2 после выхода патча/лиги PoE 2 (docs/league-update.md).

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = path.join(ROOT, 'resources/data/poe2')
const OUT = path.join(DATA, 'exchange/exchange-ids.json')
const BASE_URL = 'https://repoe-fork.github.io/poe2/base_items.json'
const FEED_URL = 'https://web.poecdn.com/api/currency-exchange/poe2'
const UA = 'POETH-data-sync (+https://github.com/MAYZOSUPER/POETH)'
const PREFIX = 'Metadata/Items/'
/** классы, которые всегда берём (даже если за эти часы их не меняли) */
const ALWAYS_CLASSES = ['StackableCurrency']

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : def
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw Object.assign(new Error(`${url}: HTTP ${res.status}`), { status: res.status })
  return res.json()
}

async function readNdjson(file) {
  const out = []
  for (const line of (await fs.readFile(file, 'utf8')).split('\n')) {
    const t = line.trim()
    if (t) out.push(JSON.parse(t))
  }
  return out
}

/** refName → имя на языке данных (только предметы, не камни умений без refName). */
async function ee2Names(lang) {
  const map = new Map()
  for (const it of await readNdjson(path.join(DATA, lang, 'items.ndjson'))) {
    if (typeof it.refName === 'string' && typeof it.name === 'string' && !map.has(it.refName)) map.set(it.refName, it.name)
  }
  return map
}

async function check() {
  const file = JSON.parse(await fs.readFile(OUT, 'utf8'))
  const [en, ru] = await Promise.all([ee2Names('en'), ee2Names('ru')])
  const bad = Object.entries(file.names).filter(([, name]) => !en.has(name))
  const badRu = Object.entries(file.ru ?? {}).filter(([id, name]) => ru.get(file.names[id]) !== name)
  // нет в EE2 — только то, что уже меняют у Ange, а данные EE2 ещё старые: такого предмета окно не узнает, не ошибка
  console.log(`exchange-ids PoE 2: ${Object.keys(file.names).length} имён; нет в EE2 en (новее данных EE2): ${bad.length}; RU не совпало: ${badRu.length}`)
  for (const [id, name] of [...bad, ...badRu].slice(0, 30)) console.log(`  ${id} — ${name}`)
  return badRu.length === 0
}

if (process.argv.includes('--check')) {
  process.exitCode = (await check()) ? 0 : 1
} else {
  const basePath = arg('--base')
  const base = basePath ? JSON.parse(await fs.readFile(basePath, 'utf8')) : await getJson(BASE_URL)
  const hours = Number(arg('--hours', '6'))

  // часы фида: из папки (--feed) или последние `hours` часов с CDN
  const feeds = []
  const feedDir = arg('--feed')
  if (feedDir) {
    for (const f of (await fs.readdir(feedDir)).filter((f) => f.endsWith('.json'))) {
      feeds.push(JSON.parse(await fs.readFile(path.join(feedDir, f), 'utf8')))
    }
  } else {
    const now = Math.floor(Date.now() / 3_600_000) * 3600
    for (let h = now - 3600; h > now - 3600 * (hours + 1); h -= 3600) {
      try {
        feeds.push(await getJson(`${FEED_URL}/${h}`))
      } catch {
        // час ещё не опубликован или сеть — следующий
      }
    }
  }
  if (!feeds.length) throw new Error('нет ни одного часа фида PoE 2')

  const feedIds = new Set()
  for (const feed of feeds) {
    for (const m of feed.markets ?? []) for (const id of m.market_pair ?? []) if (typeof id === 'string') feedIds.add(id)
  }
  const classes = new Set(ALWAYS_CLASSES)
  for (const id of feedIds) if (base[id]?.item_class) classes.add(base[id].item_class)

  const [en, ru] = await Promise.all([ee2Names('en'), ee2Names('ru')])
  const names = {}
  const ruNames = {}
  const noName = []
  const notInEe2 = []
  for (const [id, item] of Object.entries(base)) {
    if (!id.startsWith(PREFIX) || typeof item?.name !== 'string' || !item.name) continue
    if (item.release_state === 'unreleased') continue
    if (!feedIds.has(id) && !classes.has(item.item_class)) continue
    // не на обмене и нет в данных EE2 — окну цены не нужен (такого предмета из Ctrl+D не будет)
    if (!feedIds.has(id) && !en.has(item.name)) continue
    const short = id.slice(PREFIX.length)
    names[short] = item.name
    if (ru.has(item.name)) ruNames[short] = ru.get(item.name)
    if (!en.has(item.name)) notInEe2.push(`${short} — ${item.name}`)
  }
  for (const id of feedIds) if (!base[id]?.name) noName.push(id)

  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  const meta = JSON.parse(await fs.readFile(path.join(DATA, 'data.meta.json'), 'utf8'))
  await fs.mkdir(path.dirname(OUT), { recursive: true })
  await fs.writeFile(
    OUT,
    JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString().slice(0, 10),
      source: { repoe: 'repoe-fork poe2 base_items', feedHours: feeds.length, classes: [...classes].sort(), ee2Sha: meta.ee2Sha },
      names: sortObj(names),
      ru: sortObj(ruNames)
    }) + '\n'
  )
  console.log(
    `exchange-ids PoE 2: ${Object.keys(names).length} имён (из фида ${feedIds.size} id за ${feeds.length} ч), RU: ${Object.keys(ruNames).length}, ` +
      `без имени в RePoE: ${noName.length}, нет в EE2: ${notInEe2.length}`
  )
  for (const s of [...noName, ...notInEe2].slice(0, 30)) console.log(`  ${s}`)
}
