import type { Build2Dir, Build2ImportResult, Build2SaveResult } from '@shared/types/build2'

// Тексты ошибок экрана «Билд» PoE 2 (S66): ответ main → ключ словаря build2.* (загрузка по ссылке — общие
// строки bd.err.fetch.* вкладки PoE 1).

type T = (key: string, params?: Record<string, string | number>) => string
type ImportFail = Extract<Build2ImportResult, { ok: false }>
type SaveFail = Extract<Build2SaveResult, { ok: false }>

export function importErrorText(e: ImportFail, t: T): string {
  switch (e.error) {
    case 'empty':
      return t('build2.err.empty')
    case 'too-large':
      return t('build2.err.big')
    case 'poe1':
      return t('build2.err.poe1')
    case 'copy-code':
      return t(`build2.err.copy.${e.copySite ?? 'poeninja'}`)
    case 'unknown-link':
      return t('build2.err.site', { host: e.host || '?' })
    case 'fetch':
      return `${t('build2.err.fetch')} ${t(`bd.err.fetch.${e.fetchError ?? 'network'}`)}`
    case 'no-data':
      return t('build2.err.noData')
    default:
      return t('build2.err.notPob')
  }
}

/**
 * Папка планировщика для показа: «Документы\My Games\Path of Exile 2\BuildPlanner» на языке интерфейса — без
 * C:\Users\<имя> (полный путь знает только main). Подмена папки в разработке — «…\<папка>».
 */
export function dirText(dir: Build2Dir | undefined, t: T): string {
  if (!dir) return ''
  return [dir.documents ? t('build2.dlg.docs') : '…', ...dir.parts].join('\\')
}

export function saveErrorText(e: SaveFail, t: T): string {
  if (e.error === 'no-game-dir') return t('build2.err.save.no-game-dir', { path: dirText(e.dir, t) })
  if (e.error === 'confirm') return ''
  return t(`build2.err.save.${e.error}`)
}
