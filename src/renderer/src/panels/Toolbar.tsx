import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { CompassMark } from '../components/CompassMark'
import { BrandImg } from '../components/BrandImg'
import { GameSwitch } from '../components/GameSwitch'
import { GAMES } from '@shared/games'

interface Props {
  showSettings: boolean
  onToggleSettings: () => void
}

export function Toolbar({ showSettings, onToggleSettings }: Props) {
  const settings = useAppStore((s) => s.settings)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const tailerStatus = useAppStore((s) => s.tailerStatus)
  const tailerStart = useAppStore((s) => s.tailerStart)
  const tailerStop = useAppStore((s) => s.tailerStop)
  const t = useT()

  const locked = settings?.locked ?? false
  const hasCampaign = GAMES[settings?.game ?? 'poe1'].features.campaign
  const autoOn = tailerStatus?.running ?? false

  return (
    <div className="toolbar">
      <div className="brand drag">
        <span className="brand-mark">
          <BrandImg file="app_icon.png" className="brand-img" fallback={<CompassMark size={24} />} />
        </span>
        <span className="brand-title" title="POE Trade Helper">POETH</span>
        <GameSwitch />
      </div>
      <div className="tools">
        {hasCampaign && (
          <button
            className={`pill ${autoOn ? 'on' : ''}`}
            title={t('tb.auto.title')}
            onClick={() => void (autoOn ? tailerStop() : tailerStart())}
          >
            <span className="pill-knob" />
            <span className="pill-label">{t('tb.auto')}</span>
          </button>
        )}
        <button
          className={`icon ${locked ? 'on' : ''}`}
          title={t('tb.lock.title')}
          onClick={() => {
            const v = !locked
            void patchSettings({ locked: v })
            window.overlayApi.window.setLocked(v)
          }}
        >
          {locked ? '🔒' : '🔓'}
        </button>
        <button
          className={`icon ${showSettings ? 'on' : ''}`}
          title={t('tb.settings.title')}
          onClick={onToggleSettings}
        >
          ⚙
        </button>
        <span className="tb-sep" />
        <button className="icon" title={t('tb.min.title')} onClick={() => window.overlayApi.window.minimize()}>
          —
        </button>
        <button
          className="icon"
          title={t('tb.hide.title')}
          onClick={() => window.overlayApi.window.toggleVisible()}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
