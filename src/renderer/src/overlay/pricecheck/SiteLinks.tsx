import type { ParsedItem } from '@shared/poe1/parser'
import { deepLinkUrl, linkRefOfItem, type LinkSite } from '@shared/siteLinks'
import type { SiteId } from '@shared/sites'
import { Icon } from '../Icon'
import './sitelinks.css'

// «Открыть на poedb / вики / poe.ninja» в окне цены (S43): сразу на странице предмета во вкладке сайта
// трейд-окна. Имена — английские (refName данных), poedb — на языке клиента игры (язык текста предмета),
// poe.ninja — в лиге окна цены. Адрес main ещё раз проверяет по хостам сайта.

type T = (key: string, params?: Record<string, string | number>) => string

const TAB: Record<LinkSite, SiteId> = { poedb: 'poedb', wiki: 'wiki', ninja: 'ninja' }

export function SiteLinks({ item, league, t }: { item: ParsedItem | null; league: string; t: T }) {
  const ref = linkRefOfItem(item)
  if (!item || !ref) return null
  const ctx = { gameLang: item.lang === 'ru' ? ('ru' as const) : ('en' as const), league }
  const links: { site: LinkSite; label: string; url: string | null }[] = [
    { site: 'poedb', label: 'poedb', url: deepLinkUrl('poedb', ref, ctx) },
    { site: 'wiki', label: t('sites.link.wiki'), url: deepLinkUrl('wiki', ref, ctx) },
    { site: 'ninja', label: 'poe.ninja', url: league ? deepLinkUrl('ninja', ref, ctx) : null }
  ]
  return (
    <div className="pc-sites">
      <span className="pc-sites__label">{t('sites.link.open')}</span>
      {links.map(
        (l) =>
          l.url && (
            <button
              key={l.site}
              type="button"
              className="ui-btn ui-btn--sm ui-btn--ghost"
              title={t('sites.link.title', { site: l.label })}
              onClick={() => void window.overlayApi.sites.open({ tab: TAB[l.site], url: l.url! })}
            >
              <Icon name="external" />
              {l.label}
            </button>
          )
      )}
    </div>
  )
}
