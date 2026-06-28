// Editorial ascendancy / trial reference data — our own content (facts re-stated
// from the game, NOT scraped). Flagged needs-validation: ascendancy names, trial
// access items and point values should be checked against the live PoE2 0.5 game.
//
// Ascendancy points come from completing Trials. Trial COMPLETION can never be
// auto-detected from the log (same as quests) — so the UI tracks these as manual
// checkboxes. Each trial grants points the first time you clear that difficulty;
// the campaign opens the two base trials, harder tiers come later (endgame).

export const trials = [
  {
    id: 'trial-sekhemas-1',
    name: 'Trial of the Sekhemas',
    nameRu: 'Испытание Сехема',
    actId: 'act-2',
    points: 2,
    phase: 'campaign',
    note: 'Act 2 — enter with a Djinn Barya. Sanctum-style: survive 3 floors, guard your Honour (avoid hits, pick safe relics/boons).',
    noteRu: 'Акт 2 — вход по предмету «Djinn Barya». Похоже на Святилище: пройди 3 этажа, береги Честь (не получай удары, выбирай безопасные реликвии/благословения).'
  },
  {
    id: 'trial-chaos-1',
    name: 'Trial of Chaos',
    nameRu: 'Испытание Хаоса',
    actId: 'act-3',
    points: 2,
    phase: 'campaign',
    note: 'Act 3 — enter with an Inscribed Ultimatum. Ultimatum-style rounds with escalating afflictions; clear the required number of trials.',
    noteRu: 'Акт 3 — вход по предмету «Inscribed Ultimatum». Раунды в стиле Ультиматума с нарастающими карами; пройди нужное число испытаний.'
  },
  {
    id: 'trial-sekhemas-2',
    name: 'Trial of the Sekhemas (higher)',
    nameRu: 'Испытание Сехема (выше)',
    actId: 'act-4',
    points: 2,
    phase: 'endgame',
    note: 'Higher-difficulty Sekhemas (more floors). Available later / in maps — grants the 3rd ascension.',
    noteRu: 'Сложная версия Сехема (больше этажей). Доступна позже / на картах — даёт 3-е вознесение.'
  },
  {
    id: 'trial-chaos-2',
    name: 'Trial of Chaos (higher)',
    nameRu: 'Испытание Хаоса (выше)',
    actId: 'act-4',
    points: 2,
    phase: 'endgame',
    note: 'Higher-difficulty Chaos (more trials). Available later / in maps — grants the 4th ascension.',
    noteRu: 'Сложная версия Хаоса (больше испытаний). Доступна позже / на картах — даёт 4-е вознесение.'
  }
]

// Two ascendancy options per base class (PoE2 0.5). Names flagged needs-validation.
const cls = (base, options) => ({ base, options })
const asc = (id, name, nameRu) => ({ id, name, nameRu })

// Ascendancy options per base class — sourced from poe2db.tw/us + /ru
// (authoritative). RU names as poe2db renders them.
export const ascendancyClasses = [
  cls('Warrior', [
    asc('titan', 'Titan', 'Титан'),
    asc('warbringer', 'Warbringer', 'Вестник войны'),
    asc('smith-of-kitava', 'Smith of Kitava', 'Кузнец Китавы')
  ]),
  cls('Witch', [
    asc('infernalist', 'Infernalist', 'Инферналист'),
    asc('blood-mage', 'Blood Mage', 'Маг крови'),
    asc('lich', 'Lich', 'Лич'),
    asc('abyssal-lich', 'Abyssal Lich', 'Лич Бездны')
  ]),
  cls('Ranger', [
    asc('deadeye', 'Deadeye', 'Снайпер'),
    asc('pathfinder', 'Pathfinder', 'Следопыт')
  ]),
  cls('Monk', [
    asc('invoker', 'Invoker', 'Заклинатель стихий'),
    asc('acolyte-of-chayula', 'Acolyte of Chayula', 'Служитель Чаюлы'),
    asc('martial-artist', 'Martial Artist', 'Мастер боевых искусств')
  ]),
  cls('Mercenary', [
    asc('witchhunter', 'Witchhunter', 'Охотник на ведьм'),
    asc('gemling-legionnaire', 'Gemling Legionnaire', 'Легионер каменитов'),
    asc('tactician', 'Tactician', 'Тактик')
  ]),
  cls('Sorceress', [
    asc('stormweaver', 'Stormweaver', 'Ткач бурь'),
    asc('chronomancer', 'Chronomancer', 'Хрономант'),
    asc('disciple-of-varashta', 'Disciple of Varashta', 'Ученица Варашты')
  ]),
  cls('Huntress', [
    asc('amazon', 'Amazon', 'Амазонка'),
    asc('ritualist', 'Ritualist', 'Ритуалист'),
    asc('spirit-walker', 'Spirit Walker', 'Ходящая среди духов')
  ]),
  cls('Druid', [asc('oracle', 'Oracle', 'Оракул'), asc('shaman', 'Shaman', 'Шаман')])
]
