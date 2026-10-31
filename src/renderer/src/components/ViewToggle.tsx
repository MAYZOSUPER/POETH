import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { ShellIcon } from './ShellIcon'

/** «Что дальше / Чек-лист» компаса PoE 2 (ui-seg); в простом режиме — строка, чем они отличаются. */
export function ViewToggle() {
  const viewMode = useAppStore((s) => s.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const t = useT()
  return (
    <>
      <div className="ui-seg" role="group" aria-label={t('vt.label')}>
        <button type="button" aria-pressed={viewMode === 'whatsnext'} onClick={() => setViewMode('whatsnext')}>
          {t('vt.whatsnext')}
        </button>
        <button type="button" aria-pressed={viewMode === 'checklist'} onClick={() => setViewMode('checklist')}>
          {t('vt.checklist')}
        </button>
      </div>
      {simple && (
        <span className="ui-hint">
          <ShellIcon name="help" />
          <span>{t(viewMode === 'whatsnext' ? 'vt.whatsnext.help' : 'vt.checklist.help')}</span>
        </span>
      )}
    </>
  )
}
