// «Взято ✓» вкладки «Билд» по журналу игры Client.txt (S39; чистый модуль: main, tests/build/takenLog.test.ts).
// Строки вложения и снятия нод (`Successfully allocated|unallocated passive skill id: …`, разбор — S36,
// src/shared/leveling/log.ts) имени персонажа не содержат: относим их к персонажу текущего входа — тому, чьё
// повышение уровня видели после строки входа; до первого повышения копим и отдаём ему. Дальнейшие «is now level»
// в группе пишут и чужие — меняют только уровень своего персонажа. Тот же подсчёт берёт дерево поверх игры S38
// (main/build/treeOverlay.ts через buildTaken.ts): id → hash нод там (treeOverlayLog.ts), здесь — строковые id без
// данных дерева. Журнал читается с хвоста — что взято раньше хвоста, здесь не видно.

import { parseBuildLogLine, parseLevelingLine } from '../leveling/log'
import type { BuildTaken } from '../types/build'

/** Сколько персонажей помнить. */
const MAX_CHARS = 32

interface Nodes {
  taken: Set<string>
  removed: Set<string>
}

interface CharNodes extends Nodes {
  className: string
  level: number
}

/** Персонаж текущего входа. */
export interface TakenCharacter {
  name: string
  /** класс или восхождение (как в журнале: `Witch`, `Necromancer`) */
  className: string
  level: number
}

const empty = (): Nodes => ({ taken: new Set(), removed: new Set() })

export class BuildTakenTracker {
  private chars = new Map<string, CharNodes>()
  private current: string | null = null
  private pending: Nodes = empty()

  /** Строки журнала по порядку; true — что-то изменилось для окна. */
  ingest(lines: Iterable<string>): boolean {
    let changed = false
    for (const line of lines) {
      const lv = parseLevelingLine(line)
      if (lv) {
        if (lv.type === 'login') {
          if (this.current !== null || this.pending.taken.size || this.pending.removed.size) changed = true
          this.current = null
          this.pending = empty()
        } else if (lv.type === 'level' && this.current === null) {
          // первое повышение после входа — свой персонаж (дальше в группе пишут и чужие)
          this.adopt(lv.character, lv.className, lv.level)
          changed = true
        } else if (lv.type === 'level' && lv.character === this.current) {
          const c = this.chars.get(lv.character)
          if (c) Object.assign(c, { className: lv.className, level: lv.level })
          changed = true
        }
        continue
      }
      const ev = parseBuildLogLine(line)
      if (!ev || ev.type !== 'passive' || ev.atlas) continue
      const into = this.current ? (this.chars.get(this.current) ?? this.pending) : this.pending
      if (ev.allocated) {
        into.taken.add(ev.id)
        into.removed.delete(ev.id)
      } else {
        into.removed.add(ev.id)
        into.taken.delete(ev.id)
      }
      changed = true
    }
    return changed
  }

  private adopt(name: string, className: string, level: number): void {
    let c = this.chars.get(name)
    if (!c) {
      if (this.chars.size >= MAX_CHARS) this.chars.delete(this.chars.keys().next().value as string)
      c = { ...empty(), className, level }
      this.chars.set(name, c)
    }
    c.className = className
    c.level = level
    for (const id of this.pending.taken) {
      c.taken.add(id)
      c.removed.delete(id)
    }
    for (const id of this.pending.removed) {
      c.removed.add(id)
      c.taken.delete(id)
    }
    this.pending = empty()
    this.current = name
  }

  /** Персонаж текущего входа; null — после входа ещё не было повышения уровня. */
  character(): TakenCharacter | null {
    const c = this.current ? this.chars.get(this.current) : undefined
    return c && this.current ? { name: this.current, className: c.className, level: c.level } : null
  }

  /** Ноды персонажа текущего входа (до первого повышения уровня — накопленные без имени). */
  snapshot(log: boolean): BuildTaken {
    const c = this.current ? this.chars.get(this.current) : undefined
    const src = c ?? this.pending
    return { character: this.current, taken: [...src.taken], removed: [...src.removed], log }
  }
}
