import { useEffect } from 'react'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { useDealsStore, type DealsPage } from '../store/useDealsStore'
import { Ico, Rich, Switch, playChime, useSimple, type IcoName } from './deals/common'
import { HistoryPage } from './deals/HistoryPage'
import { RepliesPage } from './deals/RepliesPage'
import { StashPage } from './deals/StashPage'
import { BlacklistPage } from './deals/BlacklistPage'
import './deals/deals.css'

// Вкладка «Сделки» компаньона (PoE1, этап S8) по утверждённому макету: история с фильтрами,
// шаблоны ответов RU/EN, подсветка тайника и калибровка, чёрный список PoE Hub. Справа —
// включение менеджера и простой/экспертный режим. Карточки поверх игры — фаза 2 (после S1).

const PAGES: { id: DealsPage; icon: IcoName }[] = [
  { id: 'history', icon: 'history' },
  { id: 'replies', icon: 'chat' },
  { id: 'stash', icon: 'grid' },
  { id: 'blacklist', icon: 'shield' }
]

export function DealsTab() {
  const t = useT()
  const simple = useSimple()
  const settings = useAppStore((s) => s.settings)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const ready = useDealsStore((s) => s.ready)
  const init = useDealsStore((s) => s.init)
  const page = useDealsStore((s) => s.page)
  const setPage = useDealsStore((s) => s.setPage)
  const log = useDealsStore((s) => s.log)
  const config = useDealsStore((s) => s.state?.config)
  const lastNew = useDealsStore((s) => s.lastNew)
  const total = useDealsStore((s) => s.state?.deals.filter((d) => d.status === 'new').length ?? 0)

  useEffect(() => {
    void init()
  }, [init])

  const enabled = settings?.deals.enabled ?? true

  // звук входящей сделки (пока карточек поверх игры нет — играет компаньон)
  useEffect(() => {
    if (!lastNew || !enabled || !config?.sound || !settings?.sound.enabled) return
    if (lastNew.dir === 'in' && lastNew.status === 'new') playChime(settings.sound.volume)
  }, [lastNew]) // только на новую сделку, не на смену настроек

  if (!ready || !settings) return <div className="ui-empty">{t('deals.loading')}</div>

  return (
    <div className="dl">
      <div className="ui-tabs dl-tabs" role="tablist">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className="ui-tab"
            role="tab"
            aria-selected={page === p.id}
            onClick={() => setPage(p.id)}
          >
            <Ico name={p.icon} />
            {t(`deals.page.${p.id}`)}
            {p.id === 'history' && total > 0 && <span className="ui-count">{total}</span>}
          </button>
        ))}
        <span className="dl-grow" />
        <Switch on={enabled} onChange={(v) => void patchSettings({ deals: { enabled: v } })}>
          {t('deals.enabled')}
        </Switch>
        <Switch on={!simple} onChange={(v) => void patchSettings({ ui: { simpleMode: !v } })}>
          {t('deals.expert')}
        </Switch>
      </div>
      {!enabled && (
        <div className="ui-banner">
          <Ico name="pause" />
          <span>
            <Rich text={t('deals.off.banner')} />
          </span>
          <span />
        </div>
      )}
      {enabled && page === 'history' && log && !log.connected && (
        <div className="ui-banner ui-banner--info">
          <Ico name="info" />
          <span>
            <Rich text={t('deals.log.banner')} />
          </span>
          <span />
        </div>
      )}
      <div className="dl-body ui-scroll">
        {page === 'history' && <HistoryPage />}
        {page === 'replies' && <RepliesPage />}
        {page === 'stash' && <StashPage />}
        {page === 'blacklist' && <BlacklistPage />}
      </div>
    </div>
  )
}
