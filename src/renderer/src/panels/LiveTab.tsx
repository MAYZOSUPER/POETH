import { useT } from '../i18n'
import { ComingSoon } from '../components/ComingSoon'

// TODO S6: вкладка «live» компаньона (PoE1).
export function LiveTab() {
  const t = useT()
  return <ComingSoon icon="📡" feature={t('app.live')} text={t('soon.live')} />
}
