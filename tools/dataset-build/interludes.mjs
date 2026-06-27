// Interlude data (PoE2 0.5) — our own structuring of facts from
// Lechkolion/poe2-leveling-overlay src/data/interludes.ts (MIT) + Exile-UI areas.
// Zones resolve to Exile-UI layout images via the canonical areaId map.
// Rewards are already in our schema (kind/value/numeric/swappable).

export const INTERLUDES = [
  {
    id: 'interlude-1',
    actNumber: 5,
    actName: 'Интерлюдия 1 — Проклятие Холтена',
    zones: [
      { name: 'Scorched Farmlands' },
      { name: 'Stones of Serle' },
      { name: 'The Blackwood' },
      { name: 'Holten', isTown: true },
      { name: 'Wolvenhold' },
      { name: 'Holten Estate' }
    ],
    quests: [
      {
        name: 'Siora, Blade of the Mists',
        type: 'mandatory',
        boss: true,
        zone: 'The Blackwood',
        rewards: [],
        notes: 'Зона тумана (как King in the Mists в Акте 1).'
      },
      {
        name: 'Oswin, the Dread Warden',
        type: 'optional',
        boss: true,
        zone: 'Wolvenhold',
        rewards: [{ kind: 'passive_point', value: '+2 Skill Points', numeric: 2 }],
        notes: 'Боковая зона от Holten. Постоянные +2 очка пассивок.'
      },
      {
        name: 'Lady Elswyth & Thane Wulfric',
        type: 'mandatory',
        boss: true,
        zone: 'Holten Estate',
        rewards: [],
        notes: 'Финал Интерлюдии 1 (двойной босс).'
      }
    ]
  },
  {
    id: 'interlude-2',
    actNumber: 6,
    actName: 'Интерлюдия 2 — Украденная Барья',
    zones: [
      { name: 'The Khari Crossing' },
      { name: 'Pools of Khatal' },
      { name: 'Sel Khari Sanctuary' },
      { name: 'The Galai Gates' },
      { name: 'Qimah', isTown: true },
      { name: 'Qimah Reservoir' }
    ],
    quests: [
      {
        name: 'Akthi & Anundr',
        type: 'optional',
        boss: true,
        zone: 'The Khari Crossing',
        rewards: [{ kind: 'passive_point', value: '+2 Skill Points', numeric: 2 }]
      },
      {
        name: "Molten One's Gift",
        type: 'optional',
        zone: 'The Khari Crossing',
        rewards: [{ kind: 'life', value: '+5% Maximum Life', numeric: 5 }],
        notes: 'Алтарь у центральной переправы. Постоянный бонус.'
      },
      {
        name: 'Elzarah, the Cobra Lord',
        type: 'mandatory',
        boss: true,
        zone: 'Sel Khari Sanctuary',
        rewards: []
      },
      {
        name: 'Vornas, the Fell Flame',
        type: 'mandatory',
        boss: true,
        zone: 'The Galai Gates',
        rewards: []
      },
      {
        name: 'Seven Pillars of Qimah',
        type: 'optional',
        zone: 'Qimah',
        rewards: [
          { kind: 'other', value: 'Выбор 1 из 7 бонусов (атрибуты/сопротивления/восстановление и т.д.)', swappable: true }
        ],
        notes: 'Круг из 7 столбов в центре города Qimah. Выбор постоянный.'
      },
      {
        name: 'Финал Интерлюдии 2',
        type: 'mandatory',
        boss: true,
        zone: 'Qimah Reservoir',
        rewards: [],
        notes: 'Завершает Интерлюдию 2.'
      }
    ]
  },
  {
    id: 'interlude-3',
    actNumber: 7,
    actName: 'Интерлюдия 3 — План Дориани',
    zones: [
      { name: 'Ashen Forest' },
      { name: 'Kriar Village' },
      { name: 'Kriar Peaks' },
      { name: 'Vaal Catacombs' },
      { name: 'Sanctified Archives' },
      { name: 'Sealed Caverns' },
      { name: 'Howling Caves' },
      { name: 'The Glade', isTown: true },
      { name: 'Kingsmarch', isTown: true }
    ],
    quests: [
      {
        name: 'Lythara, the Wayward Spear',
        type: 'optional',
        boss: true,
        zone: 'Kriar Village',
        rewards: [{ kind: 'spirit', value: '+40 Spirit', numeric: 40 }],
        notes: 'Постоянные +40 к максимуму Духа.'
      },
      {
        name: 'Elder Madox',
        type: 'optional',
        zone: 'Kriar Peaks',
        rewards: [{ kind: 'unique_item', value: 'Уникальный предмет на выбор', swappable: true }],
        notes: 'Дружелюбный НПС у каменного алтаря.'
      },
      {
        name: 'Architect of Dominion',
        type: 'mandatory',
        boss: true,
        zone: 'Sanctified Archives',
        rewards: []
      },
      {
        name: 'The Abominable Yeti',
        type: 'optional',
        boss: true,
        zone: 'Howling Caves',
        rewards: [{ kind: 'passive_point', value: '+2 Skill Points', numeric: 2 }],
        notes: 'Боковая зона от Sealed Caverns.'
      },
      {
        name: 'Stormgore & Rakkar',
        type: 'mandatory',
        boss: true,
        zone: 'Sealed Caverns',
        rewards: [],
        notes: 'Финал Интерлюдии 3 (два босса подряд).'
      },
      {
        name: 'The Hooded One',
        type: 'mandatory',
        zone: 'Kingsmarch',
        rewards: [{ kind: 'passive_point', value: '+2 Skill Points', numeric: 2 }],
        notes: 'После всех 3 интерлюдий — поговори с Hooded One в Кингсмарче. Финальные +2 очка.'
      }
    ]
  }
]
