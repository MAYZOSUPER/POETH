import type { ItemEnRequest } from '@shared/types'
import { getDefaultPoe1DataStore } from '@shared/poe1/data'
import { itemEnCopy, itemEnNotice, type ItemEnCopy } from '@shared/build/itemEnCopy'
import { useOverlayStore } from '../../store/useOverlayStore'
import { poe2ItemEn } from './poe2'

// «Скопировать предмет по-английски» (S51): main скопировал предмет по хоткею → здесь английский текст (данные PoE1
// оверлея, те же, что у окна цены) → main кладёт его в буфер → уведомление поверх игры. Текст — только в памяти.
// S61: в режиме PoE 2 — данные и сборка PoE 2 (./poe2), уведомления те же.

let seq = 0

export async function copyItemEn(req: ItemEnRequest): Promise<void> {
  const my = ++seq
  let r: ItemEnCopy
  if (useOverlayStore.getState().game === 'poe2') r = await poe2ItemEn(req)
  else if (req.lang === 'en') r = itemEnCopy(req.text, 'en', null, null)
  else {
    const store = getDefaultPoe1DataStore()
    const [src, en] = await Promise.all([store.ensureLanguage(req.lang), store.ensureLanguage('en')]).catch(() => [null, null])
    r = itemEnCopy(req.text, req.lang, src, en)
  }
  // игрок уже нажал клавишу ещё раз (первая загрузка данных) — в буфер идёт только последний предмет
  if (my !== seq) return
  const written = r.ok ? await window.overlayApi.overlay.copyItemEn(r.text).catch(() => false) : false
  if (!r.ok) console.warn(`[itemEn] not translated: ${r.reason}`)
  useOverlayStore.getState().notify(itemEnNotice(r, written))
}
