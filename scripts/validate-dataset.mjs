// Validates the built dataset under resources/data. Fails (exit 1) on:
//  - duplicate quest ids (would corrupt saved progress)
//  - a quest/zone referencing a layout areaId missing from the manifest
//  - a reward without a recognized kind
// Run with `npm run validate:data` (CI gate before packaging).

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '..', 'resources', 'data')

const read = (rel) => JSON.parse(readFileSync(join(DATA, rel), 'utf8'))

const KINDS = new Set([
  'skill_point',
  'passive_point',
  'spirit',
  'resistance',
  'attribute',
  'life',
  'mana',
  'charm_slot',
  'weapon_set_point',
  'skill_gem',
  'support_gem',
  'uncut_gem',
  'crafting',
  'unique_item',
  'currency',
  'ring_or_amulet',
  'other'
])

const errors = []
const index = read('index.json')
const layouts = read('layouts/index.json')
const seenIds = new Set()
let quests = 0
let zones = 0

for (const ref of index.acts) {
  const act = read(ref.file)
  for (const z of act.zones) {
    zones++
    if (z.layout && !layouts[z.layout]) {
      errors.push(`zone ${z.areaId}: layout "${z.layout}" not in manifest`)
    }
  }
  for (const q of act.quests) {
    quests++
    if (seenIds.has(q.id)) errors.push(`duplicate quest id: ${q.id}`)
    seenIds.add(q.id)
    if (!q.zone) errors.push(`quest ${q.id}: missing zone`)
    if (q.layout && !layouts[q.layout]) {
      errors.push(`quest ${q.id}: layout "${q.layout}" not in manifest`)
    }
    for (const r of q.rewards ?? []) {
      if (!KINDS.has(r.kind)) errors.push(`quest ${q.id}: unknown reward kind "${r.kind}"`)
    }
  }
}

for (const [areaId, ref] of Object.entries(layouts)) {
  if (!Array.isArray(ref.files) || ref.files.length === 0) {
    errors.push(`layout ${areaId}: no files`)
  }
}

if (errors.length) {
  console.error(`Dataset validation FAILED with ${errors.length} error(s):`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

console.log(
  `Dataset OK: ${index.acts.length} acts, ${zones} zones, ${quests} quests, ${Object.keys(layouts).length} layout zones.`
)
