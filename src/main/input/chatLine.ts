// Текст для ввода в игру (чат и поиск в тайнике) — ровно одна строка (S29). Источники текста бывают
// чужими: whisper из ответа API трейда (название вкладки продавца, имя предмета), находки live search,
// строки импортированной regex-библиотеки. Перевод строки в буфере обмена мог бы после Ctrl+V дать игре
// вторую команду, поэтому управляющие символы и разделители строк превращаются в пробел, а слишком
// длинный текст не вводится вовсе (обрезка поменяла бы смысл команды). Без electron — tests/security.

/** С запасом: whisper трейда ~300 символов, строка поиска игры — до 250. */
export const MAX_GAME_TEXT = 1000

// C0 (в т.ч. \t \r \n), DEL, C1 (в т.ч. NEL U+0085), разделители строки/абзаца U+2028/U+2029
const LINE_BREAKS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g

/** Одна строка для чата/поиска игры; null — не строка, пусто или длиннее MAX_GAME_TEXT. */
export function toGameLine(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const line = text.replace(LINE_BREAKS, ' ')
  if (!line.trim() || line.length > MAX_GAME_TEXT) return null
  return line
}
