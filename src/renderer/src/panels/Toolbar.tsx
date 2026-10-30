import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { CompassMark } from '../components/CompassMark'
import { BrandImg } from '../components/BrandImg'
import { GameSwitch } from '../components/GameSwitch'
import { ShellIcon } from '../components/ShellIcon'
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
  // подсказки с текущими сочетаниями: оба переназначаются в настройках (S37)
  const keyText = (a?: string): string =>
    (a ?? '')
      .split('+')
      .filter(Boolean)
      .map((k) => (k === 'Control' ? 'Ctrl' : k === 'Super' ? 'Win' : k))
      .join('+')
  const lockKey = keyText(settings?.hotkeys.toggleLock.accel)
  const hideKey = keyText(settings?.hotkeys.toggleCompanion.accel)
  const lockTitle = lockKey ? t('tb.lock.title', { key: lockKey }) : t('tb.lock.title.nokey')
  const hideTitle = hideKey ? t('tb.hide.title', { key: hideKey }) : t('tb.hide.title.nokey')
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
        {/* иконки спрайта, как на макете навигации (S20); состояние замка и настроек — aria-pressed и рамка .on */}
        <button
          type="button"
          className={`icon ${locked ? 'on' : ''}`}
          title={lockTitle}
          aria-label={lockTitle}
          aria-pressed={locked}
          onClick={() => {
            const v = !locked
            void patchSettings({ locked: v })
            window.overlayApi.window.setLocked(v)
          }}
        >
          <ShellIcon name="lock" />
        </button>
        <button
          type="button"
          className={`icon ${showSettings ? 'on' : ''}`}
          title={t('tb.settings.title')}
          aria-label={t('tb.settings.title')}
          aria-pressed={showSettings}
          onClick={onToggleSettings}
        >
          <ShellIcon name="gear" />
        </button>
        <span className="tb-sep" />
        {/* data-window-control: кнопки окна остаются доступными, когда открыт мастер первого запуска (Wizard.tsx) */}
        <button
          type="button"
          className="icon"
          data-window-control
          title={t('tb.min.title')}
          aria-label={t('tb.min.title')}
          onClick={() => window.overlayApi.window.minimize()}
        >
          <ShellIcon name="min" />
        </button>
        <button
          type="button"
          className="icon"
          data-window-control
          title={hideTitle}
          aria-label={hideTitle}
          onClick={() => window.overlayApi.window.toggleVisible()}
        >
          <ShellIcon name="close" />
        </button>
      </div>
    </div>
  )
}
