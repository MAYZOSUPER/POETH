import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { KIND_GROUPS, isHardcoreLeague, loadPoe2Prices, parsePoe2PriceIndex, parsePoe2PriceSnapshot } from '@shared/poe2/prices'
import { isSafeDataPath } from '@shared/updates'

// Снимок цен PoE 2 в данных PoE 2 — встроенный (resources/data/poe2/prices) или тот, что CI собирается выпустить:
// POETH_POE2_DATA_DIR=<папка данных PoE 2> (data.yml: пакет со свежим снимком poe.ninja).
// Строго — только формат: на старте лиги (1.0, 11.12) poe.ninja может ещё не знать валюту, руны или имена новых
// предметов, и выпуск не должен из-за этого падать. Покрытие (группы, курсы, имена EE2) — предупреждения в выводе.

const DIR = resolve(process.env.POETH_POE2_DATA_DIR || resolve(__dirname, '../../../resources/data/poe2'))
const read = async (rel: string) => {
  try {
    return readFileSync(join(DIR, rel), 'utf8')
  } catch {
    return null
  }
}
// видно с `--silent=false`; на GitHub Actions — ещё и аннотация в сводке запуска
const warn = (msg: string) =>
  process.env.GITHUB_ACTIONS ? console.log(`::warning title=Цены PoE 2::${msg}`) : console.warn(`[цены PoE 2] предупреждение: ${msg}`)

describe(`снимок цен PoE 2 (${DIR})`, () => {
  const index = parsePoe2PriceIndex(JSON.parse(readFileSync(join(DIR, 'prices/index.json'), 'utf8')))

  it('index.json: формат, файл каждой лиги есть, лишних файлов нет, пути годятся для пакета данных', () => {
    expect(index).not.toBeNull()
    expect(index!.leagues.length).toBeGreaterThan(0)
    const files = readdirSync(join(DIR, 'prices')).sort()
    expect(files).toEqual(['index.json', ...index!.leagues.map((l) => l.file)].sort())
    for (const f of files) {
      expect(isSafeDataPath(`prices/${f}`), f).toBe(true)
      expect(statSync(join(DIR, 'prices', f)).size, f).toBeLessThan(1024 * 1024)
    }
    if (index!.leagues.some((l) => isHardcoreLeague(l.league))) warn('в снимке есть хардкор-лиги (по умолчанию CI их не снимает)')
  })

  it('каждая лига: формат читателя, ни одной отброшенной строки, только поля для расчёта', async () => {
    for (const l of index!.leagues) {
      const text = readFileSync(join(DIR, 'prices', l.file), 'utf8')
      const raw = JSON.parse(text) as { lines?: unknown[] }
      const snap = parsePoe2PriceSnapshot(raw)
      expect(snap, l.league).not.toBeNull()
      expect(snap!.league, l.file).toBe(l.league)
      // строки, которые читатель отбросил бы, — ошибка CI (снимок и читатель разошлись)
      expect(snap!.lines.length, l.league).toBe(raw.lines?.length)
      expect(snap!.lines.length, l.league).toBe(l.lines)
      for (const banned of ['"icon"', 'poecdn', 'flavour', 'Modifiers', '"image"']) expect(text, `${l.file} ${banned}`).not.toContain(banned)
      const p = (await loadPoe2Prices(read, l.league))!
      expect(p.match, l.league).toBe('exact')
    }
  })

  it('покрытие — только предупреждения: курсы, группы «Слухов» и «Вложения», имена EE2', async () => {
    for (const l of index!.leagues) {
      const t = (await loadPoe2Prices(read, l.league))!.table
      if (t.primary !== 'divine') warn(`${l.league}: цены не в divine, а в ${t.primary}`)
      if (t.byId('divine')?.divine !== 1) warn(`${l.league}: нет строки Divine Orb`)
      if (!(t.exaltedPerDivine! > 1) || !(t.rates.chaos > 0)) warn(`${l.league}: нет курсов exalted/chaos`)
      if (t.all(KIND_GROUPS.currency).length < 4) warn(`${l.league}: валюты меньше 4 строк`)
    }
    const cur = (await loadPoe2Prices(read, 'auto'))!.table
    for (const g of ['emotions', 'runes', 'gems', 'omens', 'uniques'] as const) {
      if (cur.all(KIND_GROUPS[g]).length < 4) warn(`${cur.league}: группа ${g} — ${cur.all(KIND_GROUPS[g]).length} строк`)
    }
    let ref: Set<string> | null = null
    try {
      ref = new Set<string>()
      for (const line of readFileSync(join(DIR, 'en/items.ndjson'), 'utf8').split('\n')) {
        if (!line) continue
        const j = JSON.parse(line) as { refName?: string; name?: string }
        ref.add((j.refName ?? j.name ?? '').toLowerCase())
      }
    } catch {
      warn('нет en/items.ndjson — имена с данными EE2 не сверены')
    }
    if (ref) {
      const all = cur.all()
      const missing = all.filter((p) => !ref!.has(p.name.toLowerCase()))
      if (missing.length / Math.max(1, all.length) > 0.03) warn(`${missing.length} из ${all.length} имён нет в EE2 (пин EE2 устарел?): ${missing.slice(0, 5).map((p) => p.name).join(', ')}`)
      const key = cur.all([...KIND_GROUPS.emotions, ...KIND_GROUPS.runes]).filter((p) => !ref!.has(p.name.toLowerCase()))
      if (key.length) warn(`эмоций/рун без имени в EE2: ${key.map((p) => p.name).join(', ')}`)
    }
    expect(true).toBe(true)
  })
})
