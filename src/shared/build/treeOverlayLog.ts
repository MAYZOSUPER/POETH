// Что взято на дереве у персонажа — по журналу игры Client.txt (S38). Строки вложения и снятия нод
// (`Successfully allocated|unallocated passive skill id: …`) имени персонажа не содержат: относим их к последнему
// персонажу, чьё повышение уровня видели после входа; до первого повышения — копим и отдаём ему.
// Журнал читается не с начала (хвост при запуске) — что взято раньше, он не знает: такие ноды остаются «keep».
// Чистый модуль (main, tests/build/**).

import { parseBuildLogLine, parseLevelingLine } from '../leveling/log'
import type { TakenNodes } from './treeOverlayDraw'
import type { TreeData } from './types'

/** Сколько персонажей помнить за сессию. */
const MAX_CHARS = 32

interface CharNodes {
  taken: Set<number>
  removed: Set<number>
  className: string
  level: number
}

export interface LogCharacter {
  name: string
  /** класс или восхождение (как в журнале: `Witch`, `Necromancer`) */
  className: string
  level: number
}

const emptyNodes = (): Pick<CharNodes, 'taken' | 'removed'> => ({ taken: new Set(), removed: new Set() })

export class TreeLogTracker {
  private chars = new Map<string, CharNodes>()
  private current: string | null = null
  private pending = emptyNodes()

  constructor(private readonly tree: TreeData) {}

  /** Строки журнала по порядку; true — что-то изменилось. */
  ingest(lines: Iterable<string>): boolean {
    let changed = false
    for (const line of lines) {
      const lv = parseLevelingLine(line)
      if (lv) {
        if (lv.type === 'login') {
          this.current = null
          this.pending = emptyNodes()
          changed = true
        } else if (lv.type === 'level') {
          this.levelUp(lv.character, lv.className, lv.level)
          changed = true
        }
        continue
      }
      const ev = parseBuildLogLine(line)
      if (!ev || ev.type !== 'passive' || ev.atlas) continue
      const node = this.tree.byId.get(ev.id)
      if (!node) continue
      const into = this.current ? (this.chars.get(this.current) ?? this.pending) : this.pending
      if (ev.allocated) {
        into.taken.add(node.hash)
        into.removed.delete(node.hash)
      } else {
        into.removed.add(node.hash)
        into.taken.delete(node.hash)
      }
      changed = true
    }
    return changed
  }

  private levelUp(name: string, className: string, level: number): void {
    let c = this.chars.get(name)
    if (!c) {
      if (this.chars.size >= MAX_CHARS) this.chars.delete(this.chars.keys().next().value as string)
      c = { ...emptyNodes(), className, level }
      this.chars.set(name, c)
    }
    c.className = className
    c.level = level
    for (const h of this.pending.taken) {
      c.taken.add(h)
      c.removed.delete(h)
    }
    for (const h of this.pending.removed) {
      c.removed.add(h)
      c.taken.delete(h)
    }
    this.pending = emptyNodes()
    this.current = name
  }

  /** Персонаж текущего входа (по последнему повышению уровня); null — ещё не знаем. */
  character(): LogCharacter | null {
    const c = this.current ? this.chars.get(this.current) : undefined
    return c && this.current ? { name: this.current, className: c.className, level: c.level } : null
  }

  /** Что журнал знает о нодах текущего персонажа; null — ничего (наложение рисует по этапам). */
  nodes(): TakenNodes | null {
    const c = this.current ? this.chars.get(this.current) : undefined
    const src = c ?? this.pending
    if (src.taken.size === 0 && src.removed.size === 0) return null
    return { taken: new Set(src.taken), removed: new Set(src.removed) }
  }
}
