import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT, useName } from '../i18n'

export function LayoutViewerPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const selectedZoneAreaId = useAppStore((s) => s.selectedZoneAreaId)
  const selectZone = useAppStore((s) => s.selectZone)
  const t = useT()
  const localName = useName()

  const [urls, setUrls] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)

  const zone = dataset?.acts.flatMap((a) => a.zones).find((z) => z.areaId === selectedZoneAreaId)
  const layoutKey = zone?.layout ?? null

  useEffect(() => {
    let cancelled = false
    setUrls([])
    setActive(0)
    if (!layoutKey) return
    setLoading(true)
    window.overlayApi.layout
      .resolve(layoutKey)
      .then((u) => {
        if (!cancelled) setUrls(u)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [layoutKey])

  if (!selectedZoneAreaId || !layoutKey) return null

  return (
    <section className="panel layout">
      <div className="panel-head">
        <span>{t('lv.title', { name: localName(zone?.name ?? '') })}</span>
        <button className="icon" title={t('lv.close')} onClick={() => selectZone(null)}>
          ✕
        </button>
      </div>
      {urls.length === 0 ? (
        <div className="muted small">{loading ? t('lv.loading') : t('lv.unavailable')}</div>
      ) : (
        <>
          <div className="layout-main">
            <img src={urls[active]} alt={zone?.name} />
          </div>
          {urls.length > 1 && (
            <div className="thumbs">
              {urls.map((u, i) => (
                <img
                  key={i}
                  src={u}
                  className={i === active ? 'active' : ''}
                  onClick={() => setActive(i)}
                  alt={`вариант ${i + 1}`}
                />
              ))}
            </div>
          )}
          <div className="muted small">
            {t('lv.rotateNote')} © Lailloken / Exile-UI (MIT)
          </div>
        </>
      )}
    </section>
  )
}
