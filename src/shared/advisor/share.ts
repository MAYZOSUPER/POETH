// «Поделиться» и «Открыть в POETH» (S17; чистый модуль, tests/advisor/share.test.ts): ссылка на страницу
// стратегии, адрес формы «Предложить стратегию» на GitHub и разбор ссылки протокола из аргументов запуска.
//
// Протокол — отдельная схема poeth-strategy:, а не внутренняя poeth:// (файлы данных и иконки для окон
// приложения, привилегированная схема Chromium). Из ОС принимаем только poeth-strategy://import#<код>:
// всё остальное в аргументах игнорируется, а код всегда идёт в окно импорта с предпросмотром — без
// автодобавления. Почему отдельная схема — docs/advisor.md.

import { STRATEGY_ISSUE_URL, STRATEGY_VIEW_URL } from '../links'
import { MAX_CODE_CHARS, extractCode } from './codec'

/** Схема «Открыть в POETH» (регистрирует установленная версия; portable — нет). */
export const STRATEGY_SCHEME = 'poeth-strategy'
/** Ссылка, которую ставит сайт: poeth-strategy://import#POETH1:… */
export const STRATEGY_DEEP_LINK = `${STRATEGY_SCHEME}://import#`
/** Длиннее адрес формы GitHub не открываем с кодом: код уходит в буфер, форма — без него. */
export const MAX_ISSUE_URL = 7_500

/** Страница стратегии на сайте: код после # (на сервер не уходит). */
export function strategyLink(code: string): string {
  return `${STRATEGY_VIEW_URL}#${code}`
}

/** Адрес формы «Предложить стратегию» с названием и кодом; длинный — без кода (withCode = false). */
export function issueUrl(code: string, title: string): { url: string; withCode: boolean } {
  const base = `${STRATEGY_ISSUE_URL}?template=strategy.yml&title=${encodeURIComponent(`Стратегия: ${title}`.slice(0, 120))}`
  const full = `${base}&code=${encodeURIComponent(code)}`
  return full.length <= MAX_ISSUE_URL ? { url: full, withCode: true } : { url: base, withCode: false }
}

/** Код из ссылки протокола; null — не наша ссылка или не путь импорта (её игнорируем). */
export function deepLinkCode(arg: unknown): string | null {
  if (typeof arg !== 'string' || arg.length > MAX_CODE_CHARS + 200) return null
  const m = /^poeth-strategy:\/\/import\/?#(.+)$/is.exec(arg.trim())
  if (!m) return null
  const code = extractCode(m[1])
  return code && /^POETH\d{1,3}:/.test(code) ? code : null
}

/** Первая ссылка импорта среди аргументов запуска (second-instance, первый запуск). */
export function deepLinkFromArgv(argv: readonly unknown[]): string | null {
  for (const a of argv) {
    const code = deepLinkCode(a)
    if (code) return code
  }
  return null
}
