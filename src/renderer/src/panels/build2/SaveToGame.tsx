import { useEffect, useId, useRef, useState } from 'react'
import type { Build2Dir, Build2SaveResult, Build2Summary, BuildHintLang } from '@shared/types/build2'
import type { GameLang } from '@shared/types/settings'
import { useT } from '../../i18n'
import { BIco } from '../build/ui'
import { saveErrorText } from './errors'

// «Сохранить билд в игру» (S66; решение пользователя 31.10): файл `.build` в папку игрового планировщика PoE 2.
// Поток: кнопка → main отвечает, куда запишет и есть ли такой файл (build:twoSave без confirm) → диалог с путём →
// «Сохранить» / «Заменить» / «Сохранить копией» → запись в main. Содержимое файла собирает main из своего билда,
// окно передаёт только id, название и язык подсказок; свободное имя копии («Название (N)», после обрезки длинного
// имени) подбирает тоже main. Ниже — «Как выбрать в игре» (2 шага).

/** name — название в игре из ответа main (у копии — с «(N)»); copy — повторить запрос с copy при записи */
type Ask = { dir: Build2Dir; fileName: string; exists: boolean; name: string; copy: boolean }
type SaveFail = Extract<Build2SaveResult, { ok: false }>

export function SaveToGame({ build, gameLang, expert }: { build: Build2Summary; gameLang: GameLang; expert: boolean }) {
  const t = useT()
  const id = useId()
  const [name, setName] = useState(build.defaultName[gameLang === 'ru' ? 'ru' : 'en'])
  const [lang, setLang] = useState<BuildHintLang>(gameLang === 'ru' ? 'ru' : 'en')
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [done, setDone] = useState<{ fileName: string; name: string } | null>(null)
  const [error, setError] = useState<SaveFail | null>(null)
  const api = window.overlayApi.build

  /** Спросить main, куда запишем; «копия» — main подберёт свободное «Название (N)» (нет — ошибка «no-free-name»). */
  const prepare = async (copy: boolean): Promise<void> => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await api.poe2Save({ id: build.id, name, lang, ...(copy ? { copy: true } : {}) })
      if (res.ok) return // без confirm main не пишет — сюда не попадаем
      if (res.error === 'confirm') {
        setAsk({ dir: res.dir, fileName: res.fileName, exists: res.exists, name: res.name, copy })
      } else {
        setAsk(null)
        setError(res)
      }
    } finally {
      setBusy(false)
    }
  }

  const write = async (overwrite: boolean): Promise<void> => {
    if (!ask) return
    setBusy(true)
    try {
      const res = await api.poe2Save({
        id: build.id,
        name,
        lang,
        confirm: true,
        fileName: ask.fileName,
        overwrite,
        ...(ask.copy ? { copy: true } : {})
      })
      setAsk(null)
      // «changed» / «exists» — имя или папка поменялись между вопросом и записью: игрок нажмёт кнопку ещё раз
      if (res.ok) setDone({ fileName: res.fileName, name: res.name })
      else setError(res)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ui-box b2-box" aria-labelledby={`${id}-t`}>
      <h2 className="b2-h" id={`${id}-t`}>
        <BIco name="export" />
        {t('build2.save.title')}
      </h2>
      {!expert && <p className="b2-lead">{t('build2.save.what')}</p>}
      <div className="b2-save">
        <div className="ui-field b2-save__name">
          <label className="ui-field__label" htmlFor={`${id}-n`}>
            {t('build2.save.name')}
          </label>
          <input id={`${id}-n`} className="ui-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ui-field">
          <span className="ui-field__label">{t('build2.save.lang')}</span>
          <span className="ui-seg" role="group" aria-label={t('build2.save.lang')}>
            {(['ru', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
                {t(`build2.save.lang.${l}`)}
              </button>
            ))}
          </span>
        </div>
        <button type="button" className="ui-btn ui-btn--primary b2-save__btn" disabled={busy || !name.trim()} onClick={() => void prepare(false)}>
          <BIco name={busy ? 'refresh' : 'export'} />
          {busy && !ask ? t('build2.save.checking') : t('build2.save.btn')}
        </button>
      </div>

      {error && (
        <div className="ui-banner ui-banner--bad b2-banner" role="alert">
          <BIco name="warn" />
          <span>{saveErrorText(error, t)}</span>
          <span />
        </div>
      )}
      {done && (
        <div className="ui-banner ui-banner--info b2-banner" role="status">
          <BIco name="check" />
          <span>
            <b>{t('build2.done', { file: done.fileName })}</b> {t('build2.done.d')}
          </span>
          <span />
        </div>
      )}

      <div className="b2-how">
        <div className="ui-label">{t('build2.how.title')}</div>
        <ol className="b2-steps">
          <li>{t('build2.how.1')}</li>
          <li>{t('build2.how.2', { name: done?.name ?? name })}</li>
        </ol>
      </div>

      {ask && <ConfirmDialog ask={ask} busy={busy} onCancel={() => setAsk(null)} onSave={(o) => void write(o)} onCopy={() => void prepare(true)} />}
    </section>
  )
}

function ConfirmDialog({ ask, busy, onCancel, onSave, onCopy }: {
  ask: Ask
  busy: boolean
  onCancel: () => void
  onSave: (overwrite: boolean) => void
  onCopy: () => void
}) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('.ui-dialog__foot .ui-btn--primary')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus?.()
    }
  }, [])
  return (
    <div className="ui-dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div ref={box} className="ui-dialog bd-dialog b2-dlg" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-busy={busy || undefined}>
        <div className="ui-dialog__head">
          <h3 className="ui-dialog__title" id={`${id}-t`}>
            {t('build2.dlg.title')}
          </h3>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('build2.dlg.cancel')} disabled={busy} onClick={onCancel}>
            <BIco name="close" />
          </button>
        </div>
        <div className="ui-dialog__body b2-dlg__body">
          <div className="b2-path">
            <span className="ui-label">{t('build2.dlg.path')}</span>
            <code className="ui-code b2-code">{ask.dir.path}</code>
            <span className="ui-label">{t('build2.dlg.file')}</span>
            <code className="ui-code b2-code">{ask.fileName}</code>
          </div>
          {ask.exists && (
            <div className="ui-banner b2-banner" role="alert">
              <BIco name="warn" />
              <span>{t('build2.dlg.exists')}</span>
              <span />
            </div>
          )}
          <p className="b2-muted b2-dlg__local">
            <BIco name="lock" size="sm" /> {t('build2.dlg.local')}
          </p>
        </div>
        <div className="ui-dialog__foot">
          <button type="button" className="ui-btn ui-btn--ghost" disabled={busy} onClick={onCancel}>
            {t('build2.dlg.cancel')}
          </button>
          <span className="grow" />
          {ask.exists ? (
            <>
              <button type="button" className="ui-btn ui-btn--danger" disabled={busy} onClick={() => onSave(true)}>
                {t('build2.dlg.replace')}
              </button>
              <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={onCopy}>
                {t('build2.dlg.copy')}
              </button>
            </>
          ) : (
            <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => onSave(false)}>
              {t('build2.dlg.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
