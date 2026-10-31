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

/**
 * Зарезервированные имена Windows — и с расширением: «CON.build», «nul.x.build», «COM1 .build» тоже не создать.
 * Проверяем часть имени до первой точки (пробелы перед точкой Windows отбрасывает).
 */
const RESERVED = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])\s*(?:\.|$)/i

/** Имя файла (с расширением или без) — зарезервированное имя устройства Windows. */
export function isReservedName(name: string): boolean {
  return RESERVED.test(name)
}

/** Название билда → имя файла `<имя>.build` (только безопасные символы). */
export function buildFileName(name: string): string {
  let s = translit(String(name ?? '').normalize('NFC'))
    .replace(/[—–]/g, '-')
    .replace(/[^A-Za-z0-9 ._()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/^[.\s-]+|[.\s]+$/g, '')
  if (!s) s = 'PoE2 build'
  else if (isReservedName(s)) s = `PoE2 ${s}`
  return `${fit(s, FILE_NAME_MAX)}${BUILD_EXT}`
}

/** Обрезать основу имени до max, без точек и пробелов в конце. */
function fit(stem: string, max: number): string {
  return stem.length > max ? stem.slice(0, max).replace(/[.\s]+$/g, '') : stem
}

/** Сколько копий пробовать: «Имя (2)» … «Имя (99)». */
export const COPIES_MAX = 99

/**
 * «Сохранить копией» (S66): первое свободное имя — само имя (n = 1), иначе «Имя (2).build», «Имя (3).build»…
 * Суффикс всегда помещается: основа обрезается так, чтобы «Имя (N)» было не длиннее FILE_NAME_MAX (транслит
 * удлиняет кириллицу, и длинное название упирается в предел). `taken` — имя занято (на Windows — без учёта регистра).
 * null — свободного нет среди COPIES_MAX.
 */
export function nextFreeName(fileName: string, taken: (name: string) => boolean): { fileName: string; n: number } | null {
  if (!taken(fileName)) return { fileName, n: 1 }
  const base = fileName.endsWith(BUILD_EXT) ? fileName.slice(0, -BUILD_EXT.length) : fileName
  for (let n = 2; n <= COPIES_MAX; n++) {
    const suffix = ` (${n})`
    const name = `${fit(base, FILE_NAME_MAX - suffix.length)}${suffix}${BUILD_EXT}`
    if (!taken(name)) return { fileName: name, n }
  }
  return null
}

/** Название копии в игре: «Название (N)», не длиннее max (суффикс не обрезается). */
export function copyBuildName(name: string, n: number, max = 80): string {
  if (n <= 1) return name
  const suffix = ` (${n})`
  return `${name.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`
}
