import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT, useName } from '../i18n'
import { ShellIcon } from '../components/ShellIcon'

// Running totals of permanent campaign rewards: collected vs total available.
// Only sums reward kinds with consistent units (points, spirit, resistances).
// Hovering a row reveals every quest that grants it, marking done vs remaining
// so you can find what's left without scanning the whole list.

type Contributor = {
  id: string
  name: string
  actNumber: number
  kind: string
  value: number
  done: boolean
}

/** «Награды кампании» (.ui-box + .ui-meter): очки пассивных умений, набора оружия, дух и три сопротивления. */
export function RewardsSummary() {
  const dataset = useAppStore((s) => s.dataset)
  const progress = useAppStore((s) => s.progress)
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const t = useT()
  const localName = useName()
  const [pop, setPop] = useState<{ key: string; x: number; y: number } | null>(null)
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
    { key: 'spirit', label: t('rw.spirit'), got: c.spirit, tot: c.spiritT, fmt: 'plus' }
  ].filter((r) => r.tot > 0)
  const res = [
    { key: 'cold', label: t('rw.cold'), got: c.cold, tot: c.coldT },
    { key: 'fire', label: t('rw.fire'), got: c.fire, tot: c.fireT },
    { key: 'light', label: t('rw.light'), got: c.light, tot: c.lightT }
  ].filter((r) => r.tot > 0)

  const fmt = (r: { got: number; tot: number; fmt: string }): string =>
    r.fmt === 'plus' ? `+${r.got} / +${r.tot}` : `${r.got} / ${r.tot}`
  const pct = (got: number, tot: number): string => `${tot ? Math.round((100 * got) / tot) : 0}%`

  const actLabel = (n: number, kind: string): string =>
    kind === 'interlude' ? t('int.title', { n: n - 4 }) : t('act.short', { n })

  function showPop(key: string, e: MouseEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const right = rect.right + 8 + 250 <= window.innerWidth
    const x = right ? rect.right + 8 : Math.max(8, rect.left - 258)
    const y = Math.min(rect.top, window.innerHeight - 348)
    setPop({ key, x, y: Math.max(8, y) })
  }

  const popList = pop ? contrib[pop.key] ?? [] : []
  const popRemaining = popList.filter((x) => !x.done).length
  const hover = (key: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLDivElement>) => showPop(key, e),
    onMouseLeave: () => setPop(null)
  })

  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <ShellIcon name="passive" />
          {t('rw.title')}
        </span>
        <span className="ui-label__grow" />
        {simple && (
          <span className="ui-q" title={t('rw.help')}>
            ?
          </span>
        )}
      </div>
      <div className="ui-box__body cp-meters">
        {rows.map((r) => (
          <div key={r.key} className="ui-meter cp-meter" {...hover(r.key)}>
            <div className="ui-meter__row">
              <span>{r.label}</span>
              <b>{fmt(r)}</b>
            </div>
            <div className="ui-meter__bar" style={{ ['--v' as string]: pct(r.got, r.tot) }} />
          </div>
        ))}
        {res.length > 0 && (
          <div className="cp-res">
            {res.map((r) => (
              <div key={r.key} className={`ui-meter cp-meter cp-res__${r.key}`} {...hover(r.key)}>
                <div className="ui-meter__row">
                  <span>
                    <i />
                    {r.label}
                  </span>
                  <b>
                    {r.got}/{r.tot}%
                  </b>
                </div>
                <div className="ui-meter__bar" style={{ ['--v' as string]: pct(r.got, r.tot) }} />
              </div>
            ))}
          </div>
        )}
      </div>
      {pop && popList.length > 0 && (
        <div className="cp-pop" style={{ left: pop.x, top: pop.y }} role="tooltip">
          <div className="cp-pop__head">{t('rw.remaining', { n: popRemaining, m: popList.length })}</div>
          <ul>
            {popList.map((x, i) => (
              <li key={`${x.id}-${i}`} className={x.done ? 'is-done' : ''}>
                <ShellIcon name={x.done ? 'check' : 'dash'} />
                <b>+{x.value}</b>
                <span>{localName(x.name)}</span>
                <span>{actLabel(x.actNumber, x.kind)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
