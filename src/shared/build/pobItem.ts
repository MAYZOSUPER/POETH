// Текст предмета Path of Building → предмет с готовыми строками модов (S40, «Предметы этапа»).
// PoB хранит предмет почти как игра (EN), но со служебными строками: «Unique ID:», «Prefix:», «Implicits: N»,
// варианты уника («Variant:», «Selected Variant:», префикс строки {variant:1,2}) и роллы диапазоном
// {range:0.5}(10-20). Здесь — только чтение: какой вариант выбран, какое число получилось из диапазона (как
// itemLib.applyRange у PoB: min + (max − min) · range, по умолчанию 0.5), какие строки — имплициты.
// pobItemGameText собирает из этого текст «как Ctrl+C в игре» (EN) для парсера окна цены (порт APT, S4/S23).
// Чистый модуль, тесты — tests/build/pobItem.test.ts.

export type PobRarity = 'normal' | 'magic' | 'rare' | 'unique'

export interface PobModLine {
  /** строка мода на английском, с числами (диапазон уже свёрнут) */
  text: string
  crafted?: true
  fractured?: true
  enchant?: true
  /**
   * строка есть только у выбранного варианта уника ({variant:…}) — по ней вариант отличают на трейде; только если
   * варианты — выбор (ауры Aul's Uprising, кольцо Thread of Hope), а не старые версии («Pre 3.19.0» → «Current»)
   */
  variant?: true
}

export interface PobItemInfo {
  rarity: PobRarity
  /** имя: у уника и редкого — своё, у обычного и магического — строка имени целиком */
  name: string
  /** база: у уника и редкого — вторая строка; у магического — строка имени (базу находит парсер APT) */
  base: string
  implicits: PobModLine[]
  explicits: PobModLine[]
  /** «R-R G» как в PoB; null — гнёзд нет */
  sockets: string | null
  /** самая длинная связка */
  links: number
  quality: number
  levelReq: number | null
  ilvl: number | null
  corrupted: boolean
  mirrored: boolean
  /** «Shaper», «Hunter», «Searing Exarch»… */
  influences: string[]
  /** сколько вариантов у уника (0 — без вариантов) и название выбранного */
  variants: number
  variantName: string | null
  /** радиус самоцвета («Medium», «Large»…) */
  radius: string | null
  /** уник Foulborn (мутированный): имя — без приставки, на трейде — отдельный фильтр */
  foulborn: boolean
}

const RARITY: Record<string, PobRarity> = { NORMAL: 'normal', MAGIC: 'magic', RARE: 'rare', UNIQUE: 'unique', RELIC: 'unique' }

const INFLUENCES = ['Shaper', 'Elder', 'Crusader', 'Redeemer', 'Hunter', 'Warlord', 'Searing Exarch', 'Eater of Worlds']
const INFLUENCE_RE = new RegExp(`^(${INFLUENCES.join('|')}) Item$`)
/** Строки-флаги (в шапке или после модов), не моды. */
const FLAG_RE = /^(?:Corrupted|Mirrored|Split|Unidentified|Foulborn|Fractured Item|Synthesised Item|Veiled)$/
/** Служебная строка «Ключ: значение» шапки PoB. */
const META_RE = /^[A-Z][A-Za-z ]{1,40}: ?\S?/

/** Число из диапазона PoB: min + (max − min) · range; дробные — с той же точностью, что в диапазоне. */
function rangeValue(a: string, b: string, range: number): string {
  const min = Number(a)
  const max = Number(b)
  const dp = Math.max((a.split('.')[1] ?? '').length, (b.split('.')[1] ?? '').length)
  const v = min + (max - min) * range
  if (dp) return String(Number(v.toFixed(dp)))
  return String(Math.floor(v + 0.5))
}

/** «{range:0.5}+(10-20) to …» → «+15 to …»; отрицательное «(-10-10)% increased» с минусом → «reduced». */
export function applyPobRange(line: string, range = 0.5): string {
  let s = line.replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, (_m, a: string, b: string) => rangeValue(a, b, range))
  s = s.replace(/\+-/g, '-')
  s = s.replace(/^-(\d+(?:\.\d+)?%) increased\b/, '$1 reduced').replace(/^-(\d+(?:\.\d+)?%) more\b/, '$1 less')
  return s
}

interface ModTags {
  variants: number[] | null
  range: number | null
  crafted: boolean
  fractured: boolean
  enchant: boolean
  text: string
}

/** Префиксы строки PoB в фигурных скобках: {variant:1,2}{range:0.5}{crafted}{tags:…}… */
function modTags(raw: string): ModTags {
  const out: ModTags = { variants: null, range: null, crafted: false, fractured: false, enchant: false, text: raw }
  let s = raw
  for (let m = /^\{([^{}]*)\}/.exec(s); m; m = /^\{([^{}]*)\}/.exec(s)) {
    const tag = m[1]
    s = s.slice(m[0].length)
    if (tag.startsWith('variant:')) {
      out.variants = tag
        .slice(8)
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isInteger(x))
    } else if (tag.startsWith('range:')) {
      const r = Number(tag.slice(6))
      if (Number.isFinite(r)) out.range = Math.min(1, Math.max(0, r))
    } else if (tag === 'crafted') out.crafted = true
    else if (tag === 'fractured') out.fractured = true
    else if (tag === 'enchant') out.enchant = true
  }
  out.text = s.trim()
  return out
}

function int(v: string | undefined): number | null {
  if (!v) return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

/** Самая длинная связка по строке гнёзд PoB «R-R G B-B-B». */
export function maxLinks(sockets: string | null): number {
  if (!sockets) return 0
  return Math.max(0, ...sockets.split(/\s+/).filter(Boolean).map((g) => g.split('-').length))
}

/** Текст предмета PoB → предмет; не предмет (нет имени) — null. */
export function readPobItem(text: string): PobItemInfo | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return null
  let i = 0
  let rarity: PobRarity = 'normal'
  const r = /^Rarity: ?(\w+)/i.exec(lines[0])
  if (r) {
    rarity = RARITY[r[1].toUpperCase()] ?? 'normal'
    i = 1
  }
  let name = lines[i++]
  if (!name) return null
  const base = rarity === 'rare' || rarity === 'unique' ? (lines[i++] ?? name) : name
  const foulborn = rarity === 'unique' && /^Foulborn /.test(name)
  if (foulborn) name = name.slice('Foulborn '.length)

  const info: PobItemInfo = {
    rarity,
    name,
    base,
    implicits: [],
    explicits: [],
    sockets: null,
    links: 0,
    quality: 0,
    levelReq: null,
    ilvl: null,
    corrupted: false,
    mirrored: false,
    influences: [],
    variants: 0,
    variantName: null,
    radius: null,
    foulborn
  }
  const variantNames: string[] = []
  let selected: number | null = null
  const alt: number[] = []
  let implicits = -1
  const mods: Array<{ tags: ModTags; implicit: boolean }> = []

  const flag = (line: string): boolean => {
    if (line === 'Corrupted') info.corrupted = true
    else if (line === 'Mirrored') info.mirrored = true
    else {
      const inf = INFLUENCE_RE.exec(line)
      if (inf) info.influences.push(inf[1])
      else if (!FLAG_RE.test(line)) return false
    }
    return true
  }

  for (; i < lines.length; i++) {
    const line = lines[i]
    if (implicits < 0) {
      // шапка: служебные строки до «Implicits: N»
      const im = /^Implicits: ?(\d+)$/.exec(line)
      if (im) {
        implicits = Number(im[1])
        continue
      }
      if (flag(line)) continue
      const kv = /^([A-Za-z ]+): ?(.*)$/.exec(line)
      if (kv && META_RE.test(line)) {
        const [, key, value] = kv
        if (key === 'Variant') variantNames.push(value)
        else if (key === 'Selected Variant') selected = int(value)
        else if (/^Selected Alt Variant/.test(key)) {
          const n = int(value)
          if (n !== null) alt.push(n)
        } else if (key === 'Sockets') info.sockets = value.trim() || null
        else if (key === 'Quality') info.quality = int(value) ?? 0
        else if (key === 'LevelReq') info.levelReq = int(value)
        else if (key === 'Item Level') info.ilvl = int(value)
        else if (key === 'Radius') info.radius = value.trim() || null
        continue
      }
      const req = /^Requires Level (\d+)/.exec(line)
      if (req) {
        info.levelReq = Number(req[1])
        continue
      }
      // прочее в шапке (повтор базы у уника из базы PoB и т. п.) — пропускаем
      continue
    }
    if (flag(line)) continue
    mods.push({ tags: modTags(line), implicit: mods.length < implicits })
  }

  info.variants = variantNames.length
  if (variantNames.length && (selected === null || selected < 1 || selected > variantNames.length)) selected = variantNames.length
  info.variantName = selected !== null ? (variantNames[selected - 1] ?? null) : null
  const chosen = new Set<number>([...(selected !== null ? [selected] : []), ...alt])
  // варианты-«версии» PoB называет «Pre 3.19.0», «Legacy»…; выбор есть, если кроме выбранного есть ещё не-версии
  const isVersion = (n: string): boolean => /^(?:Pre |Legacy|Current$)/i.test(n)
  const choice = variantNames.filter((n, i) => !isVersion(n) && i + 1 !== selected).length > 0 && !isVersion(info.variantName ?? '')

  for (const { tags, implicit } of mods) {
    if (tags.variants && variantNames.length && !tags.variants.some((v) => chosen.has(v))) continue
    if (!tags.text) continue
    const line: PobModLine = { text: applyPobRange(tags.text, tags.range ?? 0.5) }
    if (tags.crafted) line.crafted = true
    if (tags.fractured) line.fractured = true
    if (tags.enchant) line.enchant = true
    if (tags.variants && choice) line.variant = true
    ;(implicit ? info.implicits : info.explicits).push(line)
  }
  info.links = maxLinks(info.sockets)
  return info
}

const RARITY_EN: Record<PobRarity, string> = { normal: 'Normal', magic: 'Magic', rare: 'Rare', unique: 'Unique' }
const ELDRITCH = new Set(['Searing Exarch', 'Eater of Worlds'])

/** База без пометки варианта PoB: «Two-Stone Ring (Cold/Lightning)» → «Two-Stone Ring». */
export function pobBaseName(base: string): string {
  return base.replace(/\s*\([^()]*\)$/, '')
}

/**
 * Текст «как Ctrl+C в игре» (EN, без строк { … }) для парсера окна цены: имя, гнёзда, уровень предмета,
 * зачарования, имплициты с « (implicit)», моды (созданные — « (crafted)»), «Corrupted».
 */
export function pobItemGameText(info: PobItemInfo): string {
  const plain = info.rarity === 'normal' || info.rarity === 'magic'
  const head = [`Item Class: Item`, `Rarity: ${RARITY_EN[info.rarity]}`, plain ? pobBaseName(info.name) : info.foulborn ? `Foulborn ${info.name}` : info.name]
  if (!plain) head.push(pobBaseName(info.base))
  const sections: string[][] = [head]
  if (info.sockets) sections.push([`Sockets: ${info.sockets}`])
  if (info.ilvl) sections.push([`Item Level: ${info.ilvl}`])
  const enchants = info.implicits.filter((m) => m.enchant).map((m) => `${m.text} (enchant)`)
  const implicits = info.implicits.filter((m) => !m.enchant).map((m) => `${m.text} (implicit)`)
  if (enchants.length) sections.push(enchants)
  if (implicits.length) sections.push(implicits)
  const explicits = info.explicits.map((m) => (m.crafted ? `${m.text} (crafted)` : m.fractured ? `${m.text} (fractured)` : m.text))
  if (explicits.length) sections.push(explicits)
  // влияния Пожирателя и Экзарха игра строкой «… Item» не пишет (парсер APT на них падает)
  const influences = info.influences.filter((x) => !ELDRITCH.has(x))
  if (influences.length) sections.push(influences.map((x) => `${x} Item`))
  if (info.corrupted) sections.push(['Corrupted'])
  return sections.map((s) => s.join('\n')).join('\n--------\n')
}

// ---------------------------------------------------------------------------- ключевые свойства

/** Что в строке мода важно новичку: жизнь, сопротивления, скорость, «важно для билда» (урон, камни, умения). */
export type PropKind = 'life' | 'res' | 'speed' | 'build'

const LIFE_RE = /\bto maximum Life\b|\bincreased maximum Life\b|\btotal maximum Life\b/
const RES_RE = /% (?:total )?(?:to )?(?:all Elemental|Fire|Cold|Lightning|Chaos|all|Fire and Cold|Fire and Lightning|Cold and Lightning)(?: and \w+)? Resistances?$|total (?:Elemental )?Resistance$/
const SPEED_RE = /increased Movement Speed(?: during (?:any Flask )?Effect)?$/
const BUILD_RE =
  /to Level of|Socketed|Spell Damage|Damage to Spells|Damage with|Critical Strike|Attack Speed|Cast Speed|Physical Damage|Elemental Damage|Fire Damage|Cold Damage|Lightning Damage|Chaos Damage|Damage over Time|increased Damage\b|Minion|^Grants|^Triggers?|Projectiles?\b|Area of Effect|Aura|Maximum \w+ Charges?|Curse|Allocates|Passive Skills?|Converted to|has no Reservation/

/** Вид строки мода (EN или ref стата с #); null — прочее (показываем бледным). */
export function propKind(line: string): PropKind | null {
  if (SPEED_RE.test(line)) return 'speed'
  if (LIFE_RE.test(line) && !/Regenerat|Leech|Recover|on Kill|on Hit/.test(line)) return 'life'
  if (RES_RE.test(line) && !/Penetrat|maximum/i.test(line)) return 'res'
  // «… урона от ударов становится …», «получаемый урон» — защита, не урон билда
  if (BUILD_RE.test(line) && !/\btaken\b|from Hits|Damage Taken/i.test(line)) return 'build'
  return null
}

// ---------------------------------------------------------------------------- числа для «что нужно от слота»

export type Element = 'fire' | 'cold' | 'lightning' | 'chaos'
export type Attribute = 'str' | 'dex' | 'int'

export interface ItemNumbers {
  life: number
  es: number
  speed: number
  res: Record<Element, number>
  attr: Record<Attribute, number>
  /** «+N к уровню камней чар» */
  spellLevels: number
}

const ELEMENT: Record<string, Element> = { Fire: 'fire', Cold: 'cold', Lightning: 'lightning', Chaos: 'chaos' }
const ATTRIBUTE: Record<string, Attribute> = { Strength: 'str', Dexterity: 'dex', Intelligence: 'int' }

/** Плоские жизнь, ЭЩ, скорость, сопротивления и атрибуты из строк предмета (EN). */
export function itemNumbers(info: Pick<PobItemInfo, 'implicits' | 'explicits'>): ItemNumbers {
  const out: ItemNumbers = { life: 0, es: 0, speed: 0, res: { fire: 0, cold: 0, lightning: 0, chaos: 0 }, attr: { str: 0, dex: 0, int: 0 }, spellLevels: 0 }
  for (const { text } of [...info.implicits, ...info.explicits]) {
    let m: RegExpExecArray | null
    if ((m = /^\+(\d+) to maximum Life$/.exec(text))) out.life += Number(m[1])
    else if ((m = /^\+(\d+) to maximum Energy Shield$/.exec(text))) out.es += Number(m[1])
    else if ((m = /^(\d+)% increased Movement Speed$/.exec(text))) out.speed += Number(m[1])
    else if ((m = /^([+-]\d+)% to all Elemental Resistances$/.exec(text))) {
      out.res.fire += Number(m[1])
      out.res.cold += Number(m[1])
      out.res.lightning += Number(m[1])
    } else if ((m = /^([+-]\d+)% to (Fire|Cold|Lightning) and (Fire|Cold|Lightning) Resistances$/.exec(text))) {
      out.res[ELEMENT[m[2]]] += Number(m[1])
      out.res[ELEMENT[m[3]]] += Number(m[1])
    } else if ((m = /^([+-]\d+)% to (Fire|Cold|Lightning|Chaos) Resistance$/.exec(text))) out.res[ELEMENT[m[2]]] += Number(m[1])
    else if ((m = /^\+(\d+) to all Attributes$/.exec(text))) {
      out.attr.str += Number(m[1])
      out.attr.dex += Number(m[1])
      out.attr.int += Number(m[1])
    } else if ((m = /^\+(\d+) to (Strength|Dexterity|Intelligence) and (Strength|Dexterity|Intelligence)$/.exec(text))) {
      out.attr[ATTRIBUTE[m[2]]] += Number(m[1])
      out.attr[ATTRIBUTE[m[3]]] += Number(m[1])
    } else if ((m = /^\+(\d+) to (Strength|Dexterity|Intelligence)$/.exec(text))) out.attr[ATTRIBUTE[m[2]]] += Number(m[1])
    else if ((m = /^\+(\d+) to Level of all (?:\w+ )?Spell Skill Gems$/.exec(text))) out.spellLevels += Number(m[1])
  }
  return out
}
