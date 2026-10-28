// Склонение русских названий валюты после числа (S18): «1 Божественная сфера», «2 Сферы хаоса», «149 Сфер хаоса»,
// «1,5 Сферы хаоса», винительный для «на N …» — «на 1 Сферу хаоса». Сами названия — из данных APT
// (items.ndjson), здесь только правила: главное слово — первое существительное, прилагательные перед ним
// согласуются с ним, хвост в родительном падеже («хаоса», «Каландры», «ваал») не меняется.

/** Форма после числа: 1/21 — one, 2–4/22 — few, 0/5–20/11–14 — many, дробь (1,5) — frac. */
export type RuCount = 'one' | 'few' | 'many' | 'frac'
/** Именительный («стоит 2 Сферы хаоса») или винительный («подорожал на 1 Сферу хаоса»). */
export type RuCase = 'nom' | 'acc'
export type RuGender = 'm' | 'f' | 'n'

/** Форма по числу или по его записи на русском («149,2», «1 500», «≈ 3», «−21»). */
export function ruCount(value: number | string): RuCount {
  let int: number
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'many'
    const a = Math.abs(value)
    if (!Number.isInteger(a)) return 'frac'
    int = a
  } else {
    const m = /\d[\d\s  ]*(?:[.,]\d+)?/.exec(value)
    if (!m) return 'many'
    if (/[.,]\d/.test(m[0])) return 'frac'
    int = Number(m[0].replace(/\D/g, ''))
  }
  const d10 = int % 10
  const d100 = int % 100
  if (d10 === 1 && d100 !== 11) return 'one'
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'few'
  return 'many'
}

interface Forms {
  g: RuGender
  nom: string
  gen: string
  acc: string
  /** именительный множественного — только у прилагательных (2–4 + женский род: «2 Божественные сферы») */
  nomPl?: string
  genPl: string
  /** неисчисляемое («Золото»): после любого числа, кроме 1, — родительный единственного */
  mass?: boolean
}

/** Существительные, которые правилами не просклонять (беглые гласные, особые формы, неисчисляемые). */
const NOUNS: Record<string, Omit<Forms, 'nom'>> = {
  масло: { g: 'n', gen: 'масла', acc: 'масло', genPl: 'масел' },
  глаз: { g: 'm', gen: 'глаза', acc: 'глаз', genPl: 'глаз' },
  слеза: { g: 'f', gen: 'слезы', acc: 'слезу', genPl: 'слёз' },
  уголь: { g: 'm', gen: 'угля', acc: 'уголь', genPl: 'углей' },
  уголёк: { g: 'm', gen: 'уголька', acc: 'уголёк', genPl: 'угольков' },
  камень: { g: 'm', gen: 'камня', acc: 'камень', genPl: 'камней' },
  золото: { g: 'n', gen: 'золота', acc: 'золото', genPl: 'золота', mass: true }
}

const VOWEL = 'аеёиоуыэюя'
const VELAR = /[гкх]$/
const SIBILANT = /[жшщч]$/
const ADJ_RE = /(ая|яя|ый|ий|ой|ое|ее)$/

function isAdjective(w: string): boolean {
  const base = w.endsWith('ся') ? w.slice(0, -2) : w
  return base.length > 3 && ADJ_RE.test(base)
}

/** Прилагательное (или причастие на -ся) в именительном единственного → его формы. */
function adjectiveForms(w: string): Forms {
  if (w.endsWith('ся') && w.length > 5) {
    const f = adjectiveForms(w.slice(0, -2))
    const add = (s: string): string => `${s}ся`
    return { g: f.g, nom: w, gen: add(f.gen), acc: add(f.acc), nomPl: add(f.nomPl ?? f.genPl), genPl: add(f.genPl) }
  }
  const s = w.slice(0, -2)
  const hard = !(VELAR.test(s) || SIBILANT.test(s)) // после г/к/х/ж/ш/щ/ч — «-ие/-их», не «-ые/-ых»
  const pl = hard ? 'ые' : 'ие'
  const plGen = hard ? 'ых' : 'их'
  switch (w.slice(-2)) {
    case 'ая':
      return { g: 'f', nom: w, gen: s + (SIBILANT.test(s) ? 'ей' : 'ой'), acc: `${s}ую`, nomPl: s + pl, genPl: s + plGen }
    case 'яя':
      return { g: 'f', nom: w, gen: `${s}ей`, acc: `${s}юю`, nomPl: `${s}ие`, genPl: `${s}их` }
    case 'ий':
      return { g: 'm', nom: w, gen: s + (VELAR.test(s) ? 'ого' : 'его'), acc: w, nomPl: `${s}ие`, genPl: `${s}их` }
    case 'ее':
      return { g: 'n', nom: w, gen: `${s}его`, acc: w, nomPl: `${s}ие`, genPl: `${s}их` }
    case 'ое':
      return { g: 'n', nom: w, gen: `${s}ого`, acc: w, nomPl: s + pl, genPl: s + plGen }
    default: // -ый, -ой
      return { g: 'm', nom: w, gen: `${s}ого`, acc: w, nomPl: s + pl, genPl: s + plGen }
  }
}

/** Существительное в именительном единственного → его формы (правила + исключения NOUNS). */
function nounForms(w: string): Forms {
  const ex = NOUNS[w]
  if (ex) return { nom: w, ...ex }
  const last = w.slice(-1)
  const s = w.slice(0, -1)
  if (last === 'ь') return { g: 'f', nom: w, gen: `${s}и`, acc: w, genPl: `${s}ей` } // сущность, деталь
  if (w.endsWith('ия')) return { g: 'f', nom: w, gen: `${s}и`, acc: `${s}ю`, genPl: `${w.slice(0, -2)}ий` }
  if (last === 'я') return { g: 'f', nom: w, gen: `${s}и`, acc: `${s}ю`, genPl: `${s}ь` }
  if (last === 'а') {
    // татуировка → татуировок (беглая о между согласными), призма → призм
    const genPl = new RegExp(`[^${VOWEL}й]к$`).test(s) ? `${s.slice(0, -1)}${SIBILANT.test(s.slice(0, -1)) ? 'е' : 'о'}к` : s
    return { g: 'f', nom: w, gen: s + (VELAR.test(s) || SIBILANT.test(s) ? 'и' : 'ы'), acc: `${s}у`, genPl }
  }
  if (w.endsWith('ие')) return { g: 'n', nom: w, gen: `${s}я`, acc: w, genPl: `${w.slice(0, -2)}ий` }
  if (last === 'о') return { g: 'n', nom: w, gen: `${s}а`, acc: w, genPl: s }
  if (last === 'е') return { g: 'n', nom: w, gen: `${s}я`, acc: w, genPl: `${s}ей` }
  if (last === 'й') return { g: 'm', nom: w, gen: `${s}я`, acc: w, genPl: `${s}ев` } // скарабей
  // мужской род на согласный; беглая гласная: осколок → осколка, резец → резца
  let stem = w
  if (w.length > 5 && new RegExp(`[^${VOWEL}]ок$`).test(w)) stem = `${w.slice(0, -2)}к`
  else if (new RegExp(`[^${VOWEL}]ец$`).test(w)) stem = `${w.slice(0, -2)}ц`
  return { g: 'm', nom: w, gen: `${stem}а`, acc: w, genPl: stem + (SIBILANT.test(stem) ? 'ей' : 'ов') }
}

function pick(f: Forms, count: RuCount, c: RuCase, adjective: boolean, mass: boolean): string {
  if (count === 'one') return c === 'acc' ? f.acc : f.nom
  if (mass || count === 'frac') return f.gen
  if (count === 'few') return adjective ? (f.g === 'f' ? (f.nomPl ?? f.genPl) : f.genPl) : f.gen
  return f.genPl
}

function sameCase(src: string, out: string): string {
  return src[0] !== src[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out
}

interface Parsed {
  words: string[]
  /** индекс главного слова; до него — согласуемые прилагательные */
  head: number
  /** главное слово — прилагательное в роли существительного («Зубчатое ископаемое») */
  substantive: boolean
  forms: Forms
}

function parse(name: string): Parsed | null {
  const words = name.trim().split(/\s+/)
  // «Таранные …», «Диковинные …» — название во множественном числе: не склоняем
  if (!words[0] || /ые$/.test(words[0].toLowerCase())) return null
  if (!words.every((w) => /^[А-Яа-яЁё-]+$/.test(w))) return null
  let head = words.findIndex((w) => !isAdjective(w.toLowerCase()))
  // все слова — прилагательные: последнее и есть существительное («Зубчатое ископаемое»)
  const substantive = head === -1
  if (substantive) head = words.length - 1
  const lower = words[head].toLowerCase()
  return { words, head, substantive, forms: substantive ? adjectiveForms(lower) : nounForms(lower) }
}

/** Название после числа: declineRu('Сфера хаоса', 'many') → 'Сфер хаоса'. Непонятное — как есть. */
export function declineRu(name: string, count: RuCount, c: RuCase = 'nom'): string {
  const p = parse(name)
  if (!p) return name
  const mass = !!p.forms.mass
  return p.words
    .map((w, i) => {
      if (i > p.head) return w
      const isHead = i === p.head
      const f = isHead ? p.forms : adjectiveForms(w.toLowerCase())
      return sameCase(w, pick(f, count, c, !isHead || p.substantive, mass))
    })
    .join(' ')
}

/** Род названия — для согласования глагола («Божественная сфера подорожала»). */
export function ruGender(name: string): RuGender {
  return parse(name)?.forms.g ?? 'f'
}
