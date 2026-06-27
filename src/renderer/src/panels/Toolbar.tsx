import { useAppStore } from '../store/useAppStore'

interface Props {
  showSettings: boolean
  onToggleSettings: () => void
}

export function Toolbar({ showSettings, onToggleSettings }: Props) {
  const settings = useAppStore((s) => s.settings)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const opacity = settings?.opacity ?? 0.95
  const locked = settings?.locked ?? false

  return (
    <div className="toolbar">
      <div className="drag">⠿ PoE2 Quest Overlay</div>
      <div className="tools">
        <input
          className="opacity"
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={opacity}
          title="Прозрачность"
          onChange={(e) => {
            const v = Number(e.target.value)
            void patchSettings({ opacity: v })
            window.overlayApi.window.setOpacity(v)
          }}
        />
        <button
          className={`icon ${locked ? 'on' : ''}`}
          title="Блокировка: оверлей не перехватывает мышь (все клики идут в игру)"
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
