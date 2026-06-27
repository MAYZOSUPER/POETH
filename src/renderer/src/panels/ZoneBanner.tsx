import { useAppStore } from '../store/useAppStore'

export function ZoneBanner() {
  const label = useAppStore((s) => s.detectedZoneLabel)
  const tailerStatus = useAppStore((s) => s.tailerStatus)
  const progress = useAppStore((s) => s.progress)

  if (!tailerStatus?.running) return null

  return (
    <div className="zone-banner">
      <span className="zb-dot">📍</span>
      <span className="zb-label">{label ?? 'ожидание входа в зону…'}</span>
      {progress?.level ? <span className="zb-level">ур. {progress.level}</span> : null}
    </div>
  )
}
