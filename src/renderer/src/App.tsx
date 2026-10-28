import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { useShellStore } from './store/useShellStore'
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
import { LevelingTab } from './panels/leveling/LevelingTab'
import { WealthTab } from './panels/WealthTab'
import { FlipTab } from './panels/FlipTab'
import { AdvisorTab } from './panels/AdvisorTab'
import { ViewToggle } from './components/ViewToggle'
import { Wizard } from './panels/onboarding/Wizard'
import { AboutPanel } from './panels/onboarding/AboutPanel'

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
    case 'wealth':
      return <WealthTab />
    case 'flip':
      return <FlipTab />
    case 'advisor':
      return <AdvisorTab />
    default:
      return null
  }
}

export default function App() {
  const ready = useAppStore((s) => s.ready)
  const init = useAppStore((s) => s.init)
  const appTab = useAppStore((s) => s.appTab)
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const opacity = useAppStore((s) => s.settings?.opacity ?? 1)
  const firstRunDone = useAppStore((s) => s.settings?.startup.firstRunDone ?? true)
  // S9: служебные страницы (настройки, «О программе») и мастер первого запуска
  const page = useShellStore((s) => s.page)
  const setPage = useShellStore((s) => s.setPage)
  const wizard = useShellStore((s) => s.wizard)
  const closeWizard = useShellStore((s) => s.closeWizard)
  const showSettings = page === 'settings'

  useEffect(() => {
    void init()
  }, [init])

  // трей (S10a) и др.: main просит открыть «О программе» / настройки / мастер
  useEffect(() => window.overlayApi.onShowPage((p) => useShellStore.getState().show(p)), [])

  return (
    <div className="app" style={{ opacity }}>
      <Toolbar showSettings={page !== null} onToggleSettings={() => setPage(page ? null : 'settings')} />
      {!ready ? (
        // язык интерфейса ещё неизвестен (настройки грузятся) — без текста
        <div className="loading" aria-busy="true">
          <span className="ui-skeleton" style={{ width: 180, margin: '0 auto' }} />
        </div>
      ) : (
        <>
          <AppTabs />
          {page === 'about' ? (
            <div className="body">
              <AboutPanel />
            </div>
          ) : appTab === 'campaign' && game === 'poe1' && !showSettings ? (
            <div className="body">
              <LevelingTab />
            </div>
          ) : appTab === 'campaign' && game !== 'poe1' ? (
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
          {(!firstRunDone || wizard) && <Wizard onClose={closeWizard} />}
        </>
      )}
    </div>
  )
}
