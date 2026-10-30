import { useEffect, useId, type FormEvent } from 'react'
import { ascOrClass, buildTitle, mainSkillName } from './names'
import { BIco, classLine } from './ui'
import { sourceHost } from '@shared/build/library'
import { useT, useLang } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { useBuildStore, type ImportError } from '../../store/useBuildStore'
import type { IconName } from '../../overlay/Icon'

// Пустое состояние вкладки «Билд» (макет v0.2, раздел 1): вставка кода или ссылки, загрузка (скелет), ошибки
// «что случилось и что сделать», три мини-инструкции «где взять код» (простой режим), недавние билды.
// S59: рядом со вставкой — «Выбрать стартер лиги 3.30» (раздел «Стартеры»).

const SITES = ['pobb.in', 'pastebin.com', 'pob.codes', 'poedb.tw', 'maxroll.gg/poe/pob']

type T = ReturnType<typeof useT>

/** Ошибка вставки → текст баннера (жирное — что случилось, дальше — что сделать). */
function errorText(e: ImportError, t: T): { bad: boolean; icon: IconName; title: string; text: string } {
  switch (e.error) {
    case 'empty':
      return { bad: true, icon: 'warn', title: t('bd.err.empty'), text: t('bd.err.empty.d') }
    case 'not-pob':
      return { bad: true, icon: 'warn', title: t('bd.err.notPob'), text: t('bd.err.notPob.d') }
    case 'too-large':
      return { bad: true, icon: 'warn', title: t('bd.err.big'), text: t('bd.err.big.d') }
    case 'poe2':
      return { bad: false, icon: 'info', title: t('bd.err.poe2'), text: t('bd.err.poe2.d') }
    case 'copy-code':
      return { bad: false, icon: 'info', title: t('bd.err.copy'), text: t(`bd.err.copy.${e.copySite ?? 'maxroll-planner'}`) }
    case 'unknown-link':
      return { bad: true, icon: 'shield', title: t('bd.err.site'), text: t('bd.err.site.d', { sites: SITES.join(', ') }) }
    case 'fetch':
    default: {
      const f = e.fetchError ?? 'network'
      return { bad: true, icon: 'refresh', title: t(`bd.err.fetch.${f}`), text: t('bd.err.fetch.d') }
    }
  }
}

function Paste() {
  const t = useT()
  const id = useId()
  const input = useBuildStore((s) => s.input)
  const busy = useBuildStore((s) => s.busy)
  const error = useBuildStore((s) => s.error)
  const { setInput, importText } = useBuildStore.getState()
  const loading = busy === 'import'
  const err = error ? errorText(error, t) : null
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void importText(input.trim())
  }
  return (
    <>
      <form className="ui-field" onSubmit={submit}>
        <label className="ui-field__label" htmlFor={id}>
          {t('bd.paste.label')}
        </label>
        <div className={`bd-paste${err?.bad ? ' is-bad' : ''}`}>
          <input
            id={id}
            className="ui-input ui-input--lg"
            placeholder={t('bd.paste.ph')}
            value={input}
            disabled={loading}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={err?.bad || undefined}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="ui-btn ui-btn--primary" aria-disabled={loading || undefined} disabled={loading}>
            <BIco name={loading ? 'refresh' : 'import'} />
            {loading ? t('bd.paste.loading') : t('bd.paste.open')}
          </button>
        </div>
        <span className="bd-sites">
          {t('bd.paste.links')}{' '}
          {SITES.map((s, i) => (
            <span key={s}>
              {i > 0 && ' · '}
              <code>{s}</code>
            </span>
          ))}
        </span>
      </form>
      {err && (
        <div className={`ui-banner ${err.bad ? 'ui-banner--bad' : 'ui-banner--info'} bd-banner`} role="alert">
          <BIco name={err.icon} />
          <span>
            <b>{err.title}</b> {err.text}
          </span>
          <span />
        </div>
      )}
    </>
  )
}

function Loading() {
  const t = useT()
  return (
    <>
      <div className="ui-hint bd-hint">
        <BIco name="info" />
        <span>{t('bd.loading')}</span>
      </div>
      <div className="ui-box" aria-busy="true">
        <div className="ui-box__body bd-sk">
          <i className="ui-skeleton" style={{ width: '62%', height: 20 }} />
          <i className="ui-skeleton" style={{ width: '44%' }} />
          <div className="bd-sk__chips">
            {[1, 2, 3, 4, 5].map((i) => (
              <i key={i} className="ui-skeleton" />
            ))}
          </div>
          <i className="ui-skeleton" style={{ width: '90%' }} />
          <i className="ui-skeleton" style={{ width: '80%' }} />
        </div>
      </div>
    </>
  )
}

/** «Не знаете, чем начать лигу?» → раздел «Стартеры» (S59). Список читается из данных приложения, без сети. */
function StarterCta({ expert }: { expert: boolean }) {
  const t = useT()
  const league = useBuildStore((s) => s.starters?.league ?? null)
  const { loadStarters, setSection } = useBuildStore.getState()
  useEffect(() => {
    if (!useBuildStore.getState().starters) void loadStarters()
  }, [loadStarters])
  return (
    <div className="bd-st-cta">
      <span className="ui-mech" aria-hidden="true">
        <BIco name="star" />
      </span>
      {!expert && (
        <span className="bd-st-cta__t">
          <b>{t('bd.st.cta.title')}</b>
          <span>{t('bd.st.cta.text')}</span>
        </span>
      )}
      <button type="button" className="ui-btn ui-btn--primary" onClick={() => setSection('starters')}>
        <BIco name="star" />
        {league ? t('bd.st.cta.btn', { league }) : t('bd.st.cta.btnAny')}
      </button>
    </div>
  )
}

function HowTo() {
  const t = useT()
  const how: { icon: IconName; name: string; steps: string[] }[] = [
    { icon: 'import', name: 'Path of Building', steps: [t('bd.how.pob.1'), t('bd.how.pob.2'), t('bd.how.paste')] },
    { icon: 'external', name: 'Maxroll', steps: [t('bd.how.guide'), t('bd.how.maxroll.2'), t('bd.how.paste')] },
    { icon: 'copy', name: 'Mobalytics', steps: [t('bd.how.guide'), t('bd.how.moba.2'), t('bd.how.paste')] }
  ]
  return (
    <>
      <div className="ui-label">{t('bd.how.title')}</div>
      <div className="bd-howto">
        {how.map((h) => (
          <div key={h.name} className="bd-how">
            <span className="ui-mech ui-mech--sm">
              <BIco name={h.icon} />
            </span>
            <b>{h.name}</b>
            <ol>
              {h.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </>
  )
}

function ago(ms: number, t: T): string {
  const d = Date.now() - ms
  const day = 24 * 3600_000
  if (d < day) return t('bd.recent.today')
  if (d < 2 * day) return t('bd.recent.yesterday')
  return t('bd.recent.days', { n: Math.floor(d / day) })
}

function Recent() {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const recent = useBuildStore((s) => s.state.recent)
  const tree = useBuildStore((s) => s.tree)
  const gems = useBuildStore((s) => s.gems)
  const busy = useBuildStore((s) => s.busy)
  const { open, remove } = useBuildStore.getState()
  if (!recent.length) return null
  return (
    <section className="ui-box bd-recent">
      <div className="ui-box__head">
        <span className="ui-label">
          <BIco name="history" />
          {t('bd.recent.title')}
        </span>
      </div>
      <div className="bd-rows">
        {recent.map((r) => {
          const cls = classLine(tree, gameLang, r.classId, r.ascendClassId, r)
          const host = sourceHost(r.source)
          const title = buildTitle(mainSkillName(gems, r.mainGemId, r.mainSkill, gameLang), ascOrClass(tree, gameLang, r.classId, r.ascendClassId, r))
          return (
            <div key={r.id} className="bd-row">
              <BIco name="passive" />
              <span className="bd-row__t">
                <b>{title}</b>
                <span>
                  {cls} · {host ? host.split('/')[0] : t('bd.source.code')} · {ago(r.openedAt, t)}
                </span>
              </span>
              <span className="bd-row__end">
                <button type="button" className="ui-btn ui-btn--sm" disabled={!!busy} onClick={() => void open(r.id)}>
                  {t('bd.paste.open')}
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                  aria-label={t('bd.recent.remove', { name: title })}
                  title={t('bd.recent.remove', { name: title })}
                  onClick={() => void remove(r.id)}
                >
                  <BIco name="close" />
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function EmptyView({ expert }: { expert: boolean }) {
  const t = useT()
  const loading = useBuildStore((s) => s.busy === 'import')
  return (
    <div className="bd-empty">
      <div className="bd-empty__hi">
        <h3>{t('bd.empty.title')}</h3>
        {!expert && !loading && <p>{t('bd.empty.lead')}</p>}
      </div>
      <Paste />
      {!loading && <StarterCta expert={expert} />}
      {loading ? (
        <Loading />
      ) : (
        <>
          {!expert && <HowTo />}
          <Recent />
          <div className="bd-private">
            <BIco name="lock" />
            <span>{t('bd.private')}</span>
          </div>
        </>
      )}
    </div>
  )
}
