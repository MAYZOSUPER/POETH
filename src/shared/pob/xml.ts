// Маленький XML-парсер только под то, что пишет Path of Building (S35; чистый модуль, tests/pob/xml.test.ts).
// Код PoB — недоверенные данные от игрока или чужого сайта, поэтому:
//  - <!DOCTYPE и <!ENTITY отвергаются сразу (PoB их не пишет) — нет XXE и «billion laughs»;
//  - раскрываются только 5 стандартных сущностей и числовые ссылки; прочие &…; остаются текстом как есть;
//  - пределы глубины, числа элементов, длины имени, атрибута и текста — превышение = ошибка, а не обрезка;
//  - атрибуты в Map: имя «__proto__» из чужого XML ничего не портит;
//  - разбор линейный (indexOf + липкие регэкспы без вложенных квантификаторов), рекурсии нет.
// Инструкции <?…?>, комментарии и CDATA допустимы (CDATA — просто текст). Пространства имён не нужны.

export interface XmlElement {
  name: string
  attrs: Map<string, string>
  children: XmlElement[]
  /** весь собственный текст элемента (куски между детьми склеены); только пробелы — пустая строка */
  text: string
}

export interface XmlLimits {
  /** глубина вложенности: у PoB1 — 5, у PoB2 — 6 */
  maxDepth: number
  /** элементов всего: в крупном реальном билде ~3,5 тыс. */
  maxElements: number
  /** значение одного атрибута, символов: самый длинный в реальных кодах (nodes) < 1 тыс. */
  maxAttrLength: number
  /** собственный текст одного элемента, символов: уник Forbidden Flame со всеми вариантами — 31 тыс. */
  maxTextLength: number
  /** имя элемента или атрибута */
  maxNameLength: number
  /** атрибутов у одного элемента */
  maxAttrs: number
}

export const XML_LIMITS: Readonly<XmlLimits> = Object.freeze({
  maxDepth: 8,
  maxElements: 50_000,
  maxAttrLength: 64 * 1024,
  maxTextLength: 1024 * 1024,
  maxNameLength: 64,
  maxAttrs: 64
})

export type XmlErrorCode =
  | 'doctype' // <!DOCTYPE / <!ENTITY
  | 'malformed' // не XML или не так закрыт
  | 'too-deep'
  | 'too-many-elements'
  | 'too-long' // имя, атрибут или текст длиннее предела
  | 'too-many-attrs'

export class XmlError extends Error {
  constructor(
    public readonly code: XmlErrorCode,
    public readonly at: number
  ) {
    super(`xml: ${code} @${at}`)
    this.name = 'XmlError'
  }
}

const NAME_RE = /[A-Za-z_][\w.:-]*/y
const SPACE_RE = /[ \t\r\n]*/y
const FORBIDDEN_RE = /<!(?:DOCTYPE|ENTITY|ELEMENT|ATTLIST|NOTATION)/i
const NAMED: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** Пять стандартных сущностей и &#N; / &#xH;. Всё остальное, похожее на сущность, — как есть. */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#[xX][0-9A-Fa-f]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,4});/g, (m, body: string) => {
    if (body[0] !== '#') return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m
    const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
    // XML Char: без NUL и прочих управляющих (кроме \t \n \r), без суррогатов, не больше U+10FFFF
    const ok =
      cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff)
    return ok ? String.fromCodePoint(cp) : m
  })
}

const isBlank = (s: string): boolean => /^[ \t\r\n]*$/.test(s)

/**
 * Разобрать XML в дерево. Корень — ровно один элемент; вокруг — только пробелы, инструкции и комментарии.
 * Ошибка — XmlError с кодом.
 */
export function parseXml(src: string, limits: Readonly<XmlLimits> = XML_LIMITS): XmlElement {
  if (FORBIDDEN_RE.test(src)) throw new XmlError('doctype', src.search(FORBIDDEN_RE))

  const stack: XmlElement[] = []
  /** собственный текст открытых элементов: куски и их общая длина (без пересчёта на каждом куске) */
  const texts: Array<{ parts: string[]; len: number }> = []
  const doc: { root: XmlElement | null } = { root: null }
  let elements = 0
  let pos = src.charCodeAt(0) === 0xfeff ? 1 : 0

  const fail = (code: XmlErrorCode, at = pos): never => {
    throw new XmlError(code, at)
  }
  const readName = (): string => {
    NAME_RE.lastIndex = pos
    const m = NAME_RE.exec(src)
    if (!m) return fail('malformed')
    if (m[0].length > limits.maxNameLength) fail('too-long')
    pos += m[0].length
    return m[0]
  }
  const skipSpace = (): number => {
    SPACE_RE.lastIndex = pos
    const n = (SPACE_RE.exec(src) as RegExpExecArray)[0].length
    pos += n
    return n
  }
  const addText = (raw: string, at: number): void => {
    if (!stack.length) {
      if (!isBlank(raw)) fail('malformed', at)
      return
    }
    const t = texts[texts.length - 1]
    t.len += raw.length
    if (t.len > limits.maxTextLength) fail('too-long', at)
    t.parts.push(raw)
  }

  while (pos < src.length) {
    const lt = src.indexOf('<', pos)
    if (lt < 0) {
      addText(src.slice(pos), pos)
      break
    }
    if (lt > pos) addText(src.slice(pos, lt), pos)
    pos = lt

    if (src.startsWith('<?', pos)) {
      const end = src.indexOf('?>', pos + 2)
      if (end < 0) fail('malformed')
      pos = end + 2
      continue
    }
    if (src.startsWith('<!--', pos)) {
      const end = src.indexOf('-->', pos + 4)
      if (end < 0) fail('malformed')
      pos = end + 3
      continue
    }
    if (src.startsWith('<![CDATA[', pos)) {
      if (!stack.length) fail('malformed')
      const end = src.indexOf(']]>', pos + 9)
      if (end < 0) fail('malformed')
      // CDATA — сырой текст; помечаем «&» так, чтобы decodeEntities его не тронул
      addText(src.slice(pos + 9, end).replace(/&/g, '&amp;'), pos)
      pos = end + 3
      continue
    }
    if (src.startsWith('<!', pos)) fail('doctype')

    if (src.startsWith('</', pos)) {
      pos += 2
      const name = readName()
      skipSpace()
      if (src[pos] !== '>') fail('malformed')
      pos++
      const el = stack.pop()
      if (!el || el.name !== name) fail('malformed')
      close(el as XmlElement, (texts.pop() as { parts: string[] }).parts)
      continue
    }

    // открывающий тег
    pos++
    const name = readName()
    if (++elements > limits.maxElements) fail('too-many-elements')
    if (stack.length + 1 > limits.maxDepth) fail('too-deep')
    if (doc.root && !stack.length) fail('malformed') // второй корень
    const el: XmlElement = { name, attrs: new Map(), children: [], text: '' }
    for (;;) {
      const gap = skipSpace()
      if (src.startsWith('/>', pos)) {
        pos += 2
        attach(el)
        break
      }
      if (src[pos] === '>') {
        pos++
        attach(el)
        stack.push(el)
        texts.push({ parts: [], len: 0 })
        break
      }
      if (!gap) fail('malformed')
      const attr = readName()
      skipSpace()
      if (src[pos] !== '=') fail('malformed')
      pos++
      skipSpace()
      const q = src[pos]
      if (q !== '"' && q !== "'") fail('malformed')
      const end = src.indexOf(q, pos + 1)
      if (end < 0) fail('malformed')
      const raw = src.slice(pos + 1, end)
      if (raw.length > limits.maxAttrLength) fail('too-long')
      if (el.attrs.has(attr)) fail('malformed')
      if (el.attrs.size >= limits.maxAttrs) fail('too-many-attrs')
      el.attrs.set(attr, decodeEntities(raw))
      pos = end + 1
    }
  }

  if (stack.length || !doc.root) fail('malformed')
  return doc.root as XmlElement

  function attach(el: XmlElement): void {
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(el)
    else doc.root = el
  }

  function close(el: XmlElement, parts: string[]): void {
    const joined = parts.join('')
    el.text = isBlank(joined) ? '' : decodeEntities(joined)
  }
}

// ---------------------------------------------------------------------------- помощники для модели

/** Первый ребёнок с таким именем. */
export function child(el: XmlElement | null | undefined, name: string): XmlElement | null {
  if (!el) return null
  for (const c of el.children) if (c.name === name) return c
  return null
}

/** Все дети с таким именем (в порядке документа). */
export function childrenOf(el: XmlElement | null | undefined, name: string): XmlElement[] {
  return el ? el.children.filter((c) => c.name === name) : []
}
