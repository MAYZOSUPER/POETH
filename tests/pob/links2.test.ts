import { describe, expect, it } from 'vitest'
import { POB_FETCH_HOSTS, parsePobInput } from '@shared/pob/links'
import { POB2_FETCH_HOSTS, isPob2FetchUrl, parsePob2Input } from '@shared/pob/links2'
import { fixtureCode } from './fixtures'

// Ссылки на билды PoE 2 (S66): пасты как у PoE 1, PoB-паста Maxroll PoE 2, poe2db; планнеры — «скопируйте код»;
// ссылки PoE 1 — «это билд PoE 1» без сети. Разбор PoE 1 (links.ts) не меняется.

describe('PoE 2: ссылки на сырой код', () => {
  it.each([
    ['https://pobb.in/cfGX8dxpObcW', 'pobbin', 'https://pobb.in/cfGX8dxpObcW/raw'],
    ['pobb.in/c2oP9ShIWk2A', 'pobbin', 'https://pobb.in/c2oP9ShIWk2A/raw'],
    ['https://pob.codes/b/AbCdEfGhIjK', 'pobcodes', 'https://api.pob.codes/AbCdEfGhIjK/raw'],
    ['https://pastebin.com/dzfTT720', 'pastebin', 'https://pastebin.com/raw/dzfTT720'],
    ['https://rentry.co/abcd1234', 'rentry', 'https://rentry.co/paste/abcd1234/raw'],
    ['https://maxroll.gg/poe2/pob/wxyz5678', 'maxroll', 'https://maxroll.gg/poe2/api/pob/wxyz5678'],
    ['https://maxroll.gg/poe2/api/pob/wxyz5678', 'maxroll', 'https://maxroll.gg/poe2/api/pob/wxyz5678'],
    ['https://poe2db.tw/pob/AbCd1234', 'poe2db', 'https://poe2db.tw/pob/AbCd1234/raw'],
    ['https://poe2db.tw/ru/pob/AbCd1234', 'poe2db', 'https://poe2db.tw/pob/AbCd1234/raw'],
    ['Билд: https://pobb.in/IM7N3sAmty33.', 'pobbin', 'https://pobb.in/IM7N3sAmty33/raw']
  ])('%s', (text, site, rawUrl) => {
    const r = parsePob2Input(text)
    expect(r).toMatchObject({ kind: 'link', site, rawUrl })
    if (r.kind === 'link') expect(isPob2FetchUrl(r.rawUrl)).toBe(true)
  })

  it('планнер и гайды Maxroll PoE 2, Mobalytics, poe.ninja — «скопируйте код»', () => {
    expect(parsePob2Input('https://maxroll.gg/poe2/planner/abc123')).toEqual({ kind: 'copy-code', site: 'maxroll-planner' })
    expect(parsePob2Input('https://maxroll.gg/poe2/build-guides/lightning-arrow')).toEqual({ kind: 'copy-code', site: 'maxroll-planner' })
    expect(parsePob2Input('https://mobalytics.gg/poe-2/builds/x')).toEqual({ kind: 'copy-code', site: 'mobalytics' })
    expect(parsePob2Input('https://poe.ninja/poe2/pob/12345')).toEqual({ kind: 'copy-code', site: 'poeninja' })
  })

  it('ссылки на билды PoE 1 узнаются без сети', () => {
    for (const u of ['https://maxroll.gg/poe/pob/abcd1234', 'https://poedb.tw/pob/eQVFNoqVZrza', 'https://poe.ninja/poe1/pob/1', 'https://mobalytics.gg/poe/builds/x']) {
      expect(parsePob2Input(u)).toEqual({ kind: 'poe1' })
    }
  })

  it('код — как есть; чужой сайт и мусор', () => {
    expect(parsePob2Input(fixtureCode('poe2-pobbin-amazon'))).toMatchObject({ kind: 'code' })
    expect(parsePob2Input('https://example.com/build')).toEqual({ kind: 'unknown-link', host: 'example.com' })
    expect(parsePob2Input('https://pobb.in:8443/abcd1234')).toEqual({ kind: 'unknown-link', host: 'pobb.in' })
    expect(parsePob2Input('просто текст')).toEqual({ kind: 'not-pob' })
    expect(parsePob2Input('   ')).toEqual({ kind: 'empty' })
  })

  it('allowlist загрузки: хосты PoE 1 + poe2db, только https без порта и логина', () => {
    expect([...POB2_FETCH_HOSTS].sort()).toEqual([...POB_FETCH_HOSTS, 'poe2db.tw'].sort())
    expect(isPob2FetchUrl('https://poe2db.tw/pob/AbCd1234/raw')).toBe(true)
    expect(isPob2FetchUrl('http://poe2db.tw/pob/AbCd1234/raw')).toBe(false)
    expect(isPob2FetchUrl('https://user@pobb.in/x')).toBe(false)
    expect(isPob2FetchUrl('https://evil.example/x')).toBe(false)
  })

  it('PoE 1 не изменился: poe2db и Maxroll PoE 2 там по-прежнему «это билд PoE 2»', () => {
    expect(parsePobInput('https://poe2db.tw/pob/AbCd1234')).toEqual({ kind: 'poe2' })
    expect(parsePobInput('https://maxroll.gg/poe2/pob/wxyz5678')).toEqual({ kind: 'poe2' })
    expect(POB_FETCH_HOSTS.has('poe2db.tw')).toBe(false)
  })
})
