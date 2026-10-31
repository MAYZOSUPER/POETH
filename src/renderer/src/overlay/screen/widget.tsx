import { useEffect, useRef, useState } from 'react'
import type { ScreenIpcApi } from '@shared/ipc/screen'
import { formatPrice, toCss } from '@shared/screen/labels'
import type { ScreenLabels, ScreenOverlayState } from '@shared/types/screen'
import { Icon } from '../Icon'
import { useInteractive } from '../interactive'
import { useOverlayT } from '../useOverlayT'
import { useOverlayStore } from '../../store/useOverlayStore'
import type { OverlayWidgetDef } from '../registry'
import './screen.css'

// Цены поверх окон (S68): подписи цены за штуку у каждой ячейки особой вкладки тайника и итог вкладки. Снимок и
// распознавание — в main по хоткею; здесь только рисунок по готовому состоянию (event:screen.state). Подписи не
// ловят мышь — она проходит в игру; ловит только кнопка «спрятать» на итоге. Простые подписи на токенах
// дизайн-системы — оформление рисует дизайнер (фаза 2).

/** Мост домена: строка в агрегаторе preload — через лида; до неё виджет молчит. */
function api(): ScreenIpcApi | null {
  const a = window.overlayApi as unknown as Partial<ScreenIpcApi>
  return a.screen && a.onScreenState ? (a as ScreenIpcApi) : null
}

function useScreenState(): ScreenOverlayState {
  const [st, setSt] = useState<ScreenOverlayState>({ status: 'idle' })
  useEffect(() => {
    const a = api()
    if (!a) return
    const off = a.onScreenState(setSt)
    void a.screen.state().then(setSt)
    return off
  }, [])
  return st
}

function Total({ labels, ms }: { labels: ScreenLabels; ms?: number }) {
  const t = useOverlayT()
  const lang = useOverlayStore((s) => s.lang)
  const ref = useRef<HTMLDivElement>(null)
  useInteractive(ref)
  const dpr = window.devicePixelRatio || 1
  const a = toCss(labels.anchor, dpr)
  // справа от области ячеек, у её верха; не влезает — над ней
  const right = a.x + a.width + 8
  const style = right + 220 <= window.innerWidth ? { left: right, top: a.y } : { left: a.x, top: Math.max(4, a.y - 64) }
  const priced = labels.labels.length > 0
  return (
    <div ref={ref} className="ui-panel scr-total" style={style} role="status" title={t('scr.total.tip')}>
      <div className="scr-total__row">
        <span className="scr-total__label">{t('scr.total')}</span>
        <b className="scr-total__sum">
          {priced ? `${labels.approx ? '≈ ' : ''}${formatPrice(labels.total, labels.base, labels.divine, lang)}` : '—'}
        </b>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          aria-label={t('scr.close')}
          title={t('scr.close')}
          onClick={() => void api()?.screen.hide()}
        >
          <Icon name="close" />
        </button>
      </div>
      {!priced && <div className="scr-total__note">{t('scr.noPrices')}</div>}
      {labels.approx && <div className="scr-total__note">{t('scr.approx')}</div>}
      {(labels.unpriced > 0 || labels.uncounted > 0) && (
        <div className="scr-total__note">
          {[labels.unpriced ? t('scr.unpriced', { n: labels.unpriced }) : '', labels.uncounted ? t('scr.uncounted', { n: labels.uncounted }) : '']
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {ms !== undefined && <div className="scr-total__ms">{t('scr.ms', { ms: Math.round(ms) })}</div>}
    </div>
  )
}

function Labels({ labels }: { labels: ScreenLabels }) {
  const lang = useOverlayStore((s) => s.lang)
  const dpr = window.devicePixelRatio || 1
  return (
    <>
      {labels.labels.map((l, i) => {
        const r = toCss(l.rect, dpr)
        // подпись — полоса по низу ячейки, шрифт от размера ячейки (метка уровня II/III игры — справа снизу, видна)
        const fs = Math.max(9, Math.min(14, r.height * 0.24))
        return (
          <div
            key={i}
            className={`scr-label${l.doubt ? ' is-doubt' : ''}`}
            style={{ left: r.x, top: r.y + r.height - fs * 1.35, width: r.width, fontSize: fs }}
          >
            {l.unit !== null ? `${l.doubt ? '~' : ''}${formatPrice(l.unit, labels.base, labels.divine, lang)}` : '?'}
          </div>
        )
      })}
    </>
  )
}

function ScreenPrices() {
  const st = useScreenState()
  const t = useOverlayT()
  if (st.status === 'idle') return null
  if (st.status === 'busy' || st.status === 'fail')
    return (
      <div className="scr-root">
        <div className={`ui-panel ov-notice scr-toast ov-notice--${st.status === 'fail' ? 'warn' : 'info'}`} role="status">
          <Icon name={st.status === 'fail' ? 'warn' : 'info'} />
          <span>
            {st.status === 'fail'
              ? t(`scr.fail.${st.fail ?? 'error'}`)
              : st.icons
                ? t('scr.icons', { done: st.icons.done, total: st.icons.total })
                : t('scr.busy')}
          </span>
        </div>
      </div>
    )
  if (!st.labels) return null
  return (
    <div className="scr-root">
      <Labels labels={st.labels} />
      <Total labels={st.labels} ms={st.ms?.total} />
    </div>
  )
}

// ниже окна цены и тостов: подписи на всё окно, мышь — в игру
const widget: OverlayWidgetDef = { id: 'screen', layer: 'cards', order: -50, Component: ScreenPrices }
export default widget
