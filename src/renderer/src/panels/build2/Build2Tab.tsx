import { useCallback, useEffect, useState } from 'react'
import { sameTreeVersion } from '@shared/poe2/build/view'
import type { Build2ImportResult, Build2State } from '@shared/types/build2'
import { useGameLang } from '../../gameLang'
import { useLang, useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { BIco } from '../build/ui'
import { ImportBox } from './ImportBox'
import { InstillBox } from './InstillBox'
import { SaveToGame } from './SaveToGame'
import { StagesPreview } from './StagesPreview'
import './build2.css'

// Экран «Билд» для PoE 2 (S66, облегчённый, черновик на ui-* до макета дизайнера): импорт PoB2 → предпросмотр
// этапов → «Сохранить в игру» (файл `.build` в папку игрового планировщика) → «Как выбрать в игре» → «Вложение».
// Ветвление по игре — одно место, BuildTab.tsx; вкладка PoE 1 не меняется. Разбор, данные и запись — в main.

type ImportFail = Extract<Build2ImportResult, { ok: false }>

export function Build2Tab() {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const expert = !useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const [state, setState] = useState<Build2State | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ImportFail | null>(null)
  const api = window.overlayApi.build

  useEffect(() => {
    let alive = true
    void api.poe2State().then((s) => alive && setState(s))
    return () => {
      alive = false
    }
  }, [api])

  const run = useCallback(async (p: Promise<Build2ImportResult>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await p
      if (res.ok) setState(res.state)
      else setError(res)
    } finally {
      setBusy(false)
    }
  }, [])

  const active = state?.active ?? null
  const fmtName = (n: { ru: string; en: string }): string => (gameLang === 'ru' ? n.ru : n.en)

  return (
    <div className="bd-host" role="region" aria-label={t('build2.title')} aria-busy={!state || undefined}>
      <div className="bd-scroll ui-scroll b2">
        {!state ? (
          <div className="bd-empty">
            <span className="ui-skeleton" style={{ width: 220, height: 22 }} />
            <span className="ui-skeleton" style={{ width: '70%' }} />
          </div>
        ) : state.dataError ? (
          <div className="ui-banner ui-banner--bad b2-banner" role="alert">
            <BIco name="warn" />
            <span>
              <b>{t('build2.data.err')}</b> {t('build2.data.err.d')}
            </span>
            <span />
          </div>
        ) : !active ? (
          <>
            <ImportBox busy={busy} error={error} expert={expert} onImport={(text) => void run(api.poe2Import(text))} />
            {state.recent.length > 0 && (
              <section className="ui-box b2-box">
                <div className="ui-label">{t('build2.recent')}</div>
                <ul className="b2-recent">
                  {state.recent.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="ui-btn ui-btn--ghost b2-recent__open" onClick={() => void api.poe2Open(r.id).then(setState)}>
                        <BIco name="passive" size="sm" />
                        {fmtName(r.name)}
                      </button>
                      <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('build2.remove')} title={t('build2.remove')} onClick={() => void api.poe2Remove(r.id).then(setState)}>
                        <BIco name="trash" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <InstillBox author={undefined} gameLang={gameLang} expert={expert} />
          </>
        ) : (
          <>
            <section className="ui-box b2-box b2-head">
              <div className="b2-head__name">
                <b>{fmtName(active.defaultName)}</b>
                <span className="b2-muted">
                  {[
                    active.ascendancy ? (gameLang === 'ru' && active.ascendancy.ru ? active.ascendancy.ru : active.ascendancy.en) : active.className,
                    t('build2.lv', { n: active.level }),
                    active.source.kind === 'link' ? t('build2.src.link') : t('build2.src.code')
                  ].join(' · ')}
                </span>
              </div>
              <div className="b2-head__acts">
                {active.source.kind === 'link' && (
                  <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={busy} onClick={() => void run(api.poe2Reload(active.id))}>
                    <BIco name="refresh" size="sm" />
                    {t('build2.reload')}
                  </button>
                )}
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => void api.poe2Open(null).then(setState)}>
                  <BIco name="import" size="sm" />
                  {t('build2.new')}
                </button>
              </div>
            </section>
            {error && (
              <div className="ui-banner ui-banner--bad b2-banner" role="alert">
                <BIco name="warn" />
                <span>{t('build2.err.fetch')}</span>
                <span />
              </div>
            )}
            {!sameTreeVersion(active.treeVersion.pob, active.treeVersion.data) && (
              <div className="ui-hint b2-hint">
                <BIco name="info" />
                <span>{t('build2.tree.old', { pob: active.treeVersion.pob.replace(/_/g, '.'), data: active.treeVersion.data })}</span>
              </div>
            )}
            <StagesPreview build={active} gameLang={gameLang} expert={expert} />
            <SaveToGame key={active.id} build={active} gameLang={gameLang} expert={expert} />
            <InstillBox author={active.instill} gameLang={gameLang} expert={expert} />
          </>
        )}
      </div>
    </div>
  )
}
