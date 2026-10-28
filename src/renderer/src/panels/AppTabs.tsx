import { useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { tabsFor, type TabDef } from '../tabs'

/**
 * Как строка вкладок умещается в ширину окна (S19), от просторного к тесному:
 * full — иконка и подпись; compact — то же плотнее; icons — подпись только у открытой вкладки,
 * у остальных иконка с названием в title/aria-label; bare — одни иконки. Строка никогда не шире окна.
 */
type Fit = 'full' | 'compact' | 'icons' | 'bare'
/** режимы, ширину которых меряем невидимыми копиями строки; bare — запасной, когда не влезло ничего */
const MEASURED: Fit[] = ['full', 'compact', 'icons']

/** Top-level tab strip (depends on the running game), shown under the toolbar. */
export function AppTabs() {
  const appTab = useAppStore((s) => s.appTab)
  const setAppTab = useAppStore((s) => s.setAppTab)
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const t = useT()
  const tabs = tabsFor(game)

  const stripRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<Fit>('full')

  // Ширины копий не зависят от выбранного режима, поэтому выбор не «прыгает» на границе.
  // Копии меняют ширину при смене языка, игры, открытой вкладки и после загрузки шрифта — их тоже слушаем.
  useLayoutEffect(() => {
    const strip = stripRef.current
    const ruler = rulerRef.current
    if (!strip || !ruler) return
    const rows = Array.from(ruler.children) as HTMLElement[]
    const pick = (): void => {
      const avail = strip.clientWidth
      const i = rows.findIndex((row) => row.offsetWidth <= avail)
      setFit(i < 0 ? 'bare' : MEASURED[i])
    }
    pick()
    const ro = new ResizeObserver(pick)
    ro.observe(strip)
    rows.forEach((row) => ro.observe(row))
    return () => ro.disconnect()
  }, [])

  const tab = (def: TabDef, mode: Fit, live: boolean) => {
    const active = def.id === appTab
    const label = t(def.key)
    const named = mode === 'full' || mode === 'compact' || (mode === 'icons' && active)
    return (
      <button
        key={def.id}
        type="button"
        className={`app-tab ${active ? 'active' : ''}`}
        title={named ? undefined : label}
        aria-label={named ? undefined : label}
        aria-current={active ? 'page' : undefined}
        tabIndex={live ? undefined : -1}
        onClick={live ? () => setAppTab(def.id) : undefined}
      >
        <span className="app-tab-icon" aria-hidden="true">
          {def.icon}
        </span>
        {named && <span className="app-tab-label">{label}</span>}
      </button>
    )
  }

  return (
    <>
      <div className="app-tabs" data-fit={fit} ref={stripRef}>
        {tabs.map((def) => tab(def, fit, true))}
      </div>
      <div className="app-tabs-ruler" ref={rulerRef} aria-hidden="true">
        {MEASURED.map((mode) => (
          <div key={mode} className="app-tabs" data-fit={mode}>
            {tabs.map((def) => tab(def, mode, false))}
          </div>
        ))}
      </div>
    </>
  )
}
