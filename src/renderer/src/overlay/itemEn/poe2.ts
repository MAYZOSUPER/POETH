import type { ItemEnRequest } from '@shared/types'
import { getDefaultPoe2DataStore } from '@shared/poe2/data'
import { poe2ItemEnCopy } from '@shared/build/poe2ItemEn'
import type { ItemEnCopy } from '@shared/build/itemEnCopy'

// «Скопировать предмет по-английски» для PoE 2 (S61): данные PoE 2 оверлея (EE2, те же, что у окна цены PoE 2) →
// английский текст (@shared/build/poe2ItemEn). EN-клиент — как есть. Текст — только в памяти.

export async function poe2ItemEn(req: ItemEnRequest): Promise<ItemEnCopy> {
  if (req.lang === 'en') return poe2ItemEnCopy(req.text, 'en', null, null)
  const store = getDefaultPoe2DataStore()
  const [src, en] = await Promise.all([store.ensureLanguage(req.lang), store.ensureLanguage('en')]).catch(() => [null, null])
  return poe2ItemEnCopy(req.text, req.lang, src, en)
}
