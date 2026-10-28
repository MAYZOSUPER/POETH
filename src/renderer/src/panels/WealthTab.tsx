import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { useWealthStore } from './wealth/useWealthStore'
import { useNameOf } from './wealth/names'
import { StashView } from './wealth/StashView'
import { SessionView } from './wealth/SessionView'
import { WIco } from './wealth/ui'
import { clock } from './wealth/format'
import './wealth/wealth.css'

// Вкладка «Богатство» компаньона (PoE1, S11a) по утверждённому макету «Богатство» v2: подвкладки
// «Тайник» (сумма тайника, график, разбивка, что прибавилось) и «Сессия фарма» (пока — своя по тайнику;
// после слияния с трекером карт S11b здесь будет его FarmPanel с плиткой дохода IncomeTile).

type Sub = 'stash' | 'session'

function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function WealthTab() {
  const t = useT()
  const lang = useAppStore((s) => s.settings?.uiLang ?? 'ru')
  const expert = !(useAppStore((s) => s.settings?.ui.simpleMode ?? true))
  const s = useWealthStore((st) => st.state)
  const init = useWealthStore((st) => st.init)
  const nameOf = useNameOf(lang)
  const now = useNow()
  const [sub, setSub] = useState<Sub>('stash')

  useEffect(() => init(), [init])

  if (!s) return <div className="wealth-tab" />
  if (!s.supported) {
    return (
      <div className="wealth-tab">
        <div className="ui-empty">
          <span>{t('wealth.err.unsupported-game')}</span>
        </div>
      </div>
    )
  }
  const session = s.farm.session
  const running = !!session && session.stoppedAt === undefined
  const subs: Array<[Sub, 'grid' | 'map', string]> = [
    ['stash', 'grid', t('wealth.sub.stash')],
    ['session', 'map', t('wealth.sub.session')]
  ]
  return (
    <div className="wealth-tab">
      <div className="ui-tabs wl-subtabs" role="tablist">
        {subs.map(([id, icon, label]) => (
          <button key={id} type="button" className="ui-tab" role="tab" aria-selected={sub === id} onClick={() => setSub(id)}>
            <WIco name={icon} />
            {label}
            {id === 'session' && running && <span className="ui-count ui-count--live">{clock(now - session.startedAt, true).slice(0, -3)}</span>}
          </button>
        ))}
      </div>
      <div className="wl-body ui-scroll">
        {sub === 'stash' ? (
          <StashView s={s} t={t} lang={lang} now={now} expert={expert} nameOf={nameOf} />
        ) : (
          <SessionView s={s} t={t} lang={lang} now={now} expert={expert} nameOf={nameOf} />
        )}
      </div>
    </div>
  )
}
