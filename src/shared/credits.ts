// «О программе» (S9): атрибуции из NOTICE.md, текст лицензии MIT и разбор списка
// «Благодарностей» (resources/supporters.json). Чистый модуль — main, renderer и тесты.

/** Сторонний код/данные, которые мы используем (подробно — NOTICE.md). Описание — ключ about.credit.<id>. */
export interface CreditEntry {
  id: string
  name: string
  /** адрес проекта — показывается текстом (github.com не в allowlist внешних ссылок) */
  url: string
  license: string
}

export const CREDITS: readonly CreditEntry[] = [
  { id: 'apt', name: 'Awakened PoE Trade', url: 'github.com/SnosMe/awakened-poe-trade', license: 'MIT' },
  { id: 'repoe', name: 'RePoE fork', url: 'github.com/repoe-fork/repoe-fork', license: 'open data' },
  { id: 'bt', name: 'Better Trading', url: 'github.com/exile-center/better-trading', license: 'MIT' },
  { id: 'exileui', name: 'Exile-UI (Lailloken)', url: 'github.com/Lailloken/Exile-UI', license: 'MIT' },
  { id: 'leveling', name: 'exile-leveling, poe2-leveling-overlay', url: 'github.com/HeartofPhos/exile-leveling', license: 'MIT' },
  { id: 'native', name: 'electron-overlay-window, uiohook-napi, ws', url: 'npmjs.com', license: 'MIT' },
  { id: 'fonts', name: 'Cormorant SC, Golos Text, JetBrains Mono', url: 'fonts.google.com', license: 'SIL OFL 1.1' },
  { id: 'electron', name: 'Electron, React, zustand', url: 'electronjs.org', license: 'MIT' }
]

/** Текст LICENSE (в сборку файл не попадает — держим копию; тест сверяет с LICENSE). */
export const MIT_LICENSE_TEXT = `MIT License

Copyright (c) 2026 PoE2 Quest Overlay contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

/** Подписчик уровня «Печать» в «Благодарностях». */
export interface Supporter {
  name: string
  /** с какого месяца, «10.2026» — показывается в подсказке */
  since?: string
}

const NAME_MAX = 40

/**
 * resources/supporters.json → список для «Благодарностей»: только [{name, since?}], пустые имена
 * отбрасываются, дубли (без учёта регистра) склеиваются, порядок — как в файле.
 */
export function parseSupporters(raw: unknown): Supporter[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Supporter[] = []
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue
    const o = r as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    const s: Supporter = { name }
    if (typeof o.since === 'string' && /^\d{2}\.\d{4}$/.test(o.since.trim())) s.since = o.since.trim()
    out.push(s)
  }
  return out
}
