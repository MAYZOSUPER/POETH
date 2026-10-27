// Правила выбора лиги PoE1 (чистый модуль; тесты — tests/net/leagues.test.ts).
// Источник — GET /api/trade/data/leagues: {result:[{id, realm, text}]}. Сайт трейда
// перечисляет текущую челлендж-лигу первой (затем её Hardcore/Ruthless, потом Standard).

import type { LeagueChoice, TradeLeague } from '@shared/types'

export interface RawLeague {
  id?: unknown
  realm?: unknown
  text?: unknown
}

export const FALLBACK_LEAGUES: TradeLeague[] = [
  { id: 'Standard', text: 'Standard' },
  { id: 'Hardcore', text: 'Hardcore' }
]

const PERMANENT = new Set(['standard', 'hardcore'])

/** Лиги для трейда PoE1: только realm pc, без Ruthless и приватных (PLxxxx), без дублей. */
export function filterTradeLeagues(raw: unknown): TradeLeague[] {
  const list = Array.isArray(raw) ? (raw as RawLeague[]) : []
  const out: TradeLeague[] = []
  const seen = new Set<string>()
  for (const l of list) {
    if (!l || typeof l.id !== 'string' || !l.id.trim()) continue
    if (l.realm !== undefined && l.realm !== 'pc') continue
    const id = l.id.trim()
    if (/ruthless/i.test(id)) continue
    if (/\(PL\d+\)\s*$/i.test(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, text: typeof l.text === 'string' && l.text.trim() ? l.text.trim() : id })
  }
  return out
}

function isHardcore(id: string): boolean {
  return /\bhardcore\b|^hc\b|\bhc\s/i.test(id)
}

function isSsf(id: string): boolean {
  return /\bssf\b|solo self-found/i.test(id)
}

/**
 * Текущая челлендж-лига: первая софткор-лига, не постоянная и не SSF.
 * Нет такой — Standard (или первая из списка).
 */
export function pickAutoLeague(leagues: TradeLeague[]): string {
  const challenge = leagues.find(
    (l) => !PERMANENT.has(l.id.toLowerCase()) && !isHardcore(l.id) && !isSsf(l.id)
  )
  if (challenge) return challenge.id
  return leagues.find((l) => l.id === 'Standard')?.id ?? leagues[0]?.id ?? 'Standard'
}

/**
 * Какая лига идёт в запросы при выборе `choice`. Пропавшая из списка лига → auto
 * (stale), но только если список получен с сервера (`fromServer`): запасному списку
 * без сети выбор пользователя не перечит.
 */
export function resolveLeague(
  choice: LeagueChoice,
  leagues: TradeLeague[],
  auto: string,
  fromServer = true
): { effective: string; stale: boolean } {
  if (!choice || choice === 'auto') return { effective: auto, stale: false }
  if (!fromServer || leagues.some((l) => l.id === choice)) return { effective: choice, stale: false }
  return { effective: auto, stale: true }
}
