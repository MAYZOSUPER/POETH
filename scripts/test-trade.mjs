// Быстрая проверка чистого ядра прайс-чека PoE2 без vitest и electron (S47; до S47 здесь проверялся tradeCore.ts
// компаса — его заменил порт Exiled Exchange 2): данные resources/data/poe2 с диска → парсер → пресеты фильтров →
// тело запроса trade2. Собирается esbuild'ом (уже есть в зависимостях) и исполняется в обычном Node.
// Запуск: `npm run test:trade`. Полные проверки — vitest (tests/poe2/**).

import esbuild from 'esbuild'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = path.resolve('.')
const entry = `
import { createPoe2DataStore } from './src/shared/poe2/data'
import { parseClipboard } from './src/shared/poe2/parser'
import { buildRequest, createPriceCheck } from './src/shared/poe2/pricecheck'
import { honestPrice } from './src/shared/poe1/pricecheck/results'
import { orderBulkOffers, poe2Verdict } from './src/shared/poe2/pricecheck/verdict'
export { createPoe2DataStore, parseClipboard, buildRequest, createPriceCheck, honestPrice, orderBulkOffers, poe2Verdict }
`
const out = await esbuild.build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent'
})
const tmp = path.join(os.tmpdir(), `poeth-trade.${process.pid}.mjs`)
fs.writeFileSync(tmp, out.outputFiles[0].text)
const M = await import(pathToFileURL(tmp).href)

let pass = 0
let fail = 0
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) pass++
  else {
    fail++
    console.error(`FAIL ${msg}\n  expected ${e}\n  actual   ${a}`)
  }
}
function ok(cond, msg) {
  if (cond) pass++
  else {
    fail++
    console.error(`FAIL ${msg}`)
  }
}

// данные с диска — как protocol.ts приложения отдаёт poeth://data/poe2/<lang>/<file>
const store = M.createPoe2DataStore({
  fetch: async (url) => {
    const m = /^poeth:\/\/data\/poe2\/([a-z-]+)\/([\w.-]+)$/.exec(url)
    const file = m && path.join(ROOT, 'resources/data/poe2', m[1], m[2])
    if (!file || !fs.existsSync(file)) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }
    const buf = fs.readFileSync(file)
    return { ok: true, status: 200, text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
  }
})
const [en, ru] = await Promise.all([store.ensureLanguage('en'), store.ensureLanguage('ru')])
const fixture = (lang, name) => fs.readFileSync(path.join(ROOT, 'tests/fixtures/poe2', lang, `${name}.txt`), 'utf8')

function request(lang, name) {
  const d = lang === 'en' ? en : ru
  const p = M.parseClipboard(fixture(lang, name), d)
  if (!p.ok) return { error: p.error }
  const pc = M.createPriceCheck(p.value, d, { league: 'Standard' })
  const preset = pc.presets.find((x) => x.id === pc.active)
  return { item: p.value, req: M.buildRequest(p.value, d, preset), preset }
}

// ---- редкий лук: моды, ±10 %, статус по умолчанию, EN = RU ----
const bowEn = request('en', 'ee2-bow-rare')
const bowRu = request('ru', 'ee2-bow-rare')
eq(bowEn.item.info.refName, 'Rider Bow', 'редкий лук: английская база')
eq(bowRu.item.info.refName, 'Rider Bow', 'RU-лук: та же английская база')
eq(bowEn.req.api, 'trade', 'редкий лук → поиск')
eq(bowEn.req.body.query.status, { option: 'available' }, 'статус по умолчанию — выкуп и продавцы в сети')
eq(JSON.stringify(bowEn.req.body), JSON.stringify(bowRu.req.body), 'EN и RU одного предмета → одно тело запроса')
ok(!/[а-яё]/i.test(JSON.stringify(bowRu.req.body)), 'в RU-запросе нет кириллицы')
const roll = bowEn.preset.stats.find((f) => f.roll && !f.disabled)?.roll
ok(roll && typeof roll.min === 'number' && roll.min < roll.value, 'у отмеченного свойства min ниже ролла (±10 %)')

// ---- уник по имени ----
const uniq = request('en', 'ee2-focus-unique')
ok(uniq.req.api === 'trade' && typeof uniq.req.body.query.name === 'string', 'уник ищется по имени')

// ---- руны и гнёзда ----
const runes = request('en', 'ee2-crossbow-all-types')
ok(runes.item.augmentSockets && runes.item.augmentSockets.current >= 2, 'гнёзда рун разобраны')

// ---- валюта → обмен trade2 ----
const ess = request('en', 'sk-currency-essence')
eq(ess.req.api, 'bulk', 'валюта → обмен')
ok(Array.isArray(ess.req.body.query.want) && ess.req.body.query.want.length === 1, 'обмен: одна покупаемая валюта')

// ---- не предмет ----
ok(!M.parseClipboard('just some text\nnot an item', en).ok, 'не предмет — ошибка разбора')

// ---- вердикт и порядок обмена ----
const lot = (id, amount, currency, kind = 'person') => ({ id, kind, price: { amount, currency }, accountName: id, online: 'online' })
const lots = [lot('a', 12, 'exalted'), lot('b', 13, 'exalted'), lot('c', 14, 'exalted'), lot('d', 15, 'exalted'), lot('e', 16, 'exalted')]
const v = M.poe2Verdict({ kind: 'trade', total: 25, listings: lots, honest: M.honestPrice(lots, 25), noVendor: false })
eq([v.kind, v.price], ['list', { amount: 12, currency: 'exalted' }], 'вердикт: «выставьте за ~12 ex»')
const offer = (id, exchangeAmount, currency) => ({ id, exchangeAmount, currency, itemAmount: 1, stock: 5, accountName: id, online: 'online' })
eq(M.orderBulkOffers([offer('d', 1, 'divine'), offer('e', 2, 'exalted')]).map((o) => o.id), ['e', 'd'], 'обмен: exalted — опорная валюта')

console.log(`\n${pass} passed, ${fail} failed`)
fs.unlinkSync(tmp)
process.exit(fail ? 1 : 0)
