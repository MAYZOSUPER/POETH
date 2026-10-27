import { useT } from '../i18n'

/** Заглушка раздела, который ещё в разработке (вкладки PoE1 до своих этапов). */
export function ComingSoon({ icon, feature, text }: { icon: string; feature: string; text: string }) {
  const t = useT()
  return (
    <div className="coming-soon">
      <div className="coming-soon-icon">{icon}</div>
      <div className="coming-soon-title">{t('soon.title', { feature })}</div>
      <p className="coming-soon-text">{text}</p>
      <p className="small muted">{t('soon.note')}</p>
    </div>
  )
}
