import { describe, expect, it } from 'vitest'
import {
  blacklistReasonKey,
  buildBlacklistIndex,
  checkBlacklist,
  parseBlacklistCsv,
  splitCsvLine
} from '@shared/deals/blacklist'

// Формат как в The-Forbidden-Trove/ForbiddenTroveBlacklist/blacklist.csv (данные выдуманы).
const CSV = [
  'account_name, discord_id, blacklisted_on, reason, active',
  '"scammer#2351", "726096719573680181", "27/06/2020", "Stole Item(s) during Service(s)", "Y"',
  '"OldName", "342248236146360330", "28/06/2020", "Swap scam(s)", "Y"',
  '"Мошенник#0001", "1", "01/01/2024", "Editing whisper message", "Y"',
  '"forgiven#1", "2", "01/01/2021", "Rota scam", "N"',
  '"quote""d", "3", "02/02/2022", "Did not pay, then left", "Y"',
  ''
].join('\r\n')

describe('splitCsvLine', () => {
  it('кавычки, пробелы после запятой, «""», запятая внутри', () => {
    expect(splitCsvLine('"a", "b c", "x, y"')).toEqual(['a', 'b c', 'x, y'])
    expect(splitCsvLine('"q""d",2')).toEqual(['q"d', '2'])
    expect(splitCsvLine('a, b ,')).toEqual(['a', 'b', ''])
  })
})

describe('parseBlacklistCsv', () => {
  it('активные записи, заголовок пропущен', () => {
    const list = parseBlacklistCsv('﻿' + CSV)
    expect(list.map((e) => e.account)).toEqual(['scammer#2351', 'OldName', 'Мошенник#0001', 'quote"d'])
    expect(list[0]).toEqual({ account: 'scammer#2351', reason: 'Stole Item(s) during Service(s)', since: '27/06/2020' })
    expect(list[3].reason).toBe('Did not pay, then left')
  })
})

describe('checkBlacklist', () => {
  const idx = buildBlacklistIndex(parseBlacklistCsv(CSV))

  it('точно по аккаунту (без учёта регистра)', () => {
    expect(checkBlacklist(idx, { account: 'Scammer#2351' })).toMatchObject({ account: 'scammer#2351', matchedBy: 'account' })
    expect(checkBlacklist(idx, { account: 'мошенник#0001' })?.reason).toBe('Editing whisper message')
  })

  it('аккаунт без #… совпадает с «имя#1234»; другой дискриминатор — нет', () => {
    expect(checkBlacklist(idx, { account: 'scammer' })?.matchedBy).toBe('account')
    expect(checkBlacklist(idx, { account: 'scammer#9999' })).toBeNull()
  })

  it('имя персонажа = имя аккаунта из списка → «вероятно»', () => {
    expect(checkBlacklist(idx, { character: 'oldname' })).toMatchObject({ account: 'OldName', matchedBy: 'character' })
    expect(checkBlacklist(idx, { character: 'Мошенник' })?.matchedBy).toBe('character')
    expect(checkBlacklist(idx, { character: 'GoodGuy' })).toBeNull()
    expect(checkBlacklist(idx, {})).toBeNull()
  })

  it('неактивные записи не попадают', () => {
    expect(checkBlacklist(idx, { account: 'forgiven#1' })).toBeNull()
    expect(idx.size).toBe(4)
  })
})

describe('blacklistReasonKey', () => {
  it('частые причины → ключ перевода', () => {
    expect(blacklistReasonKey('Swap Scam(s)')).toBe('swap')
    expect(blacklistReasonKey('Did not pay for service(s)')).toBe('notPaid')
    expect(blacklistReasonKey('Editing whisper message')).toBe('editWhisper')
    expect(blacklistReasonKey('Stole currency from group')).toBe('stole')
    expect(blacklistReasonKey('Something new')).toBeNull()
  })
})
