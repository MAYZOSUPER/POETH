import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { KIND_GROUPS, isHardcoreLeague, loadPoe2Prices, parsePoe2PriceIndex } from '@shared/poe2/prices'
import { isSafeDataPath } from '@shared/updates'

// Встроенный снимок цен PoE 2 (resources/data/poe2/prices) — его же CI обновляет в пакете данных. Проверки не
// привязаны к конкретной лиге: после пересборки к 1.0 (11.12.2026) они остаются верными.

const DIR = resolve(__dirname, '../../../resources/data/poe2')
const read = async (rel: string) => {
  try {
    return readFileSync(join(DIR, rel), 'utf8')
  } catch {
    return null
  }
}

describe('встроенный снимок цен PoE 2', () => {
  const index = parsePoe2PriceIndex(JSON.parse(readFileSync(join(DIR, 'prices/index.json'), 'utf8')))!

  it('index.json: лиги без хардкора, файл каждой есть, лишних файлов нет', () => {
    expect(index.leagues.length).toBeGreaterThan(0)
    expect(index.leagues.some((l) => isHardcoreLeague(l.league))).toBe(false)
    const files = readdirSync(join(DIR, 'prices')).sort()
    expect(files).toEqual(['index.json', ...index.leagues.map((l) => l.file)].sort())
    for (const f of files) {
      expect(isSafeDataPath(`prices/${f}`), f).toBe(true)
      expect(statSync(join(DIR, 'prices', f)).size, f).toBeLessThan(512 * 1024)
    }
  })

  it('каждая лига читается: divine = 1, курсы exalted и chaos, все группы, нужные «Слухам» и «Вложению»', async () => {
    for (const l of index.leagues) {
      const p = (await loadPoe2Prices(read, l.league))!
      expect(p.match, l.league).toBe('exact')
      expect(p.table.size, l.league).toBe(l.lines)
      expect(p.table.primary).toBe('divine')
      expect(p.table.byId('divine')?.divine).toBe(1)
      expect(p.table.exaltedPerDivine!, l.league).toBeGreaterThan(1)
      expect(p.table.rates.chaos, l.league).toBeGreaterThan(0)
      expect(p.table.all(KIND_GROUPS.currency).length, l.league).toBeGreaterThan(3)
    }
    // временная лига (первая): эмоции, руны, камни, знамения, уники (у Standard уников poe.ninja PoE 2 не считает)
    const cur = (await loadPoe2Prices(read, 'auto'))!
    for (const g of ['emotions', 'runes', 'gems', 'omens'] as const) expect(cur.table.all(KIND_GROUPS[g]).length, g).toBeGreaterThan(3)
    expect(cur.table.all(KIND_GROUPS.uniques).length).toBeGreaterThan(10)
  })

  it('в снимке только поля для расчёта (без иконок, модов, flavour)', () => {
    for (const l of index.leagues) {
      const text = readFileSync(join(DIR, 'prices', l.file), 'utf8')
      for (const banned of ['"icon"', 'poecdn', 'flavour', 'Modifiers', '"image"']) expect(text, `${l.file} ${banned}`).not.toContain(banned)
    }
  })

  it('имена совпадают с данными EE2 (путь к русскому имени) — почти все', async () => {
    const ref = new Set<string>()
    for (const line of readFileSync(join(DIR, 'en/items.ndjson'), 'utf8').split('\n')) {
      if (!line) continue
      const j = JSON.parse(line) as { refName?: string; name?: string }
      ref.add((j.refName ?? j.name ?? '').toLowerCase())
    }
    const cur = (await loadPoe2Prices(read, 'auto'))!
    const all = cur.table.all()
    const found = all.filter((p) => ref.has(p.name.toLowerCase())).length
    expect(found / all.length).toBeGreaterThan(0.97)
    // эмоции и руны — все (их цены берут «Вложение» и «Слухи»)
    for (const p of cur.table.all([...KIND_GROUPS.emotions, ...KIND_GROUPS.runes])) expect(ref.has(p.name.toLowerCase()), p.name).toBe(true)
  })
})
