import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { deflateSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { inflateNode } from '@shared/advisor/codecNode'
import { decodePobCode } from '@shared/pob/decode'
import { pobCanonicalXml, pobFingerprint } from '@shared/starters/fingerprint'
import { importStarterCode, levelingHint, pobChanged, starterFacts } from '@shared/starters/play'
import { POB_FIX } from './fixtures'

// Отпечаток проверенной версии PoB (S59, §2.4) и сверка при «Играть по этому гайду».

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
const code = (name: string): string => readFileSync(join(POB_FIX, `${name}.txt`), 'utf8').trim()
const xmlOf = (c: string): string => {
  const d = decodePobCode(c, inflateNode)
  if (!d.ok) throw new Error(d.error)
  return d.xml
}
/** XML → код PoB: zlib с заданным уровнем, base64url, как PoB. */
const encode = (xml: string, level = 9): string =>
  deflateSync(Buffer.from(xml, 'utf8'), { level }).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const ACTS = code('pobbin-acts-all-axes')
const ACTS_SHA = '7939c644e9b58fc594a2cd11316a600c3e01b074be6268effd977de5e8e88ec8'

describe('отпечаток PoB', () => {
  it('стабилен: тот же XML, сжатый иначе, — тот же отпечаток', () => {
    const xml = xmlOf(ACTS)
    expect(pobFingerprint(xml, sha256)).toBe(ACTS_SHA)
    const other = encode(xml, 1)
    expect(other).not.toBe(ACTS)
    expect(pobFingerprint(xmlOf(other), sha256)).toBe(ACTS_SHA)
  })

  it('<Import> (хэши аккаунта и персонажа) не влияет', () => {
    const xml = xmlOf(ACTS)
    expect(xml).toMatch(/<Import\s*\/>/)
    const withAccount = xml.replace(/<Import\s*\/>/, '<Import lastAccountHash="0123456789abcdef" lastCharacterHash="fedcba9876543210" lastRealm="PC" exportParty="false"/>')
    expect(withAccount).not.toBe(xml)
    expect(pobFingerprint(withAccount, sha256)).toBe(ACTS_SHA)
    expect(pobCanonicalXml(withAccount)).not.toContain('lastAccountHash')
  })

  it('пробелы, переводы строк и порядок атрибутов не влияют', () => {
    const xml = xmlOf(ACTS)
    const crlf = xml.replace(/\n/g, '\r\n')
    expect(pobFingerprint(crlf, sha256)).toBe(ACTS_SHA)
    const swapped = xml.replace(/<Build ([^>]*?)(\s*\/?>)/, (_m, attrs: string, end: string) => {
      const parts = attrs.match(/\w+="[^"]*"/g) ?? []
      return `<Build ${parts.reverse().join(' ')}${end}`
    })
    expect(swapped).not.toBe(xml)
    expect(pobFingerprint(swapped, sha256)).toBe(ACTS_SHA)
  })

  it('правка билда (уровень, нода) меняет отпечаток', () => {
    const xml = xmlOf(ACTS)
    const lvl = xml.replace(/(<Build [^>]*\blevel=")(\d+)"/, (_m, a: string, n: string) => `${a}${Number(n) + 1}"`)
    expect(lvl).not.toBe(xml)
    expect(pobFingerprint(lvl, sha256)).not.toBe(ACTS_SHA)
  })

  it('не XML — null', () => {
    expect(pobCanonicalXml('not xml at all')).toBeNull()
    expect(pobFingerprint('<a><b></a>', sha256)).toBeNull()
  })
})

describe('«Играть по этому гайду»: код → билд и сверка', () => {
  it('совпал с проверенным — «не изменился»', () => {
    const r = importStarterCode(ACTS, inflateNode, sha256)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fingerprint).toBe(ACTS_SHA)
    expect(pobChanged(ACTS_SHA, r.fingerprint)).toBe(false)
    expect(r.build.className).toBe('Duelist')
  })

  it('автор перезаписал пасту — «обновлён после проверки»', () => {
    const xml = xmlOf(ACTS).replace(/(<Build [^>]*\blevel=")(\d+)"/, (_m, a: string, n: string) => `${a}${Number(n) + 1}"`)
    const r = importStarterCode(encode(xml), inflateNode, sha256)
    expect(r.ok && pobChanged(ACTS_SHA, r.fingerprint)).toBe(true)
  })

  it('битый код — ошибка разбора, а не исключение', () => {
    expect(importStarterCode('<html>404</html>', inflateNode, sha256)).toMatchObject({ ok: false, error: 'not-pob' })
    expect(importStarterCode('', inflateNode, sha256)).toMatchObject({ ok: false, error: 'empty' })
  })

  it('подсказки для add-starter: класс, навык, версия игры, «ведёт по актам»', () => {
    const acts = importStarterCode(ACTS, inflateNode, sha256)
    expect(acts.ok && starterFacts(acts.build)).toMatchObject({
      class: 'Duelist',
      ascendancy: 'Champion',
      skill: { en: 'Boneshatter of Carnage', gem: 'Metadata/Items/Gems/SkillGemBoneshatterAltY' },
      patch: '3.26',
      leveling: 'acts',
      stages: 10
    })
    const crit = importStarterCode(code('pobbin-crit'), inflateNode, sha256)
    expect(crit.ok && levelingHint(crit.build)).toBe('none')
  })
})
