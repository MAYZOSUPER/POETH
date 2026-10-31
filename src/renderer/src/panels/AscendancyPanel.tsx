import { useAppStore } from '../store/useAppStore'
import { useLang, useT, useNameLang } from '../i18n'
import { Select } from '../components/Select'
import { ShellIcon } from '../components/ShellIcon'

// Ascendancy tracker: pick your ascendancy (filtered by the profile's class) and
// tick off completed Trials to count ascendancy points. Trial completion can't be
// auto-detected (like quests), so these are manual checkboxes.

/** «Восхождение» (.ui-box): класс восхождения и испытания с очками. */
export function AscendancyPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const progress = useAppStore((s) => s.progress)
  const profiles = useAppStore((s) => s.profiles)
  const activeProfileId = useAppStore((s) => s.activeProfileId)
  const toggleTrial = useAppStore((s) => s.toggleTrial)
  const setAscendancy = useAppStore((s) => s.setAscendancy)
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const nameLang = useNameLang()
  const uiLang = useLang()
  const t = useT()

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
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <ShellIcon name="trial" />
          {t('asc.title')}
        </span>
        <span className="ui-label__grow" />
        <span className="cp-count">{t('asc.points', { a: earned, b: total })}</span>
      </div>
      <div className="cp-asc">
        {!className ? (
          <p className="cp-asc__hint">{t('asc.pickClass')}</p>
        ) : options.length === 0 ? (
          <p className="cp-asc__hint">{t('asc.noData')}</p>
        ) : (
          <>
            <span>{t('asc.choose')}</span>
            <Select
              value={progress?.ascendancyId ?? ''}
              options={[
                { value: '', label: t('asc.none') },
                ...options.map((o) => ({ value: o.id, label: nm(o.name, o.nameRu) }))
              ]}
              onChange={(v) => void setAscendancy(v || null)}
              label={t('asc.choose')}
            />
          </>
        )}
      </div>
      {asc.trials.map((tr) => {
        const done = !!completed[tr.id]
        const note = nt(tr.note, tr.noteRu)
        const name = nm(tr.name, tr.nameRu)
        return (
          <div key={tr.id} className={`cp-trial${done ? ' is-done' : ''}`}>
            <button
              type="button"
              className="ui-check"
              role="checkbox"
              aria-checked={done}
              aria-label={name}
              onClick={() => void toggleTrial(tr.id, !done)}
            >
              <ShellIcon name="check" />
            </button>
            <span className="cp-trial__t">
              <b>{name}</b>
              <span className={`ui-tag${tr.phase === 'campaign' ? ' ui-tag--warn' : ''}`}>
                {tr.phase === 'campaign' ? t('asc.campaign') : t('asc.endgame')}
              </span>
            </span>
            <span className="cp-trial__pts">+{tr.points}</span>
            {simple && note && <span className="cp-trial__note">{note}</span>}
          </div>
        )
      })}
    </section>
  )
}
