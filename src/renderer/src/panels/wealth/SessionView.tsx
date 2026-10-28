import type { WealthItemNs, WealthState } from '@shared/types'
import { useT } from '../../i18n'
import { useWealthStore } from './useWealthStore'
import { Gains } from './Gains'
import { IncomeTile } from './IncomeTile'
import { WIco } from './ui'
import { clock, sg } from './format'

// Подвкладка «Сессия фарма» — ВРЕМЕННАЯ, только по тайнику: при слиянии с трекером карт S11b её
// заменяет <FarmPanel renderIncome={(p) => <IncomeTile {...p} />} needLogin={!state.loggedIn} />
// (карты в час, время карты, смерти, история забегов — там). Вёрстка по макету «Богатство» v2.

type T = ReturnType<typeof useT>

export function SessionView({
  s,
  t,
  lang,
  now,
  expert,
  nameOf
}: {
  s: WealthState
  t: T
  lang: string
  now: number
  expert: boolean
  nameOf: (l: { name: string; ns: WealthItemNs }) => string
}) {
  const startFarm = useWealthStore((st) => st.startFarm)
  const stopFarm = useWealthStore((st) => st.stopFarm)
  const busy = useWealthStore((st) => st.busy)
  const sessionDiff = useWealthStore((st) => st.sessionDiff)
  const f = s.farm
  const session = f.session
  const active = !!session && session.stoppedAt === undefined
  const disabled = busy || s.status.phase !== 'idle' || !s.loggedIn

  if (!active) {
    return (
      <div className="w-pad">
        <div className="ui-empty" style={{ paddingTop: 40 }}>
          <WIco name="map" size="lg" />
          <span className="ui-empty__title">{t('wealth.farm')}</span>
          <span style={{ maxWidth: '54ch' }}>{t('wealth.farm.idle')}</span>
          <div className="wl-btns" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              disabled={disabled}
              title={s.loggedIn ? undefined : t('wealth.income.need')}
              onClick={() => void startFarm()}
            >
              <WIco name="play" />
              {t('wealth.farm.start')}
            </button>
          </div>
          {!expert && <span style={{ fontSize: 'var(--fs-sm)' }}>{t('wealth.farm.stashNote')}</span>}
        </div>
        {session && session.stoppedAt !== undefined && (
          <>
            <div className="ui-label">
              <WIco name="history" size="sm" />
              {t('wealth.farm.last')}
            </div>
            <div className="w-kpis w-kpis--2">
              <IncomeTile profitChaos={f.gain ?? null} activeMs={session.stoppedAt - session.startedAt} pending={false} />
              <div className="w-kpi">
                <span className="ui-label">{t('wealth.farm.gain')}</span>
                <b>{sg(f.gain ?? 0, lang)} c</b>
                <span>{t('wealth.farm.done', { t: clock(session.stoppedAt - session.startedAt, true) })}</span>
              </div>
              <div className="w-kpi">
                <span className="ui-label">{t('wealth.farm.snaps')}</span>
                <b>{f.snapshots}</b>
                <span>{t('wealth.farm.snapsSub')}</span>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  const activeMs = now - session.startedAt
  return (
    <div className="w-pad">
      <div className="w-sess-top">
        <span className="w-run">
          <span className="ui-dot" />
          {t('wealth.farm.running')} · <b>{clock(activeMs, true)}</b>
        </span>
        <span className="grow" />
        {!s.farmLinked && (
          <button type="button" className="ui-btn ui-btn--sm" disabled={disabled} onClick={() => void stopFarm()}>
            <WIco name="stop" />
            {t('wealth.farm.stop')}
          </button>
        )}
      </div>
      <div className="w-kpis w-kpis--2">
        <IncomeTile profitChaos={f.snapshots > 1 ? (f.gain ?? 0) : null} activeMs={activeMs} pending={f.snapshots < 2} />
        <div className="w-kpi">
          <span className="ui-label">{t('wealth.farm.gain')}</span>
          <b>{sg(f.gain ?? 0, lang)} c</b>
          <span>{t('wealth.farm.snapsN', { n: f.snapshots })}</span>
        </div>
        <div className="w-kpi">
          <span className="ui-label">{t('wealth.farm.lastHour')}</span>
          <b>{f.lastHour === null || f.lastHour === undefined ? '—' : `${sg(f.lastHour, lang)} c`}</b>
          <span>{t('wealth.farm.lastHourSub')}</span>
        </div>
      </div>
      {!expert && (
        <div className="ui-hint" style={{ padding: 0 }}>
          <WIco name="help" />
          <span>{t('wealth.farm.hint')}</span>
        </div>
      )}
      <Gains title={t('wealth.gains.session')} diff={sessionDiff} first={f.snapshots < 2} lang={lang} expert={expert} nameOf={nameOf} />
    </div>
  )
}
