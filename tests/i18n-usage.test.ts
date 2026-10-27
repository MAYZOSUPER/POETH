import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { DOMAIN_DICTS } from '../src/renderer/src/i18n/dicts'

// Полнота словарей по коду (S9): каждый ключ, который компонент передаёт в t('…') строкой,
// есть и в RU, и в EN; в английских строках нет кириллицы (забытый перевод), а в русских —
// латиницы целыми фразами; русские строки держатся одних терминов (см. TERMS).

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src/renderer/src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return p.includes(`${join('i18n', 'dict')}`) ? [] : files(p)
    return /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

const ru: Record<string, string> = {}
const en: Record<string, string> = {}
for (const d of Object.values(DOMAIN_DICTS)) {
  Object.assign(ru, d.ru)
  Object.assign(en, d.en)
}

/** t('key'), t("key"), translate(lang, 'key'), tOverlay('key') … — только строковые литералы. */
const CALL = /\b(?:t|tr|translate\([^,()]+,)\s*\(?\s*['"]([a-zA-Z][\w.-]*\.[\w.-]+)['"]/g

describe('i18n: ключи из кода', () => {
  const used = new Map<string, string>()
  for (const f of files(SRC)) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(CALL)) if (!used.has(m[1])) used.set(m[1], relative(ROOT, f))
  }

  it('ключей в коде много (проверка сама себя)', () => {
    expect(used.size).toBeGreaterThan(300)
  })

  it('каждый t(\'…\') есть в RU и EN', () => {
    const missing = [...used].filter(([k]) => !(k in ru) || !(k in en)).map(([k, f]) => `${k} (${f})`)
    expect(missing).toEqual([])
  })
})

/** Слова, которые в английских строках — норма (имена, коды, названия игры и сайта). */
const EN_CYRILLIC_OK = /«Печать»/

describe('i18n: переводы', () => {
  it('в английских строках нет кириллицы', () => {
    const bad = Object.entries(en)
      .filter(([, v]) => /[а-яё]/i.test(v.replace(EN_CYRILLIC_OK, '')))
      .map(([k]) => k)
    expect(bad).toEqual([])
  })

  it('русские строки, совпадающие с английскими, — только имена и коды', () => {
    const same = Object.keys(ru).filter((k) => ru[k] === en[k] && /[a-z]{3,}\s+[a-z]{3,}\s+[a-z]{3,}/i.test(ru[k]))
    expect(same).toEqual([])
  })
})

/**
 * Один термин для одного понятия в русском интерфейсе (как в макетах и в клиенте игры):
 * «тайник», а не «стэш»; «трейд-окно»; «live search»; режим игры — «Окно без рамки».
 */
const TERMS: [RegExp, string][] = [
  [/ст[эе]ш/i, 'тайник (как в клиенте игры)'],
  [/трейд окн|трейдовое окно|окно трейда/i, 'трейд-окно'],
  [/лайв[- ]?поиск|живой поиск/i, 'live search'],
  [/оконн\S*\s+полноэкранн/i, '«Окно без рамки» (как в настройках и MEMORY.md)']
]

describe('i18n: термины RU', () => {
  it.each(TERMS)('нет «%s» → %s', (re) => {
    const bad = Object.entries(ru)
      .filter(([, v]) => re.test(v))
      .map(([k, v]) => `${k}: ${v}`)
    expect(bad).toEqual([])
  })
})
