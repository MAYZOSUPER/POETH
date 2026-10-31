import { useEffect, useMemo, useState } from 'react'
import type { RumoursOverlayCmd } from '@shared/types/rumours'
import type { RumourLang } from '@shared/rumours/match'
import { pickRumour } from '@shared/rumours/pick'
import { priceNumber, rumourRow } from '@shared/rumours/view'
import { useOverlayStore } from '../../store/useOverlayStore'
import { useGameLang } from '../../gameLang'
import { rumoursApi, useRumoursStore } from '../../panels/rumours/store'
import { OverlayWidget } from '../OverlayWidget'
import { Icon } from '../Icon'
import { formatAccel, useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'
import './rumours-overlay.css'

// «Слухи журнала» поверх игры (S65, PoE 2): короткий вид по хоткею rumours — выбранные слухи (до 6) одной строкой
// каждый: тир, слух как в клиенте, куда ведёт, цена главной награды; лучший выделен, под ним «почему».
// Мышь проходит в игру (не кликабельный); прячется повторным нажатием или сам через 30 секунд (решает main).
// Слой toasts — справа сверху, центр экрана свободен.

function useHotkeyAccel(): string {
  const [accel, setAccel] = useState('')
  useEffect(() => {
    const read = (): void => {
      void window.overlayApi.settings.get().then((s) => {
        setAccel((s.hotkeys as unknown as Record<string, { accel?: string } | undefined>).rumours?.accel ?? '')
      })
    }
    read()
    return window.overlayApi.onOverlayFocus(read)
  }, [])
  return accel
}

function RumoursOverlay() {
  const [cmd, setCmd] = useState<RumoursOverlayCmd | null>(null)
  useEffect(() => {
    const api = rumoursApi()
    if (!api) return
    return api.onRumoursOverlay((c) => {
      setCmd(c)
      if (c.show) void useRumoursStore.getState().init()
    })
  }, [])
  if (!cmd?.show) return null
  return <Panel cmd={cmd} />
}

function Panel({ cmd }: { cmd: RumoursOverlayCmd }) {
  const t = useOverlayT()
  const uiLang = useOverlayStore((s) => s.lang) as RumourLang
  const gameLang = useGameLang(uiLang) as RumourLang
  const accel = useHotkeyAccel()
  const data = useRumoursStore((s) => s.data)
  const user = useRumoursStore((s) => s.user)
  const prices = useRumoursStore((s) => s.prices)
  const list = data?.rumours ?? []
  const pick = useMemo(() => pickRumour(list, user.picked, user.marks, prices), [list, user, prices])
  const byId = new Map(list.map((r) => [r.id, r]))
  const rows = pick.ranked.map((x) => rumourRow(byId.get(x.id)!, gameLang, uiLang, user.marks[x.id], prices))
  const best = rows.find((r) => r.id === pick.best)
  const why = pick.why
  const whyText = !why ? null : 'than' in why ? t(`rumours.why.${why.kind}`, { than: rows.find((r) => r.id === why.than)?.text ?? '' }) : t(`rumours.why.${why.kind}`)

  return (
    <OverlayWidget interactive={false}>
      <div className="ui-panel ov-rm" role="status">
        <div className="ov-rm__head">
          <Icon name="expedition" />
          <b>{t('app.rumours')}</b>
          {cmd.read === 'found' && <span className="ov-rm__muted">{t('rumours.ov.found', { n: cmd.count })}</span>}
        </div>
        {cmd.read === 'none' && <div className="ov-rm__warn">{t('rumours.ov.none')}</div>}
        {rows.length === 0 ? (
          cmd.read !== 'none' && <div className="ov-rm__muted">{t('rumours.ov.empty')}</div>
        ) : (
          <>
            {best && (
              <div className="ov-rm__best">
                <b>{t('rumours.best', { text: best.text })}</b>
                {whyText && <span>{whyText}</span>}
              </div>
            )}
            <ul className="ov-rm__rows">
              {rows.map((r) => {
                const tier = r.ownTier ?? r.tier
                return (
                  <li key={r.id} className={`ov-rm__row${r.id === pick.best ? ' is-best' : ''}${r.skip ? ' is-skip' : ''}`}>
                    <span className="ui-pips" aria-hidden="true">
                      {[1, 2, 3].map((i) => (
                        <i key={i} className={tier !== null && i <= tier ? 'on' : ''} />
                      ))}
                    </span>
                    <span className="ov-rm__text">{r.text}</span>
                    <span className="ov-rm__muted">→ {r.island}</span>
                    {r.price && (
                      <span className="ov-rm__price">
                        {t('rumours.price', { price: `${priceNumber(r.price, uiLang)} ${t(`rumours.unit.${r.price.unit}`)}` })}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
        <div className="ov-rm__foot">
          {user.picked.length > 0 && user.picked.length < 6 && <span>{t('rumours.ov.reroll')}</span>}
          <span>{accel ? t('rumours.ov.close', { key: formatAccel(accel) }) : t('rumours.ov.close.nokey')}</span>
        </div>
      </div>
    </OverlayWidget>
  )
}

const widget: OverlayWidgetDef = { id: 'rumours', layer: 'toasts', order: -5, Component: RumoursOverlay }
export default widget
