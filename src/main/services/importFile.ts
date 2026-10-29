import { promises as fs } from 'fs'

// Файл импорта, выбранный игроком (библиотека regex и т.п.; S29): размер проверяется ДО чтения — чужой
// «файл библиотеки» на сотни мегабайт не должен повесить main. Без electron — tests/security/importLimits.test.ts.

/** JSON из файла не больше maxBytes (BOM срезается); undefined — нет файла, слишком большой или не JSON. */
export async function readImportJson(file: string, maxBytes: number): Promise<unknown> {
  try {
    const st = await fs.stat(file)
    if (!st.isFile() || st.size > maxBytes) return undefined
    const text = await fs.readFile(file, 'utf8')
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown
  } catch {
    return undefined
  }
}
