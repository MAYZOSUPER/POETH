// Язык клиента игры (S26): названия предметов, валют и баз в POETH — как в игре, а пояснения — на языке
// интерфейса. Чистый модуль (main, renderer, тесты): какой язык брать по настройке, определение по тексту
// предмета и строкам Client.txt, перенос старой настройки вкладки Regex.
// По конфигу игры не определяем: в production_Config.ini ключа языка нет (проверено 29.10.2026 на EN-клиенте).

import type { GameLang, GameLangDetected, GameLangSettings, GameLangSource, UiLang } from './types/settings'
import { detectItemLang } from './poe1/data/lang'
import { splitLogLine } from './deals/whisperParse'

/** Откуда язык названий: выбран вручную, узнан по игре или (пока не узнан) — как язык интерфейса. */
export type GameLangBy = 'choice' | GameLangSource | 'ui'

/** Язык названий: ручной выбор → узнанный по игре → язык интерфейса. */
export function resolveGameLang(
  gl: GameLangSettings | null | undefined,
  uiLang: UiLang
): { lang: GameLang; by: GameLangBy } {
  if (gl && gl.choice !== 'auto') return { lang: gl.choice, by: 'choice' }
  if (gl?.detected) return { lang: gl.detected.lang, by: gl.detected.by }
  return { lang: uiLang, by: 'ui' }
}

/** Более свежее из двух определений. */
export function newerDetected(
  a: GameLangDetected | null | undefined,
  b: GameLangDetected | null | undefined
): GameLangDetected | null {
  if (!a) return b ?? null
  if (!b) return a
  return b.at > a.at ? b : a
}

/**
 * Что записать в настройки после нового определения: null — ничего (язык тот же или сведения старее
 * уже известных). Пишем только смену языка — settings.json не трогается на каждый Ctrl+D.
 */
export function nextDetected(prev: GameLangDetected | null, found: GameLangDetected): GameLangDetected | null {
  if (prev && (found.at <= prev.at || found.lang === prev.lang)) return null
  return found
}

/** Язык клиента по тексту предмета (Ctrl+D): «Item Class:» / «Класс предмета:». */
export function detectedFromItem(text: string, at: number): GameLangDetected | null {
  const lang = detectItemLang(text)
  return lang ? { lang, by: 'item', at } : null
}

// Строки Client.txt, где язык клиента виден наверняка: шёпот (CHAT_WHISPER_FROM/TO из client_strings APT) и
// системные сообщения (BackendErrors GGG: вход в область, игрок пришёл/ушёл, сделка, AFK/DND). Чат игроков
// (#, $, %, &) не смотрим — там пишут на любом языке; текст шёпота — тоже (купить пишут с сайта любого языка).
const LOG_LANG: readonly { re: RegExp; lang: GameLang }[] = [
  { re: /^@(?:From|To) /, lang: 'en' },
  { re: /^@(?:От кого|Кому) /, lang: 'ru' },
  { re: /^: You have entered .+\.$/, lang: 'en' },
  { re: /^: Вы вошли в область .+\.$/, lang: 'ru' },
  { re: /^: .+ has (?:joined|left) the area\.$/, lang: 'en' },
  { re: /^: .+ (?:присоединил(?:ся|ась)(?: к области)?|покинула? область)\.$/, lang: 'ru' },
  { re: /^: Trade (?:accepted|cancelled)\.$/, lang: 'en' },
  { re: /^: Сделка (?:совершена|отклонена)\.$/, lang: 'ru' },
  { re: /^: (?:AFK|DND) mode is now O(?:N|FF)\b/, lang: 'en' },
  { re: /^: Режим "(?:отош[её]л|недоступен)"/, lang: 'ru' }
]

/** Язык клиента по одной строке Client.txt (с префиксом даты) и время строки; null — строка не о языке. */
export function logLineLang(line: string): { lang: GameLang; ts: number | null } | null {
  const ll = splitLogLine(line)
  if (!ll) return null
  for (const p of LOG_LANG) if (p.re.test(ll.text)) return { lang: p.lang, ts: ll.ts }
  return null
}

/**
 * Язык по пачке строк лога (по порядку, новые в конце) — по последней строке с явным языком. fallbackAt — время
 * для строки без даты: новые строки передают «сейчас», хвост лога при запуске — 0 (старое не перебивает свежее).
 */
export function detectedFromLog(lines: readonly string[], fallbackAt: number): GameLangDetected | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const r = logLineLang(lines[i])
    if (r) return { lang: r.lang, by: 'log', at: r.ts ?? fallbackAt }
  }
  return null
}

/**
 * Перенос старой настройки вкладки Regex (prefs.gameLang, до S26). Мастер первого запуска писал туда ответ с
 * выбором «как интерфейс» по умолчанию, поэтому значение, равное языку интерфейса, не отличить от «не трогал» —
 * оно остаётся «авто» (пока игра не узнана, это тот же язык). Другой язык — осознанный выбор, переносим как есть.
 * null — переносить нечего (уже выбрано вручную, старого значения нет или оно совпадает с интерфейсом).
 */
export function legacyRegexChoice(legacy: unknown, gl: GameLangSettings, uiLang: UiLang): GameLang | null {
  if (legacy !== 'ru' && legacy !== 'en') return null
  if (gl.choice !== 'auto' || legacy === uiLang) return null
  return legacy
}
