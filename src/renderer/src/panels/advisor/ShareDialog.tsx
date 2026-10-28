import { useEffect, useState } from 'react'
import type { AdvisorShareInfo, AdvisorSubmitResult } from '@shared/types'
import { useT } from '../../i18n'
import { useAdvisorStore } from '../../store/useAdvisorStore'
import { AIco, CopyButton, Dialog } from './ui'
import { minutesText, tx } from './view'

// «Поделиться» (S17, макет): код POETH1 и ссылка на страницу сайта — одна и та же стратегия; ник (только у своей,
// запоминается); что попадает в код и что нет; «Отправить в каталог» — форма GitHub в браузере (открывает main).

export function ShareDialog({ id, lang, expert }: { id: string; lang: string; expert: boolean }) {
  const t = useT()
  const close = useAdvisorStore((s) => s.closeDialog)
  const state = useAdvisorStore((s) => s.state)
  const view = state?.views.find((v) => v.strategy.id === id)
  const s = view?.strategy
  const mine = s?.source.kind === 'mine'
  const savedNick = state?.nick ?? ''
  const [info, setInfo] = useState<AdvisorShareInfo | null>(null)
  const [nick, setNick] = useState(savedNick)
  const [submit, setSubmit] = useState<AdvisorSubmitResult | 'busy' | null>(null)

  // код своей зависит от ника — пересобираем после сохранения ника
  useEffect(() => {
    let alive = true
    void window.overlayApi.advisor.share(id).then((r) => alive && setInfo(r))
    return () => {
      alive = false
    }
  }, [id, savedNick])

  const saveNick = (): void => {
    if (nick.trim() !== savedNick) void window.overlayApi.advisor.setNick(nick).then(setNick)
  }
  const name = s ? tx(s.name, lang) : ''
  const yes = [
    t('advisor.share.in.texts'),
    t('advisor.share.in.items'),
    t('advisor.share.in.steps'),
    t('advisor.share.in.build'),
    s?.measured
      ? t('advisor.share.in.measured', { maps: s.measured.maps, hours: minutesText(s.measured.hours, lang) })
      : t('advisor.share.in.estimate'),
    mine ? t('advisor.share.in.nick') : t('advisor.share.in.author')
  ]
  const no = [t('advisor.share.out.account'), 'POESESSID', t('advisor.share.out.stash'), t('advisor.share.out.history')]

  return (
    <Dialog
      title={t('advisor.share.title', { name })}
      onClose={close}
      foot={
        <>
          <span className="ad-xs ad-faint ad-inline">
            <AIco name="shield" size="sm" />
            {t('advisor.share.foot')}
          </span>
          <span className="grow" />
          <button type="button" className="ui-btn" onClick={close}>
            {t('advisor.done')}
          </button>
        </>
      }
    >
      {!s ? (
        <p className="ad-muted">{t('advisor.share.gone')}</p>
      ) : (
        <>
          <div className="ui-field">
            <span className="ui-field__label">{t('advisor.share.code')}</span>
            <div className="ui-code">
              <p className="ui-code__text" tabIndex={0}>
                {info?.code ?? '…'}
              </p>
              <CopyButton text={info?.code ?? ''} label={t('advisor.share.copyCode')} primary />
            </div>
            <span className="ui-field__help">
              {t('advisor.share.code.help')}
              {expert && info ? ` · ${t('advisor.share.chars', { n: info.code.length })}` : ''}
            </span>
          </div>
          <div className="ui-field">
            <span className="ui-field__label">{t('advisor.share.link')}</span>
            <div className="ui-code ui-code--line">
              <p className="ui-code__text" tabIndex={0}>
                {info ? info.link.replace(/^https:\/\//, '') : '…'}
              </p>
              <CopyButton text={info?.link ?? ''} label={t('advisor.share.copyLink')} icon="link" />
            </div>
            <span className="ui-field__help">{t('advisor.share.link.help')}</span>
          </div>
          {mine && (
            <label className="ui-field">
              <span className="ui-field__label">{t('advisor.share.nick')}</span>
              <input
                className="ui-input ui-input--lg"
                value={nick}
                maxLength={40}
                placeholder={t('advisor.share.nick.ph')}
                onChange={(e) => setNick(e.target.value)}
                onBlur={saveNick}
                onKeyDown={(e) => e.key === 'Enter' && saveNick()}
              />
              <span className="ui-field__help">{t('advisor.share.nick.help')}</span>
            </label>
          )}
          <div className="ad-share-in">
            <div>
              <span className="ui-label">{t('advisor.share.in')}</span>
              <ul className="yes">
                {yes.map((x) => (
                  <li key={x}>
                    <AIco name="check" size="sm" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="ui-label">{t('advisor.share.out')}</span>
              <ul className="no">
                {no.map((x) => (
                  <li key={x}>
                    <AIco name="cross" size="sm" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {mine && (
            <div className="ad-cat">
              <span className="ui-label">{t('advisor.share.cat')}</span>
              <p className="ad-text ad-small">{t('advisor.share.cat.text')}</p>
              <div className="ad-row">
                <button
                  type="button"
                  className="ui-btn"
                  disabled={submit === 'busy'}
                  onClick={() => {
                    setSubmit('busy')
                    void window.overlayApi.advisor.submit(id).then(setSubmit)
                  }}
                >
                  <AIco name="external" />
                  {t('advisor.share.submit')}
                </button>
                <span className="ad-xs ad-faint">github.com/MAYZOSUPER/POETH · {t('advisor.share.form')}</span>
              </div>
              {submit === 'opened' && <span className="ad-ok">{t('advisor.share.submit.opened')}</span>}
              {submit === 'copied' && <span className="ad-ok">{t('advisor.share.submit.copied')}</span>}
              {submit === 'error' && <span className="ui-field__error">{t('advisor.share.submit.error')}</span>}
            </div>
          )}
        </>
      )}
    </Dialog>
  )
}
