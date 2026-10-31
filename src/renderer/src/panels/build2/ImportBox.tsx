import { useId, useState } from 'react'
import type { Build2ImportResult } from '@shared/types/build2'
import { useT } from '../../i18n'
import { BIco } from '../build/ui'
import { importErrorText } from './errors'

// Вставка кода PoB2 или ссылки (S66). Разбор и сеть — в main (build:twoImport), по ссылке — один запрос по нажатию.

export function ImportBox({ busy, error, expert, onImport }: {
  busy: boolean
  error: Extract<Build2ImportResult, { ok: false }> | null
  expert: boolean
  onImport: (text: string) => void
}) {
  const t = useT()
  const id = useId()
  const [text, setText] = useState('')
  const go = (): void => {
    if (text.trim() && !busy) onImport(text)
  }
  return (
    <section className="ui-box b2-box" aria-labelledby={`${id}-t`}>
      <h2 className="b2-h" id={`${id}-t`}>
        <BIco name="import" />
        {t('build2.title')}
      </h2>
      {!expert && <p className="b2-lead">{t('build2.lead')}</p>}
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={id}>
          {t('build2.paste.label')}
        </label>
        <div className="b2-paste">
          <input
            id={id}
            className="ui-input"
            value={text}
            placeholder={t('build2.paste.ph')}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
          <button type="button" className="ui-btn ui-btn--primary" disabled={!text.trim() || busy} onClick={go}>
            <BIco name={busy ? 'refresh' : 'import'} />
            {busy ? t('build2.paste.loading') : t('build2.paste.open')}
          </button>
        </div>
        {!expert && <p className="ui-field__help">{t('build2.paste.help')}</p>}
      </div>
      {error && (
        <div className="ui-banner ui-banner--bad b2-banner" role="alert">
          <BIco name="warn" />
          <span>{importErrorText(error, t)}</span>
          <span />
        </div>
      )}
    </section>
  )
}
