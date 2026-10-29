import { deflateSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { inflateNode } from '@shared/advisor/codecNode'
import { POB_CODE_MAX_CHARS, cleanPobCode, decodePobCode } from '@shared/pob/decode'
import { importPobCode } from '@shared/pob/import'
import { parsePobXml } from '@shared/pob/model'
import { XmlError, decodeEntities, parseXml, type XmlErrorCode } from '@shared/pob/xml'
import { encodePob, fixtureCode } from './fixtures'

const PREFIX = '<?xml version="1.0" encoding="UTF-8"?>\n'
const imp = (code: string): ReturnType<typeof importPobCode> => importPobCode(code, inflateNode)

function xmlError(src: string): XmlErrorCode | null {
  try {
    parseXml(src)
    return null
  } catch (e) {
    if (e instanceof XmlError) return e.code
    throw e
  }
}

describe('атаки через XML', () => {
  it('XXE: внешняя сущность не читается — DOCTYPE отвергается', () => {
    const xml = `${PREFIX}<!DOCTYPE PathOfBuilding [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]>
<PathOfBuilding><Build level="1" className="Witch" targetVersion="3_0"/><Notes>&xxe;</Notes></PathOfBuilding>`
    // декодер отвергает уже по заголовку (до корня PathOfBuilding — только <?xml?>), парсер — по DOCTYPE
    expect(imp(encodePob(xml))).toEqual({ ok: false, error: 'not-pob' })
    expect(parsePobXml(xml)).toEqual({ ok: false, error: 'not-pob', detail: 'doctype' })
    // DOCTYPE после корня (мимо проверки заголовка) — тоже
    const inner = '<PathOfBuilding><!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]><Notes>&xxe;</Notes></PathOfBuilding>'
    expect(imp(encodePob(inner))).toEqual({ ok: false, error: 'not-pob', detail: 'doctype' })
  })

  it('billion laughs: вложенные сущности не раскрываются', () => {
    const ents = ['<!ENTITY lol "lol">']
    for (let i = 1; i < 10; i++) ents.push(`<!ENTITY lol${i} "${`&lol${i === 1 ? '' : i - 1};`.repeat(10)}">`)
    const xml = `${PREFIX}<!DOCTYPE lolz [${ents.join('')}]><PathOfBuilding><Notes>&lol9;</Notes></PathOfBuilding>`
    expect(imp(encodePob(xml))).toEqual({ ok: false, error: 'not-pob' })
    expect(parsePobXml(xml)).toEqual({ ok: false, error: 'not-pob', detail: 'doctype' })
  })

  it('<!ENTITY без DOCTYPE, строчными буквами и внутри текста — тоже нет', () => {
    expect(xmlError('<a><!ENTITY x "y"></a>')).toBe('doctype')
    expect(xmlError('<!doctype a><a/>')).toBe('doctype')
    expect(xmlError('<a><![CDATA[<!DOCTYPE x>]]></a>')).toBe('doctype')
    expect(xmlError('<a><!ELEMENT a ANY></a>')).toBe('doctype')
  })

  it('неизвестные и опасные сущности остаются текстом', () => {
    expect(decodeEntities('&xxe; &lol9; &amp;lt; &#0; &#xD800; &#x110000; &#65;&#x42;&quot;&apos;&lt;&gt;')).toBe(
      "&xxe; &lol9; &lt; &#0; &#xD800; &#x110000; AB\"'<>"
    )
    const r = parsePobXml('<PathOfBuilding><Build level="1" className="Witch" targetVersion="3_0"/><Notes>&xxe;</Notes></PathOfBuilding>')
    expect(r.ok && r.build.notes).toBe('&xxe;')
  })

  it('огромная глубина — ошибка предела, а не переполнение стека', () => {
    const deep = '<a>'.repeat(100_000) + '</a>'.repeat(100_000)
    expect(xmlError(deep)).toBe('too-deep')
    expect(imp(encodePob(`<PathOfBuilding>${'<x>'.repeat(20)}${'</x>'.repeat(20)}</PathOfBuilding>`))).toMatchObject({
      ok: false,
      error: 'too-large',
      detail: 'too-deep'
    })
  })

  it('слишком много элементов', () => {
    expect(xmlError(`<a>${'<b/>'.repeat(50_001)}</a>`)).toBe('too-many-elements')
    expect(xmlError(`<a>${'<b/>'.repeat(49_000)}</a>`)).toBeNull()
  })

  it('длинный атрибут, длинный текст, много атрибутов', () => {
    expect(xmlError(`<a x="${'1'.repeat(64 * 1024 + 1)}"/>`)).toBe('too-long')
    expect(xmlError(`<a x="${'1'.repeat(64 * 1024)}"/>`)).toBeNull()
    expect(xmlError(`<a>${'t'.repeat(1024 * 1024 + 1)}</a>`)).toBe('too-long')
    expect(xmlError(`<a ${Array.from({ length: 65 }, (_, i) => `a${i}="1"`).join(' ')}/>`)).toBe('too-many-attrs')
    expect(xmlError(`<${'n'.repeat(65)}/>`)).toBe('too-long')
  })

  it('текст между тысячами детей считается линейно (без квадратичной проверки)', () => {
    const src = `<a>${'x<b/>'.repeat(49_000)}</a>`
    const t = performance.now()
    expect(parseXml(src).text).toBe('x'.repeat(49_000))
    expect(performance.now() - t).toBeLessThan(2000)
  })

  it('битая разметка', () => {
    for (const bad of ['', 'just text', '<a>', '<a></b>', '<a/><b/>', '<a x=1/>', '<a x="1"x="2"/>', '<a x="1" x="1"/>', 'text<a/>', '<a/>text', '<a><!-- x </a>', '<?xml', '</a>'])
      expect(xmlError(bad), bad).toBe('malformed')
  })

  it('допустимое: инструкции, комментарии, CDATA, BOM, одинарные кавычки', () => {
    const el = parseXml('\uFEFF<?xml version="1.0"?><!-- c --><a k=\'v &amp; w\'><![CDATA[1 &amp; <2>]]> &lt;3</a><!-- end -->')
    expect(el.attrs.get('k')).toBe('v & w')
    expect(el.text).toBe('1 &amp; <2> <3')
  })

  it('атрибут __proto__ не трогает прототип', () => {
    const el = parseXml('<a __proto__="x" constructor="y"/>')
    expect(el.attrs.get('__proto__')).toBe('x')
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})

describe('атаки через код', () => {
  it('zip-бомба: распаковка обрывается на 16 МБ', () => {
    const bomb = deflateSync(Buffer.concat([Buffer.from('<PathOfBuilding>'), Buffer.alloc(40 * 1024 * 1024, 0x61)]), { level: 9 })
    const code = bomb.toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    expect(code.length).toBeLessThan(POB_CODE_MAX_CHARS)
    expect(imp(code)).toEqual({ ok: false, error: 'too-large' })
  })

  it('код больше 1 МБ не распаковывается', () => {
    let called = false
    const res = decodePobCode('eN' + 'A'.repeat(POB_CODE_MAX_CHARS), () => {
      called = true
      return new Uint8Array()
    })
    expect(res).toEqual({ ok: false, error: 'too-large' })
    expect(called).toBe(false)
  })

  it('мусорный base64 и не-PoB', () => {
    const notZlib = Buffer.from('hello, this is plain text, not zlib').toString('base64')
    const zlibText = encodePob('just some text, not xml')
    const otherXml = encodePob(`${PREFIX}<svg xmlns="http://www.w3.org/2000/svg"/>`)
    const broken = fixtureCode('pobbin-crit').slice(0, 2000)
    for (const bad of ['!!!@@@', 'eN', 'eN%%%%', 'eNq', '{"json":true}', notZlib, zlibText, otherXml, broken])
      expect(imp(bad).ok, bad.slice(0, 30)).toBe(false)
    expect(imp(otherXml)).toEqual({ ok: false, error: 'not-pob' })
    expect(imp(broken)).toEqual({ ok: false, error: 'not-pob' })
  })

  it('код с переносами строк, пробелами и стандартным base64 (+/=) — принимается', () => {
    const code = fixtureCode('pobbin-crit')
    const wrapped = code.match(/.{1,76}/g)?.join('\r\n  ') ?? ''
    expect(imp(wrapped).ok).toBe(true)
    const std = code.replace(/-/g, '+').replace(/_/g, '/')
    expect(imp(std + '=').ok).toBe(true)
    expect(cleanPobCode('ab cd\nef')).toBe('abcdef')
    expect(cleanPobCode('https://pobb.in/x')).toBeNull()
  })

  it('битый UTF-8 в XML — замена символов, а не отказ', () => {
    const xml = Buffer.concat([
      Buffer.from('<PathOfBuilding><Build level="3" className="Witch" targetVersion="3_0"/><Notes>'),
      Buffer.from([0xff, 0xfe, 0xc3]),
      Buffer.from('</Notes></PathOfBuilding>')
    ])
    const r = imp(encodePob(xml))
    expect(r.ok && r.build.notes).toBe('\uFFFD\uFFFD\uFFFD')
  })
})

describe('модель: пределы и мусор в значениях', () => {
  it('числа и строки вне диапазона — значения по умолчанию', () => {
    const r = parsePobXml(
      '<PathOfBuilding><Build level="9999" className="' +
        'W'.repeat(500) +
        '" bandit="Evil" mainSocketGroup="-1" targetVersion="3_0"><PlayerStat stat="Life" value="NaN"/><PlayerStat stat="Mana" value="1e400"/></Build>' +
        '<Tree activeSpec="77"><Spec title="^1^xFF0000T\u0000itle" nodes="1,2,2,abc,-5,99999999999,3" masteryEffects="{1,2},{bad},{3,4}"/></Tree>' +
        '<Skills activeSkillSet="5"><SkillSet id="2"><Skill><Gem nameSpec="X" level="999" quality="abc" count="0"/></Skill></SkillSet></Skills>' +
        '</PathOfBuilding>'
    )
    if (!r.ok) throw new Error(r.error)
    const b = r.build
    expect(b.level).toBe(1)
    expect(b.className).toHaveLength(40)
    expect(b.bandit).toBeNull()
    expect(b.mainSocketGroup).toBeNull()
    expect(b.stats).toEqual({})
    expect(b.activeSpec).toBe(0)
    expect(b.specs[0].title).toBe('T itle')
    expect(b.specs[0].nodes).toEqual([1, 2, 3])
    expect(b.specs[0].masteryEffects).toEqual([
      { node: 1, effect: 2 },
      { node: 3, effect: 4 }
    ])
    expect(b.activeSkillSet).toBe(0)
    expect(b.skillSets[0].groups[0].gems[0]).toMatchObject({ level: 1, quality: 0, count: 1 })
  })

  it('предмет длиннее 64 КБ пропускается, заметки обрезаются', () => {
    const r = parsePobXml(
      `<PathOfBuilding><Build level="1" className="Witch" targetVersion="3_0"/><Items><Item id="1">${'x'.repeat(70_000)}</Item><Item id="2">Rarity: NORMAL\nIron Ring</Item></Items><Notes>${'n'.repeat(70_000)}</Notes></PathOfBuilding>`
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.build.items.map((i) => i.id)).toEqual([2])
    expect(r.build.notes).toHaveLength(64 * 1024)
    expect(r.build.warnings).toEqual(['item 1: text too long', 'notes truncated'])
  })
})
