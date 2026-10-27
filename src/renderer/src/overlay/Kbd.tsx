import { Fragment } from 'react'
import { formatAccel } from './useOverlayT'

/** Сочетание клавиш как в макетах: <span class="ui-kbd"><kbd>Shift</kbd>+<kbd>Space</kbd></span>. */
export function Kbd({ accel }: { accel: string }) {
  const keys = formatAccel(accel).split(' + ')
  return (
    <span className="ui-kbd">
      {keys.map((k, i) => (
        <Fragment key={`${k}-${i}`}>
          {i > 0 && '+'}
          <kbd>{k}</kbd>
        </Fragment>
      ))}
    </span>
  )
}
