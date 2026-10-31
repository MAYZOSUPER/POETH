import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n'
import { ShellIcon } from '../../components/ShellIcon'
import { SOON_GROUPS, SOON_POE2, type SoonStatus } from './soonPoe2'
import './soon.css'

// Пункт рельса «Скоро в PoE 2» (вариант В макета PoE 2 v1): одна страница вместо скрытых или серых вкладок.
// Подключение — запись в tabs.ts и ветка в App.tsx (делает лид); здесь только сама страница.

const TAG: Record<SoonStatus, string> = {
  work: 'ui-tag--good',
  plan: 'ui-tag--person',
  after: '',
  never: 'ui-tag--bad'
}

export function SoonPoe2Page() {
  const t = useT()
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <div className="page-scroll">
      <div className="sn-page">
        <h2>{t('soon2.title')}</h2>
        <p>{t('soon2.lead')}</p>
        <div className="ui-box">
          {SOON_GROUPS.map((g) => {
            const items = SOON_POE2.filter((x) => x.status === g)
            if (items.length === 0) return null
            return (
              <section key={g} className="sn-grp" aria-labelledby={`sn-${g}`}>
                <h3 className="sn-grp__h" id={`sn-${g}`}>
                  {t(`soon2.group.${g}`)}
                </h3>
                {items.map((x) => (
                  <div key={x.id} className="sn-row">
                    <ShellIcon name={x.icon} />
                    <b>{t(`soon2.${x.id}.t`)}</b>
                    <span className={`ui-tag ${TAG[x.status]}`}>{t(`soon2.status.${x.status}`)}</span>
                    {simple && <span className="sn-row__d">{t(`soon2.${x.id}.d`)}</span>}
                  </div>
                ))}
              </section>
            )
          })}
        </div>
        <div className="sn-switch">
          {!ask ? (
            <>
              <button type="button" className="ui-btn" onClick={() => setAsk(true)}>
                <ShellIcon name="refresh" />
                {t('soon2.toPoe1')}
              </button>
              <span>{t('soon2.toPoe1.note')}</span>
            </>
          ) : (
            <>
              <span>{t('game.restart.text')}</span>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={busy} onClick={() => setAsk(false)}>
                {t('game.restart.cancel')}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--primary ui-btn--sm"
                disabled={busy}
                autoFocus
                onClick={() => {
                  setBusy(true)
                  void window.overlayApi.app.switchGame('poe1').finally(() => setBusy(false))
                }}
              >
                <ShellIcon name="refresh" />
                {t('game.restart.ok')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
