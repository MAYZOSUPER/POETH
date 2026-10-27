import { translate } from '../i18n'
import { useOverlayStore } from '../store/useOverlayStore'

// useT() компаньона берёт язык из useAppStore, который на странице оверлея не грузится;
// здесь — то же самое на языке из useOverlayStore.
export function useOverlayT(): (key: string, params?: Record<string, string | number>) => string {
  const lang = useOverlayStore((s) => s.lang)
  return (key, params) => translate(lang, key, params)
}

/** 'Control+Shift+Space' → 'Ctrl + Shift + Space' (как в экране настроек). */
export function formatAccel(accel: string): string {
  if (!accel) return '—'
  return accel
    .split('+')
    .map((p) => (p === 'Control' ? 'Ctrl' : p === 'Super' ? 'Win' : p))
    .join(' + ')
}
