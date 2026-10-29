// Сверка текстов журнала игры для вкладки «Билд» (S36) с таблицами клиента: BUILD_LOG_STRINGS в
// src/shared/leveling/log.ts ↔ BackendErrors/ClientStrings выгрузки repoe-fork/dat-export (DAT_COMMIT).
//
//   node tools/build-data/log-strings.mjs [--refresh]
//
// После патча (новый DAT_COMMIT) показывает, какие тексты GGG поменяли — их нужно перенести в log.ts (разбор
// строится по этим шаблонам). Код ничего не пишет; выход 1 — есть расхождения.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOT, readCsv } from './sources.mjs'

const LOG_TS = path.join(ROOT, 'src/shared/leveling/log.ts')

/** BUILD_LOG_STRINGS из исходника: строки вида `  Id: { en: '…', ru: '…' },`. */
export function readLogStrings(source) {
  const block = /export const BUILD_LOG_STRINGS = \{([\s\S]*?)\n\} as const/.exec(source)?.[1] ?? ''
  const out = {}
  for (const m of block.matchAll(/^\s+(\w+): \{ en: '([^']*)', ru: '([^']*)' \},?$/gm)) out[m[1]] = { en: m[2], ru: m[3] }
  return out
}

export async function checkLogStrings() {
  const ours = readLogStrings(readFileSync(LOG_TS, 'utf8').replace(/\r\n/g, '\n'))
  const rows = [...(await readCsv('dat-BackendErrors.csv')), ...(await readCsv('dat-ClientStrings.csv'))]
  const client = new Map(rows.map((r) => [r.Id, { en: r.Text, ru: r['Text (Russian)'] }]))
  const diff = []
  for (const [id, t] of Object.entries(ours)) {
    const c = client.get(id)
    if (!c) diff.push(`${id}: нет в таблицах клиента`)
    else {
      if (c.en !== t.en) diff.push(`${id} EN: «${t.en}» → «${c.en}»`)
      if (c.ru !== t.ru) diff.push(`${id} RU: «${t.ru}» → «${c.ru}»`)
    }
  }
  return { count: Object.keys(ours).length, diff }
}

async function main() {
  const { count, diff } = await checkLogStrings()
  if (count === 0) throw new Error('не нашёл BUILD_LOG_STRINGS в log.ts')
  if (diff.length) {
    console.log(`тексты журнала изменились (${diff.length}) — перенесите в BUILD_LOG_STRINGS:\n  ${diff.join('\n  ')}`)
    process.exitCode = 1
  } else console.log(`тексты журнала: ${count} шаблонов совпадают с клиентом`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
