import { describe, expect, it } from 'vitest'
import { parseLiveInput } from '../../src/main/games/poe1/live/tradeUrl'
import { plainModText, toLiveHit } from '../../src/main/games/poe1/live/hits'
import { poe2LotQuery } from '../../src/main/games/poe1/live/poe2Lot'

// Live search PoE 2 (S63): ссылки trade2, лот из /api/trade2/fetch (формат — живой ответ 31.10.2026,
// аккаунты и ники заменены), запрос «лот продавца» для трейд-окна.

const ID = 'H4sIAAAAAAAAA3WNsQ7CMAxEfwXd3IERdUdiAwF7ZYVALdIkSh1EVOXfiZnKgKd3Z'

describe('ссылка на поиск PoE 2', () => {
  it('…/trade2/search/poe2/<лига>/<код>(/live) — лига, код, хост', () => {
    expect(parseLiveInput(`https://www.pathofexile.com/trade2/search/poe2/Standard/${ID}`, 'poe2')).toEqual({
      ok: true,
      league: 'Standard',
      slug: ID,
      host: 'www.pathofexile.com'
    })
    expect(parseLiveInput('ru.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/kE6YLz5Tw/live', 'poe2')).toEqual({
      ok: true,
      league: 'Runes of Aldur',
      slug: 'kE6YLz5Tw',
      host: 'ru.pathofexile.com'
    })
  })

  it('длинный id запроса окна цены (по фикстурам PoE 2 — до ~550 символов) — принимается', () => {
    const long = 'H4sI' + 'a'.repeat(600)
    expect(parseLiveInput(`https://www.pathofexile.com/trade2/search/poe2/Standard/${long}`, 'poe2')).toMatchObject({ ok: true, slug: long })
  })

  it('код и «лига/код» — как у PoE 1', () => {
    expect(parseLiveInput('kE6YLz5Tw', 'poe2')).toEqual({ ok: true, slug: 'kE6YLz5Tw' })
    expect(parseLiveInput('Standard/kE6YLz5Tw', 'poe2')).toEqual({ ok: true, league: 'Standard', slug: 'kE6YLz5Tw' })
  })

  it('обмен, ссылка PoE 1 и без realm — понятные ошибки', () => {
    expect(parseLiveInput('https://www.pathofexile.com/trade2/exchange/poe2/Standard/abc123', 'poe2')).toEqual({ ok: false, error: 'exchange' })
    expect(parseLiveInput('https://www.pathofexile.com/trade/search/Standard/kE6YLz5Tw', 'poe2')).toEqual({ ok: false, error: 'bad-url' })
    for (const s of [
      'https://www.pathofexile.com/trade2/search/Standard/kE6YLz5Tw',
      'https://www.pathofexile.com/trade2/search/poe2/Standard',
      'https://www.pathofexile.com/trade2/search/poe2/Standard/kE6YLz5Tw/extra',
      'https://pathofexile.com.evil.com/trade2/search/poe2/Standard/kE6YLz5Tw'
    ]) {
      expect(parseLiveInput(s, 'poe2'), s).toEqual({ ok: false, error: 'bad-url' })
    }
  })

  it('режим PoE 1 не меняется: ссылка trade2 — ошибка «poe2»', () => {
    expect(parseLiveInput(`https://www.pathofexile.com/trade2/search/poe2/Standard/${ID}`)).toEqual({ ok: false, error: 'poe2' })
    expect(parseLiveInput(`https://www.pathofexile.com/trade2/search/poe2/Standard/${ID}`, 'poe1')).toEqual({ ok: false, error: 'poe2' })
  })
})

const ctx = {
  searchId: 's2',
  searchTitle: 'Кольца',
  league: 'Standard',
  siteUrl: 'https://www.pathofexile.com/trade2/search/poe2/Standard/abc',
  now: 1000,
  game: 'poe2' as const
}

// запись result[] ответа /api/trade2/fetch (структура — как в живом ответе; ники заменены)
const inPerson = {
  id: 'a'.repeat(64),
  listing: {
    method: 'psapi',
    whisper:
      '@Seller_Char Здравствуйте, хочу купить у вас Шёпот братства Кольцо с сапфиром за 3 exalted в лиге Standard (секция "shop"; позиция: 3 столбец, 9 ряд)',
    price: { type: '~price', amount: 3, currency: 'exalted' },
    account: { name: 'Seller#1234', online: { league: 'Standard' }, lastCharacterName: 'Seller_Char', language: 'ru_RU' }
  },
  item: {
    rarity: 'Unique',
    frameType: 3,
    name: 'Whisper of the Brotherhood',
    typeLine: 'Sapphire Ring',
    baseType: 'Sapphire Ring',
    ilvl: 81,
    explicitMods: [
      { description: '9% increased [SkillSpeed|Skill Speed]', domain: 'explicit', hash: 'stat.explicit.stat_970213192', mods: [] },
      { description: '+18 to [Dexterity|Dexterity]', domain: 'explicit', hash: 'stat.explicit.stat_3261801346', mods: [] },
      { description: '100% of [Cold] Damage [Conversion|Converted] to [Lightning] Damage', domain: 'explicit', mods: [] }
    ],
    extended: { hashes: {} }
  }
}

const buyout = {
  id: 'b'.repeat(64),
  listing: {
    method: 'psapi',
    fee: 1357,
    price: { type: '~b/o', amount: 1, currency: 'exalted' },
    account: { name: 'Merchant#0001', online: null }
  },
  item: { rarity: 'Magic', frameType: 1, name: '', typeLine: 'Vaporous Iron Ring of the Newt', baseType: 'Iron Ring', ilvl: 40, explicitMods: [] }
}

describe('лот trade2 → находка', () => {
  it('личный обмен: whisper (язык продавца), продавец в сети, моды без разметки', () => {
    const hit = toLiveHit(inPerson, ctx)
    expect(hit).toMatchObject({
      game: 'poe2',
      rarity: 'unique',
      merchant: false,
      seller: 'online',
      price: { amount: 3, currency: 'exalted' },
      account: 'Seller#1234',
      ilvl: 81,
      mods: ['9% increased Skill Speed', '+18 to Dexterity', '100% of Cold Damage Converted to Lightning Damage']
    })
    expect(hit?.whisper).toContain('хочу купить у вас Шёпот братства')
    expect(hit?.text).toBeUndefined()
  })

  it('мгновенный выкуп: без whisper, комиссия в золоте', () => {
    const hit = toLiveHit(buyout, ctx)
    expect(hit).toMatchObject({ game: 'poe2', merchant: true, fee: 1357, rarity: 'magic', baseType: 'Iron Ring' })
    expect(hit?.whisper).toBeUndefined()
    expect(hit?.seller).toBeUndefined()
  })

  it('PoE 1 не меняется: без game моды-объекты не берутся, поля game нет', () => {
    const { game: _g, ...poe1 } = ctx
    const hit = toLiveHit(inPerson, poe1)
    expect(hit?.game).toBeUndefined()
    expect(hit?.mods).toEqual([])
  })

  it('разметка ссылок trade2', () => {
    expect(plainModText('+25% to [Resistances|Cold Resistance]')).toBe('+25% to Cold Resistance')
    expect(plainModText('Adds 14 to 21 [Fire] damage to [Attack|Attacks]')).toBe('Adds 14 to 21 Fire damage to Attacks')
    expect(plainModText('без разметки')).toBe('без разметки')
  })
})

describe('«Открыть в трейд-окне» — запрос лота trade2', () => {
  it('база + продавец + редкость + ilvl в type_filters, статус «Все», без имени', () => {
    expect(poe2LotQuery({ account: 'Merchant#0001', typeLine: 'Vaporous Iron Ring of the Newt', baseType: 'Iron Ring', rarity: 'magic', ilvl: 40 })).toEqual({
      status: { option: 'any' },
      type: 'Iron Ring',
      filters: {
        trade_filters: { filters: { account: { input: 'Merchant#0001' } } },
        type_filters: { filters: { rarity: { option: 'magic' }, ilvl: { min: 40, max: 40 } } }
      }
    })
  })

  it('без продавца или базы — null (откроется страница поиска)', () => {
    expect(poe2LotQuery({ typeLine: 'Iron Ring', rarity: 'rare' })).toBeNull()
    expect(poe2LotQuery({ account: 'A#1', typeLine: '', rarity: 'rare' })).toBeNull()
  })

  it('валюта: редкости в фильтре нет, мусорный ilvl — без ilvl', () => {
    expect(poe2LotQuery({ account: 'A#1', typeLine: 'Exalted Orb', rarity: 'currency', ilvl: 0 })).toEqual({
      status: { option: 'any' },
      type: 'Exalted Orb',
      filters: { trade_filters: { filters: { account: { input: 'A#1' } } } }
    })
  })
})
