#!/usr/bin/env node
// «Богатство PoE 2» (S70): список валюты для ручного ввода — resources/data/poe2/wealth/currency.json.
//
// Ключевая валюта — Divine, Exalted, Chaos (база PoE 2 — exalted, дорогое — divine). Ходовая — по объёму обмена:
// снимок poe.ninja PoE 2 (S67, данные из CI; poe.ninja берёт обмен из фида GGG) текущей временной лиги, тип
// Currency, число проданных штук за период = оборот (в divine) ÷ цена штуки (в divine). Дешевле MIN_EX за штуку —
// мелочь (свитки, осколки): в «Богатство» её не вводят. Берём первые COMMON штук, которые есть в фиде обмена
// (resources/data/poe2/exchange/exchange-ids.json, S61) — иначе у строки не будет «цены у Ange».
//
// Сеть не нужна: только файлы данных в репо. Запуск — после обновления снимка цен (к 1.0 PoE 2, 11.12):
//   node tools/wealth/poe2-currency.mjs           — пересобрать
//   node tools/wealth/poe2-currency.mjs --check   — сверить с файлом (код выхода 1 — отличается)

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = join(ROOT, 'resources/data/poe2')
const OUT = join(DATA, 'wealth/currency.json')
const MAIN = ['Divine Orb', 'Exalted Orb', 'Chaos Orb']
const COMMON = 8
const MIN_EX = 2

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

function tradeTags() {
  const out = new Map()
  for (const line of readFileSync(join(DATA, 'en/items.ndjson'), 'utf8').split('\n')) {
    if (!line.includes('"tradeTag":')) continue
    const r = JSON.parse(line)
    if (typeof r.refName === 'string' && typeof r.tradeTag === 'string' && !out.has(r.refName)) out.set(r.refName, r.tradeTag)
  }
  return out
}

function build() {
  const index = readJson(join(DATA, 'prices/index.json'))
  const first = index.leagues[0]
  const snap = readJson(join(DATA, 'prices', first.file))
  const feed = new Set(Object.values(readJson(join(DATA, 'exchange/exchange-ids.json')).names))
  const tags = tradeTags()
  const exRate = snap.rates?.exalted
  if (!(exRate > 0)) throw new Error('в снимке нет курса exalted')
  const ranked = snap.lines
    .filter((l) => l.kind === 'Currency' && l.value > 0 && l.volume > 0 && !MAIN.includes(l.name) && feed.has(l.name))
    .filter((l) => l.value * exRate >= MIN_EX)
    .map((l) => ({ name: l.name, units: l.volume / l.value }))
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name))
    .slice(0, COMMON)
  const ref = (name) => (tags.has(name) ? { name, tag: tags.get(name) } : { name })
  return {
    version: 1,
    generatedAt: new Date(snap.at).toISOString().slice(0, 10),
    source: {
      prices: `poe.ninja PoE 2 (${snap.league})`,
      rule: `Currency, штук продано = volume / value; дороже ${MIN_EX} ex; есть в фиде обмена; первые ${COMMON}`
    },
    main: MAIN.map(ref),
    common: ranked.map((r) => ref(r.name))
  }
}

const next = `${JSON.stringify(build(), null, 1)}\n`
if (process.argv.includes('--check')) {
  let cur = ''
  try {
    cur = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n')
  } catch {
    // файла нет — отличается
  }
  if (cur !== next) {
    console.log('currency.json отличается — пересоберите: node tools/wealth/poe2-currency.mjs')
    process.exit(1)
  }
  console.log('currency.json совпадает')
} else {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, next)
  console.log(`записан ${OUT}`)
  console.log(next)
}
