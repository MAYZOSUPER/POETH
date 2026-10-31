import { useState } from 'react'

/**
 * Поле числа (S70): пока игрок печатает — черновик, в main уходит по Enter или уходу с поля; Esc — отмена.
 * Пробелы-разделители разрядов («1 500») допускаются, дробное округляется до целого.
 */
export function QtyInput({ value, label, onCommit, wide }: { value: number | null; label: string; onCommit: (n: number) => void; wide?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (): void => {
    if (draft === null) return
    const n = Number(draft.replace(/[\s  ]/g, '').replace(',', '.'))
    setDraft(null)
    if (Number.isFinite(n) && n >= 0 && Math.round(n) !== value) onCommit(Math.round(n))
  }
  return (
    <input
      className={`ui-input ui-input--num w2-qty${wide ? ' w2-qty--wide' : ''}`}
      inputMode="numeric"
      aria-label={label}
      value={draft ?? (value === null ? '' : String(value))}
      placeholder="?"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}
