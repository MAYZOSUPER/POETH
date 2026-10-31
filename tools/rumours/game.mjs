// Чтение слухов из файлов игры PoE 2 (S65): таблицы .datc64 с CDN патчей GGG через библиотеку pathofexile-dat
// (SnosMe, MIT). Пакет в package.json не добавляем: его ставят во временную папку (команда — в extract.mjs),
// сюда передают путь к её node_modules.
//
// Где что лежит (патч 0.5.5.5, проверено 31.10.2026):
//  - EndgameMaps — узлы атласа; у острова экспедиции есть строка-«слух» (безымянная строковая колонка схемы,
//    в 0.5.5.5 это `_25`) и ссылка WorldArea;
//  - WorldAreas — Id и имя острова, боссы (Bosses_MonsterVarietiesKeys → MonsterVarieties.Name);
//  - EndgameMapContent — содержимое узла: у больших экспедиций Id = GrandExpedition;
//  - BaseItemTypes — путь метаданных и имя предмета-награды;
//  - перевод — те же таблицы в Data/Balance/Russian.
//
// Сеть: один TCP-запрос к патч-серверу GGG за номером патча (если не задан --patch), файлы с patch-poe2.poecdn.com,
// схема таблиц с GitHub (poe-tool-dev/dat-schema, закреплена — SCHEMA_PIN). User-Agent POETH/<версия из package.json>,
// данных пользователя нет. Всё скачанное — в отдельную временную папку, не в репозиторий.

import net from 'node:net'
import { createHash } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PKG = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
export const UA = `POETH/${PKG.version} (+https://github.com/MAYZOSUPER/POETH)`

/**
 * Схема таблиц dat-schema. Собранный JSON у проекта есть только в «плавающем» релизе `latest`, версионных релизов нет,
 * поэтому закрепляем содержимое: сборка коммита 6034b071846e (29.10.2026, «Fix 28 tables the game client reads
 * differently»), sha256 ниже. Другой файл по адресу — отказ с подсказкой; свежую схему проверить и передать
 * `--schema <файл>`, затем закрепить здесь её коммит и sha256.
 */
export const SCHEMA_PIN = {
  url: 'https://github.com/poe-tool-dev/dat-schema/releases/download/latest/schema.min.json',
  commit: '6034b071846e',
  sha256: '8666b1df2479aaeb2456994dda2e2da0a24d36788dfd6d63cf163fb7d19cb444'
}
export const PATCH_SERVER = { host: 'patch.pathofexile2.com', port: 13060 }

/** Номер текущего патча PoE 2 у патч-сервера GGG: ответ содержит адрес CDN `https://patch-poe2.poecdn.com/<патч>/`. */
export function queryPatchVersion({ host, port } = PATCH_SERVER, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port }, () => s.write(Buffer.from([1, 7])))
    s.setTimeout(timeoutMs, () => {
      s.destroy()
      reject(new Error('патч-сервер не ответил'))
    })
    s.once('data', (d) => {
      s.destroy()
      const n = d[34]
      const url = d.subarray(35, 35 + n * 2).toString('utf16le')
      const m = /\/(\d+(?:\.\d+){1,4})\/?$/.exec(url)
      if (m) resolve(m[1])
      else reject(new Error(`непонятный ответ патч-сервера: ${JSON.stringify(url)}`))
    })
    s.on('error', reject)
  })
}

async function importDat(datModules) {
  const base = path.join(datModules, 'pathofexile-dat', 'dist')
  try {
    await fs.access(path.join(base, 'bundles.js'))
  } catch {
    throw new Error(`нет pathofexile-dat в ${datModules}`)
  }
  const B = await import(pathToFileURL(path.join(base, 'bundles.js')).href)
  const D = await import(pathToFileURL(path.join(base, 'dat.js')).href)
  return { B, D }
}

/** Скачанная схема — та, что закреплена (SCHEMA_PIN.sha256); иначе ошибка с подсказкой. */
export function checkPinnedSchema(bytes) {
  const got = createHash('sha256').update(bytes).digest('hex')
  if (got !== SCHEMA_PIN.sha256) {
    throw new Error(
      `схема таблиц на GitHub обновилась (sha256 ${got.slice(0, 12)}…, закреплена ${SCHEMA_PIN.sha256.slice(0, 12)}… — коммит ${SCHEMA_PIN.commit}).\n` +
        '  Проверьте новую схему и передайте её файлом: --schema <schema.min.json>; затем закрепите коммит и sha256 в SCHEMA_PIN (tools/rumours/game.mjs).'
    )
  }
}

/** schemaFile — файл схемы (--schema); null — закреплённая схема с GitHub. */
async function loadSchema(schemaFile, log) {
  if (schemaFile) {
    const bytes = await fs.readFile(schemaFile)
    log(`схема таблиц из файла, sha256 ${createHash('sha256').update(bytes).digest('hex')}`)
    return JSON.parse(bytes.toString('utf8'))
  }
  const r = await fetch(SCHEMA_PIN.url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`схема таблиц: HTTP ${r.status}`)
  const bytes = Buffer.from(await r.arrayBuffer())
  checkPinnedSchema(bytes)
  log(`схема таблиц — закреплённая (коммит ${SCHEMA_PIN.commit})`)
  return JSON.parse(bytes.toString('utf8'))
}

/** Колонки таблицы по схеме (validFor & 2 — PoE 2); безымянные получают имя `_<номер>`. */
function headersOf(schema, name, dat, D) {
  const sch = schema.tables.find((s) => s.name === name && s.validFor & 2) ?? schema.tables.find((s) => s.name === name)
  if (!sch) throw new Error(`в схеме нет таблицы ${name}`)
  let offset = 0
  const out = []
  for (const [i, c] of sch.columns.entries()) {
    const t = c.type
    const h = {
      name: c.name || `_${i}`,
      offset,
      type: {
        array: c.array,
        interval: c.interval,
        integer:
          t === 'i32' || t === 'enumrow'
            ? { unsigned: false, size: 4 }
            : t === 'u32'
              ? { unsigned: true, size: 4 }
              : t === 'i16'
                ? { unsigned: false, size: 2 }
                : t === 'u16'
                  ? { unsigned: true, size: 2 }
                  : undefined,
        decimal: t === 'f32' ? { size: 4 } : undefined,
        string: t === 'string' ? {} : undefined,
        boolean: t === 'bool' ? {} : undefined,
        key: t === 'row' || t === 'foreignrow' ? { foreign: t === 'foreignrow' } : undefined
      },
      readable: ['i32', 'enumrow', 'u32', 'i16', 'u16', 'f32', 'string', 'bool', 'row', 'foreignrow'].includes(t)
    }
    out.push(h)
    offset += D.getHeaderLength(h, dat)
  }
  return out
}

/**
 * Строки игры про слухи и награды.
 * @param {object} o
 * @param {string} o.datModules  папка node_modules с pathofexile-dat
 * @param {string} o.patch       версия патча на CDN (`0.5.5.5`)
 * @param {string} o.cacheDir    временная папка для скачанных бандлов
 * @param {string|null} [o.schema] файл схемы таблиц; null — закреплённая с GitHub (SCHEMA_PIN)
 * @param {string[]} [o.itemNames] английские имена наград, для которых нужны путь метаданных и RU-имя
 * @param {(msg: string) => void} [o.log]
 */
export async function readGameRumours({ datModules, patch, cacheDir, schema = null, itemNames = [], log = () => {} }) {
  const { B, D } = await importDat(datModules)
  await fs.mkdir(cacheDir, { recursive: true })
  let downloaded = 0
  const loader = {
    async fetchFile(name) {
      const f = path.join(cacheDir, name.replace(/\//g, '@'))
      try {
        return new Uint8Array(await fs.readFile(f))
      } catch {
        // нет в кэше — качаем
      }
      log(`CDN: ${name}`)
      const r = await fetch(B.toCdnUrl(patch, name), { headers: { 'User-Agent': UA } })
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
      const b = new Uint8Array(await r.arrayBuffer())
      downloaded += b.length
      await fs.writeFile(f, b)
      return b
    }
  }
  const files = await B.FileLoader.create(loader)
  const sch = await loadSchema(schema, log)

  /** Таблица целиком; lang — папка перевода (`Russian`) или null. null на выходе — перевода нет. */
  async function table(name, lang = null) {
    const own = lang ? await files.tryGetFileContents(`Data/Balance/${lang}/${name}.datc64`) : null
    if (lang && !own) return null
    const bin = own ?? (await files.getFileContents(`Data/Balance/${name}.datc64`))
    const dat = D.readDatFile('.datc64', bin)
    const cols = headersOf(sch, name, dat, D)
      .filter((h) => h.readable)
      .map((h) => ({ name: h.name, data: D.readColumn(h, dat) }))
    return Array.from({ length: dat.rowCount }, (_, i) => Object.fromEntries(cols.map((c) => [c.name, c.data[i]])))
  }

  const em = await table('EndgameMaps')
  const emRu = await table('EndgameMaps', 'Russian')
  const column = rumourColumn(em)
  log(`строка слуха — колонка EndgameMaps.${column}`)
  const wa = await table('WorldAreas')
  const waRu = await table('WorldAreas', 'Russian')
  const content = await table('EndgameMapContent')
  const mv = await table('MonsterVarieties')
  const mvRu = await table('MonsterVarieties', 'Russian')

  const rows = []
  for (const [i, r] of em.entries()) {
    const en = typeof r[column] === 'string' ? r[column].trim() : ''
    if (!en) continue
    const area = wa[r.WorldArea]
    if (!area) continue
    const ru = emRu?.[i]?.[column]?.trim() || null
    const bossKeys = [...new Set(area.Bosses_MonsterVarietiesKeys ?? [])]
    rows.push({
      area: area.Id,
      text: { en, ru },
      island: { en: area.Name, ru: waRu?.[r.WorldArea]?.Name || null },
      category: categoryOf(area, content[r.MapContent]?.Id ?? null),
      bosses: bossKeys
        .map((k) => ({ en: mv[k]?.Name ?? '', ru: mvRu?.[k]?.Name || null }))
        .filter((b) => b.en)
    })
  }

  const items = new Map()
  if (itemNames.length) {
    const bit = await table('BaseItemTypes')
    const bitRu = await table('BaseItemTypes', 'Russian')
    const want = new Set(itemNames)
    for (const [i, b] of bit.entries()) {
      if (!want.has(b.Name) || items.has(b.Name)) continue
      items.set(b.Name, { meta: b.Id, ru: bitRu?.[i]?.Name || null })
    }
  }
  return { patch, column, rows, items, downloaded, russian: !!emRu }
}

/**
 * Колонка строки слуха в EndgameMaps. Если схема её назовёт (Rumour, Clue) — по имени; иначе строковая колонка, где
 * больше всего коротких строк (≤ 40 символов) — у слухов это «Fallen stars...», а описания узлов длиннее.
 */
export function rumourColumn(rows) {
  if (!rows.length) throw new Error('EndgameMaps пуста')
  const cols = Object.keys(rows[0]).filter((k) => rows.some((r) => typeof r[k] === 'string' && r[k]))
  const named = cols.find((k) => /rumou?r|clue/i.test(k))
  if (named) return named
  let best = null
  let bestScore = 0
  for (const k of cols) {
    const vals = rows.map((r) => r[k]).filter((v) => typeof v === 'string' && v.trim())
    const short = vals.filter((v) => v.length <= 40).length
    if (short >= 10 && short === vals.length && short > bestScore) {
      best = k
      bestScore = short
    }
  }
  if (!best) throw new Error('не нашли колонку строки слуха в EndgameMaps — проверьте схему таблиц')
  return best
}

/**
 * Категория по данным игры: содержимое узла GrandExpedition — большая экспедиция; уникальная область карты
 * (MapUnique…) — уникальная карта; остальное (острова боссов экспедиции, Нефритовые острова) — босс.
 */
export function categoryOf(area, contentId) {
  if (contentId === 'GrandExpedition') return 'expedition'
  if (/^MapUnique/.test(area.Id) || (area.IsUniqueMapArea && !(area.Bosses_MonsterVarietiesKeys ?? []).length)) return 'unique'
  return 'boss'
}
