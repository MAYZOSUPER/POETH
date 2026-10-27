import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import './updates.css'

// Блок настроек «Запуск и обновления» (S10a): автозапуск с Windows, «Запускать свёрнутым»,
// «Проверять обновления», ручная проверка и версия приложения.

export function UpdatesSettings() {
  const settings = useAppStore((s) => s.settings)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const t = useT()
  const [st, setSt] = useState<UpdateState | null>(null)

  useEffect(() => {
    void window.overlayApi.updates.state().then(setSt)
    return window.overlayApi.onUpdateState(setSt)
  }, [])

  const startup = settings?.startup
  const status =
    st?.phase === 'checking'
      ? t('upd.set.state.checking')
      : st?.phase === 'none'
        ? t('upd.set.state.none')
        : st?.phase === 'available' || st?.phase === 'downloading' || st?.phase === 'downloaded'
          ? t('upd.set.state.available', { version: st.version ?? '' })
          : st?.phase === 'error'
            ? t('upd.set.state.error', { error: st.error ?? '' })
            : ''

  return (
    <div className="block">
      <div className="block-title">{t('upd.set.title')}</div>
      <label className="row-toggle">
        <input
          type="checkbox"
          checked={startup?.withWindows ?? false}
          onChange={(e) => void patchSettings({ startup: { withWindows: e.target.checked } })}
        />
        {t('upd.set.withWindows')}
      </label>
      <label className="row-toggle">
        <input
          type="checkbox"
          checked={startup?.minimized ?? true}
          onChange={(e) => void patchSettings({ startup: { minimized: e.target.checked } })}
        />
        {t('upd.set.minimized')}
      </label>
      <div className="small muted">{t('upd.set.minimized.hint')}</div>
      <label className="row-toggle">
        <input
          type="checkbox"
          checked={settings?.updates?.check ?? true}
          onChange={(e) => void patchSettings({ updates: { check: e.target.checked } })}
        />
        {t('upd.set.check')}
      </label>
      <div className="small muted">{t('upd.set.check.hint')}</div>
      <div className="upd-set__row">
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          disabled={st?.phase === 'checking' || st?.phase === 'downloading'}
          onClick={() => void window.overlayApi.updates.check().then(setSt)}
        >
          {t('upd.set.checkNow')}
        </button>
        <span className="small muted">
          {t('upd.set.version', { version: st?.current ?? '' })}
          {status ? ` · ${status}` : ''}
        </span>
      </div>
    </div>
  )
}
