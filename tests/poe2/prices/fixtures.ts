// Ответы poe.ninja PoE 2 в форме API (https://poe.ninja/docs/api) — синтетические, по образцу живых ответов
// 31.10.2026: цены в divine (core.primary), курсы exalted/chaos — core.rates, имена валюты — в items[].

const core = (exalted: number, chaos: number) => ({
  primary: 'divine',
  secondary: 'chaos',
  rates: { exalted, chaos },
  items: [
    { id: 'divine', name: 'Divine Orb', image: '/gen/image/x/divine.png', category: 'Currency', detailsId: 'divine-orb' },
    { id: 'exalted', name: 'Exalted Orb', image: '/gen/image/x/exalted.png', category: 'Currency', detailsId: 'exalted-orb' },
    { id: 'chaos', name: 'Chaos Orb', image: '/gen/image/x/chaos.png', category: 'Currency', detailsId: 'chaos-orb' }
  ]
})

const spark = (totalChange: number) => ({ totalChange, data: [0, 1.5, null, totalChange] })

export const CURRENCY = {
  core: core(560, 9.5),
  lines: [
    { id: 'divine', primaryValue: 1, volumePrimaryValue: 1258, maxVolumeCurrency: 'exalted', maxVolumeRate: 560, sparkline: spark(1.3) },
    { id: 'exalted', primaryValue: 0.0017857, volumePrimaryValue: 52.8, maxVolumeCurrency: 'divine', maxVolumeRate: 560, sparkline: spark(-3.14) },
    { id: 'chaos', primaryValue: 0.10526, volumePrimaryValue: 1259, maxVolumeCurrency: 'divine', maxVolumeRate: 9.5, sparkline: spark(-1.2) },
    { id: 'mirror', primaryValue: 5813.4, volumePrimaryValue: 7751, maxVolumeCurrency: 'divine', maxVolumeRate: 0.000172, sparkline: spark(0) },
    // без имени в items[] и с нулевой ценой — в снимок не попадают
    { id: 'unknown-orb', primaryValue: 3, volumePrimaryValue: 1 },
    { id: 'chaos-shard', primaryValue: 0 }
  ],
  items: [
    { id: 'divine', name: 'Divine Orb', image: '/gen/image/x/1.png', category: 'Currency', detailsId: 'divine-orb' },
    { id: 'exalted', name: 'Exalted Orb', image: '/gen/image/x/2.png', category: 'Currency', detailsId: 'exalted-orb' },
    { id: 'chaos', name: 'Chaos Orb', image: '/gen/image/x/3.png', category: 'Currency', detailsId: 'chaos-orb' },
    { id: 'mirror', name: 'Mirror of Kalandra', image: '/gen/image/x/4.png', category: 'Currency', detailsId: 'mirror-of-kalandra' },
    { id: 'chaos-shard', name: 'Chaos Shard', image: '/gen/image/x/5.png', category: 'Currency', detailsId: 'chaos-shard' }
  ]
}

export const DELIRIUM = {
  // у ответов разных типов курсы расходятся — в снимок идут курсы обмена валюты
  core: core(564.1, 9.6),
  lines: [
    { id: 'liquid-paranoia', primaryValue: 0.004996, volumePrimaryValue: 0.009159, maxVolumeCurrency: 'exalted', maxVolumeRate: 0.3548, sparkline: spark(-2) },
    { id: 'diluted-liquid-greed', primaryValue: 0.0011473, volumePrimaryValue: 0.00325, maxVolumeCurrency: 'exalted', maxVolumeRate: 1.55, sparkline: spark(5.68) },
    { id: 'potent-liquid-contempt', primaryValue: 1.17, volumePrimaryValue: 35.67, maxVolumeCurrency: 'divine', maxVolumeRate: 0.8551, sparkline: spark(12.3) },
    // оборот меньше четверти штуки — «мало данных»
    { id: 'ancient-concentrated-liquid-suffering', primaryValue: 0.1429, volumePrimaryValue: 0.03, maxVolumeCurrency: 'divine', maxVolumeRate: 7 }
  ],
  items: [
    { id: 'liquid-paranoia', name: 'Liquid Paranoia', image: '/i/a.png', category: 'Delirium', detailsId: 'liquid-paranoia' },
    { id: 'diluted-liquid-greed', name: 'Diluted Liquid Greed', image: '/i/b.png', category: 'Delirium', detailsId: 'diluted-liquid-greed' },
    { id: 'potent-liquid-contempt', name: 'Potent Liquid Contempt', image: '/i/c.png', category: 'Delirium', detailsId: 'potent-liquid-contempt' },
    { id: 'ancient-concentrated-liquid-suffering', name: 'Ancient Concentrated Liquid Suffering', image: '/i/d.png', category: 'Delirium', detailsId: 'x' }
  ]
}

export const RUNES = {
  core: core(559, 9.4),
  lines: [{ id: 'aldurs-legacy', primaryValue: 207.94, volumePrimaryValue: 623.7, sparkline: spark(4) }],
  items: [{ id: 'aldurs-legacy', name: "Aldur's Legacy", image: '/i/r.png', category: 'Runes', detailsId: 'aldurs-legacy' }]
}

const uniqueLine = (o: Record<string, unknown>) => ({
  id: 1,
  itemId: `${o.name} ${o.baseType}`,
  icon: 'https://web.poecdn.com/gen/image/x.png',
  flavourText: 'Долгий текст, который в снимок не идёт',
  levelRequired: 60,
  category: 'Belt',
  corrupted: false,
  sparkLine: spark(-2.17),
  implicitModifiers: [{ text: 'implicit', optional: false }],
  explicitModifiers: [{ text: '+(60-80) to maximum Life', optional: false }],
  ...o
})

export const UNIQUE_ACCESSORIES = {
  core: core(579.9, 9.44),
  lines: [
    uniqueLine({ detailsId: 'mageblood-utility-belt', name: 'Mageblood', baseType: 'Utility Belt', primaryValue: 200, listingCount: 4219 }),
    uniqueLine({ detailsId: 'the-gnashing-sash-wide-belt', name: 'The Gnashing Sash', baseType: 'Wide Belt', primaryValue: 4050, listingCount: 8 }),
    uniqueLine({ detailsId: 'headhunter-heavy-belt', name: 'Headhunter', baseType: 'Heavy Belt', primaryValue: 48, listingCount: 1000 }),
    uniqueLine({ detailsId: 'headhunter-heavy-belt-corrupted', name: 'Headhunter', baseType: 'Heavy Belt', primaryValue: 40, listingCount: 30, corrupted: true }),
    uniqueLine({ detailsId: 'broken', name: '', baseType: 'Ring', primaryValue: 1, listingCount: 3 }),
    // лот «для вида»: 42 млн divine при одном лоте — в снимок не идёт
    uniqueLine({ detailsId: 'winters-bite-glass-shank', name: "Winter's Bite", baseType: 'Glass Shank', primaryValue: 42570000, listingCount: 1 })
  ]
}

export const UNIQUE_WEAPONS = {
  core: core(580, 9.4),
  lines: [
    uniqueLine({ detailsId: 'quill-rain-shortbow', name: 'Quill Rain', baseType: 'Shortbow', primaryValue: 0.05, listingCount: 900 }),
    uniqueLine({ detailsId: 'quill-rain-runeforged-shortbow', name: 'Quill Rain', baseType: 'Runeforged Shortbow', primaryValue: 3.2, listingCount: 41 }),
    uniqueLine({ detailsId: 'mjolner-torment-club', name: 'Mjölner', baseType: 'Torment Club', primaryValue: 12.5, listingCount: 77, variant: '2 sockets' })
  ]
}

export const LEAGUES = [
  { id: 'Forbidden Rites', name: 'Forbidden Rites' },
  { id: 'Runes of Aldur', name: 'Runes of Aldur' },
  { id: 'HC Forbidden Rites', name: 'HC Forbidden Rites' },
  { id: 'HC Runes of Aldur', name: 'HC Runes of Aldur' },
  { id: 'Standard', name: 'Standard' },
  { id: 'Hardcore', name: 'Hardcore' }
]

/** Ответы по типам для фейкового сервера и --from-dir; остальные типы — пустые. */
export const RESPONSES: Record<string, unknown> = {
  Currency: CURRENCY,
  Delirium: DELIRIUM,
  Runes: RUNES,
  UniqueAccessories: UNIQUE_ACCESSORIES,
  UniqueWeapons: UNIQUE_WEAPONS
}
