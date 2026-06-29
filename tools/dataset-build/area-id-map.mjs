// POE2 areaId -> canonical zone display name.
// Source: Lailloken/Exile-UI (areas) + Lechkolion/poe2-leveling-overlay
// src/data/areaIds.ts (MIT). The areaId is what the game's Client.txt emits in
// `Generating level N area "<areaId>"`, and is also the Exile-UI image key.

export const AREA_ID_MAP = {
  // Act 1
  g1_1: 'The Riverbank',
  g1_town: 'Clearfell Encampment',
  g1_2: 'Clearfell',
  g1_3: 'The Mud Burrow',
  g1_4: 'The Grelwood',
  g1_5: 'The Red Vale',
  g1_6: 'The Grim Tangle',
  g1_7: 'Cemetery of the Eternals',
  g1_8: 'The Mausoleum of the Praetor',
  g1_9: 'Tomb of the Consort',
  g1_11: 'The Hunting Grounds',
  g1_12: 'Freythorn',
  g1_13_1: 'Ogham Farmlands',
  g1_13_2: 'Ogham Village',
  g1_14: 'The Manor Ramparts',
  g1_15: 'Ogham Manor',
  // Act 2
  g2_1: 'Vastiri Outskirts',
  g2_town: 'The Ardura Caravan',
  g2_2: "Traitor's Passage",
  g2_3: 'The Halani Gates',
  g2_3a: 'The Halani Gates',
  g2_4_1: 'Keth',
  g2_4_2: 'The Lost City',
  g2_4_3: 'Buried Shrines',
  g2_5_1: 'Mastodon Badlands',
  g2_5_2: 'The Bone Pits',
  g2_6: 'Valley of the Titans',
  g2_7: 'The Titan Grotto',
  g2_8: 'Deshar',
  g2_9_1: 'Path of Mourning',
  g2_9_2: 'The Spires of Deshar',
  g2_10_1: 'Mawdun Quarry',
  g2_10_2: 'Mawdun Mine',
  g2_12_1: 'The Dreadnought',
  g2_12_2: 'The Dreadnought Vanguard',
  g2_12: 'The Dreadnought',
  g2_13: 'Trial of the Sekhemas',
  // Act 3
  g3_1: 'Sandswept Marsh',
  g3_town: 'Ziggurat Encampment',
  g3_2_1: 'Infested Barrens',
  g3_2_2: 'The Matlan Waterways',
  g3_3: 'Jungle Ruins',
  g3_4: 'The Venom Crypts',
  g3_5: 'Chimeral Wetlands',
  g3_6_1: "Jiquani's Machinarium",
  g3_6_2: "Jiquani's Sanctum",
  g3_7: 'The Azak Bog',
  g3_8: 'The Drowned City',
  g3_9: 'The Molten Vault',
  g3_10: 'The Trial of Chaos',
  g3_10_airlock: 'The Trial of Chaos',
  g3_11: 'Apex of Filth',
  g3_12: 'Temple of Kopec',
  g3_14: 'Utzaal',
  g3_16: 'Aggorat',
  g3_17: 'The Black Chambers',
  // Act 4
  g4_town: 'Kingsmarch',
  g4_1_1: 'Isle of Kin',
  g4_1_2: 'Volcanic Warrens',
  g4_2_1: 'Kedge Bay',
  g4_2_2: "Journey's End",
  g4_3_1: 'Whakapanu Island',
  g4_3_2: 'Singing Caverns',
  g4_4_1: 'Eye of Hinekora',
  g4_4_2: 'Halls of the Dead',
  g4_4_3: 'Trial of the Ancestors',
  g4_5_1: 'Abandoned Prison',
  g4_5_2: 'Solitary Confinement',
  g4_7: 'Shrike Island',
  g4_8b: 'Arastas',
  g4_10: 'The Excavation',
  g4_11_1b: 'Ngakanu',
  g4_11_2: 'Heart of the Tribe',
  g4_13: "Plunder's Point",
  // Interludes (p = interlude "part")
  p1_1: 'Scorched Farmlands',
  p1_2: 'Stones of Serle',
  p1_3: 'The Blackwood',
  p1_4: 'Holten',
  p1_5: 'Wolvenhold',
  p1_6: 'Holten Estate',
  p1_town: 'The Refuge',
  p2_1: 'The Khari Crossing',
  p2_2: 'Pools of Khatal',
  p2_3: 'Sel Khari Sanctuary',
  p2_5: 'The Galai Gates',
  p2_6: 'Qimah',
  p2_7: 'Qimah Reservoir',
  p2_town: 'The Khari Bazaar',
  p3_town: 'The Glade',
  p3_1: 'Ashen Forest',
  p3_2: 'Kriar Village',
  p3_3: 'Glacial Tarn',
  p3_4: 'Howling Caves',
  p3_5: 'Kriar Peaks',
  p3_6: 'Etched Ravine',
  p3_7: 'The Cuachic Vault'
}

/** Normalize a zone name for matching (lowercase, drop leading "the", parens, punctuation). */
export function normName(s) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// normalized name -> areaId
const NAME_TO_AREA = {}
for (const [areaId, name] of Object.entries(AREA_ID_MAP)) {
  const n = normName(name)
  if (!(n in NAME_TO_AREA)) NAME_TO_AREA[n] = areaId
}

// Manual overrides for zone names that don't normalize-match the canonical map.
const OVERRIDES = {
  'Ogham Manor: First Floor': 'g1_15',
  'Ogham Manor: Second Floor': 'g1_15',
  'Ogham Manor: Third Floor': 'g1_15'
}

/** Resolve a zone display name -> Exile-UI areaId (or null). */
export function areaIdForZone(name) {
  if (OVERRIDES[name]) return OVERRIDES[name]
  const n = normName(name)
  if (NAME_TO_AREA[n]) return NAME_TO_AREA[n]
  // fallback: a canonical name that is a prefix of this zone (e.g. "Ogham Manor")
  let best = null
  for (const [cn, areaId] of Object.entries(NAME_TO_AREA)) {
    if (n.startsWith(cn) && (!best || cn.length > best.len)) best = { areaId, len: cn.length }
  }
  return best ? best.areaId : null
}
