import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

export function ZoneBanner() {
  const label = useAppStore((s) => s.detectedZoneLabel)
  const tailerStatus = useAppStore((s) => s.tailerStatus)
  const progress = useAppStore((s) => s.progress)
  const t = useT()

  if (!tailerStatus?.running) return null

  return (
    <div className="zone-banner">
      <span className="zb-dot">📍</span>
      <span className="zb-label">{label ?? t('zb.waiting')}</span>
      {progress?.level ? (
        <span className="zb-level">{t('zb.level', { n: progress.level })}</span>
      ) : null}
    </div>
  )
}
