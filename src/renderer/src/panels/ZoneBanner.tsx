import { useAppStore } from '../store/useAppStore'
import { useT, useName } from '../i18n'

/** Текущая зона по журналу игры — короткой строкой рядом с «Что дальше / Чек-лист». Уровень — в ProfileBar. */
export function ZoneBanner() {
  const nameEn = useAppStore((s) => s.detectedZoneNameEn)
  const actId = useAppStore((s) => s.detectedActId)
  const dataset = useAppStore((s) => s.dataset)
  const tailerStatus = useAppStore((s) => s.tailerStatus)
  const t = useT()
  const localName = useName()

  if (!tailerStatus?.running) return null

  if (!nameEn) {
    return (
      <span className="cp-now" role="status">
        <span className="ui-dot ui-dot--off" />
        {t('zb.waiting')}
      </span>
    )
  }
  const act = dataset?.acts.find((a) => a.id === actId)
  const prefix = act
    ? act.kind === 'interlude'
      ? t('int.title', { n: act.actNumber - 4 })
      : t('act.short', { n: act.actNumber })
    : ''

  return (
    <span className="cp-now" role="status" title={t('zb.title')}>
      <span className="ui-dot" />
      {t('zb.now')}
      <b>
        {prefix ? `${prefix} · ` : ''}
        {localName(nameEn)}
      </b>
    </span>
  )
}
