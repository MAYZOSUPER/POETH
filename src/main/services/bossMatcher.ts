import type { Dataset } from '@shared/types'

// Matches a log dialogue speaker (e.g. "Kabala, Constrictor Queen") to a boss
// quest. The index is built BILINGUALLY (English quest names + their Russian
// names from the dataset), so it works regardless of the game client's language
// vs the overlay's nameLang. Pure + side-effect free for easy testing.

export interface BossQuestRef {
  questId: string
  actId: string
  name: string
}

export interface BossIndex {
  exact: Map<string, BossQuestRef>
  entries: { norm: string; ref: BossQuestRef }[]
}

/** Lowercase, drop apostrophes/punctuation, collapse spaces. Script-agnostic (keeps Cyrillic). */
export function normalizeBossName(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Game areaId prefix -> our act id: "g3_..." -> "act-3", "p1_..." -> "interlude-1". */
export function actIdFromGameArea(areaId: string | undefined | null): string | null {
  if (!areaId) return null
  const m = areaId.toLowerCase().match(/^([gp])(\d+)/)
  if (!m) return null
  return m[1] === 'g' ? `act-${Number(m[2])}` : `interlude-${Number(m[2])}`
}

export function buildBossIndex(dataset: Dataset): BossIndex {
  const exact = new Map<string, BossQuestRef>()
  const entries: { norm: string; ref: BossQuestRef }[] = []
  const namesRu = dataset.namesRu ?? {}
  const add = (raw: string, ref: BossQuestRef): void => {
    const n = normalizeBossName(raw)
    if (n.length < 3) return
    if (!exact.has(n)) exact.set(n, ref)
    if (!entries.some((e) => e.norm === n)) entries.push({ norm: n, ref })
  }
  for (const act of dataset.acts) {
    for (const q of act.quests) {
      if (!q.boss) continue
      const ref: BossQuestRef = { questId: q.id, actId: act.id, name: q.name }
      add(q.name, ref) // English
      const ru = namesRu[normalizeBossName(q.name)] // namesRu keyed by normalized EN
      if (ru) add(ru, ref) // Russian
    }
  }
  return { exact, entries }
}

/**
 * Resolve a log dialogue speaker to a boss quest, or null. Exact match first,
 * then bidirectional containment with guards (so the log subtitle
 * "Draven, the Eternal Praetor" matches the quest "Draven"). Ambiguity is
 * broken by the current act, else dropped (never guess).
 */
export function matchSpeaker(
  index: BossIndex,
  speaker: string,
  currentActId?: string | null
): BossQuestRef | null {
  const n = normalizeBossName(speaker)
  if (n.length < 3) return null
  const ex = index.exact.get(n)
  if (ex) return ex

  const hits: BossQuestRef[] = []
  for (const e of index.entries) {
    const b = e.norm
    const shorter = n.length <= b.length ? n : b
    if (shorter.length < 4) continue
    let hit = false
    if (n.includes(b))
      hit = true // speaker contains the boss name
    else if (b.includes(n))
      // boss name contains speaker — require a whole-word prefix so "the"/"of" can't over-match
      hit = b === n || b.startsWith(n + ' ')
    if (hit) hits.push(e.ref)
  }
  const uniq = [...new Map(hits.map((r) => [r.questId, r])).values()]
  if (uniq.length === 1) return uniq[0]
  if (uniq.length > 1 && currentActId) {
    const inAct = uniq.filter((r) => r.actId === currentActId)
    if (inAct.length === 1) return inAct[0]
  }
  return null
}
