// @ts-check
// Сбор реальных текстов предметов PoE1 для фикстур парсера (EN + RU пары одного и того же предмета).
//
//   node tools/data/collect-fixtures.mjs            # из кэша, если он есть; иначе — сеть
//   node tools/data/collect-fixtures.mjs --refresh  # заново сходить в сеть (бюджет! см. ниже)
//   опции: --league Standard  --per-search 10  --only armour,gem
//
// Как: анонимный POST /api/trade/search/<league> на www.pathofexile.com → первые id → GET /api/trade/fetch/<ids>
// на www (EN) и на ru.pathofexile.com (RU) с ТЕМИ ЖЕ id. В ответе fetch `item.extended.text` — base64 текста
// предмета в формате Ctrl+C (обычный, не расширенный). Пишем tests/fixtures/poe1/{en,ru}/<категория>-NN.txt
// (одинаковое имя = пара). Данные продавцов (listing) не сохраняются никуда.
//
// Лимиты GGG: читаем x-rate-limit-<rule> / -state и ждём, если окно почти выбрано; 429 → остановка.
// Бюджет этапа S2: ≤10 поисков и ≤20 fetch — по одному поиску и по одному fetch на язык на категорию.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const CACHE_DIR = path.join(__dirname, '.cache', 'fixtures')
const OUT_DIR = path.join(ROOT, 'tests/fixtures/poe1')
const UA = 'POETH/0.1.0 (fixture collector, low volume)'
const HOSTS = { en: 'https://www.pathofexile.com', ru: 'https://ru.pathofexile.com' }
const MAX_SEARCHES = 10
const MAX_FETCHES = 20

const IDENTIFIED = { identified: { option: 'true' } }
const typeFilters = (category, rarity) => ({
  filters: { ...(category ? { category: { option: category } } : {}), ...(rarity ? { rarity: { option: rarity } } : {}) }
})

/** Категории поиска: одна категория = один поиск. `filters` → query.filters, `stats`/`type` → query. */
const SEARCHES = [
  ['armour', { filters: { type_filters: typeFilters('armour', 'rare') } }],
  ['weapon', { filters: { type_filters: typeFilters('weapon', 'rare'), misc_filters: { filters: { ...IDENTIFIED, fractured_item: { option: 'true' } } } } }],
  ['jewellery', {
    filters: { type_filters: typeFilters('accessory', 'rare'), misc_filters: { filters: IDENTIFIED } },
    stats: [{ type: 'and', filters: [{ id: 'pseudo.pseudo_has_influence_count', value: { min: 1 } }] }]
  }],
  ['unique', { filters: { type_filters: typeFilters(null, 'unique'), misc_filters: { filters: IDENTIFIED } } }],
  ['gem', { filters: { type_filters: typeFilters('gem', null) } }],
  ['map', { filters: { type_filters: typeFilters('map', null) } }],
  ['jewel', { filters: { type_filters: typeFilters('jewel', 'rare'), misc_filters: { filters: IDENTIFIED } } }],
  ['timeless', { type: 'Timeless Jewel', filters: {} }],
  ['flask', { filters: { type_filters: typeFilters('flask', 'magic'), misc_filters: { filters: IDENTIFIED } } }],
  ['card', { filters: { type_filters: typeFilters('card', null) } }]
]

function parseArgs(argv) {
  const args = { refresh: false, league: 'Standard', perSearch: 10, only: /** @type {string[]|null} */ (null) }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--refresh') args.refresh = true
    else if (a === '--league') args.league = argv[++i]
    else if (a === '--per-search') args.perSearch = Math.min(10, Number(argv[++i]))
    else if (a === '--only') args.only = argv[++i].split(',')
    else throw new Error(`Неизвестный аргумент: ${a}`)
  }
  return args
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let searches = 0
let fetches = 0

/** Ждём, если по заголовкам лимита осталось ≤1 запроса в каком-то окне. */
async function respectRateLimit(res, label) {
  const rules = (res.headers.get('x-rate-limit-rules') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  let waitS = 0
  for (const rule of rules) {
    const limits = (res.headers.get(`x-rate-limit-${rule}`) ?? '').split(',').filter(Boolean)
    const states = (res.headers.get(`x-rate-limit-${rule}-state`) ?? '').split(',').filter(Boolean)
    console.log(`    [${label}] ${rule}: ${states.join(' ')} / ${limits.join(' ')}`)
    limits.forEach((lim, k) => {
      const [hits, period] = lim.split(':').map(Number)
      const [cur, , restricted] = (states[k] ?? '0:0:0').split(':').map(Number)
      if (restricted > 0) throw new Error(`Ограничение лимита (${rule}): ${restricted} с — стоп`)
      if (cur >= hits - 1) waitS = Math.max(waitS, period)
    })
  }
  if (waitS) {
    console.log(`    ждём ${waitS} с (окно лимита почти выбрано)`)
    await sleep(waitS * 1000)
  }
}

async function api(method, url, body, label) {
  const res = await fetch(url, {
    method,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 429) throw new Error(`429 Too Many Requests (${label}), retry-after=${res.headers.get('retry-after')} — стоп`)
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${label}: ${text.slice(0, 200)}`)
  await respectRateLimit(res, label)
  return JSON.parse(text)
}

/** Только то, что нужно фикстурам: id, тип/имя и текст. Без listing (данные продавцов). */
function stripFetch(json) {
  return (json.result ?? []).map((r) =>
    r && r.item
      ? { id: r.id, name: r.item.name, typeLine: r.item.typeLine, baseType: r.item.baseType, text: r.item.extended?.text ?? null }
      : null
  )
}

async function collectOne(key, spec, args) {
  const cacheFile = path.join(CACHE_DIR, `${key}.json`)
  if (!args.refresh && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  if (searches + 1 > MAX_SEARCHES || fetches + 2 > MAX_FETCHES) throw new Error('Бюджет запросов исчерпан')

  const query = {
    status: { option: 'any' },
    ...(spec.type ? { type: spec.type } : {}),
    ...(spec.stats ? { stats: spec.stats } : {}),
    filters: spec.filters
  }
  console.log(`  поиск ${key}…`)
  searches++
  const search = await api('POST', `${HOSTS.en}/api/trade/search/${encodeURIComponent(args.league)}`, { query, sort: { price: 'asc' } }, `search ${key}`)
  const ids = (search.result ?? []).slice(0, args.perSearch)
  if (!ids.length) throw new Error(`Пустой результат поиска ${key}`)
  await sleep(2500)

  const out = { key, searchId: search.id, total: search.total, ids, en: [], ru: [] }
  for (const lang of /** @type {const} */ (['en', 'ru'])) {
    fetches++
    const json = await api('GET', `${HOSTS[lang]}/api/trade/fetch/${ids.join(',')}?query=${search.id}`, null, `fetch ${key} ${lang}`)
    out[lang] = stripFetch(json)
    await sleep(2500)
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(cacheFile, JSON.stringify(out, null, 1))
  return out
}

function decode(b64) {
  return Buffer.from(b64, 'base64').toString('utf8').replace(/\r\n/g, '\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let pairs = 0
  for (const [key, filters] of SEARCHES) {
    if (args.only && !args.only.includes(key)) continue
    const data = await collectOne(key, filters, args)
    let n = 0
    for (let k = 0; k < data.ids.length; k++) {
      const en = data.en.find((r) => r?.id === data.ids[k])
      const ru = data.ru.find((r) => r?.id === data.ids[k])
      if (!en?.text || !ru?.text) continue
      n++
      const base = `${key}-${String(n).padStart(2, '0')}.txt`
      for (const [lang, rec] of /** @type {const} */ ([['en', en], ['ru', ru]])) {
        const file = path.join(OUT_DIR, lang, base)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, decode(rec.text).replace(/\n*$/, '\n'))
      }
      pairs++
    }
    console.log(`  ${key}: пар ${n} (всего найдено ${data.total})`)
  }
  console.log(`Готово: пар ${pairs}; запросов в сеть — поисков ${searches}, fetch ${fetches}.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  console.error(`(сделано поисков ${searches}, fetch ${fetches})`)
  process.exitCode = 1
})
