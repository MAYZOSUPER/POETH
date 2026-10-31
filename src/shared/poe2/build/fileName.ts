// Имя файла `.build` для папки игрового планировщика PoE 2 (S66; чистый модуль, tests/build2/fileName.test.ts).
// Из названия билда (его видно в игре — внутри файла, поле `name`), без личных данных. Имя файла — только латиница,
// цифры, пробел, «-», «_», «(», «)» и «.»: кириллицу переводим латиницей (игра и Windows с кириллицей в путях
// не всегда дружат — S53, фильтры), прочее убираем. Зарезервированные имена Windows и пустое — заменяем.

export const BUILD_EXT = '.build'
/** без расширения: путь `Documents/My Games/Path of Exile 2/BuildPlanner/<имя>.build` остаётся коротким */
export const FILE_NAME_MAX = 60

const RU: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
}

function translit(s: string): string {
  let out = ''
  for (const ch of s) {
    const low = ch.toLowerCase()
    const t = RU[low]
    if (t === undefined) out += ch
    else out += ch === low || !t ? t : t[0].toUpperCase() + t.slice(1)
  }
  return out
}

const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Название билда → имя файла `<имя>.build` (только безопасные символы). */
export function buildFileName(name: string): string {
  let s = translit(String(name ?? '').normalize('NFC'))
    .replace(/[—–]/g, '-')
    .replace(/[^A-Za-z0-9 ._()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/^[.\s-]+|[.\s]+$/g, '')
  if (s.length > FILE_NAME_MAX) s = s.slice(0, FILE_NAME_MAX).replace(/[.\s]+$/g, '')
  if (!s || RESERVED.test(s)) s = s ? `${s}_build` : 'PoE2 build'
  return `${s}${BUILD_EXT}`
}

/** Имя свободно? Нет — «Имя (2).build», «Имя (3).build»… (для «Сохранить копией»). */
export function nextFreeName(fileName: string, taken: (name: string) => boolean): string {
  if (!taken(fileName)) return fileName
  const base = fileName.endsWith(BUILD_EXT) ? fileName.slice(0, -BUILD_EXT.length) : fileName
  for (let i = 2; i < 100; i++) {
    const n = `${base} (${i})${BUILD_EXT}`
    if (!taken(n)) return n
  }
  return `${base} (${Date.now()})${BUILD_EXT}`
}
