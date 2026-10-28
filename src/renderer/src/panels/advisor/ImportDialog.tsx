import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AdvisorImportMode, AdvisorImportNote, AdvisorImportPreview, AdvisorStrategy } from '@shared/types'
import type { FarmState } from '@shared/types/farm'
import { useT } from '../../i18n'
import { useAdvisorStore } from '../../store/useAdvisorStore'
import { AIco, Dialog } from './ui'
import { StrategyCard } from './StrategyCard'
import { DEFAULT_ADVISOR_VIEW, buildRows, itemNs, tx } from './view'

// «Импорт» (S17, макет — 7 состояний): вставить код или ссылку → main раскрывает и проверяет (строгий валидатор)
// → предпросмотр «как будет в списке» и замечания простыми словами → «Добавить» только по кнопке.
// «Уже есть»: та же — «Открыть её»; своя с тем же id — «Заменить мою» или «Добавить копией»; наша — только копией.

type NameOf = (l: { name: string; ns: ReturnType<typeof itemNs> }) => string

/** Состояние окна по ответу main. */
export type ImportView = 'empty' | 'loading' | 'ok' | 'warn' | 'dup' | 'notcode' | 'cut' | 'newer' | 'bad'

export function importView(text: string, p: AdvisorImportPreview | null): ImportView {
  if (!text.trim()) return 'empty'
  if (!p) return 'loading'
  if (!p.ok) return p.error === 'notcode' || p.error === 'empty' ? 'notcode' : p.error === 'broken' ? 'cut' : p.error === 'newer' ? 'newer' : 'bad'
  if (p.match !== 'new') return 'dup'
  return p.notes.length ? 'warn' : 'ok'
}

function noteText(n: AdvisorImportNote, t: ReturnType<typeof useT>, nameOf: NameOf): string {
  switch (n.kind) {
    case 'noPrice':
      return t('advisor.imp.note.noPrice', { name: nameOf({ name: n.ref, ns: 'ITEM' }) })
    case 'lang':
      return t(`advisor.imp.note.lang.${n.lang}`)
    case 'link':
      return t('advisor.imp.note.link', { host: n.host })
    case 'outdated':
      return t('advisor.imp.note.outdated', { patch: n.patch })
  }
}

export function ImportDialog(props: {
  initial: string
  lang: string
  expert: boolean
  farm: FarmState | null
  currentPatch: string | null
  nameOf: NameOf
}) {
  const { initial, lang, expert, farm, currentPatch, nameOf } = props
  const t = useT()
  const close = useAdvisorStore((s) => s.closeDialog)
  const reveal = useAdvisorStore((s) => s.reveal)
  const setView = useAdvisorStore((s) => s.setView)
  const [text, setText] = useState(initial)
  const [preview, setPreview] = useState<AdvisorImportPreview | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pasteHint, setPasteHint] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  // код раскрывает main (не чаще раза в 250 мс при вводе); ответ на устаревший текст отбрасываем
  useEffect(() => {
    setPreview(null)
    setError(null)
    if (!text.trim()) return
    let alive = true
    const id = setTimeout(() => {
      void window.overlayApi.advisor.decode(text).then((p) => alive && setPreview(p))
    }, 250)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [text])

  const st = importView(text, preview)
  const row = useMemo(
    () => (preview?.ok ? (buildRows([preview.view], farm, DEFAULT_ADVISOR_VIEW)[0] ?? null) : null),
    [preview, farm]
  )

  const paste = (): void => {
    navigator.clipboard
      .readText()
      .then((s) => setText(s))
      .catch(() => {
        setPasteHint(true)
        area.current?.focus()
      })
  }
  const add = (mode: AdvisorImportMode): void => {
    if (!preview?.ok) return
    setBusy(true)
    void window.overlayApi.advisor
      .import(preview.code, mode)
      .then((r) => {
        if (r.ok) {
          setView({ src: 'all' })
          reveal(r.id)
        } else setError(t(`advisor.imp.err.${r.error === 'exists' ? 'exists' : 'failed'}`))
      })
      .finally(() => setBusy(false))
  }

  const existing = preview?.ok ? preview.existing : null
  const name = (s: { name: AdvisorStrategy['name'] }): string => tx(s.name, lang)
  const ownConflict = preview?.ok && preview.match === 'conflict' && existing && (existing.kind === 'mine' || existing.kind === 'imported')

  let banner: ReactNode = null
  if (st === 'ok' && preview?.ok) {
    const s = preview.view.strategy
    banner = (
      <span className="ad-ok">
        <AIco name="check" />
        {t('advisor.imp.ok', { name: name(s), author: s.source.author ?? t('advisor.by.noAuthor'), patch: s.patch })}
      </span>
    )
  } else if (st === 'warn' && preview?.ok) {
    banner = (
      <div className="ui-banner ad-warn" role="note">
        <AIco name="warn" />
        <span>
          <b>{t('advisor.imp.warn')}</b>
          <ul className="ad-issues">
            {preview.notes.map((n, i) => (
              <li key={i}>{noteText(n, t, nameOf)}</li>
            ))}
          </ul>
        </span>
        <span />
      </div>
    )
  } else if (st === 'dup' && existing) {
    banner = (
      <div className="ui-banner ui-banner--info ad-banner" role="note">
        <AIco name="info" />
        <span>
          <b>{t('advisor.imp.dup', { name: name(existing), kind: t(`advisor.src.tag.${existing.kind}`) })}</b>{' '}
          {preview?.ok && preview.match === 'same'
            ? t('advisor.imp.dup.same')
            : ownConflict
              ? t('advisor.imp.dup.own')
              : t('advisor.imp.dup.builtin')}
        </span>
        <span />
      </div>
    )
  } else if (st === 'notcode') {
    banner = (
      <div className="ui-banner ui-banner--bad ad-banner" role="alert">
        <AIco name="warn" />
        <span>
          <b>{t('advisor.imp.notcode')}</b> {t('advisor.imp.notcode.text')}
        </span>
        <span />
      </div>
    )
  } else if (st === 'cut') {
    banner = (
      <div className="ui-banner ui-banner--bad ad-banner" role="alert">
        <AIco name="warn" />
        <span>
          <b>{t('advisor.imp.cut')}</b> {t('advisor.imp.cut.text')}
        </span>
        <span />
      </div>
    )
  } else if (st === 'newer') {
    banner = (
      <div className="ui-banner ad-warn" role="note">
        <AIco name="info" />
        <span>
          <b>{t('advisor.imp.newer')}</b> {t('advisor.imp.newer.text')}
        </span>
        <span />
      </div>
    )
  } else if (st === 'bad' && preview && !preview.ok) {
    banner = (
      <div className="ui-banner ui-banner--bad ad-banner" role="alert">
        <AIco name="warn" />
        <span>
          <b>{t(`advisor.imp.${preview.error === 'toolarge' ? 'toolarge' : 'invalid'}`)}</b>{' '}
          {preview.error === 'toolarge' ? t('advisor.imp.toolarge.text') : t('advisor.imp.invalid.text')}
          {expert && preview.detail && <span className="ad-faint"> ({preview.detail})</span>}
        </span>
        <span />
      </div>
    )
  }

  const canAdd = st === 'ok' || st === 'warn'
  return (
    <Dialog
      title={t('advisor.imp.title')}
      onClose={close}
      wide
      foot={
        <>
          <span className="ad-xs ad-faint ad-inline">
            <AIco name="shield" size="sm" />
            {t('advisor.imp.foot')}
          </span>
          <span className="grow" />
          <button type="button" className="ui-btn ui-btn--ghost" onClick={close}>
            {t('advisor.cancel')}
          </button>
          {st === 'dup' && preview?.ok && preview.match === 'same' && existing ? (
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => (setView({ src: 'all' }), reveal(existing.id))}>
              {t('advisor.imp.open')}
            </button>
          ) : st === 'dup' ? (
            <>
              <button type="button" className={`ui-btn${ownConflict ? '' : ' ui-btn--primary'}`} disabled={busy} onClick={() => add('copy')}>
                {t('advisor.imp.copy')}
              </button>
              {ownConflict && (
                <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => add('replace')}>
                  {t('advisor.imp.replace')}
                </button>
              )}
            </>
          ) : (
            <button type="button" className="ui-btn ui-btn--primary" disabled={!canAdd || busy} onClick={() => add('add')}>
              <AIco name="plus" />
              {t(st === 'warn' ? 'advisor.imp.add.warn' : 'advisor.imp.add')}
            </button>
          )}
        </>
      }
    >
      {st === 'empty' && <img className="ad-empty-img ad-empty-img--sm" src="poeth://brand/empty-route.svg" alt="" />}
      <div className="ui-field">
        <div className="ad-flabel">
          <span className="ui-field__label">{t('advisor.imp.field')}</span>
          <span className="grow" />
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={paste}>
            <AIco name="copy" size="sm" />
            {t('advisor.imp.paste')}
          </button>
        </div>
        <textarea
          ref={area}
          className="ui-input ad-ta ad-paste"
          aria-invalid={st === 'notcode' || st === 'cut' || st === 'bad'}
          rows={3}
          spellCheck={false}
          value={text}
          placeholder={t('advisor.imp.ph')}
          onChange={(e) => setText(e.target.value)}
        />
        {st === 'empty' && <span className="ui-field__help">{pasteHint ? t('advisor.imp.pasteHint') : t('advisor.imp.help')}</span>}
        {st === 'loading' && <span className="ui-field__help">{t('advisor.imp.loading')}</span>}
      </div>
      {banner}
      {error && <span className="ui-field__error">{error}</span>}
      {row && (
        <>
          <span className="ui-label">{t('advisor.imp.preview')}</span>
          <StrategyCard
            row={row}
            lang={lang}
            expert={expert}
            open={open}
            onToggle={() => setOpen(!open)}
            preview
            farm={farm}
            glossary={{}}
            currentPatch={currentPatch}
            nameOf={nameOf}
          />
          {st !== 'dup' && <p className="ad-xs ad-faint">{t('advisor.imp.preview.note')}</p>}
        </>
      )}
    </Dialog>
  )
}
