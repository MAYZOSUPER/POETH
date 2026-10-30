import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem } from '@shared/poe1/parser'
import { deepLinkUrl, linkRefOfItem, ninjaLeague, poedbSlug, poedbUrl, wikiUrl, type LinkRef } from '@shared/siteLinks'
import { isTabUrl } from '@shared/sites'
import { readFixture, store } from '../poe1/helpers'

// S43: глубокие ссылки — сразу на страницу предмета, камня или ноды. Имена английские, poedb — на языке клиента.

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

function ref(lang: Poe1Lang, fixture: string): LinkRef | null {
  const res = parseItem(readFixture(lang, fixture), data)
  if (!res.ok) throw new Error(`${lang}/${fixture}: ${res.error}`)
  return linkRefOfItem(res.value)
}

describe('адреса страниц', () => {
  it('poedb: пробелы → _, без апострофов, дефис и не-ASCII как есть', () => {
    expect(poedbSlug("Atziri's Disfavour")).toBe('Atziris_Disfavour')
    expect(poedbSlug('Brutus’ Lead Sprinkler')).toBe('Brutus_Lead_Sprinkler')
    expect(poedbSlug('Seven-League Step')).toBe('Seven-League_Step')
    expect(poedbSlug('Mjölner')).toBe('Mj%C3%B6lner')
    expect(poedbSlug('Kinetic Blast of Clustering')).toBe('Kinetic_Blast_of_Clustering')
  })

  it('poedb: /ru/ для RU-клиента, /us/ для EN', () => {
    expect(poedbUrl('Headhunter', 'ru')).toBe('https://poedb.tw/ru/Headhunter')
    expect(poedbUrl('Headhunter', 'en')).toBe('https://poedb.tw/us/Headhunter')
    expect(poedbUrl('  ', 'en')).toBeNull()
  })

  it('вики: пробелы → _, апостроф остаётся', () => {
    expect(wikiUrl("Atziri's Disfavour")).toBe("https://www.poewiki.net/wiki/Atziri's_Disfavour")
    expect(wikiUrl('Mjölner')).toBe('https://www.poewiki.net/wiki/Mj%C3%B6lner')
  })

  it('poe.ninja: лига в адресе', () => {
    expect(ninjaLeague('Allflame')).toBe('allflame')
    expect(ninjaLeague('Hardcore Allflame')).toBe('allflamehc')
    expect(ninjaLeague('SSF Allflame')).toBe('allflame')
    expect(ninjaLeague('HC SSF Allflame')).toBe('allflamehc')
    expect(ninjaLeague('Standard')).toBe('standard')
    expect(ninjaLeague('Hardcore')).toBe('hardcore')
    expect(ninjaLeague('SSF Hardcore')).toBe('hardcore')
    expect(ninjaLeague('Settlers of Kalguur')).toBe('settlersofkalguur')
  })

  it('имя в адресе не уводит со страницы: ?, #, / и ../ кодируются', () => {
    const nasty = '../../x?y=1#z'
    expect(poedbUrl(nasty, 'en')).toBe('https://poedb.tw/us/..%2F..%2Fx%3Fy%3D1%23z')
    expect(new URL(wikiUrl(nasty)!).pathname.startsWith('/wiki/')).toBe(true)
    const ninja = deepLinkUrl('ninja', { name: nasty, ninja: 'currency' }, { gameLang: 'en', league: 'Allflame' })!
    expect(new URL(ninja).searchParams.get('name')).toBe(nasty)
    expect(new URL(ninja).pathname).toBe('/poe1/economy/allflame/currency')
  })
})

describe('предмет окна цены → страница (RU и EN клиент)', () => {
  it.each(['en', 'ru'] as const)('уник (%s): по английскому имени уника, poe.ninja — аксессуары', (lang) => {
    expect(ref(lang, 'unique-01')).toEqual({ name: 'Sidhebreath', ninja: 'unique-accessories' })
  })

  it.each(['en', 'ru'] as const)('редкий пояс (%s): по базе, poe.ninja — Base Types', (lang) => {
    expect(ref(lang, 'rare-belt')).toEqual({ name: 'Stygian Vise', ninja: 'base-types' })
  })

  it.each(['en', 'ru'] as const)('камень, карта гадания, валюта (%s): английские имена', (lang) => {
    expect(ref(lang, 'gem-01')?.ninja).toBe('skill-gems')
    expect(ref(lang, 'gem-01')?.name).toMatch(/^[A-Za-z' -]+$/)
    expect(ref(lang, 'card-01')?.ninja).toBe('divination-cards')
    expect(ref(lang, 'card-01')?.name).toMatch(/^[A-Za-z' -]+$/)
    expect(ref(lang, 'manual-currency-01')).toEqual({ name: 'Chaos Orb', ninja: 'currency' })
  })

  it('одна и та же вещь RU и EN — один адрес вики и poe.ninja; poedb — в своём разделе', () => {
    const en = ref('en', 'unique-01')!
    const ru = ref('ru', 'unique-01')!
    const ctx = (gameLang: 'ru' | 'en') => ({ gameLang, league: 'Hardcore Allflame' })
    expect(deepLinkUrl('wiki', ru, ctx('ru'))).toBe(deepLinkUrl('wiki', en, ctx('en')))
    expect(deepLinkUrl('ninja', ru, ctx('ru'))).toBe('https://poe.ninja/poe1/economy/allflamehc/unique-accessories?name=Sidhebreath')
    expect(deepLinkUrl('poedb', ru, ctx('ru'))).toBe('https://poedb.tw/ru/Sidhebreath')
    expect(deepLinkUrl('poedb', en, ctx('en'))).toBe('https://poedb.tw/us/Sidhebreath')
  })

  it('каждый адрес — страница своей вкладки (main его пропустит)', () => {
    const r = ref('ru', 'unique-01')!
    const ctx = { gameLang: 'ru' as const, league: 'Allflame' }
    expect(isTabUrl('poedb', deepLinkUrl('poedb', r, ctx), [])).toBe(true)
    expect(isTabUrl('wiki', deepLinkUrl('wiki', r, ctx), [])).toBe(true)
    expect(isTabUrl('ninja', deepLinkUrl('ninja', r, ctx), [])).toBe(true)
  })

  it('нет предмета — нет ссылок', () => {
    expect(linkRefOfItem(null)).toBeNull()
  })
})
