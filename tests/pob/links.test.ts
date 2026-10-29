import { describe, expect, it } from 'vitest'
import { POB_FETCH_HOSTS, isPobFetchUrl, parsePobInput } from '@shared/pob/links'
import { fixtureCode } from './fixtures'

describe('ссылки на сырой код', () => {
  it.each([
    ['https://pobb.in/7wnwKj2Fc1lj', 'pobbin', 'https://pobb.in/7wnwKj2Fc1lj/raw'],
    ['https://pobb.in/-3-2bo8JyyVe', 'pobbin', 'https://pobb.in/-3-2bo8JyyVe/raw'],
    ['pobb.in/Ywau8-8eeNCT', 'pobbin', 'https://pobb.in/Ywau8-8eeNCT/raw'],
    ['https://pobb.in/u/enkivt/AbCd1234', 'pobbin', 'https://pobb.in/u/enkivt/AbCd1234/raw'],
    ['https://pobb.in/7wnwKj2Fc1lj/raw', 'pobbin', 'https://pobb.in/7wnwKj2Fc1lj/raw'],
    ['https://pobb.in/pob/7wnwKj2Fc1lj', 'pobbin', 'https://pobb.in/7wnwKj2Fc1lj/raw'],
    ['http://www.pobb.in/7wnwKj2Fc1lj?foo=1#x', 'pobbin', 'https://pobb.in/7wnwKj2Fc1lj/raw'],
    ['https://pastebin.com/dzfTT720', 'pastebin', 'https://pastebin.com/raw/dzfTT720'],
    ['https://pastebin.com/raw/iXWZWriH', 'pastebin', 'https://pastebin.com/raw/iXWZWriH'],
    ['https://pob.codes/b/AbCdEfGhIjK', 'pobcodes', 'https://api.pob.codes/AbCdEfGhIjK/raw'],
    ['https://api.pob.codes/AbCdEfGhIjK/raw', 'pobcodes', 'https://api.pob.codes/AbCdEfGhIjK/raw'],
    ['https://poedb.tw/pob/eQVFNoqVZrza', 'poedb', 'https://poedb.tw/pob/eQVFNoqVZrza/raw'],
    ['https://poedb.tw/us/pob/eQVFNoqVZrza', 'poedb', 'https://poedb.tw/pob/eQVFNoqVZrza/raw'],
    ['https://maxroll.gg/poe/pob/abcd1234', 'maxroll', 'https://maxroll.gg/poe/api/pob/abcd1234'],
    ['https://maxroll.gg/poe/api/pob/abcd1234', 'maxroll', 'https://maxroll.gg/poe/api/pob/abcd1234'],
    ['https://rentry.co/abcd1234', 'rentry', 'https://rentry.co/paste/abcd1234/raw'],
    ['PoB: https://pobb.in/7wnwKj2Fc1lj.', 'pobbin', 'https://pobb.in/7wnwKj2Fc1lj/raw']
  ])('%s', (text, site, rawUrl) => {
    const r = parsePobInput(text)
    expect(r).toMatchObject({ kind: 'link', site, rawUrl })
    if (r.kind === 'link') expect(isPobFetchUrl(r.rawUrl)).toBe(true)
  })

  it('планнер и гайды Maxroll, Mobalytics, poe.ninja — «скопируйте код»', () => {
    expect(parsePobInput('https://maxroll.gg/poe/planner/abc123')).toEqual({ kind: 'copy-code', site: 'maxroll-planner' })
    expect(parsePobInput('https://maxroll.gg/poe/build-guides/boneshatter-slayer')).toEqual({ kind: 'copy-code', site: 'maxroll-planner' })
    expect(parsePobInput('https://mobalytics.gg/poe/profile/x/builds/y')).toEqual({ kind: 'copy-code', site: 'mobalytics' })
    expect(parsePobInput('https://poe.ninja/poe1/pob/21625')).toEqual({ kind: 'copy-code', site: 'poeninja' })
    expect(parsePobInput('https://poe.ninja/builds/char/acc/name')).toEqual({ kind: 'copy-code', site: 'poeninja' })
  })

  it('ссылки на билды PoE 2 узнаются без сети', () => {
    for (const u of [
      'https://maxroll.gg/poe2/pob/wxyz5678',
      'https://maxroll.gg/poe2/planner/abc',
      'https://poe.ninja/poe2/pob/21625',
      'https://poe2db.tw/pob/abcdef12/raw',
      'https://mobalytics.gg/poe-2/builds/x'
    ])
      expect(parsePobInput(u), u).toEqual({ kind: 'poe2' })
  })

  it('сайт не из списка, приманки и обходы', () => {
    expect(parsePobInput('https://evil.example/7wnwKj2Fc1lj')).toEqual({ kind: 'unknown-link', host: 'evil.example' })
    expect(parsePobInput('https://pobb.in.evil.example/7wnwKj2Fc1lj')).toEqual({ kind: 'unknown-link', host: 'pobb.in.evil.example' })
    expect(parsePobInput('https://pobb.in@evil.example/7wnwKj2Fc1lj')).toEqual({ kind: 'unknown-link', host: 'evil.example' })
    expect(parsePobInput('https://user:pw@pobb.in/7wnwKj2Fc1lj')).toEqual({ kind: 'unknown-link', host: 'pobb.in' })
    expect(parsePobInput('https://pobb.in:8443/7wnwKj2Fc1lj')).toEqual({ kind: 'unknown-link', host: 'pobb.in' })
    expect(parsePobInput('https://pobb.in/../../etc/passwd')).toMatchObject({ kind: 'unknown-link' })
    expect(parsePobInput('https://pastebin.com/login')).toMatchObject({ kind: 'link', id: 'login' }) // сырой адрес всё равно на pastebin
    expect(parsePobInput('https://pastebin.com/u/someone')).toEqual({ kind: 'unknown-link', host: 'pastebin.com' })
    expect(parsePobInput('file:///C:/Windows/win.ini')).toEqual({ kind: 'not-pob' })
    expect(parsePobInput('javascript:alert(1)')).toEqual({ kind: 'not-pob' })
  })

  it('код, пусто, просто текст', () => {
    const code = fixtureCode('pobbin-crit')
    expect(parsePobInput(code)).toEqual({ kind: 'code', code })
    expect(parsePobInput(`  ${code}\n`)).toEqual({ kind: 'code', code })
    expect(parsePobInput('   ')).toEqual({ kind: 'empty' })
    expect(parsePobInput('привет, это мой билд')).toEqual({ kind: 'not-pob' })
  })
})

describe('allowlist загрузки', () => {
  it('только https, только свои хосты', () => {
    expect([...POB_FETCH_HOSTS].sort()).toEqual(['api.pob.codes', 'maxroll.gg', 'pastebin.com', 'pobb.in', 'poedb.tw', 'rentry.co'])
    expect(isPobFetchUrl('https://pobb.in/x/raw')).toBe(true)
    expect(isPobFetchUrl('https://maxroll.gg/poe/api/pob/x')).toBe(true)
    for (const bad of [
      'http://pobb.in/x/raw',
      'https://evil.example/x',
      'https://pobb.in.evil.example/x',
      'https://sub.pobb.in/x',
      'https://pobb.in:444/x',
      'https://a:b@pobb.in/x',
      'https://poe.ninja/poe1/pob/raw/1',
      'https://mobalytics.gg/x',
      'file:///C:/x',
      'not a url'
    ])
      expect(isPobFetchUrl(bad), bad).toBe(false)
  })
})
