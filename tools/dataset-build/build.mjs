// Dataset build pipeline.
//
// Reads (gitignored) community SOURCE data and emits our own normalized,
// read-only dataset under resources/data/. We ship only the DERIVED factual
// dataset (boss names, reward values — game facts, re-expressed in our schema),
// never the upstream source files. Re-run after a patch by refreshing the files
// in tools/dataset-build/sources/ and the xref below, then `npm run build:data`.
//
//   Sources (download into tools/dataset-build/sources/):
//   - helper_zones.json        nicolasbagatello/poe2-helper  (schema/facts reference)
//   - exile-ui-filelist.json   Lailloken/Exile-UI  file-list 2.json  (MIT, layout images)
//
// Layout images are pinned to a specific Exile-UI commit for reproducibility.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { gems as gemCatalog, recommendations as gemRecommendations } from './gem-recs.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const SRC = join(__dirname, 'sources')
const OUT = join(ROOT, 'resources', 'data')

const EXILE_UI_COMMIT = 'ca0caec4f55ef1d684a5ee0b8e2aedab20deaa05'
const LAYOUT_BASE_URL = `https://raw.githubusercontent.com/Lailloken/Exile-UI/${EXILE_UI_COMMIT}/img/GUI/act-decoder/zones%202/`
const GAME_PATCH = '0.5'

// --- zone name -> Exile-UI areaID (layout image key). Act 1 verified by image
// inspection; other acts left for a future per-patch pass (quests still ship). ---
const EXILE_UI_AREA = {
  Clearfell: 'g1_2',
  'Mud Burrow': 'g1_3',
  'The Grelwood': 'g1_4',
  'The Red Vale': 'g1_5',
  'The Grim Tangle': 'g1_6',
  'Cemetery of the Eternals': 'g1_7',
  'Mausoleum of the Praetor': 'g1_8',
  'Tomb of the Consort': 'g1_9',
  'Hunting Grounds': 'g1_11',
  Freythorn: 'g1_12',
  'Ogham Farmlands': 'g1_13_1',
  'Ogham Village': 'g1_13_2',
  'The Manor Ramparts': 'g1_14',
  'Ogham Manor: First Floor': 'g1_15',
  'Ogham Manor: Second Floor': 'g1_15',
  'Ogham Manor: Third Floor': 'g1_15'
}

// ---------------------------------------------------------------------------

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function isTownName(name) {
  return /\btown\b|encampment/i.test(name)
}

function cleanBossName(name) {
  return name
    .replace(/^(final boss|optional boss|bosses?|boss)\s*:\s*/i, '')
    .replace(/\s*\(optional\)\s*$/i, '')
    .trim()
}

/** Split a reward string on commas that are not inside parentheses. */
function splitRewards(text) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** Classify one reward fragment into our {kind, value, numeric?, swappable?, options?}. */
function classifyOne(raw) {
  const text = raw.replace(/^permanent buff:\s*/i, '').trim()
  if (!text) return null
  const swappable = /\bchoice of\b|\bchoice:|\bor\b|\//i.test(text)

  let m
  if ((m = text.match(/(\d+)\s*%?\s*(?:increased\s+)?(?:to\s+)?(cold|fire|lightning|chaos)\s*resist/i))) {
    return { kind: 'resistance', value: `+${m[1]}% ${cap(m[2])} Resistance`, numeric: +m[1], swappable }
  }
  if (/weapon set skill point|book of specialisation/i.test(text)) {
    const wm = text.match(/(\d+)/)
    return { kind: 'weapon_set_point', value: `+${wm ? wm[1] : 2} Weapon Set Skill Points`, numeric: wm ? +wm[1] : 2 }
  }
  if ((m = text.match(/(\d+)\s*(?:passive\s+)?skill points?/i))) {
    return { kind: 'passive_point', value: `+${m[1]} Skill Points`, numeric: +m[1] }
  }
  if (/uncut spirit gem/i.test(text)) {
    return { kind: 'uncut_gem', value: text.replace(/\s*\(.*?\)\s*$/, '').trim() || 'Uncut Spirit Gem' }
  }
  if (/uncut support gem/i.test(text)) {
    return { kind: 'support_gem', value: 'Uncut Support Gem' }
  }
  if (/uncut skill gem/i.test(text)) {
    return { kind: 'uncut_gem', value: 'Uncut Skill Gem' }
  }
  if ((m = text.match(/(\d+)\s*(?:to\s+)?(?:maximum\s+)?spirit/i))) {
    return { kind: 'spirit', value: `+${m[1]} Spirit`, numeric: +m[1], swappable }
  }
  if ((m = text.match(/(\d+)\s*(?:to\s+)?(?:maximum\s+)?life/i))) {
    return { kind: 'life', value: `+${m[1]} Maximum Life`, numeric: +m[1], swappable }
  }
  if (/mana/i.test(text)) {
    return { kind: 'mana', value: text, swappable }
  }
  if (/charm/i.test(text)) {
    return { kind: 'charm_slot', value: text, swappable }
  }
  if ((m = text.match(/(\d+)\s*(strength|dexterity|intelligence|attribute)/i))) {
    return { kind: 'attribute', value: text, numeric: +m[1], swappable }
  }
  if (/\bring\b|\bamulet\b|\bbelt\b/i.test(text)) {
    return { kind: 'ring_or_amulet', value: text, swappable }
  }
  return { kind: 'other', value: text, swappable: swappable || undefined }
}

function classifyRewards(rewardText) {
  if (!rewardText) return []
  return splitRewards(rewardText)
    .map(classifyOne)
    .filter(Boolean)
    // drop swappable:false noise
    .map((r) => (r.swappable ? r : { ...r, swappable: undefined }))
}

// ---------------------------------------------------------------------------

const helper = JSON.parse(readFileSync(join(SRC, 'helper_zones.json'), 'utf8'))
const fileList = Object.keys(JSON.parse(readFileSync(join(SRC, 'exile-ui-filelist.json'), 'utf8')))

function filesForArea(exileAreaId) {
  return fileList.filter((f) => f.split(' ')[0] === exileAreaId)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'acts'), { recursive: true })
mkdirSync(join(OUT, 'layouts'), { recursive: true })

const layouts = {}
const indexActs = []
const routeSteps = []
let routeOrder = 0
let layoutCount = 0
let questCount = 0

for (const act of helper.acts) {
  const actNumber = act.act_number
  const actId = `act-${actNumber}`
  const file = `acts/${actId}.json`
  const actName = `Act ${actNumber} — ${act.act_name}`

  const zones = []
  const quests = []
  const usedIds = new Set()

  for (const z of act.zones) {
    const areaId = `a${actNumber}-${slug(z.zone_name)}`
    const exileUiAreaId = EXILE_UI_AREA[z.zone_name]
    const isTown = isTownName(z.zone_name)

    const zone = {
      areaId,
      name: z.zone_name,
      isTown: isTown || undefined,
      layout: exileUiAreaId ? areaId : null
    }
    if (exileUiAreaId) zone.xref = { exileUiAreaId }
    zones.push(zone)

    if (exileUiAreaId) {
      const files = filesForArea(exileUiAreaId)
      if (files.length) {
        layouts[areaId] = {
          areaId,
          files,
          rotationLocked: false,
          attribution: 'Exile-UI (MIT)'
        }
        layoutCount += files.length
      }
    }

    routeSteps.push({
      order: routeOrder++,
      actId,
      areaId,
      text: isTown ? `Town: ${z.zone_name}` : `Enter ${z.zone_name}`,
      optional: false
    })

    for (const poi of z.points_of_interest || []) {
      const isBoss = /boss/i.test(poi.name)
      if (!poi.reward && !isBoss) continue

      const name = isBoss ? cleanBossName(poi.name) : poi.name.replace(/\s*\(.*?\)\s*$/, '').trim()
      let id = `${actId}q-${slug(name)}`
      let n = 2
      while (usedIds.has(id)) id = `${actId}q-${slug(name)}-${n++}`
      usedIds.add(id)

      const rewards = classifyRewards(poi.reward || '')
      quests.push({
        id,
        name,
        type: poi.optional ? 'optional' : 'mandatory',
        boss: isBoss || undefined,
        zone: areaId,
        rewards,
        layout: null,
        notes: poi.location_hint || poi.tip || undefined,
        autoComplete: { onZoneEnter: exileUiAreaId || null }
      })
      questCount++
    }
  }

  writeFileSync(
    join(OUT, file),
    JSON.stringify({ id: actId, actNumber, actName, kind: 'act', zones, quests }, null, 2)
  )
  indexActs.push({ id: actId, file, actNumber, kind: 'act', actName })
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify({ acts: indexActs }, null, 2))
writeFileSync(
  join(OUT, 'layouts', 'index.json'),
  JSON.stringify(layouts, null, 2)
)
writeFileSync(
  join(OUT, 'route.json'),
  JSON.stringify({ patch: GAME_PATCH, steps: routeSteps }, null, 2)
)
writeFileSync(
  join(OUT, 'gems.json'),
  JSON.stringify({ gems: gemCatalog, recommendations: gemRecommendations }, null, 2)
)

const meta = {
  schemaVersion: '1.0.0',
  gamePatch: GAME_PATCH,
  gameVersionLabel:
    'Early Access 0.5 — community data (verify quest rewards against the live game)',
  generatedAt: new Date().toISOString(),
  actCount: indexActs.length,
  layoutRemoteBaseUrl: LAYOUT_BASE_URL,
  sources: [
    {
      name: 'nicolasbagatello/poe2-helper',
      url: 'https://github.com/nicolasbagatello/poe2-helper',
      license: 'educational/informational (facts re-derived, source not redistributed)'
    },
    {
      name: 'Lailloken/Exile-UI (Act-Decoder layout images)',
      url: 'https://github.com/Lailloken/Exile-UI',
      license: 'MIT',
      commit: EXILE_UI_COMMIT
    },
    {
      name: 'maxroll.gg (reward validation reference)',
      url: 'https://maxroll.gg/poe2/getting-started/permanent-stats-from-campaign',
      license: 'proprietary — reference only'
    }
  ]
}
writeFileSync(join(OUT, 'dataset.meta.json'), JSON.stringify(meta, null, 2))

console.log(
  `Built ${indexActs.length} acts, ${questCount} quests, ${Object.keys(layouts).length} mapped zones (${layoutCount} layout images). Output: ${OUT}`
)
