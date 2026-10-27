import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { tabsFor } from '../tabs'

/** Top-level tab strip (depends on the running game), shown under the toolbar. */
export function AppTabs() {
  const appTab = useAppStore((s) => s.appTab)
  const setAppTab = useAppStore((s) => s.setAppTab)
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const t = useT()

  return (
    <div className="app-tabs">
      {tabsFor(game).map((tab) => (
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
