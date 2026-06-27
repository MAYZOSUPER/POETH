// Editorial skill-gem hints — our own content (not scraped). These are common
// league-start picks for the early campaign; they are SUGGESTIONS, not a build
// guide. Verify against the live game / your build of choice. Keyed loosely by
// class so the UI can show "early skills for <class>".

const gem = (id, name, kind, colour, requiredLevel) => [
  id,
  { id, name, kind, colour, requiredLevel }
]

export const gems = Object.fromEntries([
  // active skills
  gem('spark', 'Spark', 'active', 'blue', 1),
  gem('frost-bolt', 'Frost Bolt', 'active', 'blue', 1),
  gem('fireball', 'Fireball', 'active', 'blue', 1),
  gem('boneshatter', 'Boneshatter', 'active', 'red', 1),
  gem('mace-strike', 'Mace Strike', 'active', 'red', 1),
  gem('lightning-arrow', 'Lightning Arrow', 'active', 'green', 1),
  gem('galvanic-shards', 'Galvanic Shards', 'active', 'green', 1),
  gem('tempest-flurry', 'Tempest Flurry', 'active', 'green', 1),
  gem('falling-thunder', 'Falling Thunder', 'active', 'green', 1),
  gem('explosive-shot', 'Explosive Shot', 'active', 'green', 1),
  gem('skeletal-warriors', 'Summon Skeletal Warriors', 'active', 'blue', 1),
  gem('essence-drain', 'Essence Drain', 'active', 'blue', 1),
  // supports
  gem('unleash', 'Unleash', 'support', 'blue', 1),
  gem('lightning-infusion', 'Lightning Infusion', 'support', 'blue', 1),
  gem('magnified-effect', 'Magnified Effect', 'support', 'red', 1),
  gem('martial-tempo', 'Martial Tempo', 'support', 'green', 1),
  gem('scattershot', 'Scattershot', 'support', 'green', 1),
  gem('minion-mastery', 'Minion-related support', 'support', 'blue', 1)
])

export const recommendations = [
  {
    class: 'Sorceress',
    actId: 'act-1',
    primaryGemIds: ['spark', 'frost-bolt'],
    supportGemIds: ['unleash', 'lightning-infusion'],
    note: 'Cut your first Uncut Skill Gem into Spark or Frost Bolt; add a support once you get the Lv1 Uncut Support Gem.'
  },
  {
    class: 'Witch',
    actId: 'act-1',
    primaryGemIds: ['skeletal-warriors', 'essence-drain'],
    supportGemIds: ['minion-mastery', 'unleash'],
    note: 'Minion start: Summon Skeletal Warriors as your main damage; Essence Drain as a single-target option.'
  },
  {
    class: 'Warrior',
    actId: 'act-1',
    primaryGemIds: ['boneshatter', 'mace-strike'],
    supportGemIds: ['magnified-effect', 'martial-tempo'],
    note: 'Boneshatter as the first gem; Mace Strike to build heavy-stun. Shield Charge from Tarkleigh for mobility.'
  },
  {
    class: 'Ranger',
    actId: 'act-1',
    primaryGemIds: ['lightning-arrow', 'galvanic-shards'],
    supportGemIds: ['scattershot', 'martial-tempo'],
    note: 'Lightning Arrow clears packs; Galvanic Shards for single target.'
  },
  {
    class: 'Monk',
    actId: 'act-1',
    primaryGemIds: ['falling-thunder', 'tempest-flurry'],
    supportGemIds: ['martial-tempo'],
    note: 'Tempest Flurry to build power charges, Falling Thunder to spend them.'
  },
  {
    class: 'Mercenary',
    actId: 'act-1',
    primaryGemIds: ['galvanic-shards', 'explosive-shot'],
    supportGemIds: ['scattershot'],
    note: 'Crossbow start: Galvanic Shards as your workhorse, Explosive Shot for groups.'
  }
]
