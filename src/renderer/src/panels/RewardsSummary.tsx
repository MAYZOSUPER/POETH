import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

// Running totals of permanent campaign rewards: collected vs total available.
// Only sums reward kinds with consistent units (points, spirit, resistances).

export function RewardsSummary() {
  const dataset = useAppStore((s) => s.dataset)
  const progress = useAppStore((s) => s.progress)
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!dataset) return null

  const completed = progress?.completedQuestIds ?? {}
  const c: Record<string, number> = {
    passive: 0,
    passiveT: 0,
    weapon: 0,
    weaponT: 0,
    spirit: 0,
    spiritT: 0,
    cold: 0,
    coldT: 0,
    fire: 0,
    fireT: 0,
    light: 0,
    lightT: 0
  }

  for (const act of dataset.acts) {
    for (const q of act.quests) {
      const done = !!completed[q.id]
      for (const r of q.rewards) {
        const n = r.numeric ?? 0
        const add = (key: string): void => {
          c[`${key}T`] += n
          if (done) c[key] += n
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
    { label: t('rw.passive'), got: c.passive, tot: c.passiveT, kind: 'plain' },
    { label: t('rw.weapon'), got: c.weapon, tot: c.weaponT, kind: 'plain' },
    { label: t('rw.spirit'), got: c.spirit, tot: c.spiritT, kind: 'plus' },
    { label: t('rw.cold'), got: c.cold, tot: c.coldT, kind: 'pct' },
    { label: t('rw.fire'), got: c.fire, tot: c.fireT, kind: 'pct' },
    { label: t('rw.light'), got: c.light, tot: c.lightT, kind: 'pct' }
  ].filter((r) => r.tot > 0)

  const fmt = (r: { got: number; tot: number; kind: string }): string =>
    r.kind === 'pct' ? `${r.got}/${r.tot}%` : r.kind === 'plus' ? `+${r.got}/+${r.tot}` : `${r.got}/${r.tot}`

  return (
    <section className="panel rewards">
      <div className="panel-head clickable" onClick={() => setOpen((o) => !o)}>
        <span>{t('rw.head', { a: c.passive, b: c.passiveT })}</span>
        <span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="rw-grid">
          {rows.map((r) => (
            <div key={r.label} className="rw-row">
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
    </section>
  )
}
