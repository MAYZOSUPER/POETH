import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT, useName } from '../i18n'
import { ShellIcon } from '../components/ShellIcon'

/** «Схема зоны» (.ui-box): картинка раскладки, варианты миниатюрами, Esc и крестик закрывают. */
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

  useEffect(() => {
    if (!selectedZoneAreaId) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') selectZone(null)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [selectedZoneAreaId, selectZone])

  if (!selectedZoneAreaId || !layoutKey) return null
  const name = localName(zone?.name ?? '')

  return (
    <section className="ui-box" role="region" aria-label={t('lv.title', { name })}>
      <div className="ui-box__head">
        <span className="ui-label">
          <ShellIcon name="map" />
          {t('lv.title', { name })}
        </span>
        <span className="ui-label__grow" />
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          title={t('lv.close')}
          aria-label={t('lv.close')}
          onClick={() => selectZone(null)}
        >
          <ShellIcon name="close" />
        </button>
      </div>
      <div className="ui-box__body">
        {urls.length === 0 ? (
          loading ? (
            <span className="ui-skeleton" style={{ height: 160 }} aria-label={t('lv.loading')} />
          ) : (
            <p className="cp-asc__hint">{t('lv.unavailable')}</p>
          )
        ) : (
          <>
            <div className="cp-map">
              <img src={urls[active]} alt={name} />
            </div>
            {urls.length > 1 && (
              <div className="cp-thumbs" role="group" aria-label={t('lv.variants')}>
                {urls.map((u, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={i === active}
                    aria-label={t('lv.variant', { n: i + 1 })}
                    onClick={() => setActive(i)}
                  >
                    <img src={u} alt="" />
                  </button>
                ))}
              </div>
            )}
            <span className="cp-credit">
              {t('lv.rotateNote')} © Lailloken / Exile-UI (MIT)
            </span>
          </>
        )}
      </div>
    </section>
  )
}
