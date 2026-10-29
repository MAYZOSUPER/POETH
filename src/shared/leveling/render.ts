// Текст шага прокачки (S14): части маршрута → сегменты для отрисовки. Текст — на языке интерфейса (наш
// перевод коротких кусков), имена зон, квестов, боссов, NPC, предметов, арен и лабиринтов — на языке клиента
// игры (S31, Settings.gameLang), как их видно в игре: «Убейте Hillock», «➞ The Coast». Имена — без падежей
// (надпись в игре), кроме описаний, которых в клиенте нет (data.plain: «лодку», «всех») — те на языке интерфейса.

import type { LevelingData, LvLab, LvPart } from '../types/leveling'

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

/** Запасные имена лабиринта — если в данных нет labs (как в клиенте 3.29). */
const LAB: Record<LvLab, { ru: string; en: string }> = {
  normal: { ru: 'Лабиринт', en: 'The Labyrinth' },
  cruel: { ru: 'Жестокий Лабиринт', en: 'The Cruel Labyrinth' },
  merciless: { ru: 'Безжалостный Лабиринт', en: 'The Merciless Labyrinth' },
  eternal: { ru: 'Вечный Лабиринт', en: 'The Eternal Labyrinth' }
}

/** Имя зоны; lang — язык клиента игры. */
export function areaName(data: LevelingData, id: string, lang: UiLangLv): string {
  const a = data.areas[id]
  return a ? (lang === 'ru' ? a.ru : a.en) : id
}

/** Имя квеста; lang — язык клиента игры. */
export function questName(data: LevelingData, id: string, lang: UiLangLv): string {
  const q = data.quests[id]
  return q ? (lang === 'ru' ? q.ru : q.en) : id
}

/** Имя по EN из data.names (босс, NPC, предмет квеста, арена) на языке lang. */
export function nameOf(data: LevelingData, en: string, lang: UiLangLv): string {
  return lang === 'ru' ? (data.names[en] ?? en) : en
}

const plainSets = new WeakMap<LevelingData, Set<string>>()

/** Имени нет в клиенте игры — это описание («лодку», «всех»), его пишем на языке интерфейса. */
export function isPlainName(data: LevelingData, en: string): boolean {
  let set = plainSets.get(data)
  if (!set) plainSets.set(data, (set = new Set(data.plain ?? [])))
  return set.has(en)
}

/** Имя фрагмента маршрута: из игры — на языке клиента, описание — на языке интерфейса. */
export function fragName(data: LevelingData, en: string, lang: UiLangLv, gameLang: UiLangLv): string {
  return nameOf(data, en, isPlainName(data, en) ? lang : gameLang)
}

export function labName(data: LevelingData, lab: LvLab, gameLang: UiLangLv): string {
  const l = data.labs?.[lab] ?? LAB[lab]
  return l ? l[gameLang] : lab
}

/**
 * lang — язык интерфейса (текст шага), gameLang — язык клиента игры (имена); без gameLang — как интерфейс.
 */
export function renderParts(parts: LvPart[], data: LevelingData, lang: UiLangLv, gameLang: UiLangLv = lang): Seg[] {
  const ru = lang === 'ru'
  const g = gameLang
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
        out.push({ kind: 'area', text: areaName(data, p.a, g), ref: p.a })
        break
      case 'wp':
        out.push({ kind: 'wp', text: ru ? 'Путевой камень ➞' : 'Waypoint ➞' })
        out.push({ kind: 'area', text: areaName(data, p.a, g), ref: p.a })
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
        out.push({ kind: 'quest', text: questName(data, p.q, g), ref: p.q })
        break
      case 'kill':
        out.push({ kind: 'boss', text: fragName(data, p.v, lang, g) })
        break
      case 'arena':
        out.push({ kind: 'area', text: fragName(data, p.v, lang, g) })
        break
      case 'generic':
      case 'qtext':
        out.push({ kind: 'item', text: fragName(data, p.v, lang, g) })
        break
      case 'copy':
        out.push({ kind: 'text', text: p.v })
        break
      case 'trial':
        out.push({ kind: 'trial', text: ru ? 'испытание восхождения' : 'the Trial of Ascendancy' })
        break
      case 'ascend':
        out.push({ kind: 'lab', text: `${labName(data, p.v, g)} — ${ru ? 'восхождение' : 'ascend'}` })
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
