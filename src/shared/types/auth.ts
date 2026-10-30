// Вход в аккаунт pathofexile.com и сеть трейда (этап S3).
// ВАЖНО: POESESSID и любые cookies никогда не попадают в renderer — только статус.

import type { LeagueChoice } from './settings'

/** Почему статус входа не удалось проверить. */
export type AuthProblem = 'network' | 'blocked'

export interface AuthStatus {
  loggedIn: boolean
  /** имя аккаунта (Name#1234), если сайт его показал */
  accountName?: string
  /** идёт проверка сессии */
  checking: boolean
  /** null — проверка прошла; 'blocked' — Cloudflare просит пройти проверку в окне сайта */
  problem: AuthProblem | null
  /** откуда сессия: окно входа на сайте или вставленный вручную POESESSID */
  source?: 'window' | 'pasted'
}

export type PasteSessionError =
  /** не 32 шестнадцатеричных символа */
  | 'invalid-format'
  /** сайт не узнал аккаунт по этому POESESSID (устарел/неверный) */
  | 'not-logged-in'
  | 'network'
  | 'blocked'

/**
 * S47: итог переноса старого POESESSID прайс-чека PoE2 (secret.json) во вход аккаунта (partition persist:poe-account):
 *  - `moved` — ключ перенесён во вход (сайт его узнал или проверить пока не удалось — проверка позже);
 *  - `expired` — сайт ключ не узнал (сессия кончилась): удалён, войти заново кнопкой «Войти»;
 *  - `already` — вход в аккаунт уже был: старый ключ просто удалён.
 */
export type Poe2SessionNotice = 'moved' | 'expired' | 'already'

export type PasteSessionResult =
  | { ok: true; status: AuthStatus }
  | { ok: false; error: PasteSessionError; status: AuthStatus }

/** Коды ошибок сети трейда (шлюз S3) — общие для main и UI (S4/S6). */
export type NetErrorCode =
  /** ждать места в лимите дольше допустимого; retryAfterMs — через сколько повторить */
  | 'rate-limited'
  /** Cloudflare/HTML вместо JSON — пройти проверку в окне сайта */
  | 'blocked'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'bad-request'
  | 'server'
  | 'network'
  | 'bad-response'

export interface NetError {
  code: NetErrorCode
  retryAfterMs?: number
  status?: number
  /** сообщение API GGG ({error:{message}}), если было */
  message?: string
}

/** Лига трейда PoE1 (realm pc, без Ruthless и приватных). */
export interface TradeLeague {
  id: string
  text: string
}

export interface LeaguesState {
  leagues: TradeLeague[]
  /** текущая челлендж-лига (для выбора 'auto') */
  auto: string
  /** выбор в настройках (poe1.league) */
  chosen: LeagueChoice
  /** лига, которая реально идёт в запросы */
  effective: string
  /** выбранной вручную лиги больше нет в списке — используется auto */
  stale: boolean
  /** когда список обновлён с сервера (ms); null — ещё ни разу, используется запасной */
  updatedAt: number | null
}
