import type { ReactNode } from 'react'
import { SITES, bookmarkTab, type SiteTabId } from '@shared/sites'
import { useT } from '../i18n'
import { Ico } from '../panels/regex/Ico'
import { useFavStore } from './useFavStore'

// Рельс вкладок трейд-окна (S43): «Трейд» (официальный сайт, вход в аккаунт), сайты реестра, свои закладки,
// внизу — страница «Сайты» (закладки, данные сайтов). Значки — буквы, чужие favicon не грузим. Сами сайты —
// вью main правее рельса; здесь только кнопки.

/** Две буквы закладки: первые буквы двух слов названия или первые две буквы. */
export function bookmarkMark(title: string): string {
  const words = title.replace(/^www\./i, '').split(/[\s.\-_]+/).filter(Boolean)
  const s = words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2)
  return s.toUpperCase()
}

function RailTab({ tab, title, children }: { tab: SiteTabId; title: string; children: ReactNode }) {
  const active = useFavStore((s) => s.sites?.active === tab)
  const live = useFavStore((s) => !!s.sites?.live.includes(tab))
  return (
    <button
      type="button"
      className={`ts-rail__tab${live ? ' is-live' : ''}`}
      aria-pressed={active}
      aria-label={title}
      title={title}
      onClick={() => void window.overlayApi.sites.select(tab)}
    >
      {children}
    </button>
  )
}

export function SiteRail() {
  const t = useT()
  const bookmarks = useFavStore((s) => s.sites?.bookmarks ?? [])
  return (
    <nav className="ts-rail" aria-label={t('sites.rail')}>
      <RailTab tab="trade" title={t('sites.trade.title')}>
        <Ico name="trade" />
        <span className="ts-rail__cap">{t('sites.trade')}</span>
      </RailTab>
      <span className="ts-rail__sep" />
      {SITES.map((s) => (
        <RailTab key={s.id} tab={s.id} title={`${s.name} — ${t(s.aboutKey)}`}>
          <span className="ts-rail__mark" data-site={s.id}>
            {s.mark}
          </span>
        </RailTab>
      ))}
      {bookmarks.length > 0 && <span className="ts-rail__sep" />}
      {bookmarks.map((b) => (
        <RailTab key={b.id} tab={bookmarkTab(b.id)} title={b.title}>
          <span className="ts-rail__mark ts-rail__mark--own">{bookmarkMark(b.title)}</span>
        </RailTab>
      ))}
      <span className="ts-grow" />
      <RailTab tab="manage" title={t('sites.manage.title')}>
        <Ico name="gear" />
      </RailTab>
    </nav>
  )
}
