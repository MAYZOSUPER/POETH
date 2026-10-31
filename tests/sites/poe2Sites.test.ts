import { describe, expect, it } from 'vitest'
import {
  SITES,
  SITES_POE2,
  gameOfTab,
  isKnownTab,
  isSiteId,
  isSiteOfGame,
  isSitesExternalUrl,
  isTabUrl,
  siteDef,
  siteNavDecision,
  sitesFor,
  tabForUrl,
  tabHome,
  validateBookmark,
  type SiteBookmark
} from '@shared/sites'
import { fav } from '../../src/renderer/src/i18n/dict/fav'

// S64: сайты трейд-окна для PoE 2 — свой список (poe.ninja PoE 2, poe2db, вики PoE 2, Maxroll и Mobalytics PoE 2,
// poe2.re, poe2-regex-ru, PoE 2 Scout). Только ссылки: вкладка — сайт как в браузере. Без игры всё как в S43.

const BM: SiteBookmark[] = [{ id: 'v1', title: 'Vault', url: 'https://www.poe-vault.com/guides' }]

describe('реестр сайтов PoE 2', () => {
  it('список и порядок вкладок', () => {
    expect(SITES_POE2.map((s) => s.id)).toEqual(['ninja2', 'poe2db', 'wiki2', 'maxroll2', 'mobalytics2', 'poe2re', 'regexru', 'scout'])
    expect(sitesFor('poe2')).toBe(SITES_POE2)
    expect(sitesFor('poe1')).toBe(SITES)
    expect(sitesFor()).toBe(SITES)
  })

  it('буквы на вкладках и хосты внутри списка не повторяются', () => {
    expect(new Set(SITES_POE2.map((s) => s.mark)).size).toBe(SITES_POE2.length)
    const hosts = SITES_POE2.flatMap((s) => s.hosts)
    expect(new Set(hosts).size).toBe(hosts.length)
  })

  it('все хосты — https-домены, домашние страницы — на своих хостах', () => {
    for (const s of SITES_POE2) {
      for (const lang of ['ru', 'en'] as const) {
        const home = s.home(lang)
        const u = new URL(home)
        expect(u.protocol, home).toBe('https:')
        expect(s.hosts, home).toContain(u.hostname)
        expect(isTabUrl(s.id, home, []), home).toBe(true)
      }
    }
  })

  it('домашние страницы PoE 2 разделов, poe2db — на языке клиента', () => {
    expect(siteDef('ninja2').home('en')).toBe('https://poe.ninja/poe2/economy')
    expect(siteDef('maxroll2').home('en')).toBe('https://maxroll.gg/poe2')
    expect(siteDef('mobalytics2').home('en')).toBe('https://mobalytics.gg/poe-2')
    expect(tabHome('poe2db', 'ru', [])).toBe('https://poe2db.tw/ru/')
    expect(tabHome('poe2db', 'en', [])).toBe('https://poe2db.tw/us/')
    expect(siteDef('regexru').home('ru')).toBe('https://vudirvp-sketch.github.io/poe2-regex-ru/')
  })

  it('на русском — poe2db и poe2-regex-ru, остальные с подсказкой EN', () => {
    expect(SITES_POE2.filter((s) => !s.enOnly).map((s) => s.id)).toEqual(['poe2db', 'regexru'])
  })

  it('у каждого сайта есть описание RU и EN', () => {
    for (const s of SITES_POE2) {
      expect(fav.ru[s.aboutKey], s.aboutKey).toBeTypeOf('string')
      expect(fav.en[s.aboutKey], s.aboutKey).toBeTypeOf('string')
    }
  })

  it('id обеих игр известны; вкладка относится к своей игре', () => {
    for (const s of [...SITES, ...SITES_POE2]) expect(isSiteId(s.id), s.id).toBe(true)
    expect(gameOfTab('poe2db')).toBe('poe2')
    expect(gameOfTab('ninja')).toBe('poe1')
    expect(gameOfTab('scout')).toBe('poe1') // общий сайт
    expect(gameOfTab('bm:v1')).toBeUndefined()
    expect(isSiteOfGame('scout', 'poe2')).toBe(true)
    expect(isSiteOfGame('poelab', 'poe2')).toBe(false)
  })
})

describe('вкладки по игре', () => {
  it('с игрой — только её сайты; без игры — любой сайт реестра (как в S43)', () => {
    expect(isKnownTab('poe2db', [], 'poe2')).toBe(true)
    expect(isKnownTab('poelab', [], 'poe2')).toBe(false)
    expect(isKnownTab('poe2db', [], 'poe1')).toBe(false)
    expect(isKnownTab('poelab', [])).toBe(true)
    expect(isKnownTab('trade', [], 'poe2')).toBe(true)
    expect(isKnownTab('bm:v1', BM, 'poe2')).toBe(true)
  })

  it('ссылка на другой сайт — во вкладку сайта той же игры', () => {
    // poe2db → poe.ninja: PoE 2-раздел, а не PoE 1
    expect(siteNavDecision('poe2db', 'https://poe.ninja/poe2/economy/x', [])).toEqual({ kind: 'tab', tab: 'ninja2' })
    expect(siteNavDecision('poe2db', 'https://maxroll.gg/poe2/build-guides/x', [])).toEqual({ kind: 'tab', tab: 'maxroll2' })
    // PoE 1 — как раньше
    expect(siteNavDecision('poedb', 'https://poe.ninja/poe1/economy', [])).toEqual({ kind: 'tab', tab: 'ninja' })
    // poe2.re → poe2db
    expect(siteNavDecision('poe2re', 'https://poe2db.tw/us/Waystones', [])).toEqual({ kind: 'tab', tab: 'poe2db' })
    // закладка в режиме PoE 2 — игра передана явно
    expect(siteNavDecision('bm:v1', 'https://poe.ninja/poe2', BM, 'poe2')).toEqual({ kind: 'tab', tab: 'ninja2' })
  })

  it('PoE 1 не узнаёт сайты PoE 2: ссылка на poe2db со страницы poedb — никуда, как в S43', () => {
    expect(siteNavDecision('poedb', 'https://poe2db.tw/us/', [])).toEqual({ kind: 'block' })
    expect(isSitesExternalUrl('https://poe2db.tw/us/')).toBe(false)
    expect(isSitesExternalUrl('https://poe2db.tw/us/', 'poe2')).toBe(true)
  })

  it('tabForUrl — вкладка своей игры по адресу', () => {
    expect(tabForUrl('https://poe.ninja/poe2/economy', 'poe2')).toBe('ninja2')
    expect(tabForUrl('https://poe.ninja/poe1/economy', 'poe1')).toBe('ninja')
    expect(tabForUrl('https://poe2scout.com/', 'poe2')).toBe('scout')
    expect(tabForUrl('https://www.poelab.com/', 'poe2')).toBeNull()
    expect(tabForUrl('http://poe.ninja/', 'poe2')).toBeNull()
  })

  it('закладка: сайт реестра своей игры — «уже есть вкладка»; без игры — по PoE 1', () => {
    const id = (): string => 'x1'
    expect(validateBookmark({ url: 'https://poe2db.tw/ru/' }, [], id, 'poe2')).toEqual({ ok: false, reason: 'site' })
    expect(validateBookmark({ url: 'https://poe2.re/' }, [], id, 'poe2')).toEqual({ ok: false, reason: 'site' })
    expect(validateBookmark({ url: 'https://poe2db.tw/ru/' }, [], id).ok).toBe(true)
    expect(validateBookmark({ url: 'https://www.poelab.com/' }, [], id, 'poe2').ok).toBe(true)
  })
})
