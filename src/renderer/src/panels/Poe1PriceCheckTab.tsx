import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { ComingSoon } from '../components/ComingSoon'

// TODO S4: вкладка прайс-чека PoE1 в компаньоне (подсказки, история проверок);
// само окно цены живёт в игровом оверлее (S1/S4).
export function Poe1PriceCheckTab() {
  const t = useT()
  const accel = useAppStore((s) => s.settings?.hotkeys.priceCheck.accel) || 'Ctrl+D'
  const key = accel.replace('Control', 'Ctrl')
  return <ComingSoon icon="💰" feature={t('app.priceCheck')} text={t('soon.priceCheck', { key })} />
}
