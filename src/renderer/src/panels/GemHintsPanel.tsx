import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useLang, useT } from '../i18n'
import { ShellIcon } from '../components/ShellIcon'

/** Камни умений акта для класса персонажа — сворачиваемый ui-box над чек-листом. */
export function GemHintsPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const selectedActId = useAppStore((s) => s.selectedActId)
  const profiles = useAppStore((s) => s.profiles)
  const activeProfileId = useAppStore((s) => s.activeProfileId)
  const t = useT()
  const lang = useLang()
  const [open, setOpen] = useState(false)

  const gems = dataset?.gems
  if (!gems || !dataset || !selectedActId) return null

  // Recs are authored per act. Interludes (and any act lacking recs) fall back
  // to the most advanced act's set — by then the build is essentially formed.
  let sourceActId = selectedActId
  let recsForAct = gems.recommendations.filter((r) => r.actId === sourceActId)
  if (recsForAct.length === 0) {
    const latestAct = dataset.acts
      .filter((a) => a.kind === 'act')
      .sort((a, b) => b.actNumber - a.actNumber)[0]
    if (latestAct) {
      sourceActId = latestAct.id
      recsForAct = gems.recommendations.filter((r) => r.actId === sourceActId)
    }
  }
  const carriedOver = sourceActId !== selectedActId

  const cls = profiles.find((p) => p.id === activeProfileId)?.className
  // With a class chosen, show only that class's recs (none -> hide the panel,
  // rather than confusingly listing every class). Without a class, show all.
  const recs = cls
    ? recsForAct.filter((r) => r.class?.toLowerCase() === cls.toLowerCase())
    : recsForAct
  if (recs.length === 0) return null

  const gemName = (id: string): string => gems.gems[id]?.name ?? id

  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <ShellIcon name="gem" />
          {cls ? `${t('gem.head')} · ${cls}` : t('gem.headEarly')}
        </span>
        <span className="ui-label__grow" />
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          aria-expanded={open}
          aria-label={open ? t('gem.hide') : t('gem.show')}
          title={open ? t('gem.hide') : t('gem.show')}
          onClick={() => setOpen((o) => !o)}
        >
          <ShellIcon name={open ? 'chev-d' : 'chev-r'} />
        </button>
      </div>
      {open && (
        <div className="cp-gems">
          {carriedOver && <p className="cp-empty">{t('gem.carryover')}</p>}
          {recs.map((r, i) => {
            const note = lang === 'ru' ? (r.noteRu ?? r.note) : r.note
            return (
              <div key={i} className="cp-gem">
                {!cls && r.class && <span className="ui-tag">{r.class}</span>}
                <span>
                  <b>{t('gem.skills')}</b> {r.primaryGemIds.map(gemName).join(', ')}
                </span>
                <span>
                  <b>{t('gem.supports')}</b> {r.supportGemIds.map(gemName).join(', ')}
                </span>
                {note && <span className="cp-q__note">{note}</span>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
