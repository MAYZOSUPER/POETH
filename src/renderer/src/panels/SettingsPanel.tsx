import type { UiLang } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

export function SettingsPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const settings = useAppStore((s) => s.settings)
  const tailerStatus = useAppStore((s) => s.tailerStatus)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const tailerStart = useAppStore((s) => s.tailerStart)
  const tailerStop = useAppStore((s) => s.tailerStop)
  const tailerPickFile = useAppStore((s) => s.tailerPickFile)
  const t = useT()
  const meta = dataset?.meta

  return (
    <section className="panel settings">
      <div className="panel-head">
        <span>{t('set.title')}</span>
      </div>

      <div className="setting">
        <label>{t('set.lang')}</label>
        <select
          className="lang-select"
          value={settings?.uiLang ?? 'ru'}
          onChange={(e) => void patchSettings({ uiLang: e.target.value as UiLang })}
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="setting">
        <label>{t('set.nameLang')}</label>
        <select
          className="lang-select"
          value={settings?.nameLang ?? 'en'}
          onChange={(e) => void patchSettings({ nameLang: e.target.value as UiLang })}
        >
          <option value="en">English</option>
          <option value="ru">Русский</option>
        </select>
      </div>
      <div className="hint small muted">{t('set.nameLang.note')}</div>

      <div className="setting">
        <label>{t('set.opacity')}</label>
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={settings?.opacity ?? 0.95}
          onChange={(e) => void patchSettings({ opacity: Number(e.target.value) })}
        />
      </div>

      <label className="row-toggle">
        <input
          type="checkbox"
          checked={settings?.showInTaskbar ?? true}
          onChange={(e) => void patchSettings({ showInTaskbar: e.target.checked })}
        />
        {t('set.taskbar')}
      </label>

      <div className="hint small muted">{t('set.windowedHint')}</div>

      <div className="block">
        <div className="block-title">{t('set.hotkeys')}</div>
        <ul className="kv">
          <li>
            <span>{t('set.hk.toggle')}</span>
            <code>{settings?.hotkeys.toggleVisible}</code>
          </li>
          <li>
            <span>{t('set.hk.lock')}</span>
            <code>{settings?.hotkeys.toggleLock}</code>
          </li>
          <li>
            <span>{t('set.hk.prev')}</span>
            <code>{settings?.hotkeys.prevStep}</code>
          </li>
          <li>
            <span>{t('set.hk.next')}</span>
            <code>{settings?.hotkeys.nextStep}</code>
          </li>
        </ul>
      </div>

      <div className="block">
        <div className="block-title">{t('set.auto')}</div>
        <label className="row-toggle">
          <input
            type="checkbox"
            checked={settings?.tailerEnabled ?? false}
            onChange={(e) => void (e.target.checked ? tailerStart() : tailerStop())}
          />
          {t('set.auto.read')}
        </label>
        <div className="small muted">
          {tailerStatus?.running
            ? tailerStatus.found
              ? t('set.auto.found', { path: tailerStatus.logPath ?? '' })
              : t('set.auto.notfound')
            : t('set.auto.off')}
        </div>
        <button className="btn" onClick={() => void tailerPickFile()}>
          {t('set.auto.pick')}
        </button>
        <label className="row-toggle">
          <input
            type="checkbox"
            checked={settings?.autoAdvanceZone ?? true}
            onChange={(e) => void patchSettings({ autoAdvanceZone: e.target.checked })}
          />
          {t('set.auto.advance')}
        </label>
        <div className="small muted">{t('set.auto.note')}</div>
      </div>

      <div className="block">
        <div className="block-title">{t('set.data')}</div>
        <div className="small muted">{t('set.data.version', { label: meta?.gameVersionLabel ?? '' })}</div>
        <div className="small muted">
          {t('set.data.schema', { schema: meta?.schemaVersion ?? '', acts: meta?.actCount ?? 0 })}
        </div>
        <ul className="sources small muted">
          {meta?.sources.map((s, i) => (
            <li key={i}>
              {s.name} — {s.license}
            </li>
          ))}
        </ul>
      </div>

      <div className="disclaimer small muted">{t('set.disclaimer')}</div>
    </section>
  )
}
