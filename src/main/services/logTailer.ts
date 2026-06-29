import { EventEmitter } from 'events'
import { existsSync, createReadStream, readFileSync, statSync } from 'fs'
import { stat } from 'fs/promises'
import { createInterface } from 'readline'
import type { BossDefeatEvent, LevelEvent, TailerStatus, ZoneEvent } from '@shared/types'
import { actIdFromGameArea, matchSpeaker, type BossIndex } from './bossMatcher'

// Advisory Client.txt tailer (TOS-safe plain-text log parsing — no memory reads).
// Parsing format verified against Lechkolion/poe2-leveling-overlay (MIT) + the real log:
//   - zone:  `Generating level N area "<areaId>"`   (language-agnostic id)
//   - zone fallback: `[SCENE] Set Source [<Name>]`  (display name)
//   - level: `: <Name> is now level <N>`
//   - boss (opt-in): a boss-name DIALOGUE line `"<Boss>: ..."` means the player is
//     fighting that boss → auto-check its quest. (Passive-point awards were tried as
//     a "defeat" confirm, but most bosses reward a gem, not points — so we trigger on
//     the dialogue itself, debounced.)
//
// Emits: 'zone' (ZoneEvent), 'level' (LevelEvent), 'status' (TailerStatus), 'boss' (BossDefeatEvent).
// NOTE: `: <X> has been slain.` is a PLAYER death (self/party), NOT a boss kill — never parsed.

const GENERATING = /Generating level \d+ area "([^"]+)"/
const SCENE = /\[SCENE\] Set Source \[(.+?)\]/
const ACT_TITLE = /^Act \d+$/
// Real format: `: <Name> (<Class>) is now level <N>` — the class (which may contain
// spaces, e.g. "Spirit Walker") sits between the name and "is now level". The optional
// group keeps backward compatibility with a bare `: <Name> is now level <N>`.
const LEVEL_UP = /:\s+(\S+)(?:\s+\([^)]+\))?\s+is now level\s+(\d+)/
// NPC/boss dialogue: after the "] " log prefix, "<Speaker>: <text>". System lines
// ("] : You have...", "] : X has been slain") have an empty speaker and won't match.
const DIALOGUE = /\]\s+([^:\][]+?):\s/
// A boss speaks several times per fight — emit once, then ignore repeats this long.
const BOSS_EMIT_DEBOUNCE_MS = 60000

const SCAN_BYTES = 102400

const POE2_SUBPATH = 'Path of Exile 2\\logs\\Client.txt'

function defaultPaths(): string[] {
  const up = process.env.USERPROFILE ?? ''
  return [
    `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${POE2_SUBPATH}`,
    `C:\\Program Files (x86)\\Grinding Gear Games\\${POE2_SUBPATH}`,
    'C:\\Program Files\\Epic Games\\PathOfExile2\\logs\\Client.txt',
    `${up}\\Documents\\My Games\\${POE2_SUBPATH}`,
    `C:\\Daum Games\\Path of Exile2\\logs\\Client.txt`
  ]
}

/** Steam libraries can live on any drive — read libraryfolders.vdf to find them. */
function steamLibraryClientPaths(): string[] {
  const vdfs = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf',
    'C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf'
  ]
  const out: string[] = []
  for (const vdf of vdfs) {
    try {
      const text = readFileSync(vdf, 'utf8')
      const re = /"path"\s*"([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const lib = m[1].replace(/\\\\/g, '\\')
        out.push(`${lib}\\steamapps\\common\\${POE2_SUBPATH}`)
      }
    } catch {
      // no Steam vdf here
    }
  }
  return out
}

interface Parsed {
  areaId?: string
  areaName?: string
  level?: LevelEvent
  /** dialogue speaker (raw, unmatched) — for boss detection */
  speaker?: string
}

export class LogTailer extends EventEmitter {
  private logPath: string | null = null
  private lastSize = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private reading = false
  private lastZoneKey: string | null = null
  private lastZone: ZoneEvent | null = null
  private lastLevelValue: number | null = null
  // boss detection (opt-in; index injected from main once the dataset is loaded)
  private bossIndex: BossIndex | null = null
  private lastBossEmit: { questId: string; at: number } | null = null

  setBossIndex(index: BossIndex): void {
    this.bossIndex = index
  }

  getStatus(): TailerStatus {
    return {
      running: this.timer !== null,
      logPath: this.logPath,
      found: this.logPath !== null,
      areaId: this.lastZone?.areaId,
      areaName: this.lastZone?.areaName,
      level: this.lastLevelValue ?? undefined
    }
  }

  async start(customPath?: string | null): Promise<TailerStatus> {
    this.stop()
    const path = customPath && existsSync(customPath) ? customPath : this.findLogFile()
    this.logPath = path
    if (path) {
      try {
        const s = await stat(path)
        this.lastSize = s.size
        await this.scanTail(path, s.size)
      } catch {
        this.lastSize = 0
      }
      this.timer = setInterval(() => void this.readNew(), 1000)
    }
    const status = this.getStatus()
    this.emit('status', status)
    return status
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      this.emit('status', this.getStatus())
    }
  }

  // Several PoE2 installs (Steam on multiple drives, leftover logs) can coexist; the
  // hard-coded order would return a stale one. Pick the most recently written Client.txt.
  private findLogFile(): string | null {
    const seen = new Set<string>()
    const candidates: string[] = []
    for (const p of [...defaultPaths(), ...steamLibraryClientPaths()]) {
      const key = p.toLowerCase()
      if (existsSync(p) && !seen.has(key)) {
        seen.add(key)
        candidates.push(p)
      }
    }
    if (candidates.length === 0) return null
    let best: { path: string; mtime: number } | null = null
    for (const p of candidates) {
      try {
        const m = statSync(p).mtimeMs
        if (!best || m > best.mtime) best = { path: p, mtime: m }
      } catch {
        // unreadable candidate; skip
      }
    }
    return best ? best.path : candidates[0]
  }

  private parse(line: string): Parsed {
    const out: Parsed = {}
    const g = line.match(GENERATING)
    if (g) {
      let id = g[1]
      if (id.endsWith('_')) id = id.slice(0, -1)
      out.areaId = id.toLowerCase()
    } else {
      const sc = line.match(SCENE)
      if (sc && !ACT_TITLE.test(sc[1]) && sc[1] !== '(unknown)' && sc[1] !== '(null)') {
        out.areaName = sc[1]
      }
    }
    const lv = line.match(LEVEL_UP)
    if (lv) out.level = { character: lv[1], level: parseInt(lv[2], 10), at: Date.now() }
    const d = line.match(DIALOGUE)
    if (d) {
      const speaker = d[1].trim()
      // boss names start with a letter — skip chat/whisper prefixes (#/$/@) and system lines
      if (/^\p{L}/u.test(speaker)) out.speaker = speaker
    }
    return out
  }

  // Boss detection. Runs ONLY on live reads (never from scanTail), so historical
  // dialogue in the file can't re-check quests on startup. A boss-name dialogue
  // line means the player is fighting that boss → emit (debounced per boss).
  private handleBoss(p: Parsed): void {
    if (!this.bossIndex || !p.speaker) return
    const ref = matchSpeaker(this.bossIndex, p.speaker, actIdFromGameArea(this.lastZone?.areaId))
    if (!ref) return
    const now = Date.now()
    if (
      this.lastBossEmit &&
      this.lastBossEmit.questId === ref.questId &&
      now - this.lastBossEmit.at < BOSS_EMIT_DEBOUNCE_MS
    ) {
      return
    }
    this.lastBossEmit = { questId: ref.questId, at: now }
    const ev: BossDefeatEvent = { questId: ref.questId, name: ref.name, phase: 'defeated', at: now }
    this.emit('boss', ev)
  }

  private emitZone(areaId?: string, areaName?: string): void {
    const key = areaId ?? areaName ?? null
    if (!key || key === this.lastZoneKey) return
    this.lastZoneKey = key
    const ev: ZoneEvent = { areaId, areaName, at: Date.now() }
    this.lastZone = ev
    this.emit('zone', ev)
  }

  private emitLevel(ev: LevelEvent): void {
    this.lastLevelValue = ev.level
    this.emit('level', ev)
  }

  // On startup, scan the tail of the file to seed the current zone/level once.
  private async scanTail(path: string, size: number): Promise<void> {
    const start = Math.max(0, size - SCAN_BYTES)
    let lastZoneId: string | undefined
    let lastZoneName: string | undefined
    let lastLevel: LevelEvent | undefined
    await this.readRange(path, start, size - 1, (p) => {
      if (p.areaId) {
        lastZoneId = p.areaId
        lastZoneName = undefined
      } else if (p.areaName) {
        lastZoneName = p.areaName
        lastZoneId = undefined
      }
      if (p.level) lastLevel = p.level
    })
    if (lastZoneId || lastZoneName) this.emitZone(lastZoneId, lastZoneName)
    if (lastLevel) this.emitLevel(lastLevel)
  }

  private async readNew(): Promise<void> {
    if (!this.logPath || this.reading) return
    this.reading = true
    try {
      const s = await stat(this.logPath)
      if (s.size < this.lastSize) this.lastSize = 0 // file rotated/truncated
      if (s.size > this.lastSize) {
        const from = this.lastSize
        const to = s.size - 1
        this.lastSize = s.size
        await this.readRange(this.logPath, from, to, (p) => {
          if (p.areaId || p.areaName) this.emitZone(p.areaId, p.areaName)
          if (p.level) this.emitLevel(p.level)
          this.handleBoss(p)
        })
      }
    } catch {
      // file temporarily unavailable; try again next tick
    } finally {
      this.reading = false
    }
  }

  private readRange(
    path: string,
    start: number,
    end: number,
    onParsed: (p: Parsed) => void
  ): Promise<void> {
    return new Promise((resolve) => {
      if (end < start) {
        resolve()
        return
      }
      try {
        const stream = createReadStream(path, { start, end, encoding: 'utf8' })
        const rl = createInterface({ input: stream })
        rl.on('line', (line) => onParsed(this.parse(line)))
        rl.on('close', () => resolve())
        rl.on('error', () => resolve())
      } catch {
        resolve()
      }
    })
  }
}

export const logTailer = new LogTailer()
