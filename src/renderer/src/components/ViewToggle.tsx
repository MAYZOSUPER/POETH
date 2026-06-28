import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

export function ViewToggle() {
  const viewMode = useAppStore((s) => s.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const t = useT()
  return (
    <div className="view-toggle">
      <button
        className={viewMode === 'whatsnext' ? 'on' : ''}
        onClick={() => setViewMode('whatsnext')}
      >
        {t('vt.whatsnext')}
      </button>
      <button
        className={viewMode === 'checklist' ? 'on' : ''}
        onClick={() => setViewMode('checklist')}
      >
        {t('vt.checklist')}
      </button>
    </div>
  )
}
