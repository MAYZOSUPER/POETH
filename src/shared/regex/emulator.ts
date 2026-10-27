// Эмулятор поля поиска игры (PoE 1): по строке поиска и тексту подсказки предмета говорит,
// подсветит ли игра предмет. Нужен тестам (нет ложных срабатываний) и UI (что заденет строка).
//
// Правила (docs/regex.md):
//   • термы через пробел — И; "…" — терм с пробелами внутри;
//   • | внутри терма — ИЛИ (это обычная альтернатива регулярки);
//   • ведущий ! (внутри кавычек или перед термом) — НЕ для всего терма: "!a|b" = нет ни a, ни b;
//   • регистр не важен; терм — регулярка (. \d [..] ( ) ? + * {n} $);
//   • поиск по всему тексту подсказки; строки подсказки разделены \n, «.» не переходит через строку,
//     $ — конец строки.
// Опции моделируют то, что в игре не проверено: свёртка ё→е и регистр только для латиницы.

export interface EmulatorOptions {
  /** игра не различает ё и е */
  foldYo?: boolean
  /** без учёта регистра только для латиницы (кириллица — с учётом) */
  asciiCaseOnly?: boolean
}

export interface SearchTerm {
  negate: boolean
  /** тело терма — регулярка */
  source: string
}

/** Разобрать строку поиска на термы. Бросает Error при незакрытой кавычке. */
export function parseSearch(query: string): SearchTerm[] {
  const terms: SearchTerm[] = []
  let i = 0
  while (i < query.length) {
    const ch = query[i]
    if (ch === ' ') {
      i++
      continue
    }
    let negate = false
    if (ch === '!') {
      negate = true
      i++
    }
    let body: string
    if (query[i] === '"') {
      const end = query.indexOf('"', i + 1)
      if (end < 0) throw new Error(`незакрытая кавычка в позиции ${i}`)
      body = query.slice(i + 1, end)
      i = end + 1
    } else {
      const end = query.indexOf(' ', i)
      body = end < 0 ? query.slice(i) : query.slice(i, end)
      i = end < 0 ? query.length : end
    }
    if (body.startsWith('!')) {
      negate = !negate
      body = body.slice(1)
    }
    if (body) terms.push({ negate, source: body })
  }
  return terms
}

function foldYo(s: string): string {
  return s.replace(/ё/g, 'е').replace(/Ё/g, 'Е')
}

function lowerAscii(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase())
}

/** Скомпилировать строку поиска в предикат «подсветит ли игра этот текст». */
export function compileSearch(query: string, opts: EmulatorOptions = {}): (itemText: string) => boolean {
  const prep = (s: string): string => {
    let out = opts.foldYo ? foldYo(s) : s
    if (opts.asciiCaseOnly) out = lowerAscii(out)
    return out
  }
  const flags = opts.asciiCaseOnly ? 'm' : 'im'
  const terms = parseSearch(query).map((t) => ({ negate: t.negate, re: new RegExp(prep(t.source), flags) }))
  return (itemText: string) => {
    const text = prep(itemText)
    return terms.every((t) => t.re.test(text) !== t.negate)
  }
}

/** Подсветит ли игра предмет с текстом itemText по строке query. */
export function matchesSearch(query: string, itemText: string, opts: EmulatorOptions = {}): boolean {
  return compileSearch(query, opts)(itemText)
}
