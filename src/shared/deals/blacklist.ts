// Чёрный список PoE Hub (The-Forbidden-Trove/ForbiddenTroveBlacklist, MIT):
// blacklist.csv = «account_name, discord_id, blacklisted_on, reason, active», значения в кавычках.
// В списке — ИМЕНА АККАУНТОВ (часто с #1234), а в Client.txt приходят имена персонажей.
// Поэтому: точное совпадение — по аккаунту (известен у исходящих из трейда; для входящих —
// после запроса имени аккаунта по персонажу, S3), а совпадение имени персонажа с именем
// аккаунта из списка — «вероятно» (matchedBy: 'character').

import type { BlacklistHit } from '../types/deals'

export const BLACKLIST_URL =
  'https://raw.githubusercontent.com/The-Forbidden-Trove/ForbiddenTroveBlacklist/main/blacklist.csv'
/** Обновлять кэш не чаще раза в сутки. */
export const BLACKLIST_MAX_AGE_MS = 24 * 60 * 60_000

export interface BlacklistEntry {
  account: string
  reason: string
  since: string
}

/** Разбор одной строки CSV: кавычки, «""» внутри, пробелы после запятой. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cell = ''
  let quoted = false // ячейка начиналась с кавычки
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c !== '"') cell += c
      else if (line[i + 1] === '"') {
        cell += '"'
        i++
      } else inQuotes = false
    } else if (c === ',') {
      out.push(quoted ? cell : cell.trim())
      cell = ''
      quoted = false
    } else if (c === '"' && !quoted && cell.trim() === '') {
      cell = ''
      quoted = inQuotes = true
    } else if (!quoted) cell += c
    // после закрывающей кавычки до запятой — пропускаем
  }
  out.push(quoted ? cell : cell.trim())
  return out
}

/** blacklist.csv → активные записи (active = Y). Строка заголовка и мусор пропускаются. */
export function parseBlacklistCsv(text: string): BlacklistEntry[] {
  const out: BlacklistEntry[] = []
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  let cols: { account: number; reason: number; since: number; active: number } | null = null
  for (const line of lines) {
    if (!line.trim()) continue
    const cells = splitCsvLine(line)
    if (!cols) {
      const head = cells.map((c) => c.trim().toLowerCase())
      if (head.includes('account_name')) {
        cols = {
          account: head.indexOf('account_name'),
          reason: head.indexOf('reason'),
          since: head.indexOf('blacklisted_on'),
          active: head.indexOf('active')
        }
        continue
      }
      // без заголовка — порядок как в репозитории
      cols = { account: 0, reason: 3, since: 2, active: 4 }
    }
    const account = (cells[cols.account] ?? '').trim()
    if (!account) continue
    const active = cols.active >= 0 ? (cells[cols.active] ?? '').trim().toUpperCase() : 'Y'
    if (active && active !== 'Y') continue
    out.push({
      account,
      reason: (cols.reason >= 0 ? cells[cols.reason] : '')?.trim() ?? '',
      since: (cols.since >= 0 ? cells[cols.since] : '')?.trim() ?? ''
    })
  }
  return out
}

export interface BlacklistIndex {
  size: number
  /** полное имя аккаунта (нижний регистр) → запись */
  byAccount: Map<string, BlacklistEntry>
  /** имя аккаунта без «#1234» → запись (для совпадения с именем персонажа) */
  byBase: Map<string, BlacklistEntry>
}

const norm = (s: string): string => s.normalize('NFC').trim().toLowerCase()
const baseName = (s: string): string => norm(s).replace(/#\d+$/, '')

export function buildBlacklistIndex(entries: BlacklistEntry[]): BlacklistIndex {
  const byAccount = new Map<string, BlacklistEntry>()
  const byBase = new Map<string, BlacklistEntry>()
  for (const e of entries) {
    const key = norm(e.account)
    if (!byAccount.has(key)) byAccount.set(key, e)
    const base = baseName(e.account)
    if (base && !byBase.has(base)) byBase.set(base, e)
  }
  return { size: byAccount.size, byAccount, byBase }
}

/**
 * Проверить собеседника. account — имя аккаунта (с #1234 или без), character — имя персонажа.
 * Аккаунт без «#…» совпадает с записью «имя#1234» (старые аккаунты без дискриминатора).
 */
export function checkBlacklist(
  index: BlacklistIndex,
  who: { account?: string; character?: string }
): BlacklistHit | null {
  const hit = (e: BlacklistEntry, matchedBy: BlacklistHit['matchedBy']): BlacklistHit => ({
    account: e.account,
    reason: e.reason,
    since: e.since,
    matchedBy
  })
  if (who.account) {
    const exact = index.byAccount.get(norm(who.account))
    if (exact) return hit(exact, 'account')
    if (!/#\d+$/.test(who.account.trim())) {
      const byBase = index.byBase.get(baseName(who.account))
      if (byBase) return hit(byBase, 'account')
    }
  }
  if (who.character) {
    const e = index.byBase.get(baseName(who.character))
    if (e) return hit(e, 'character')
  }
  return null
}

/** Причина из списка → ключ строки интерфейса (deals.bl.reason.<ключ>), иначе null. */
export function blacklistReasonKey(reason: string): string | null {
  const r = reason.toLowerCase()
  if (r.includes('swap scam')) return 'swap'
  if (r.includes('did not pay')) return 'notPaid'
  if (r.includes('editing whisper')) return 'editWhisper'
  if (r.includes('alt of a')) return 'alt'
  if (r.includes('stole')) return 'stole'
  if (r.includes('overpaid')) return 'overpaid'
  if (r.includes('rota scam')) return 'rota'
  if (r.includes('harassment') || r.includes('threat') || r.includes('doxx')) return 'harassment'
  if (r.includes('carry')) return 'carry'
  if (r.includes('scam')) return 'scam'
  return null
}
