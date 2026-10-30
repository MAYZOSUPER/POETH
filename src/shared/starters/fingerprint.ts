// Отпечаток проверенной версии PoB стартера (S59, starters-research.md §2.4; чистый модуль,
// tests/starters/fingerprint.test.ts). Считается от XML после распаковки, а не от строки кода: один и тот же билд
// можно сжать и закодировать по-разному. Перед подсчётом:
//  - вырезается <Import> у корня (хэши аккаунта и персонажа, ссылка импорта — у каждого игрока свои);
//  - XML разбирается нашим безопасным разбором (xml.ts) и пишется заново канонически: атрибуты по имени,
//    текст без крайних пробелов, переводы строк \n — пробелы и порядок атрибутов не меняют отпечаток.
// sha256 подставляется снаружи (main и инструмент лида — node:crypto), здесь только каноническая строка.

import { parseXml, type XmlElement } from '../pob/xml'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const norm = (s: string): string => s.replace(/\r\n?/g, '\n')

/** XML PoB → каноническая строка без <Import>; не XML — null. Глубина обхода ограничена разбором (≤ 8). */
export function pobCanonicalXml(xml: string): string | null {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch {
    return null
  }
  const out: string[] = []
  const walk = (el: XmlElement, top: boolean): void => {
    out.push('<', el.name)
    const attrs = [...el.attrs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    for (const [k, v] of attrs) out.push(' ', k, '="', esc(norm(v)), '"')
    out.push('>')
    const text = norm(el.text).trim()
    if (text) out.push(esc(text))
    for (const c of el.children) if (!(top && c.name === 'Import')) walk(c, false)
    out.push('</', el.name, '>')
  }
  walk(root, true)
  return out.join('')
}

/** Отпечаток: sha256 (hex) канонического XML; не XML — null. */
export function pobFingerprint(xml: string, sha256: (text: string) => string): string | null {
  const canon = pobCanonicalXml(xml)
  return canon === null ? null : sha256(canon)
}
