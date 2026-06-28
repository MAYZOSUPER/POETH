import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

export function GemHintsPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const selectedActId = useAppStore((s) => s.selectedActId)
  const profiles = useAppStore((s) => s.profiles)
  const activeProfileId = useAppStore((s) => s.activeProfileId)
  const t = useT()
  const [open, setOpen] = useState(false)

  const gems = dataset?.gems
  if (!gems || !selectedActId) return null

  const cls = profiles.find((p) => p.id === activeProfileId)?.className
  let recs = gems.recommendations.filter((r) => r.actId === selectedActId)
  if (cls) {
    const filtered = recs.filter((r) => r.class?.toLowerCase() === cls.toLowerCase())
    if (filtered.length) recs = filtered
  }
  if (recs.length === 0) return null

  const gemName = (id: string): string => gems.gems[id]?.name ?? id

  return (
    <section className="panel gems">
      <div className="panel-head clickable" onClick={() => setOpen((o) => !o)}>
        <span>{cls ? `${t('gem.head')} (${cls})` : t('gem.headEarly')}</span>
        <span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <ul className="gem-recs">
          {recs.map((r, i) => (
            <li key={i}>
              <div className="gem-class">{r.class}</div>
              <div className="gem-line">
                <b>{t('gem.skills')}</b> {r.primaryGemIds.map(gemName).join(', ')}
              </div>
              <div className="gem-line">
                <b>{t('gem.supports')}</b> {r.supportGemIds.map(gemName).join(', ')}
              </div>
              {r.note && <div className="gem-note small muted">{r.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
