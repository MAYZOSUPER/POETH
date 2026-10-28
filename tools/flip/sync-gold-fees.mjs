#!/usr/bin/env node
// Комиссия биржи Фаустуса в золоте за каждую купленную единицу (S13, флиппинг).
//
//   node tools/flip/sync-gold-fees.mjs [--html <сохранённая страница poedb>]
//
// Источник — таблица poedb «Currency Exchange» (https://poedb.tw/us/Currency_Exchange): предмет → золото
// за штуку (у дешёвых бывает дробь вида «1/1000»). Результат — resources/data/poe1/flip/gold-fees.json
// (английское имя → золото за штуку); едет каналом обновления данных, перезапускать после патча/лиги.
// Имена сверяются с resources/data/poe1/wealth/exchange-ids.json (id фида обмена GGG → имя).

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'resources/data/poe1/flip/gold-fees.json')
const IDS = path.join(ROOT, 'resources/data/poe1/wealth/exchange-ids.json')
const URL_ = 'https://poedb.tw/us/Currency_Exchange'
const UA = 'POETH-data-sync (+https://github.com/MAYZOSUPER/POETH)'

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

function decode(s) {
  return s
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()
}

function toNumber(v) {
  const t = v.replace(/,/g, '')
  const frac = /^(\d+)\/(\d+)$/.exec(t)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const htmlPath = arg('--html')
const html = htmlPath
  ? await fs.readFile(htmlPath, 'utf8')
  : await (await fetch(URL_, { headers: { 'User-Agent': UA } })).text()

const re = /<a[^>]*>([^<]+)<\/a><span>([\d,./]+)<\/span>/g
const fees = {}
for (const m of html.matchAll(re)) {
  const name = decode(m[1])
  const fee = toNumber(m[2])
  if (name && fee !== null && fee > 0 && !(name in fees)) fees[name] = fee
}

const ids = JSON.parse(await fs.readFile(IDS, 'utf8'))
const names = new Set(Object.values(ids.names))
const known = Object.keys(fees).filter((n) => names.has(n))
const sorted = Object.fromEntries(Object.entries(fees).sort(([a], [b]) => a.localeCompare(b)))
await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(
  OUT,
  JSON.stringify({ version: 1, source: URL_, generatedAt: new Date().toISOString().slice(0, 10), unit: 'gold per unit bought', fees: sorted }) + '\n'
)
console.log(`gold-fees: ${Object.keys(sorted).length} предметов, из них в фиде обмена: ${known.length}`)
for (const n of ['Chaos Orb', 'Divine Orb', 'Exalted Orb', 'Mirror of Kalandra']) console.log(`  ${n}: ${sorted[n]}`)
