import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useLang, useT } from '../i18n'

// Ascendancy tracker: pick your ascendancy (filtered by the profile's class) and
// tick off completed Trials to count ascendancy points. Trial completion can't be
// auto-detected (like quests), so these are manual checkboxes.

export function AscendancyPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const progress = useAppStore((s) => s.progress)
  const profiles = useAppStore((s) => s.profiles)
  const activeProfileId = useAppStore((s) => s.activeProfileId)
  const toggleTrial = useAppStore((s) => s.toggleTrial)
  const setAscendancy = useAppStore((s) => s.setAscendancy)
  const nameLang = useAppStore((s) => s.settings?.nameLang ?? 'en')
  const uiLang = useLang()
  const t = useT()
  const [open, setOpen] = useState(false)

  const asc = dataset?.ascendancy
  if (!asc || asc.trials.length === 0) return null

  const nm = (en: string, ru?: string): string => (nameLang === 'ru' && ru ? ru : en)
  const nt = (en?: string, ru?: string): string | undefined =>
    uiLang === 'ru' ? (ru ?? en) : en

  const className = profiles.find((p) => p.id === activeProfileId)?.className
  const options =
    asc.classes.find((c) => c.base.toLowerCase() === className?.toLowerCase())?.options ?? []

  const completed = progress?.completedTrialIds ?? {}
  const earned = asc.trials.reduce((s, tr) => s + (completed[tr.id] ? tr.points : 0), 0)
  const total = asc.trials.reduce((s, tr) => s + tr.points, 0)

  return (
    <section className="panel ascendancy">
      <div className="panel-head clickable" onClick={() => setOpen((o) => !o)}>
        <span>{t('asc.head', { a: earned, b: total })}</span>
        <span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="asc-body">
          {!className ? (
            <div className="small muted asc-hint">{t('asc.pickClass')}</div>
          ) : options.length === 0 ? (
            <div className="small muted asc-hint">{t('asc.noData')}</div>
          ) : (
            <div className="setting">
              <label>{t('asc.choose')}</label>
              <select
                className="class-select"
                value={progress?.ascendancyId ?? ''}
                onChange={(e) => void setAscendancy(e.target.value || null)}
              >
                <option value="">{t('asc.none')}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {nm(o.name, o.nameRu)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <ul className="quest-list trials">
            {asc.trials.map((tr) => {
              const done = !!completed[tr.id]
              const note = nt(tr.note, tr.noteRu)
              return (
                <li key={tr.id} className={`quest ${done ? 'done' : ''}`}>
                  <label className="quest-main">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(e) => void toggleTrial(tr.id, e.target.checked)}
                    />
                    <span className="quest-name">{nm(tr.name, tr.nameRu)}</span>
                    <span className={tr.phase === 'campaign' ? 'type-tag req' : 'type-tag opt'}>
                      {tr.phase === 'campaign' ? t('asc.campaign') : t('asc.endgame')}
                    </span>
                    <span className="asc-pts">+{tr.points}</span>
                  </label>
                  {note && <div className="quest-notes">{note}</div>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
