import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useLang, useT } from '../i18n'

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
    <section className="panel gems">
      <div className="panel-head clickable" onClick={() => setOpen((o) => !o)}>
        <span>{cls ? `${t('gem.head')} (${cls})` : t('gem.headEarly')}</span>
        <span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <>
          {carriedOver && <div className="gem-carry small muted">{t('gem.carryover')}</div>}
          <ul className="gem-recs">
            {recs.map((r, i) => {
              const note = lang === 'ru' ? (r.noteRu ?? r.note) : r.note
              return (
                <li key={i}>
                  <div className="gem-class">{r.class}</div>
                  <div className="gem-line">
                    <b>{t('gem.skills')}</b> {r.primaryGemIds.map(gemName).join(', ')}
                  </div>
                  <div className="gem-line">
                    <b>{t('gem.supports')}</b> {r.supportGemIds.map(gemName).join(', ')}
                  </div>
                  {note && <div className="gem-note small muted">{note}</div>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
