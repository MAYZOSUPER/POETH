import { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { Toolbar } from './panels/Toolbar'
import { AppTabs } from './panels/AppTabs'
import { ProfileBar } from './panels/ProfileBar'
import { ActTabs } from './panels/ActTabs'
import { ZoneBanner } from './panels/ZoneBanner'
import { GemHintsPanel } from './panels/GemHintsPanel'
import { QuestChecklistPanel } from './panels/QuestChecklistPanel'
import { WhatsNextPanel } from './panels/WhatsNextPanel'
import { RewardsSummary } from './panels/RewardsSummary'
import { AscendancyPanel } from './panels/AscendancyPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { RightPanel } from './panels/RightPanel'
import { PriceCheckTab } from './panels/PriceCheckTab'
import { Poe1PriceCheckTab } from './panels/Poe1PriceCheckTab'
import { LiveTab } from './panels/LiveTab'
import { RegexTab } from './panels/RegexTab'
import { DealsTab } from './panels/DealsTab'
import { ViewToggle } from './components/ViewToggle'

/** PoE2 campaign tracker (compass) — settings open inside its left column. */
function CampaignTab({ showSettings }: { showSettings: boolean }) {
  const viewMode = useAppStore((s) => s.viewMode)
  return (
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
              <AscendancyPanel />
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
  )
}

function TabBody() {
  const appTab = useAppStore((s) => s.appTab)
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  switch (appTab) {
    case 'priceCheck':
      return game === 'poe2' ? <PriceCheckTab /> : <Poe1PriceCheckTab />
    case 'live':
      return <LiveTab />
    case 'regex':
      return <RegexTab />
    case 'deals':
      return <DealsTab />
    default:
      return null
  }
}

export default function App() {
  const ready = useAppStore((s) => s.ready)
  const init = useAppStore((s) => s.init)
  const appTab = useAppStore((s) => s.appTab)
  const opacity = useAppStore((s) => s.settings?.opacity ?? 1)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="app" style={{ opacity }}>
      <Toolbar showSettings={showSettings} onToggleSettings={() => setShowSettings((s) => !s)} />
      {!ready ? (
        <div className="loading">Загрузка…</div>
      ) : (
        <>
          <AppTabs />
          {appTab === 'campaign' ? (
            <CampaignTab showSettings={showSettings} />
          ) : showSettings ? (
            <div className="body">
              <div className="page-scroll">
                <SettingsPanel />
              </div>
            </div>
          ) : (
            <div className="body">
              <TabBody />
            </div>
          )}
        </>
      )}
    </div>
  )
}
