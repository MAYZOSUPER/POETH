// Строки с текущим сочетанием клавиш (S42): хоткеи переназначаются в настройках, поэтому в словаре
// вместо зашитого «Ctrl+D» — {key}, а для неназначенной клавиши — вариант «<ключ>.nokey».
// Вид сочетания — как в подсказках шапки и «Прайс-чека» (S37): 'Control+Shift+G' → 'Ctrl+Shift+G'.

type T = (key: string, params?: Record<string, string | number>) => string

/** 'Control+D' → 'Ctrl+D', '' → '' (клавиша не назначена). */
export function accelText(accel?: string | null): string {
  return (accel ?? '')
    .split('+')
    .filter(Boolean)
    .map((k) => (k === 'Control' || k === 'CommandOrControl' ? 'Ctrl' : k === 'Super' ? 'Win' : k))
    .join('+')
}

/** t(key) с {key} = текущее сочетание; не назначено — t(`${key}.nokey`). */
export function tKey(t: T, key: string, accel: string | null | undefined, params?: Record<string, string | number>): string {
  const k = accelText(accel)
  return k ? t(key, { ...params, key: k }) : t(`${key}.nokey`, params)
}
