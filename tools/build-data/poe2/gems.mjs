// Камни умений PoE 2 для экспорта в игровой `.build` (S66) → resources/data/poe2/build/gems.json.
//
//   node tools/build-data/poe2/gems.mjs [--refresh]
//
// Ключ — id предмета из таблицы BaseItemTypes («Metadata/Items/Gems/SkillGemEarthquake»): его же пишет PoB2 в
// `<Gem gemId>` и его же ждёт игра в `skills[].id` / `support_skills[]` файла `.build`. Берём выпущенные камни
// умений, поддержки и мета-камни из RePoE PoE 2 (base_items); стандартные атаки оружия (`PlayerDefault…`), камни
// уникальных предметов и восхождений неогранёнными не бывают — их нет. Имена EN — RePoE, RU — данные EE2 по имени.
// Формат — схема и загрузчик в src/shared/poe2/build/data.ts.

import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT_DIR, REPOE_SOURCE, ROOT, REPOE2_VERSION, ee2Source, readEe2, readJson, writeData } from './sources.mjs'

export const GEMS2_FORMAT = 1
const OUT = path.join(OUT_DIR, 'gems.json')

const KIND = { 'Active Skill Gem': 's', 'Support Skill Gem': 'p', 'Meta Skill Gem': 'm' }
/** не камни, которые можно огранить: атаки оружия по умолчанию, камни уников и восхождений */
const NOT_UNCUT = /PlayerDefault|Unique|Ascendancy/

/** Собрать gems.json. src: { items (base_items RePoE), ru (EE2 ru items.ndjson), meta } */
export function buildGems2(src) {
  const ruByName = new Map()
  for (const it of src.ru) if (it.namespace === 'GEM' && it.refName && it.name) ruByName.set(it.refName, it.name)
  const gems = {}
  const report = { noRu: [] }
  for (const id of Object.keys(src.items).sort()) {
    const b = src.items[id]
    const kind = KIND[b?.item_class]
    if (!kind || b.release_state !== 'released' || NOT_UNCUT.test(id)) continue
    const en = String(b.name ?? '').trim()
    // «Spectre: {0}» — шаблон, «[DNT] …» — невыпущенное (Do Not Translate)
    if (!en || en.includes('{') || en.startsWith('[')) continue
    const ru = ruByName.get(en) ?? ''
    if (!ru) report.noRu.push(`${en} (${id})`)
    gems[id] = [en, ru, kind]
  }
  return { data: { v: GEMS2_FORMAT, meta: { ...src.meta, gems: Object.keys(gems).length }, gems }, report }
}

export async function loadGems2Sources() {
  return {
    items: await readJson('repoe-base-items.json'),
    ru: readEe2('ru', 'items.ndjson'),
    meta: { repoe: REPOE2_VERSION, sources: [REPOE_SOURCE, ee2Source()] }
  }
}

async function main() {
  const { data, report } = buildGems2(await loadGems2Sources())
  if (report.noRu.length) {
    console.log(`\nнет RU-имени в данных EE2 — покажем EN (${report.noRu.length}):\n  ${report.noRu.slice(0, 15).join('\n  ')}${report.noRu.length > 15 ? '\n  …' : ''}`)
  }
  if (data.meta.gems < 500) {
    console.error('\nкамни не собраны (мало) — gems.json не записан')
    process.exit(1)
  }
  const bytes = writeData(OUT, data)
  const sha = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  console.log(`камней ${data.meta.gems} → ${path.relative(ROOT, OUT)} (${(bytes / 1024).toFixed(1)} КБ, sha256 ${sha.slice(0, 12)})`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
