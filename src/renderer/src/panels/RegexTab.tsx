import { useT } from '../i18n'
import { ComingSoon } from '../components/ComingSoon'

// TODO S7: вкладка «regex» компаньона (PoE1).
export function RegexTab() {
  const t = useT()
  return <ComingSoon icon="🔎" feature={t('app.regex')} text={t('soon.regex')} />
}
