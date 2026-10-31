import { useEffect, useRef, useState } from 'react'
import type { ScreenIpcApi } from '@shared/ipc/screen'
import { formatPrice, toCss } from '@shared/screen/labels'
import type { ScreenLabels, ScreenOverlayState } from '@shared/types/screen'
import { Icon } from '../Icon'
import { Kbd } from '../Kbd'
import { useInteractive } from '../interactive'
import { translate } from '../../i18n'
import { screen as SCREEN_DICT } from '../../i18n/dict/screen'
import { useOverlayStore } from '../../store/useOverlayStore'
import type { OverlayWidgetDef } from '../registry'
import './screen.css'

// Цены поверх окон (S68): подписи цены за штуку у каждой ячейки особой вкладки тайника и итог вкладки. Снимок и
// распознавание — в main по хоткею; здесь только рисунок по готовому состоянию (event:screen.state). Подписи не
// ловят мышь — она проходит в игру; ловит только панель итога. Панель — по макету «PoE 2 в POETH v2» (раздел «Цены
// поверх окон»): окно и игра, «N из M с ценой», откуда цена, что не вошло, легенда (простой режим), клавиша.

/** Мост домена: строка в агрегаторе preload — через лида; до неё виджет молчит. */
function api(): ScreenIpcApi | null {
  const a = window.overlayApi as unknown as Partial<ScreenIpcApi>
  return a.screen && a.onScreenState ? (a as ScreenIpcApi) : null
}

/**
 * Строки домена: сначала свой словарь (виджет пишет верно и до строки словаря в агрегаторе — через лида), потом общий.
 * Полноту ключей проверяет tests/screen/dict.test.ts.
 */
function useSay(): (key: string, params?: Record<string, string | number>) => string {
  const lang = useOverlayStore((s) => s.lang)
  return (key, params) => {
    let s = SCREEN_DICT[lang]?.[key] ?? SCREEN_DICT.ru[key] ?? translate(lang, key)
    if (params) for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]))
    return s
  }
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

/** Клавиша панели и простой режим — из настроек (перечитываем, когда игрок вернулся в игру). */
function usePanelSettings(): { key: string; simple: boolean } {
  const [st, setSt] = useState({ key: '', simple: true })
  useEffect(() => {
    const read = (): void => {
      void window.overlayApi.settings.get().then((s) => setSt({ key: s.hotkeys.screenPrices?.accel ?? '', simple: s.ui.simpleMode }))
    }
    read()
    return window.overlayApi.onOverlayFocus(read)
  }, [])
  return st
}

/** Ширина панели (.scr-total в screen.css) — с какой стороны от ячеек она влезает. */
const PANEL_W = 304

/** Подпись дороже 1 div — золотая рамка (легенда панели). */
function isRich(unit: number | null, divine: number | null): boolean {
  return unit !== null && !!divine && unit >= divine
}

function Total({ labels, ms }: { labels: ScreenLabels; ms?: number }) {
  const say = useSay()
  const lang = useOverlayStore((s) => s.lang)
  const priceKey = useOverlayStore((s) => s.priceCheckKey)
  const { key, simple } = usePanelSettings()
  const ref = useRef<HTMLDivElement>(null)
  useInteractive(ref)
  const dpr = window.devicePixelRatio || 1
  const a = toCss(labels.anchor, dpr)
  // справа от области ячеек, у её верха; не влезает — слева от неё; нигде — в правом верхнем углу
  const right = a.x + a.width + 8
  const left = a.x - 8 - PANEL_W
  const style =
    right + PANEL_W <= window.innerWidth ? { left: right, top: a.y } : left >= 4 ? { left, top: a.y } : { right: 8, top: 8 }
  // итог — только если хоть одно число стопки прочитано (иначе «—», а не «<0,1 c»)
  const priced = labels.counted > 0
  const coin = isRich(labels.total, labels.divine) ? 'div' : labels.base === 'exalted' ? 'ex' : 'chaos'
  const doubt = labels.labels.some((l) => l.doubt)
  const legend = simple && labels.labels.length > 0 && (!!labels.divine || doubt)
  return (
    <div ref={ref} className="ui-panel scr-total" style={style} role="status" aria-label={say('scr.title')}>
      <div className="ui-panel__head">
        <span className="ui-panel__title">{say('scr.title')}</span>
        <span className="ui-badge">{labels.game === 'poe2' ? 'PoE 2' : 'PoE 1'}</span>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm scr-total__close"
          aria-label={say('scr.close')}
          title={say('scr.close')}
          onClick={() => void api()?.screen.hide()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="scr-total__b">
        <div className="scr-total__row" title={say('scr.total.tip')}>
          <span className="scr-total__label">{say(labels.window === 'grid' ? 'scr.win.grid' : 'scr.win.stash')}</span>
          <b className="scr-total__sum">
            {priced ? (
              <>
                {labels.approx && '≈ '}
                <i className={`ui-coin ui-coin--${coin}`} aria-hidden="true" />
                {formatPrice(labels.total, labels.base, labels.divine, lang)}
              </>
            ) : (
              '—'
            )}
          </b>
        </div>
        {labels.labels.length ? (
          <span className="scr-total__meta">
            {say('scr.priced', { n: labels.labels.length, m: labels.labels.length + labels.unpriced })} ·{' '}
            {say(labels.game === 'poe2' ? 'scr.src.poe2' : 'scr.src.poe1')}
          </span>
        ) : (
          <span className="scr-total__meta">{say('scr.noPrices')}</span>
        )}
        {labels.uncounted > 0 && (
          <span className="scr-total__meta">{say(labels.approx ? 'scr.uncounted.approx' : 'scr.uncounted', { n: labels.uncounted })}</span>
        )}
        {labels.unpriced > 0 && (
          <span className="scr-total__meta scr-total__warn">
            <Icon name="warn" />
            {say('scr.unpriced', { n: labels.unpriced })}
            {priceKey && (
              <>
                {' '}
                <Kbd accel={priceKey} />
              </>
            )}
          </span>
        )}
        {legend && (
          <span className="scr-total__meta">
            {!!labels.divine && (
              <>
                <span className="scr-key is-rich">1 div</span>
                {say('scr.legend.rich')}
              </>
            )}
            {!!labels.divine && doubt && ' · '}
            {doubt && (
              <>
                <span className="scr-key is-doubt">~</span>
                {say('scr.legend.doubt')}
              </>
            )}
          </span>
        )}
        {labels.game === 'poe2' && labels.window === 'stash' && <RecordWealth />}
        {key && (
          <span className="scr-total__meta">
            <Kbd accel={key} /> {say('scr.keys')}
          </span>
        )}
        {!simple && ms !== undefined && <span className="scr-total__ms">{say('scr.ms', { ms: Math.round(ms) })}</span>}
      </div>
    </div>
  )
}

/**
 * «Богатство PoE 2» (S70): «Записать в богатство» — результат этого снимка уходит карточкой в компаньон (там
 * «Принять / Переснять»). Снимок экрана не передаётся: main берёт последний результат распознавания S68.
 */
function RecordWealth() {
  const lang = useOverlayStore((s) => s.lang)
  // строки — словарь «Богатства» (dict/wealth.ts), общий translate
  const tw = (key: string): string => translate(lang, key)
  const [st, setSt] = useState<'idle' | 'busy' | 'done' | 'fail'>('idle')
  const wealth = (window.overlayApi as Partial<typeof window.overlayApi>).wealth
  if (!wealth?.poe2ScreenRecord) return null
  const record = async (): Promise<void> => {
    setSt('busy')
    const r = await wealth.poe2ScreenRecord().catch(() => ({ ok: false }))
    setSt(r.ok ? 'done' : 'fail')
  }
  if (st === 'done' || st === 'fail')
    return <span className={`scr-total__meta scr-wealth is-${st}`}>{tw(st === 'done' ? 'wealth.p2.rec.done' : 'wealth.p2.rec.fail')}</span>
  return (
    <button type="button" className="ui-btn ui-btn--primary ui-btn--sm scr-wealth" disabled={st === 'busy'} onClick={() => void record()}>
      <Icon name="coins" />
      {tw('wealth.p2.rec')}
    </button>
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
            className={`scr-label${isRich(l.unit, labels.divine) ? ' is-rich' : ''}${l.doubt ? ' is-doubt' : ''}`}
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
  const say = useSay()
  if (st.status === 'idle') return null
  if (st.status === 'busy' || st.status === 'fail')
    return (
      <div className="scr-root">
        <div className={`ui-panel ov-notice scr-toast ov-notice--${st.status === 'fail' ? 'warn' : 'info'}`} role="status">
          <Icon name={st.status === 'fail' ? 'warn' : 'info'} />
          <span>
            {st.status === 'fail'
              ? say(`scr.fail.${st.fail ?? 'error'}`)
              : st.icons
                ? say('scr.icons', { done: st.icons.done, total: st.icons.total })
                : say('scr.busy')}
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
