import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppTab } from '@shared/types'
import { gt, guideUrl, parseInline, type GuideArticle, type GuideBlock, type GuideLang, type GuideSection } from '@shared/guide/article'
import { articleMark, dayLabel, patchLabel, searchGuide, sectionUpdated, unreadCount, visibleSections, type GuideMark } from '@shared/guide/library'
import { useLang, useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useShellStore } from '../../store/useShellStore'
import { useGuideStore } from '../../store/useGuideStore'
import { useRegexStore } from '../../store/useRegexStore'
import { ShellIcon } from '../../components/ShellIcon'
import { Switch, useSimple } from '../regex/common'
import { tabsFor } from '../../tabs'
import { resolveAppLink, type AppTarget } from './links'
import './guide.css'

// Вкладка «Справочник» (S55): список статей с поиском по заголовкам и отметками «новое / обновлено», статья из
// своих простых блоков (@shared/guide/article). Тексты — данные (resources/data/poe1/guide, канал данных S12).
// Простой режим: подсказка над списком, разделы и блоки «для опытных» — под кнопкой в конце статьи.
// Экспертный: всё сразу, список компактнее. Режим — общий (Settings.ui.simpleMode), как в Regex.

type T = ReturnType<typeof useT>

const sectionDomId = (id: string): string => `gd-s-${id}`

export function GuideTab() {
  const t = useT()
  const lang = useLang() as GuideLang
  const simple = useSimple()
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const patchSettings = useAppStore((s) => s.patchSettings)
  const status = useGuideStore((s) => s.status)
  const open = useGuideStore((s) => s.open)
  const articles = useGuideStore((s) => s.articles)
  const close = useGuideStore((s) => s.close)
  const article = open ? articles.find((a) => a.id === open.id) : undefined

  useEffect(() => {
    void useGuideStore.getState().init(game)
  }, [game])

  return (
    <div className="gd">
      <div className="gd-head">
        {article ? (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost gd-back" onClick={close}>
            <span className="gd-back__ico">
              <ShellIcon name="chev-r" size="sm" />
            </span>
            {t('guide.back')}
          </button>
        ) : (
          <SearchBox t={t} />
        )}
        <span className="gd-grow" />
        <Switch on={!simple} title={t('guide.expert.title')} onChange={(expert) => void patchSettings({ ui: { simpleMode: !expert } })}>
          {t('guide.expert')}
        </Switch>
      </div>
      {status !== 'ready' ? (
        <div className="gd-body" aria-busy="true">
          <span className="ui-skeleton" style={{ width: 220 }} />
          <span className="ui-skeleton" style={{ width: 160 }} />
        </div>
      ) : article ? (
        <ArticleView key={article.id} article={article} lang={lang} simple={simple} t={t} />
      ) : (
        <GuideList lang={lang} simple={simple} t={t} />
      )}
    </div>
  )
}

function SearchBox({ t }: { t: T }) {
  const query = useGuideStore((s) => s.query)
  const setQuery = useGuideStore((s) => s.setQuery)
  return (
    <label className="gd-search">
      <ShellIcon name="search" size="sm" />
      <input
        className="ui-input"
        type="search"
        value={query}
        placeholder={t('guide.search')}
        aria-label={t('guide.search')}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && query) {
            e.preventDefault()
            setQuery('')
          }
        }}
      />
    </label>
  )
}

function MarkTag({ mark, t }: { mark: GuideMark; t: T }) {
  if (!mark) return null
  return <span className={`ui-tag ${mark === 'new' ? 'ui-tag--good' : 'ui-tag--merchant'}`}>{t(`guide.mark.${mark}`)}</span>
}

function Meta({ a, lang, t }: { a: GuideArticle; lang: GuideLang; t: T }) {
  return (
    <span className="gd-meta">
      {t('guide.patch', { patch: patchLabel(a) })} · {t('guide.updated', { date: dayLabel(a.updated, lang) })}
    </span>
  )
}

function GuideList({ lang, simple, t }: { lang: GuideLang; simple: boolean; t: T }) {
  const articles = useGuideStore((s) => s.articles)
  const seen = useGuideStore((s) => s.seen)
  const query = useGuideStore((s) => s.query)
  const failed = useGuideStore((s) => s.failed)
  const newer = useGuideStore((s) => s.newer)
  const noIndex = useGuideStore((s) => s.noIndex)
  const { openArticle, readAll, reload, setQuery } = useGuideStore.getState()
  const hits = useMemo(() => searchGuide(articles, query), [articles, query])
  const unread = unreadCount(articles, seen)

  if (noIndex || articles.length === 0) {
    return (
      <div className="gd-body ui-scroll">
        <div className="ui-empty">
          <div className="ui-empty__title">{t('guide.empty.title')}</div>
          <span>{t(noIndex ? 'guide.empty.broken' : 'guide.empty.text')}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void reload()}>
            <ShellIcon name="refresh" size="sm" />
            {t('guide.retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`gd-body ui-scroll${simple ? '' : ' gd-body--expert'}`}>
      <div className="gd-col">
        {simple && !query && (
          <div className="ui-hint gd-intro">
            <ShellIcon name="info" />
            <span>{t('guide.intro')}</span>
          </div>
        )}
        <div className="gd-listhead">
          <span className="ui-label">{query ? t('guide.found', { n: hits.length }) : t('guide.articles', { n: articles.length })}</span>
          <span className="ui-label__grow" />
          {unread > 0 && !query && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={readAll}>
              <ShellIcon name="check" size="sm" />
              {t('guide.readAll')}
            </button>
          )}
        </div>
        {hits.length === 0 ? (
          <div className="ui-empty">
            <span>{t('guide.nothing', { q: query.trim() })}</span>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setQuery('')}>
              {t('guide.clear')}
            </button>
          </div>
        ) : (
          <ul className="gd-cards">
            {hits.map(({ article: a, sections }) => (
              <li key={a.id} className="gd-card">
                <button type="button" className="gd-card__main" onClick={() => openArticle(a.id)}>
                  <span className="gd-card__top">
                    <span className="gd-card__title">{gt(a.title, lang)}</span>
                    <MarkTag mark={articleMark(a, seen)} t={t} />
                  </span>
                  <span className="gd-card__summary">
                    <Inline text={gt(a.summary, lang)} />
                  </span>
                  <Meta a={a} lang={lang} t={t} />
                </button>
                {sections.length > 0 && (
                  <div className="gd-card__hits">
                    {sections.map((s) => (
                      <button key={s.id} type="button" className="ui-chip" onClick={() => openArticle(a.id, s.id)}>
                        {gt(s.title, lang)}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {newer.length > 0 && (
          <div className="ui-hint">
            <ShellIcon name="info" />
            <span>{t('guide.newer', { n: newer.length })}</span>
          </div>
        )}
        {failed.length > 0 && (
          <div className="ui-hint gd-faint">
            <ShellIcon name="warn" />
            <span>
              {t('guide.failed', { n: failed.length })}
              {!simple && ` (${failed.map((f) => f.id).join(', ')})`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ArticleView({ article: a, lang, simple, t }: { article: GuideArticle; lang: GuideLang; simple: boolean; t: T }) {
  const open = useGuideStore((s) => s.open)
  const seenRev = open?.seenRev
  const target = open?.section ?? null
  const { main, expert } = visibleSections(a, simple)
  // раздел из поиска — для опытных: показываем их сразу
  const [showExpert, setShowExpert] = useState(() => expert.some((s) => s.id === target))
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const sections = showExpert ? a.sections : main
  const full = !simple || showExpert
  const mark: GuideMark = seenRev === undefined ? 'new' : seenRev < a.rev ? 'updated' : null

  useLayoutEffect(() => {
    const el = target ? document.getElementById(sectionDomId(target)) : null
    if (el) el.scrollIntoView({ block: 'start' })
    else bodyRef.current?.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [target])

  const jump = (id: string): void => document.getElementById(sectionDomId(id))?.scrollIntoView({ block: 'start', behavior: 'smooth' })

  return (
    <div ref={bodyRef} className={`gd-body ui-scroll${simple ? '' : ' gd-body--expert'}`}>
      <article className="gd-col gd-article" lang={lang}>
        <header className="gd-article__head">
          <h2 ref={titleRef} className="gd-article__title" tabIndex={-1}>
            {gt(a.title, lang)}
          </h2>
          <div className="gd-article__meta">
            <MarkTag mark={mark} t={t} />
            <Meta a={a} lang={lang} t={t} />
          </div>
        </header>
        {sections.length > 2 && (
          <nav className="ui-chips gd-toc" aria-label={t('guide.toc')}>
            <span className="ui-label">{t('guide.toc')}</span>
            {sections.map((s) => (
              <button key={s.id} type="button" className="ui-chip" onClick={() => jump(s.id)}>
                {gt(s.title, lang)}
              </button>
            ))}
          </nav>
        )}
        {sections.map((s) => (
          <Section key={s.id} s={s} lang={lang} full={full} updated={sectionUpdated(s, seenRev)} t={t} />
        ))}
        {expert.length > 0 && (
          <button type="button" className="ui-btn ui-btn--sm gd-more" aria-expanded={showExpert} onClick={() => setShowExpert((v) => !v)}>
            <ShellIcon name={showExpert ? 'arrow-up' : 'chev-d'} size="sm" />
            {showExpert ? t('guide.expertHide') : t('guide.expertShow', { n: expert.length })}
          </button>
        )}
        <p className="gd-foot">{t('guide.foot')}</p>
      </article>
    </div>
  )
}

function Section({ s, lang, full, updated, t }: { s: GuideSection; lang: GuideLang; full: boolean; updated: boolean; t: T }) {
  const blocks = full ? s.blocks : s.blocks.filter((b) => !b.expert)
  return (
    <section className={`gd-sec${s.expert ? ' gd-sec--expert' : ''}`} id={sectionDomId(s.id)} aria-labelledby={`${sectionDomId(s.id)}-h`}>
      <h3 className="gd-sec__title" id={`${sectionDomId(s.id)}-h`}>
        {gt(s.title, lang)}
        {s.expert && <span className="ui-tag">{t('guide.forExpert')}</span>}
        {updated && <span className="ui-tag ui-tag--merchant">{t('guide.mark.updated')}</span>}
      </h3>
      {blocks.map((b, i) => (
        <Block key={i} b={b} lang={lang} t={t} />
      ))}
    </section>
  )
}

/** **жирный** и `клавиша` из текста статьи — только React-элементы, без HTML из данных. */
function Inline({ text }: { text: string }) {
  const parts = parseInline(text) ?? [{ kind: 'text' as const, text }]
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'bold' ? (
          <b key={i}>{p.text}</b>
        ) : p.kind === 'key' ? (
          <Keys key={i} text={p.text} />
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

function Keys({ text }: { text: string }) {
  const keys = text.split('+').filter(Boolean)
  return (
    <span className="ui-kbd gd-kbd">
      {keys.map((k, i) => (
        <span key={i}>
          {i > 0 && '+'}
          <kbd>{k}</kbd>
        </span>
      ))}
    </span>
  )
}

const NOTE: Record<'tip' | 'warn' | 'bad', { cls: string; icon: 'info' | 'warn' }> = {
  tip: { cls: 'ui-banner ui-banner--info', icon: 'info' },
  warn: { cls: 'ui-banner', icon: 'warn' },
  bad: { cls: 'ui-banner ui-banner--bad', icon: 'warn' }
}

function Block({ b, lang, t }: { b: GuideBlock; lang: GuideLang; t: T }) {
  switch (b.kind) {
    case 'text':
      return (
        <p className="gd-p">
          <Inline text={gt(b.text, lang)} />
        </p>
      )
    case 'list': {
      const items = b.items.map((it, i) => (
        <li key={i}>
          <Inline text={gt(it, lang)} />
        </li>
      ))
      return b.ordered ? <ol className="gd-list">{items}</ol> : <ul className="gd-list">{items}</ul>
    }
    case 'note': {
      const n = NOTE[b.tone]
      return (
        <div className={`${n.cls} gd-note`}>
          <ShellIcon name={n.icon} />
          <span>
            <Inline text={gt(b.text, lang)} />
          </span>
        </div>
      )
    }
    case 'link':
      return <LinkBlock b={b} lang={lang} t={t} />
    case 'app':
      return <AppBlock b={b} lang={lang} />
    case 'terms':
      return (
        <dl className="gd-terms">
          {b.items.map((it, i) => (
            <div key={i} className="gd-term">
              <dt>
                <span className="gd-term__main">{gt(it.term, lang)}</span>
                <span className="gd-term__alt" lang={lang === 'ru' ? 'en' : 'ru'}>
                  {gt(it.term, lang === 'ru' ? 'en' : 'ru')}
                </span>
              </dt>
              <dd>
                <Inline text={gt(it.def, lang)} />
              </dd>
            </div>
          ))}
        </dl>
      )
    case 'pending':
      return (
        <div className="gd-pending">
          <span className="ui-tag ui-tag--warn">{t('guide.soon')}</span>
          <span>
            <Inline text={gt(b.text, lang)} />
          </span>
        </div>
      )
  }
}

function Row({ action, text, lang }: { action: ReactNode; text?: { ru: string; en: string }; lang: GuideLang }) {
  return (
    <div className="gd-row">
      {action}
      {text && (
        <span className="gd-row__text">
          <Inline text={gt(text, lang)} />
        </span>
      )}
    </div>
  )
}

function LinkBlock({ b, lang, t }: { b: Extract<GuideBlock, { kind: 'link' }>; lang: GuideLang; t: T }) {
  const url = b.url ? guideUrl(b.url, lang) : undefined
  const ggg = b.site === 'ggg'
  const where = t(ggg ? 'guide.link.browser' : 'guide.link.tab')
  const go = (): void => {
    if (b.site === 'ggg') window.overlayApi.window.openExternal(url as string)
    else void window.overlayApi.sites.open({ tab: b.site, url })
  }
  return (
    <Row
      lang={lang}
      text={b.text}
      action={
        <button type="button" className="ui-btn ui-btn--sm gd-row__btn" title={where} aria-label={`${gt(b.label, lang)} — ${where}`} onClick={go}>
          <ShellIcon name="external" size="sm" />
          {gt(b.label, lang)}
        </button>
      }
    />
  )
}

function AppBlock({ b, lang }: { b: Extract<GuideBlock, { kind: 'app' }>; lang: GuideLang }) {
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const articles = useGuideStore((s) => s.articles)
  const target = resolveAppLink(
    b.to,
    tabsFor(game).map((x) => x.id),
    articles.map((a) => a.id)
  )
  if (!target) return null
  return (
    <Row
      lang={lang}
      text={b.text}
      action={
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary gd-row__btn" onClick={() => void goTo(target)}>
          <ShellIcon name="chev-r" size="sm" />
          {gt(b.label, lang)}
        </button>
      }
    />
  )
}

async function goTo(target: AppTarget): Promise<void> {
  if (target.kind === 'article') {
    useGuideStore.getState().openArticle(target.id)
    return
  }
  const shell = useShellStore.getState()
  if (target.kind === 'settings') {
    shell.setPage('settings')
    return
  }
  if (target.regexPage) {
    // библиотека и настройки Regex приходят из main; без init() выбор страницы перезапишется
    const rx = useRegexStore.getState()
    await rx.init()
    rx.setPrefs({ page: target.regexPage })
  }
  shell.setPage(null)
  useAppStore.getState().setAppTab(target.tab as AppTab)
}
