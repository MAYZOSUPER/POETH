// Имена областей PoE 2 из файлов игры (S69): таблица WorldAreas — английская и из Data/Balance/Russian — с CDN патчей
// GGG через библиотеку pathofexile-dat (SnosMe, MIT). Как у «Слухов» S65 (tools/rumours/game.mjs — оттуда UA, закреплённая
// схема таблиц и номер патча): пакет в package.json не добавляем, его ставят во временную папку:
//   npm install --prefix "%TEMP%\poeth-rumours-dat" --no-audit --no-fund pathofexile-dat@16.0.1
// Сеть: номер патча — у патч-сервера GGG (если не задан --patch), файлы — patch-poe2.poecdn.com, схема — GitHub;
// User-Agent POETH, данных пользователя нет. Скачанное — во временную папку, не в репозиторий.

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { SCHEMA_PIN, UA, checkPinnedSchema, queryPatchVersion } from '../rumours/game.mjs'

export { queryPatchVersion }

async function importDat(datModules) {
  const base = path.join(datModules, 'pathofexile-dat', 'dist')
  try {
    await fs.access(path.join(base, 'bundles.js'))
  } catch {
    throw new Error(`нет pathofexile-dat в ${datModules} (команда установки — в шапке tools/farm/game-areas.mjs)`)
  }
  const B = await import(pathToFileURL(path.join(base, 'bundles.js')).href)
  const D = await import(pathToFileURL(path.join(base, 'dat.js')).href)
  return { B, D }
}

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

/** Строковые колонки таблицы (Id, Name) по схеме PoE 2; смещения считаем по всем колонкам. */
function stringColumns(schema, name, dat, D, wanted) {
  const sch = schema.tables.find((s) => s.name === name && s.validFor & 2) ?? schema.tables.find((s) => s.name === name)
  if (!sch) throw new Error(`в схеме нет таблицы ${name}`)
  const size = { i32: 4, enumrow: 4, u32: 4, i16: 2, u16: 2, f32: 4 }
  let offset = 0
  const out = {}
  for (const c of sch.columns) {
    const t = c.type
    const h = {
      name: c.name,
      offset,
      type: {
        array: c.array,
        interval: c.interval,
        integer: size[t] && t !== 'f32' ? { unsigned: t === 'u32' || t === 'u16', size: size[t] } : undefined,
        decimal: t === 'f32' ? { size: 4 } : undefined,
        string: t === 'string' ? {} : undefined,
        boolean: t === 'bool' ? {} : undefined,
        key: t === 'row' || t === 'foreignrow' ? { foreign: t === 'foreignrow' } : undefined
      }
    }
    if (t === 'string' && !c.array && wanted.includes(c.name)) out[c.name] = D.readColumn(h, dat)
    offset += D.getHeaderLength(h, dat)
  }
  return out
}

/**
 * Id → имя области на английском и русском из файлов игры.
 * @returns {Promise<{ patch: string, en: Map<string, string>, ru: Map<string, string> }>}
 */
export async function readGameAreaNames({ datModules, patch, cacheDir, schema = null, log = () => {} }) {
  const { B, D } = await importDat(datModules)
  const ver = patch ?? (await queryPatchVersion())
  await fs.mkdir(cacheDir, { recursive: true })
  const files = await B.FileLoader.create({
    async fetchFile(name) {
      const f = path.join(cacheDir, name.replace(/\//g, '@'))
      try {
        return new Uint8Array(await fs.readFile(f))
      } catch {
        // нет в кэше — качаем
      }
      log(`CDN: ${name}`)
      const r = await fetch(B.toCdnUrl(ver, name), { headers: { 'User-Agent': UA } })
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
      const b = new Uint8Array(await r.arrayBuffer())
      await fs.writeFile(f, b)
      return b
    }
  })
  const sch = await loadSchema(schema, log)
  const names = async (lang) => {
    const bin = await files.getFileContents(`Data/Balance/${lang ? `${lang}/` : ''}WorldAreas.datc64`)
    const dat = D.readDatFile('.datc64', bin)
    const cols = stringColumns(sch, 'WorldAreas', dat, D, ['Id', 'Name'])
    return new Map(cols.Id.map((id, i) => [id, cols.Name[i]]))
  }
  return { patch: ver, en: await names(null), ru: await names('Russian') }
}
