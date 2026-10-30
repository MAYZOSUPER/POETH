// Уязвимости в пакетах, которые попадают в установщик, хотя записаны в devDependencies (S48).
// `npm audit --omit=dev` (шаг CI перед этим) их не видит:
//  - electron — сам рантайм: его бинарь и есть POETH.exe;
//  - react, react-dom, scheduler — vite вшивает их в бандл окон (out/renderer).
// Падает на известной уязвимости high/critical, заведённой на сам пакет из списка. Зависимости electron
// (@electron/get и др.) только скачивают бинарь при сборке — в установщик не попадают и сюда не считаются.
// Заодно пишет итог по всем зависимостям в сводку запуска GitHub Actions (если она есть).
//
//   npm audit --json > audit.json; node tools/ci/audit-shipped.mjs audit.json

import { appendFileSync, readFileSync } from 'node:fs'

// Пересматривать, если в окна или main начнёт вшиваться ещё какой-то пакет из devDependencies
// (внешние импорты src/: grep "from '" — сейчас electron, react, react-dom, zustand и пакеты dependencies).
const SHIPPED_DEV = ['electron', 'react', 'react-dom', 'scheduler']
const FAIL = new Set(['high', 'critical'])

const file = process.argv[2]
if (!file) {
  console.error('нужен путь к отчёту: npm audit --json > audit.json; node tools/ci/audit-shipped.mjs audit.json')
  process.exit(2)
}
const report = JSON.parse(readFileSync(file, 'utf8'))
if (report.error) {
  console.error(`npm audit не отработал: ${report.error.summary ?? JSON.stringify(report.error)}`)
  process.exit(2)
}

const hits = []
for (const name of SHIPPED_DEV) {
  const v = report.vulnerabilities?.[name]
  if (!v) continue
  for (const adv of v.via) {
    if (typeof adv === 'object' && FAIL.has(adv.severity)) hits.push(`${name} ${v.range}: [${adv.severity}] ${adv.title} — ${adv.url}`)
  }
}

const m = report.metadata?.vulnerabilities ?? {}
const total = ['critical', 'high', 'moderate', 'low'].map((k) => `${k}: ${m[k] ?? 0}`).join(' · ')
console.log(`npm audit, все зависимости — ${total}`)
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = ['### npm audit', '', `Все зависимости (сборка и тесты тоже): ${total}`, '']
  lines.push(hits.length ? `**В установщике (${SHIPPED_DEV.join(', ')}):**\n\n${hits.map((h) => `- ${h}`).join('\n')}` : `В установщике (${SHIPPED_DEV.join(', ')}): известных уязвимостей high/critical нет`)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
}

if (hits.length) {
  console.error(`Известные уязвимости high/critical в пакетах установщика:\n${hits.map((h) => `  ${h}`).join('\n')}`)
  process.exit(1)
}
console.log(`✓ ${SHIPPED_DEV.join(', ')}: известных уязвимостей high/critical нет`)
