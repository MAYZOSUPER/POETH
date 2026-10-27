import { describe, expect, it } from 'vitest'
import { decodeItemText, toLiveHit } from '../../src/main/games/poe1/live/hits'

const ctx = { searchId: 's1', searchTitle: 'Пояса', siteUrl: 'https://www.pathofexile.com/trade/search/Standard/abc', now: 1000 }
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
const ITEM_EN = 'Item Class: Belts\r\nRarity: Unique\r\nPyroshock Clasp\r\nLeather Belt\r\n--------\r\nItem Level: 84'
const ITEM_RU = 'Класс предмета: Пояса\r\nРедкость: Уникальный\r\nЗастёжка пироманта\r\nКожаный пояс'

describe('находка из ответа fetch', () => {
  it('in-person лот: whisper, продавец в сети, цена', () => {
    const hit = toLiveHit(
      {
        id: 'a'.repeat(64),
        listing: {
          whisper: '@Seller Hi, I would like to buy your Pyroshock Clasp',
          price: { type: '~b/o', amount: 5, currency: 'chaos' },
          account: { name: 'Seller#1234', online: { league: 'Standard' } }
        },
        item: { name: 'Pyroshock Clasp', typeLine: 'Leather Belt', frameType: 3, ilvl: 84, explicitMods: ['+30 to Strength'], extended: { text: b64(ITEM_EN) } }
      },
      ctx
    )
    expect(hit).toMatchObject({
      key: `s1:${'a'.repeat(64)}`,
      rarity: 'unique',
      merchant: false,
      seller: 'online',
      price: { amount: 5, currency: 'chaos' },
      account: 'Seller#1234',
      text: ITEM_EN,
      mods: ['+30 to Strength'],
      ilvl: 84
    })
    expect(hit?.whisper).toContain('@Seller')
  })

  it('лот торговца: без whisper, комиссия в золоте', () => {
    const hit = toLiveHit(
      { id: 'b'.repeat(64), listing: { fee: 6720, price: { amount: 1, currency: 'alch' }, account: { name: 'M', online: null } }, item: { typeLine: 'Leather Belt', frameType: 0 } },
      ctx
    )
    expect(hit).toMatchObject({ merchant: true, fee: 6720, rarity: 'normal' })
    expect(hit?.whisper).toBeUndefined()
    expect(hit?.seller).toBeUndefined()
  })

  it('AFK-продавец', () => {
    const hit = toLiveHit({ id: 'c'.repeat(64), listing: { whisper: '@x hi', account: { online: { status: 'afk' } } }, item: {} }, ctx)
    expect(hit?.seller).toBe('afk')
  })

  it('пустые и битые записи', () => {
    expect(toLiveHit(null, ctx)).toBeNull()
    expect(toLiveHit({ id: 'x'.repeat(64) }, ctx)).toBeNull()
    expect(toLiveHit({ item: {} }, ctx)).toBeNull()
    expect(toLiveHit({ id: 'd'.repeat(64), item: { frameType: 42, explicitMods: [1, 'ok'] } }, ctx)).toMatchObject({
      rarity: 'other',
      mods: ['ok'],
      merchant: true
    })
  })
})

describe('текст предмета из base64', () => {
  it('EN и RU', () => {
    expect(decodeItemText(b64(ITEM_EN))).toBe(ITEM_EN)
    expect(decodeItemText(b64(ITEM_RU))).toBe(ITEM_RU)
  })
  it('не текст предмета и мусор — undefined', () => {
    expect(decodeItemText(b64('<html>'))).toBeUndefined()
    expect(decodeItemText('не base64 !!!')).toBeUndefined()
    expect(decodeItemText(undefined)).toBeUndefined()
  })
})
