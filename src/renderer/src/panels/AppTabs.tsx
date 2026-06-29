import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import type { AppTab } from '@shared/types'

const TABS: { id: AppTab; key: string; icon: string }[] = [
  { id: 'campaign', key: 'app.campaign', icon: '🧭' },
  { id: 'priceCheck', key: 'app.priceCheck', icon: '💰' }
]

/** Top-level tab strip (campaign tracker vs price-check), shown under the toolbar. */
export function AppTabs() {
  const appTab = useAppStore((s) => s.appTab)
  const setAppTab = useAppStore((s) => s.setAppTab)
  const t = useT()

  return (
    <div className="app-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`app-tab ${tab.id === appTab ? 'active' : ''}`}
          onClick={() => setAppTab(tab.id)}
        >
          <span className="app-tab-icon">{tab.icon}</span>
          {t(tab.key)}
        </button>
      ))}
    </div>
  )
}
