// «Сообщить об ошибке» (S56): адрес формы GitHub Issues «Ошибка / Bug» (.github/ISSUE_TEMPLATE/bug.yml)
// с уже подставленными полями. Чистый модуль: main (services/bugReport.ts) собирает адрес и открывает его
// в браузере игрока — само приложение ничего никуда не отправляет.
// В адрес идут только версия POETH, игра и языки: без аккаунта, ников, путей и текста предметов.
// Ключи параметров = id полей формы (version, game, client_lang, ui_lang) — менять вместе с bug.yml.

import { STRATEGY_ISSUE_URL } from './links'
import type { GameId } from './games'
import type { GameLang, UiLang } from './types/settings'

/** Форма «Ошибка / Bug»: issues/new репозитория POETH (тот же адрес, что у формы стратегий S17). */
export const BUG_REPORT_URL = `${STRATEGY_ISSUE_URL}?template=bug.yml`

export interface BugReportFields {
  /** версия приложения (app.getVersion()) */
  version: string
  game: GameId
  /** язык клиента игры; null — ещё не узнан, поле формы останется пустым */
  clientLang: GameLang | null
  uiLang: UiLang
}

const GAME_LABEL: Record<GameId, string> = { poe1: 'PoE 1', poe2: 'PoE 2' }
const LANG_LABEL: Record<GameLang, string> = { en: 'English', ru: 'Русский' }
/** semver вида 0.1.0-rc.12 — ничего лишнего в адрес */
const VERSION = /^[0-9A-Za-z.+-]{1,40}$/

/** Адрес формы с подставленными полями; неизвестные значения не подставляются. */
export function bugReportUrl(f: BugReportFields): string {
  const params: [string, string][] = []
  if (VERSION.test(f.version)) params.push(['version', f.version])
  if (GAME_LABEL[f.game]) params.push(['game', GAME_LABEL[f.game]])
  if (f.clientLang && LANG_LABEL[f.clientLang]) params.push(['client_lang', LANG_LABEL[f.clientLang]])
  if (LANG_LABEL[f.uiLang]) params.push(['ui_lang', LANG_LABEL[f.uiLang]])
  return BUG_REPORT_URL + params.map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('')
}

/** Адрес — наша форма ошибки (main открывает только его). */
export function isBugReportUrl(url: unknown): url is string {
  return typeof url === 'string' && (url === BUG_REPORT_URL || url.startsWith(`${BUG_REPORT_URL}&`))
}
