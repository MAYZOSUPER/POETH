// Раскладки особых вкладок тайника PoE 2 из poe2pricer (S68): data/ui/stash-tabs.json → наш формат LayoutSet
// (src/shared/screen/layout.ts). poe2pricer — MIT © 2026 saxe78 (github.com/saxe78/poe2pricer), атрибуция в
// NOTICE.md. Их координаты — центры ячеек в точках окна высотой 1440 (снято с игровых таблиц …StashTabLayout).
//   node tools/screen/import-poe2pricer-layouts.mjs <stash-tabs.json> [resources/data/poe2/screen/stash-layouts.json] [коммит]
// Файл берите из репозитория poe2pricer руками (без запуска их кода); после 1.0 — перегенерировать.
import fs from 'fs'

const [src, out = 'resources/data/poe2/screen/stash-layouts.json', commit = ''] = process.argv.slice(2)
if (!src) throw new Error('usage: import-poe2pricer-layouts.mjs <stash-tabs.json> [out] [commit]')
const j = JSON.parse(fs.readFileSync(src, 'utf8'))
const ids = {
  Orbs: 'orbs',
  Essence: 'essence',
  Delirium: 'delirium',
  Breach: 'breach',
  Ritual: 'ritual',
  Abyss: 'abyss',
  Expedition: 'expedition',
  Tablets: 'tablets',
  'Socketable Runen': 'socketable-runes',
  'Socketable Runen 2': 'socketable-runes-2',
  'Socketable Soul Cores': 'socketable-soul-cores',
  'Socketable Idole': 'socketable-idols',
  'Socketable 5': 'socketable-5'
}
const tabs = []
for (const t of j.tabs ?? []) {
  const id = ids[t.kind] ?? t.kind.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const slots = (t.slots ?? []).map((s) => {
    const slot = { x: s.x, y: s.y, w: s.w, h: s.h, item: s.free ? null : (s.name ?? null) }
    if (Array.isArray(s.alternatives) && s.alternatives.length) slot.alt = s.alternatives
    return slot
  })
  tabs.push({ id, slots })
}
const set = {
  version: 1,
  game: 'poe2',
  refHeight: 1440,
  source: `poe2pricer data/ui/stash-tabs.json${commit ? ` @ ${commit}` : ''} — MIT © 2026 saxe78 (github.com/saxe78/poe2pricer)`,
  tabs
}
fs.writeFileSync(out, JSON.stringify(set, null, 0).replace(/\{"id"/g, '\n{"id"') + '\n')
console.log(`${out}: ${tabs.length} вкладок, ${tabs.reduce((n, t) => n + t.slots.length, 0)} ячеек`)
