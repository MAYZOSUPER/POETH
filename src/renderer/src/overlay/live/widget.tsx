import { useEffect, useRef, useState } from 'react'
import type { LiveWhisperResult } from '@shared/types'
import { OverlayWidget } from '../OverlayWidget'
import { Icon } from '../Icon'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'
import { ago, countdown, hitName, priceAmount, rarityColor } from '../../panels/live/format'
import { CoinIcon, Currency, CurrencyTipBody, TipAnchor } from '../../components/Currency'
import { useOverlayStore } from '../../store/useOverlayStore'
import { itemFacts, type ItemFact } from './itemFacts'
import { playLiveChime } from './chime'
import { TOAST_LIFE_MS, VISIBLE_TOASTS, useLiveToasts, type LiveToast } from './useLiveToasts'
import './live.css'

// Тосты live search (S6) — слой toasts оверлея, стопка справа сверху (макет «Тосты live
// search»): свежий сверху, видно 3, остальное — «Ещё N». Жизнь тоста 12 с, при наведении
// таймер стоит. «Написать» вставляет whisper в чат и НЕ отправляет — Enter жмёт игрок.
// Лот торговца — «Открыть лот» в трейд-окне S5 (сайт сам покажет этот лот).

const MAX_MODS = 3

function useNow(active: boolean, every = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(id)
  }, [active, every])
  return now
}

function Toast({ toast }: { toast: LiveToast }) {
  const t = useOverlayT()
  const { hit } = toast
  const [hover, setHover] = useState(false)
  const [facts, setFacts] = useState<ItemFact[]>([])
  const left = useRef(TOAST_LIFE_MS)
  const now = useNow(true, 15_000)

  useEffect(() => {
    let alive = true
    void itemFacts(hit.text).then((f) => alive && setFacts(f))
    return () => {
      alive = false
    }
  }, [hit.text])

  // 12 с жизни; наведение — пауза
  useEffect(() => {
    if (hover) return
    const started = Date.now()
    const id = window.setTimeout(() => useLiveToasts.getState().remove(toast.key), left.current)
    return () => {
      window.clearTimeout(id)
      left.current = Math.max(1500, left.current - (Date.now() - started))
    }
  }, [hover, toast.key])

  const close = (): void => useLiveToasts.getState().remove(toast.key)
  const whisper = async (): Promise<void> => {
    const r: LiveWhisperResult = await window.overlayApi.live.whisper(hit.key)
    left.current = TOAST_LIFE_MS
    useLiveToasts
      .getState()
      .update(toast.key, r === 'ok' ? { state: 'done', note: undefined } : { state: 'err', note: t(`live.act.err.${r}`) })
  }
  const copy = async (): Promise<void> => {
    const ok = await window.overlayApi.live.copyWhisper(hit.key)
    useLiveToasts.getState().update(toast.key, { note: ok ? t('live.act.copied') : t('live.act.err.no-whisper') })
  }
  const open = (): void => void window.overlayApi.live.openHit(hit.key)

  const lang = useOverlayStore((s) => s.lang)
  const done = toast.state === 'done'

  return (
    <OverlayWidget className="lv-toast-wrap">
      <div
        className={`ui-panel ui-toast lv-toast${done ? ' ui-toast--done' : ''}`}
        role="status"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span className="ui-toast__pulse" />
        <div className="ui-toast__body">
          <div className="ui-toast__meta">
            <span className={`ui-toast__kind${done ? ' lv-kind--done' : ''}`}>
              {t(done ? 'live.toast.done' : 'live.toast.kind')}
            </span>
            <span className="lv-meta-where">
              <span className="lv-meta-search" title={hit.searchTitle}>
                {hit.searchTitle}
              </span>
              <span className="lv-meta-ago">· {ago(t, hit.at, now)}</span>
            </span>
          </div>
          <div className="ui-toast__item" style={{ color: rarityColor(hit.rarity) }} title={hitName(hit)}>
            {hitName(hit)}
          </div>
          {!done && (
            <>
              {facts.length > 0 && (
                <div className="lv-facts">
                  {facts.map((f) => (
                    <span key={f.key} className="ui-tag">
                      {t(f.key, f.params)}
                    </span>
                  ))}
                </div>
              )}
              {hit.mods.length > 0 && (
                <ul className="lv-mods">
                  {hit.mods.slice(0, MAX_MODS).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
              <div className="lv-price-row">
                <span className="ui-toast__price">
                  {hit.price ? <Currency tag={hit.price.currency} text={priceAmount(hit.price.amount, lang)} lang={lang} /> : '—'}
                </span>
                {hit.merchant ? (
                  <span className="lv-sub">
                    <span className="ui-tag ui-tag--merchant">{t('live.merchant')}</span>
                    {hit.fee !== undefined && (
                      <>
                        {' '}
                        <TipAnchor className="ui-cur" tip={<CurrencyTipBody tag="gold" lang={lang} />}>
                          <CoinIcon tag="gold" lang={lang} />
                          {t('live.fee', { n: hit.fee.toLocaleString() })}
                        </TipAnchor>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="lv-sub">
                    · <span className={`ui-dot${hit.seller === 'afk' ? ' ui-dot--afk' : hit.seller === 'offline' ? ' ui-dot--off' : ''}`} />
                    {t(`live.seller.${hit.seller ?? 'online'}`)}
                  </span>
                )}
              </div>
              <div className="ui-toast__actions">
                {hit.merchant ? (
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" title={t('live.act.open.title')} onClick={open}>
                    <Icon name="external" />
                    {t('live.act.open')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm ui-btn--primary"
                      title={t('live.act.whisper.title')}
                      onClick={() => void whisper()}
                    >
                      <Icon name="chat" />
                      {t('live.act.whisper')}
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm ui-btn--icon"
                      title={t('live.act.copy')}
                      aria-label={t('live.act.copy')}
                      onClick={() => void copy()}
                    >
                      <Icon name="copy" />
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {done && (
            <div className="ui-toast__note">
              <Icon name="check" />
              {t('live.toast.done.note')}
            </div>
          )}
          {toast.note && toast.state !== 'done' && <div className="lv-note">{toast.note}</div>}
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          title={t('live.toast.close')}
          aria-label={t('live.toast.close')}
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
    </OverlayWidget>
  )
}

function PausedToast({ until }: { until: number }) {
  const t = useOverlayT()
  const now = useNow(true)
  const left = until - now
  if (left <= 0) return null
  return (
    <OverlayWidget className="lv-toast-wrap">
      <div className="ui-panel ui-toast ui-toast--paused lv-toast" role="status">
        <span className="ui-toast__pulse" />
        <div className="ui-toast__body">
          <div className="ui-toast__meta">
            <span className="ui-toast__kind">{t('live.toast.paused')}</span>
            <span>{t('live.toast.paused.meta', { t: countdown(left) })}</span>
          </div>
          <div>{t('live.toast.paused.text')}</div>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          title={t('live.toast.close')}
          aria-label={t('live.toast.close')}
          onClick={() => useLiveToasts.getState().hidePaused()}
        >
          <Icon name="close" />
        </button>
      </div>
    </OverlayWidget>
  )
}

function LiveToasts() {
  const t = useOverlayT()
  const toasts = useLiveToasts((s) => s.toasts)
  const expanded = useLiveToasts((s) => s.expanded)
  const pausedUntil = useLiveToasts((s) => s.pausedUntil)
  const pausedHiddenUntil = useLiveToasts((s) => s.pausedHiddenUntil)

  useEffect(() => {
    const api = window.overlayApi
    const st = useLiveToasts.getState()
    const offHit = api.onLiveHit((e) => {
      useLiveToasts.getState().push(e)
      if (e.sound) playLiveChime(e.volume)
    })
    const offState = api.onLiveState((s) => useLiveToasts.getState().fromSnapshot(s))
    void api.live.state().then((s) => st.fromSnapshot(s))
    return () => {
      offHit()
      offState()
    }
  }, [])

  const shown = expanded ? toasts : toasts.slice(0, VISIBLE_TOASTS)
  const more = toasts.length - shown.length
  const paused = pausedUntil !== null && pausedUntil > pausedHiddenUntil

  return (
    <>
      {paused && <PausedToast until={pausedUntil as number} />}
      {shown.map((toast) => (
        <Toast key={toast.key} toast={toast} />
      ))}
      {(more > 0 || (expanded && toasts.length > VISIBLE_TOASTS)) && (
        <OverlayWidget className="lv-toast-wrap">
          <button
            type="button"
            className="ui-panel ui-btn lv-more"
            onClick={() => useLiveToasts.getState().setExpanded(!expanded)}
          >
            {more > 0 ? t('live.toast.more', { n: more }) : t('live.toast.less')}
          </button>
        </OverlayWidget>
      )}
    </>
  )
}

const widget: OverlayWidgetDef = { id: 'live', layer: 'toasts', Component: LiveToasts }
export default widget
