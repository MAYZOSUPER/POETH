import { inflateNode } from '@shared/advisor/codecNode'
import { POB_CODE_MAX_CHARS } from '@shared/pob/decode'
import { importPob2Code, importPobCode, type Pob2ImportResult, type PobImportResult } from '@shared/pob/import'
import { parsePobInput } from '@shared/pob/links'
import { isPob2FetchUrl, parsePob2Input } from '@shared/pob/links2'
import { fetchPobCode } from './fetch'

// Вставка во вкладке «Билд» (S35): код или ссылка → билд и этапы. Разбор — здесь, в main
// (renderer получает только готовую модель — обычные строки и числа). Сеть — только для ссылки
// с сайта из allowlist и только по действию игрока (IPC вызывается кнопкой «Загрузить»).
//
// Нужный канал IPC (агрегатор заморожен — подключает лид):
//   build: { importPob: 'build:importPob' } — invoke(text: string) → PobImportResult;
//   обработчик: проверка отправителя (S29, только страница компаньона 'index'), typeof text === 'string',
//   длина ≤ POB_CODE_MAX_CHARS + 4096, затем importPob(text).

export async function importPob(text: string): Promise<PobImportResult> {
  if (typeof text !== 'string') return { ok: false, error: 'empty' }
  if (text.length > POB_CODE_MAX_CHARS + 4096) return { ok: false, error: 'too-large' }
  const input = parsePobInput(text)
  switch (input.kind) {
    case 'empty':
      return { ok: false, error: 'empty' }
    case 'not-pob':
      return { ok: false, error: 'not-pob' }
    case 'poe2':
      return { ok: false, error: 'poe2' }
    case 'copy-code':
      return { ok: false, error: 'copy-code', copySite: input.site }
    case 'unknown-link':
      return { ok: false, error: 'unknown-link', host: input.host }
    case 'code':
      return importPobCode(input.code, inflateNode)
    case 'link': {
      const res = await fetchPobCode(input.rawUrl)
      if (!res.ok) return { ok: false, error: 'fetch', fetchError: res.error }
      return importPobCode(res.code, inflateNode, { kind: 'link', site: input.site, pageUrl: input.pageUrl })
    }
  }
}

/**
 * S66: вставка на экране «Билд» PoE 2 — код или ссылка PoB2 → модель билда PoE 2. Сеть — только для ссылки с
 * сайта из allowlist PoE 2 (те же хосты + poe2db) и только по действию игрока; код PoE 1 — ошибка `poe1`.
 * Возвращает и сам код (его хранит библиотека билдов PoE 2 — при чтении он снова проходит разбор).
 */
export async function importPob2(text: string): Promise<Pob2ImportResult & { code?: string }> {
  if (typeof text !== 'string') return { ok: false, error: 'empty' }
  if (text.length > POB_CODE_MAX_CHARS + 4096) return { ok: false, error: 'too-large' }
  const input = parsePob2Input(text)
  switch (input.kind) {
    case 'empty':
      return { ok: false, error: 'empty' }
    case 'not-pob':
      return { ok: false, error: 'not-pob' }
    case 'poe1':
      return { ok: false, error: 'poe1' }
    case 'copy-code':
      return { ok: false, error: 'copy-code', copySite: input.site }
    case 'unknown-link':
      return { ok: false, error: 'unknown-link', host: input.host }
    case 'code': {
      const res = importPob2Code(input.code, inflateNode)
      return res.ok ? { ...res, code: input.code.replace(/\s+/g, '') } : res
    }
    case 'link': {
      const got = await fetchPobCode(input.rawUrl, isPob2FetchUrl)
      if (!got.ok) return { ok: false, error: 'fetch', fetchError: got.error }
      const res = importPob2Code(got.code, inflateNode, { kind: 'link', site: input.site, pageUrl: input.pageUrl })
      return res.ok ? { ...res, code: got.code.replace(/\s+/g, '') } : res
    }
  }
}
