import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT, useName } from '../i18n'

// Running totals of permanent campaign rewards: collected vs total available.
// Only sums reward kinds with consistent units (points, spirit, resistances).
// Hovering a row reveals every quest that grants it, marking done (✓) vs
// remaining (○) so you can find what's left without scanning the whole list.

type Contributor = {
  id: string
  name: string
  actNumber: number
  kind: string
  value: number
  done: boolean
}

export function RewardsSummary() {
  const dataset = useAppStore((s) => s.dataset)
  const progress = useAppStore((s) => s.progress)
  const t = useT()
  const localName = useName()
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState<{ key: string; x: number; y: number; right: boolean } | null>(null)
  if (!dataset) return null

  const completed = progress?.completedQuestIds ?? {}
  const c: Record<string, number> = {
    passive: 0, passiveT: 0,
    weapon: 0, weaponT: 0,
    spirit: 0, spiritT: 0,
    cold: 0, coldT: 0,
    fire: 0, fireT: 0,
    light: 0, lightT: 0
  }
  const contrib: Record<string, Contributor[]> = {
    passive: [], weapon: [], spirit: [], cold: [], fire: [], light: []
  }

  for (const act of dataset.acts) {
    for (const q of act.quests) {
      const done = !!completed[q.id]
      for (const r of q.rewards) {
        const n = r.numeric ?? 0
        const add = (key: string): void => {
          c[`${key}T`] += n
          if (done) c[key] += n
          contrib[key].push({ id: q.id, name: q.name, actNumber: act.actNumber, kind: act.kind, value: n, done })
        }
        if (r.kind === 'passive_point' || r.kind === 'skill_point') add('passive')
        else if (r.kind === 'weapon_set_point') add('weapon')
        else if (r.kind === 'spirit') add('spirit')
        else if (r.kind === 'resistance') {
          const v = r.value.toLowerCase()
          if (v.includes('cold')) add('cold')
          else if (v.includes('fire')) add('fire')
          else if (v.includes('lightning')) add('light')
        }
      }
    }
  }

  const rows = [
    { key: 'passive', label: t('rw.passive'), got: c.passive, tot: c.passiveT, fmt: 'plain' },
    { key: 'weapon', label: t('rw.weapon'), got: c.weapon, tot: c.weaponT, fmt: 'plain' },
    { key: 'spirit', label: t('rw.spirit'), got: c.spirit, tot: c.spiritT, fmt: 'plus' },
    { key: 'cold', label: t('rw.cold'), got: c.cold, tot: c.coldT, fmt: 'pct' },
    { key: 'fire', label: t('rw.fire'), got: c.fire, tot: c.fireT, fmt: 'pct' },
    { key: 'light', label: t('rw.light'), got: c.light, tot: c.lightT, fmt: 'pct' }
  ].filter((r) => r.tot > 0)

  const fmt = (r: { got: number; tot: number; fmt: string }): string =>
    r.fmt === 'pct' ? `${r.got}/${r.tot}%` : r.fmt === 'plus' ? `+${r.got}/+${r.tot}` : `${r.got}/${r.tot}`

  const actLabel = (n: number, kind: string): string =>
    kind === 'interlude' ? t('int.short', { n: n - 4 }) : t('act.short', { n })

  function showPop(key: string, e: MouseEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const right = rect.right + 8 + 250 <= window.innerWidth
    const x = right ? rect.right + 8 : Math.max(8, rect.left - 258)
    const y = Math.min(rect.top, window.innerHeight - 348)
    setPop({ key, x, y: Math.max(8, y), right })
  }

  const popList = pop ? contrib[pop.key] ?? [] : []
  const popRemaining = popList.filter((x) => !x.done).length

  return (
    <section className="panel rewards">
      <div className="panel-head clickable" onClick={() => setOpen((o) => !o)}>
        <span>{t('rw.head', { a: c.passive, b: c.passiveT })}</span>
        <span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="rw-grid">
          {rows.map((r) => (
            <div
              key={r.key}
              className="rw-row"
              onMouseEnter={(e) => showPop(r.key, e)}
              onMouseLeave={() => setPop(null)}
            >
              <span className="rw-label">{r.label}</span>
              <span className="rw-bar">
                <span
                  className="rw-fill"
                  style={{ width: `${r.tot ? Math.round((100 * r.got) / r.tot) : 0}%` }}
                />
              </span>
              <span className="rw-val">{fmt(r)}</span>
            </div>
          ))}
        </div>
      )}
      {pop && popList.length > 0 && (
        <div className="rw-pop" style={{ left: pop.x, top: pop.y }}>
          <div className="rw-pop-head">{t('rw.remaining', { n: popRemaining, m: popList.length })}</div>
          <ul>
            {popList.map((x, i) => (
              <li key={`${x.id}-${i}`} className={x.done ? 'done' : ''}>
                <span className="rw-pop-mark">{x.done ? '✓' : '○'}</span>
                <span className="rw-pop-val">+{x.value}</span>
                <span className="rw-pop-name">{localName(x.name)}</span>
                <span className="rw-pop-act">{actLabel(x.actNumber, x.kind)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
