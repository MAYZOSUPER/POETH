import { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { Toolbar } from './panels/Toolbar'
import { ProfileBar } from './panels/ProfileBar'
import { ActTabs } from './panels/ActTabs'
import { ZoneBanner } from './panels/ZoneBanner'
import { GemHintsPanel } from './panels/GemHintsPanel'
import { QuestChecklistPanel } from './panels/QuestChecklistPanel'
import { WhatsNextPanel } from './panels/WhatsNextPanel'
import { RewardsSummary } from './panels/RewardsSummary'
import { SettingsPanel } from './panels/SettingsPanel'
import { RightPanel } from './panels/RightPanel'
import { ViewToggle } from './components/ViewToggle'

export default function App() {
  const ready = useAppStore((s) => s.ready)
  const init = useAppStore((s) => s.init)
  const viewMode = useAppStore((s) => s.viewMode)
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
        <div className="body">
          <div className="left">
            <ProfileBar />
            <ActTabs />
            <ZoneBanner />
            <div className="scroll">
              {showSettings ? (
                <SettingsPanel />
              ) : (
                <>
                  <ViewToggle />
                  <RewardsSummary />
                  {viewMode === 'whatsnext' ? (
                    <WhatsNextPanel />
                  ) : (
                    <>
                      <GemHintsPanel />
                      <QuestChecklistPanel />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <RightPanel />
        </div>
      )}
    </div>
  )
}
