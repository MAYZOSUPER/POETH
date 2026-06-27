import { useAppStore } from '../store/useAppStore'
import { CompassMark } from '../components/CompassMark'
import { BrandImg } from '../components/BrandImg'

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

  const locked = settings?.locked ?? false
  const autoOn = tailerStatus?.running ?? false

  return (
    <div className="toolbar">
      <div className="brand drag">
        <span className="brand-mark">
          <BrandImg file="app_icon.png" className="brand-img" fallback={<CompassMark size={24} />} />
        </span>
        <span className="brand-title">Act Compass</span>
      </div>
      <div className="tools">
        <button
          className={`pill ${autoOn ? 'on' : ''}`}
          title="Автоопределение зоны из лога игры (Client.txt)"
          onClick={() => void (autoOn ? tailerStop() : tailerStart())}
        >
          <span className="pill-knob" />
          <span className="pill-label">Авто</span>
        </button>
        <button
          className={`icon ${locked ? 'on' : ''}`}
          title="Сквозной режим: все клики идут в игру (Ctrl+Shift+L)"
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
          title="Настройки"
          onClick={onToggleSettings}
        >
          ⚙
        </button>
        <span className="tb-sep" />
        <button
          className="icon"
          title="Свернуть"
          onClick={() => window.overlayApi.window.minimize()}
        >
          —
        </button>
        <button
          className="icon"
          title="Скрыть оверлей (Ctrl+Shift+O чтобы вернуть)"
          onClick={() => window.overlayApi.window.toggleVisible()}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
