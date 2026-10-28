// Текст шага прокачки на языке интерфейса (S14): части маршрута → сегменты для отрисовки. Имена зон,
// квестов, боссов и предметов — из данных (RU по poedb/APT, EN как в маршруте); короткие куски — наш перевод.

import type { LevelingData, LvPart } from '../types/leveling'

type UiLangLv = 'ru' | 'en'

export type SegKind = 'text' | 'area' | 'quest' | 'boss' | 'item' | 'wp' | 'dir' | 'trial' | 'town' | 'lab' | 'craft'

export interface Seg {
  kind: SegKind
  text: string
  /** id зоны / квеста — для подсветки и ссылок */
  ref?: string
}

/** Стрелки направлений: 0 — вверх, по часовой через 45°. */
export const DIR_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

const LAB: Record<string, { ru: string; en: string }> = {
  normal: { ru: 'Лабиринт Правителя', en: 'the Labyrinth' },
  cruel: { ru: 'Жестокий лабиринт', en: 'the Cruel Labyrinth' },
  merciless: { ru: 'Безжалостный лабиринт', en: 'the Merciless Labyrinth' },
  eternal: { ru: 'Вечный лабиринт', en: 'the Eternal Labyrinth' }
}

export function areaName(data: LevelingData, id: string, lang: UiLangLv): string {
  const a = data.areas[id]
  return a ? (lang === 'ru' ? a.ru : a.en) : id
}

export function questName(data: LevelingData, id: string, lang: UiLangLv): string {
  const q = data.quests[id]
  return q ? (lang === 'ru' ? q.ru : q.en) : id
}

export function nameOf(data: LevelingData, en: string, lang: UiLangLv): string {
  return lang === 'ru' ? (data.names[en] ?? en) : en
}

export function renderParts(parts: LvPart[], data: LevelingData, lang: UiLangLv): Seg[] {
  const ru = lang === 'ru'
  const out: Seg[] = []
  for (const [i, p] of parts.entries()) {
    if (typeof p === 'string') {
      if (p.trim()) out.push({ kind: 'text', text: p })
      continue
    }
    if ('t' in p) {
      out.push({ kind: 'text', text: ru ? p.r : p.t })
      continue
    }
    switch (p.k) {
      case 'enter':
      case 'area':
        out.push({ kind: 'area', text: areaName(data, p.a, lang), ref: p.a })
        break
      case 'wp':
        out.push({ kind: 'wp', text: ru ? 'Путевой камень ➞' : 'Waypoint ➞' })
        out.push({ kind: 'area', text: areaName(data, p.a, lang), ref: p.a })
        break
      case 'wpicon':
        out.push({ kind: 'wp', text: ru ? 'путевого камня' : 'the waypoint' })
        break
      case 'wpget':
        out.push({ kind: 'wp', text: ru ? 'путевой камень' : 'the waypoint' })
        break
      case 'logout':
        out.push({ kind: 'town', text: ru ? 'Выйдите в город (logout)' : 'Logout to town' })
        break
      case 'portal': {
        const full = p.v === 'set' ? (ru ? 'Поставьте портал' : 'Set a portal') : ru ? 'Войдите в портал' : 'Use the portal'
        // «…, place {portal|set}» / «Take {portal|use}»: глагол уже в тексте маршрута — оставляем один, наш
        const before = parts[i - 1]
        const prev = out[out.length - 1]
        if (prev?.kind === 'text' && typeof before === 'object' && 't' in before && /(^|,\s*)(place|take)\s*$/i.test(before.t)) {
          const head = prev.text.replace(/(^|,\s*)\S+\s*$/u, '$1').trimEnd()
          if (head) {
            prev.text = head
            out.push({ kind: 'town', text: full.charAt(0).toLowerCase() + full.slice(1) })
          } else {
            out.pop()
            out.push({ kind: 'town', text: full })
          }
          break
        }
        out.push({ kind: 'town', text: full })
        break
      }
      case 'quest':
        out.push({ kind: 'quest', text: questName(data, p.q, lang), ref: p.q })
        break
      case 'kill':
        out.push({ kind: 'boss', text: nameOf(data, p.v, lang) })
        break
      case 'arena':
        out.push({ kind: 'area', text: nameOf(data, p.v, lang) })
        break
      case 'generic':
      case 'qtext':
        out.push({ kind: 'item', text: nameOf(data, p.v, lang) })
        break
      case 'copy':
        out.push({ kind: 'text', text: p.v })
        break
      case 'trial':
        out.push({ kind: 'trial', text: ru ? 'испытание восхождения' : 'the Trial of Ascendancy' })
        break
      case 'ascend':
        out.push({ kind: 'lab', text: ru ? `${LAB[p.v]?.ru ?? p.v} — восхождение` : `${LAB[p.v]?.en ?? p.v} — ascend` })
        break
      case 'craft':
        out.push({ kind: 'craft', text: ru ? 'рецепт верстака' : 'the crafting recipe' })
        break
      case 'dir':
        out.push({ kind: 'dir', text: DIR_ARROWS[p.d] ?? '' })
        break
    }
  }
  return out
}

/** Сегменты одной строкой (для подсказок, заголовков, тестов). */
export function plainText(segs: Seg[]): string {
  return segs
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+([,.:;!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
