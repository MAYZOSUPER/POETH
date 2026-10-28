import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { tabsFor } from '../tabs'

/**
 * Top-level tab strip (depends on the running game), shown under the toolbar.
 * На узком окне строка прокручивается сама (колесо мыши тоже листает её вбок), страницу не раздувает (S19).
 * Навигацию переделывает дизайнер отдельным этапом — здесь только надёжный минимум.
 */
export function AppTabs() {
  const appTab = useAppStore((s) => s.appTab)
  const setAppTab = useAppStore((s) => s.setAppTab)
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const t = useT()
  const stripRef = useRef<HTMLDivElement>(null)

  // открытая вкладка всегда в видимой части строки — после переключения и когда окно сужают
  useEffect(() => {
    const reveal = (): void =>
      stripRef.current?.querySelector('.app-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    reveal()
    window.addEventListener('resize', reveal)
    return () => window.removeEventListener('resize', reveal)
  }, [appTab, game])

  return (
    <div
      className="app-tabs"
      ref={stripRef}
      onWheel={(e) => {
        if (e.deltaX === 0) e.currentTarget.scrollLeft += e.deltaY
      }}
    >
      {tabsFor(game).map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`app-tab ${tab.id === appTab ? 'active' : ''}`}
          aria-current={tab.id === appTab ? 'page' : undefined}
          onClick={() => setAppTab(tab.id)}
        >
          <span className="app-tab-icon">{tab.icon}</span>
          {t(tab.key)}
        </button>
      ))}
    </div>
  )
}
