import { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { Toolbar } from './panels/Toolbar'
import { ProfileBar } from './panels/ProfileBar'
import { ActTabs } from './panels/ActTabs'
import { LayoutViewerPanel } from './panels/LayoutViewerPanel'
import { GemHintsPanel } from './panels/GemHintsPanel'
import { QuestChecklistPanel } from './panels/QuestChecklistPanel'
import { SettingsPanel } from './panels/SettingsPanel'

export default function App() {
  const ready = useAppStore((s) => s.ready)
  const init = useAppStore((s) => s.init)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="app">
      <Toolbar showSettings={showSettings} onToggleSettings={() => setShowSettings((s) => !s)} />
      {!ready ? (
        <div className="loading">Загрузка…</div>
      ) : (
        <>
          <ProfileBar />
          <ActTabs />
          <div className="scroll">
            {showSettings ? (
              <SettingsPanel />
            ) : (
              <>
                <LayoutViewerPanel />
                <GemHintsPanel />
                <QuestChecklistPanel />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
