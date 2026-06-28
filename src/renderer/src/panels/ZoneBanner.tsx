import { useAppStore } from '../store/useAppStore'
import { useT, useName } from '../i18n'

export function ZoneBanner() {
  const nameEn = useAppStore((s) => s.detectedZoneNameEn)
  const actId = useAppStore((s) => s.detectedActId)
  const dataset = useAppStore((s) => s.dataset)
  const tailerStatus = useAppStore((s) => s.tailerStatus)
  const progress = useAppStore((s) => s.progress)
  const t = useT()
  const localName = useName()

  if (!tailerStatus?.running) return null

  let label: string
  if (nameEn) {
    const act = dataset?.acts.find((a) => a.id === actId)
    const prefix = act
      ? act.kind === 'interlude'
        ? t('int.short', { n: act.actNumber - 4 })
        : t('act.short', { n: act.actNumber })
      : ''
    label = prefix ? `${prefix}: ${localName(nameEn)}` : localName(nameEn)
  } else {
    label = t('zb.waiting')
  }

  return (
    <div className="zone-banner">
      <span className="zb-dot">📍</span>
      <span className="zb-label">{label}</span>
      {progress?.level ? (
        <span className="zb-level">{t('zb.level', { n: progress.level })}</span>
      ) : null}
    </div>
  )
}
