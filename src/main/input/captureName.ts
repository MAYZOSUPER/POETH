// Имя файла для dev-флага POETH_SAVE_CAPTURES (см. captureLog.ts). Чистый модуль —
// tests/overlay/itemText.test.ts.

function stamp(d: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`
  )
}

/**
 * Имя файла захвата: время + название предмета. Текст начинается с
 * «Item Class / Rarity / <имя> / <база>», имя — 3-я строка; если её нет (валюта и т.п.) —
 * значение 2-й строки («Rarity: Currency» → «Currency»).
 */
export function captureFileName(text: string, at: Date): string {
  const lines = text.split(/\r?\n/)
  const name =
    lines[2] && lines[2] !== '--------' ? lines[2] : (lines[1] ?? '').replace(/^[^:]+:\s*/, '')
  const slug = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60)
  return `${stamp(at)}${slug ? `-${slug}` : ''}.txt`
}
