// Editorial skill-gem hints — our own content (NOT scraped). These are common
// campaign picks per class; they are SUGGESTIONS, not a build guide, and are
// flagged needs-validation: verify against the live game / your build of choice.
// Keyed by class + actId so the UI can show "skills for <class> in <act>".
// Interludes have no entries on purpose — the UI falls back to the final act's
// set (the build is essentially formed by then).

const gem = (id, name, kind, colour, requiredLevel = 1) => [
  id,
  { id, name, kind, colour, requiredLevel }
]

export const gems = Object.fromEntries([
  // ---- active skills ----
  // INT (caster / minion)
  gem('spark', 'Spark', 'active', 'blue'),
  gem('frost-bolt', 'Frost Bolt', 'active', 'blue'),
  gem('fireball', 'Fireball', 'active', 'blue'),
  gem('flame-wall', 'Flame Wall', 'active', 'blue'),
  gem('orb-of-storms', 'Orb of Storms', 'active', 'blue'),
  gem('arc', 'Arc', 'active', 'blue'),
  gem('comet', 'Comet', 'active', 'blue'),
  gem('frost-bomb', 'Frost Bomb', 'active', 'blue'),
  gem('skeletal-warriors', 'Summon Skeletal Warriors', 'active', 'blue'),
  gem('skeletal-sniper', 'Summon Skeletal Snipers', 'active', 'blue'),
  gem('unearth', 'Unearth', 'active', 'blue'),
  gem('contagion', 'Contagion', 'active', 'blue'),
  gem('essence-drain', 'Essence Drain', 'active', 'blue'),
  gem('detonate-dead', 'Detonate Dead', 'active', 'blue'),
  // STR (warrior, mace)
  gem('boneshatter', 'Boneshatter', 'active', 'red'),
  gem('mace-strike', 'Mace Strike', 'active', 'red'),
  gem('sunder', 'Sunder', 'active', 'red'),
  gem('shield-charge', 'Shield Charge', 'active', 'red'),
  gem('perfect-strike', 'Perfect Strike', 'active', 'red'),
  gem('stampede', 'Stampede', 'active', 'red'),
  gem('hammer-of-the-gods', 'Hammer of the Gods', 'active', 'red'),
  gem('seismic-cry', 'Seismic Cry', 'active', 'red'),
  // DEX (bow / crossbow / quarterstaff)
  gem('lightning-arrow', 'Lightning Arrow', 'active', 'green'),
  gem('ice-shot', 'Ice Shot', 'active', 'green'),
  gem('gas-arrow', 'Gas Arrow', 'active', 'green'),
  gem('rain-of-arrows', 'Rain of Arrows', 'active', 'green'),
  gem('lightning-rod', 'Lightning Rod', 'active', 'green'),
  gem('galvanic-shards', 'Galvanic Shards', 'active', 'green'),
  gem('explosive-shot', 'Explosive Shot', 'active', 'green'),
  gem('fragmentation-rounds', 'Fragmentation Rounds', 'active', 'green'),
  gem('armour-piercing-rounds', 'Armour Piercing Rounds', 'active', 'green'),
  gem('gas-grenade', 'Gas Grenade', 'active', 'green'),
  gem('tempest-flurry', 'Tempest Flurry', 'active', 'green'),
  gem('falling-thunder', 'Falling Thunder', 'active', 'green'),
  gem('ice-strike', 'Ice Strike', 'active', 'green'),
  gem('charged-staff', 'Charged Staff', 'active', 'green'),
  gem('tempest-bell', 'Tempest Bell', 'active', 'green'),
  // ---- supports ----
  gem('unleash', 'Unleash', 'support', 'blue'),
  gem('lightning-infusion', 'Lightning Infusion', 'support', 'blue'),
  gem('cold-infusion', 'Cold Infusion', 'support', 'blue'),
  gem('fire-infusion', 'Fire Infusion', 'support', 'red'),
  gem('spell-cascade', 'Spell Cascade', 'support', 'blue'),
  gem('magnified-effect', 'Magnified Effect', 'support', 'red'),
  gem('martial-tempo', 'Martial Tempo', 'support', 'green'),
  gem('scattershot', 'Scattershot', 'support', 'green'),
  gem('minion-mastery', 'Minion-related support', 'support', 'blue')
])

const rec = (cls, actId, primaryGemIds, supportGemIds, note, noteRu) => ({
  class: cls,
  actId,
  primaryGemIds,
  supportGemIds,
  note,
  noteRu
})

export const recommendations = [
  // ===================== Sorceress (lightning/cold caster) =====================
  rec(
    'Sorceress',
    'act-1',
    ['spark', 'frost-bolt'],
    ['unleash', 'lightning-infusion'],
    'Cut your first Uncut Skill Gem into Spark or Frost Bolt; add a support once you get the Lv1 Uncut Support Gem.',
    'Первый необработанный камень — в Spark или Frost Bolt; поддержку добавь, когда выпадет необработанный камень поддержки.'
  ),
  rec(
    'Sorceress',
    'act-2',
    ['spark', 'flame-wall'],
    ['unleash', 'lightning-infusion'],
    'Drop Flame Wall and fire Spark through it for a big damage boost; Unleash lets Spark build up.',
    'Ставь Flame Wall и пускай Spark сквозь стену — заметный буст урона; Unleash копит заряды Spark.'
  ),
  rec(
    'Sorceress',
    'act-3',
    ['spark', 'orb-of-storms'],
    ['lightning-infusion', 'spell-cascade'],
    'Orb of Storms for single target and shock; keep Spark as your clear.',
    'Orb of Storms — по одиночным целям и для шока; Spark остаётся зачисткой.'
  ),
  rec(
    'Sorceress',
    'act-4',
    ['spark', 'comet'],
    ['unleash', 'lightning-infusion'],
    'Comet as a heavy single-target nuke (great with Frost Bomb to expose cold). Spark still clears packs.',
    'Comet — тяжёлый удар по одиночным целям (хорош с Frost Bomb для пробития холодом). Spark по-прежнему зачищает пачки.'
  ),

  // ============================ Witch (minions) ============================
  rec(
    'Witch',
    'act-1',
    ['skeletal-warriors', 'essence-drain'],
    ['minion-mastery', 'unleash'],
    'Minion start: Summon Skeletal Warriors as your main damage; Essence Drain as a single-target option.',
    'Старт на миньонах: Summon Skeletal Warriors — основной урон; Essence Drain — по одиночным целям.'
  ),
  rec(
    'Witch',
    'act-2',
    ['skeletal-warriors', 'skeletal-sniper'],
    ['minion-mastery', 'unleash'],
    'Add Skeletal Snipers for ranged minion damage; keep the warrior wall up front.',
    'Добавь Skeletal Snipers для дальнего урона миньонов; воины держат фронт.'
  ),
  rec(
    'Witch',
    'act-3',
    ['skeletal-sniper', 'unearth'],
    ['minion-mastery', 'spell-cascade'],
    'Unearth makes corpses to fuel minions and Detonate Dead; Snipers carry the damage.',
    'Unearth создаёт трупы для миньонов и Detonate Dead; основной урон — на Snipers.'
  ),
  rec(
    'Witch',
    'act-4',
    ['skeletal-warriors', 'detonate-dead'],
    ['minion-mastery', 'fire-infusion'],
    'Detonate Dead for burst on tough packs and bosses; refresh your skeleton army before fights.',
    'Detonate Dead — всплеск урона по толстым пачкам и боссам; обновляй армию скелетов перед боями.'
  ),

  // ============================ Warrior (mace) ============================
  rec(
    'Warrior',
    'act-1',
    ['boneshatter', 'mace-strike'],
    ['magnified-effect', 'martial-tempo'],
    'Boneshatter as the first gem; Mace Strike to build heavy-stun. Shield Charge from Tarkleigh for mobility.',
    'Boneshatter первым камнем; Mace Strike набирает тяжёлый стан. Shield Charge от Tarkleigh — мобильность.'
  ),
  rec(
    'Warrior',
    'act-2',
    ['boneshatter', 'sunder'],
    ['magnified-effect', 'martial-tempo'],
    'Sunder for ranged AoE and to set up stuns; Boneshatter detonates the heavy-stun for big hits.',
    'Sunder — дальняя зона и подготовка стана; Boneshatter детонирует тяжёлый стан в большой удар.'
  ),
  rec(
    'Warrior',
    'act-3',
    ['sunder', 'perfect-strike'],
    ['magnified-effect', 'martial-tempo'],
    'Perfect Strike for hard single-target hits — time the sweet spot. Sunder clears.',
    'Perfect Strike — сильный одиночный удар, лови «окно» точного попадания. Sunder зачищает.'
  ),
  rec(
    'Warrior',
    'act-4',
    ['boneshatter', 'hammer-of-the-gods'],
    ['magnified-effect', 'martial-tempo'],
    'Hammer of the Gods as a boss nuke after stacking heavy-stun. Seismic Cry boosts your slams.',
    'Hammer of the Gods — удар по боссу после накопления тяжёлого стана. Seismic Cry усиливает удары.'
  ),

  // ============================ Ranger (bow) ============================
  rec(
    'Ranger',
    'act-1',
    ['lightning-arrow', 'galvanic-shards'],
    ['scattershot', 'martial-tempo'],
    'Lightning Arrow clears packs; Galvanic Shards for single target.',
    'Lightning Arrow зачищает пачки; Galvanic Shards — по одиночным целям.'
  ),
  rec(
    'Ranger',
    'act-2',
    ['lightning-arrow', 'ice-shot'],
    ['scattershot', 'martial-tempo'],
    'Ice Shot adds freeze and cold for safer single target; Lightning Arrow stays your clear.',
    'Ice Shot добавляет заморозку и холод по одиночным целям; Lightning Arrow остаётся зачисткой.'
  ),
  rec(
    'Ranger',
    'act-3',
    ['lightning-arrow', 'lightning-rod'],
    ['scattershot', 'martial-tempo'],
    'Plant Lightning Rod then hit it with Lightning Arrow for a burst — strong on bosses.',
    'Ставь Lightning Rod и бей по нему Lightning Arrow для всплеска — сильно по боссам.'
  ),
  rec(
    'Ranger',
    'act-4',
    ['lightning-arrow', 'rain-of-arrows'],
    ['scattershot', 'martial-tempo'],
    'Rain of Arrows for big AoE on packs; Gas Arrow is a good ignite-detonation option too.',
    'Rain of Arrows — крупная зона по пачкам; Gas Arrow — хороший вариант с детонацией поджога.'
  ),

  // ============================ Monk (quarterstaff) ============================
  rec(
    'Monk',
    'act-1',
    ['falling-thunder', 'tempest-flurry'],
    ['martial-tempo'],
    'Tempest Flurry to build power charges, Falling Thunder to spend them.',
    'Tempest Flurry копит заряды силы, Falling Thunder их тратит.'
  ),
  rec(
    'Monk',
    'act-2',
    ['tempest-flurry', 'ice-strike'],
    ['martial-tempo', 'cold-infusion'],
    'Ice Strike freezes packs for safety; Tempest Flurry keeps power charges up.',
    'Ice Strike замораживает пачки — безопаснее; Tempest Flurry держит заряды силы.'
  ),
  rec(
    'Monk',
    'act-3',
    ['ice-strike', 'charged-staff'],
    ['martial-tempo', 'cold-infusion'],
    'Charge your staff, then Ice Strike for a burst of hits; great single-target window.',
    'Заряди посох (Charged Staff), затем Ice Strike — всплеск ударов; отличное окно по одиночным.'
  ),
  rec(
    'Monk',
    'act-4',
    ['falling-thunder', 'tempest-bell'],
    ['martial-tempo'],
    'Drop Tempest Bell and ring it with your hits for huge burst on bosses.',
    'Ставь Tempest Bell и «звони» в него ударами — большой всплеск по боссам.'
  ),

  // ============================ Mercenary (crossbow) ============================
  rec(
    'Mercenary',
    'act-1',
    ['galvanic-shards', 'explosive-shot'],
    ['scattershot'],
    'Crossbow start: Galvanic Shards as your workhorse, Explosive Shot for groups.',
    'Старт с арбалета: Galvanic Shards — рабочая лошадка, Explosive Shot — по группам.'
  ),
  rec(
    'Mercenary',
    'act-2',
    ['galvanic-shards', 'fragmentation-rounds'],
    ['scattershot', 'martial-tempo'],
    'Fragmentation Rounds shred packs; Galvanic Shards stays your reliable single target.',
    'Fragmentation Rounds кромсают пачки; Galvanic Shards — надёжный одиночный урон.'
  ),
  rec(
    'Mercenary',
    'act-3',
    ['fragmentation-rounds', 'gas-grenade'],
    ['scattershot', 'fire-infusion'],
    'Gas Grenade + an ignite source detonates for big AoE; reload-swap between bolt types.',
    'Gas Grenade + источник поджога даёт мощную детонацию по площади; чередуй типы болтов перезарядкой.'
  ),
  rec(
    'Mercenary',
    'act-4',
    ['galvanic-shards', 'armour-piercing-rounds'],
    ['scattershot', 'martial-tempo'],
    'Armour Piercing Rounds for armoured bosses; Galvanic Shards for everything else.',
    'Armour Piercing Rounds — по бронированным боссам; Galvanic Shards — по всему остальному.'
  )
]
