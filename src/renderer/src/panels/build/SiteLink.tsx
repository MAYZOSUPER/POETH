import { poedbUrl } from '@shared/siteLinks'
import { useLang, useT } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { BIco } from './ui'

// Камень или нода дерева → страница poedb во вкладке сайта трейд-окна (S43). Имя — английское (данные билда),
// страница poedb — на языке клиента игры.

export function PoedbButton({ name }: { name: string }) {
  const t = useT()
  const gameLang = useGameLang(useLang())
  const url = poedbUrl(name, gameLang)
  if (!url) return null
  return (
    <button
      type="button"
      className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm bd-poedb"
      title={`${t('sites.link.poedb')}: ${name}`}
      aria-label={`${t('sites.link.poedb')}: ${name}`}
      onClick={() => void window.overlayApi.sites.open({ tab: 'poedb', url })}
    >
      <BIco name="external" size="sm" />
    </button>
  )
}
