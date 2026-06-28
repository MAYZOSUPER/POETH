import { useAppStore } from '../store/useAppStore'

export function ViewToggle() {
  const viewMode = useAppStore((s) => s.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)
  return (
    <div className="view-toggle">
      <button
        className={viewMode === 'whatsnext' ? 'on' : ''}
        onClick={() => setViewMode('whatsnext')}
      >
        Что дальше?
      </button>
      <button
        className={viewMode === 'checklist' ? 'on' : ''}
        onClick={() => setViewMode('checklist')}
      >
        Чек-лист
      </button>
    </div>
  )
}
