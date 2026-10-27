// Сочетание клавиш как в макете (.ui-kbd): «Ctrl+Shift+T» → [Ctrl]+[Shift]+[T].

export function accelKeys(accel: string): string[] {
  return accel
    .split('+')
    .filter(Boolean)
    .map((k) => (k === 'Control' || k === 'CommandOrControl' ? 'Ctrl' : k === 'Super' ? 'Win' : k))
}

export function Kbd({ accel, empty }: { accel: string; empty?: string }) {
  const keys = accelKeys(accel)
  if (!keys.length) return <span className="onb-faint">{empty ?? '—'}</span>
  return (
    <span className="ui-kbd">
      {keys.map((k, i) => (
        <span key={i}>
          {i > 0 && '+'}
          <kbd>{k}</kbd>
        </span>
      ))}
    </span>
  )
}
