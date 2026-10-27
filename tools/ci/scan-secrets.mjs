// Поиск секретов в файлах репозитория перед сборкой релиза (S10a). Падает, если в
// отслеживаемых git файлах есть похожее на токен GitHub, приватный ключ или настоящий
// POESESSID. Учебные значения тестов (последовательности 0123…/aaaa…) пропускаются.
//
//   node tools/ci/scan-secrets.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

const PATTERNS = [
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: 'private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'POESESSID', re: /POESESSID["'\s]*[:=]["'\s]*([0-9a-f]{32})/i }
]

// заведомо учебные значения (tests/net/guards.test.ts и т. п.)
const FAKE = (v) => /^(0123456789abcdef){2}$/i.test(v) || /^(.)\1{31}$/.test(v)

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const hits = []
for (const f of files) {
  let st
  try {
    st = statSync(f)
  } catch {
    continue
  }
  if (!st.isFile() || st.size > 5 * 1024 * 1024) continue
  const buf = readFileSync(f)
  if (buf.includes(0)) continue // бинарный файл
  const text = buf.toString('utf8')
  for (const { name, re } of PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    if (name === 'POESESSID' && FAKE(m[1])) continue
    const line = text.slice(0, m.index).split('\n').length
    hits.push(`${f}:${line} — ${name}`)
  }
}

if (hits.length) {
  console.error('Найдены возможные секреты:\n' + hits.map((h) => `  ${h}`).join('\n'))
  process.exit(1)
}
console.log(`секретов не найдено (${files.length} файлов)`)
