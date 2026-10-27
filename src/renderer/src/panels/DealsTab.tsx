import { useT } from '../i18n'
import { ComingSoon } from '../components/ComingSoon'

// TODO S8: вкладка «deals» компаньона (PoE1).
export function DealsTab() {
  const t = useT()
  return <ComingSoon icon="🤝" feature={t('app.deals')} text={t('soon.deals')} />
}
