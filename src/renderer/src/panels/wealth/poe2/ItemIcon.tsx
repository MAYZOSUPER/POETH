import { useState } from 'react'
import { iconSrc } from '../../../components/Currency'

/** Иконка предмета PoE 2 (S70): web.poecdn.com через кэш main (poeth://icon); нет иконки или сети — кружок ui-coin. */
export function ItemIcon({ icon }: { icon?: string }) {
  const [broken, setBroken] = useState(false)
  if (!icon || broken) return <i className="ui-coin" aria-hidden="true" />
  return <img className="ui-coin ui-coin--img" src={iconSrc(icon)} alt="" aria-hidden="true" draggable={false} onError={() => setBroken(true)} />
}
