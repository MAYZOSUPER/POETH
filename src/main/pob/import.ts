import { inflateNode } from '@shared/advisor/codecNode'
import { POB_CODE_MAX_CHARS } from '@shared/pob/decode'
import { importPobCode, type PobImportResult } from '@shared/pob/import'
import { parsePobInput } from '@shared/pob/links'
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
