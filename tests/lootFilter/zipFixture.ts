import { crc32, deflateRawSync } from 'zlib'
import { createHash } from 'crypto'

// Подменённые архивы для тестов фильтра лута (S53): собираем ZIP руками — store/deflate, центральный каталог,
// комментарий как у GitHub. Можно соврать про размер и CRC, подменить имя в локальном заголовке.

export interface FixtureEntry {
  name: string
  data?: Buffer | string
  method?: 0 | 8
  /** размер в каталоге (по умолчанию — настоящий) */
  size?: number
  crc?: number
  flags?: number
  /** имя в локальном заголовке (по умолчанию — то же) */
  localName?: string
}

export function makeZip(entries: FixtureEntry[], comment = '3ab00dd016b00c6be7acfa989baf498842973d54'): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf8')
    const isDir = e.name.endsWith('/')
    const method = isDir ? 0 : (e.method ?? 8)
    const body = method === 8 ? deflateRawSync(data) : data
    const crc = e.crc ?? (crc32(data) >>> 0)
    const size = e.size ?? data.length
    const name = Buffer.from(e.name, 'utf8')
    const localName = Buffer.from(e.localName ?? e.name, 'utf8')

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(e.flags ?? 0, 6)
    lh.writeUInt16LE(method, 8)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(body.length, 18)
    lh.writeUInt32LE(size, 22)
    lh.writeUInt16LE(localName.length, 26)
    lh.writeUInt16LE(0, 28)
    const local = Buffer.concat([lh, localName, body])

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(0x031e, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(e.flags ?? 0, 8)
    ch.writeUInt16LE(method, 10)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(body.length, 20)
    ch.writeUInt32LE(size, 24)
    ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([ch, name]))
    locals.push(local)
    offset += local.length
  }
  const cd = Buffer.concat(centrals)
  const c = Buffer.from(comment, 'utf8')
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(c.length, 20)
  return Buffer.concat([...locals, cd, eocd, c])
}

export const ROOT = 'NeverSink-Filter-8.20.2'

/** Текст, похожий на настоящий фильтр NeverSink (шапка + правила). */
export function filterText(type: string, style = 'DEFAULT', extra = ''): string {
  return [
    '#===============================================================================================================',
    "# NeverSink's Indepth Loot Filter - for Path of Exile",
    '#===============================================================================================================',
    '# VERSION:  8.20.2',
    `# TYPE:     ${type}`,
    `# STYLE:    ${style}`,
    '# AUTHOR:   NeverSink',
    '',
    'Show # %D5 $type->currency $tier->t1',
    '\tClass == "Stackable Currency"',
    '\tSetFontSize 45',
    '',
    'Hide # $type->decorators',
    '\tRarity Normal',
    extra,
    ''
  ].join('\n')
}

const LEVEL_CODES = ['0-SOFT', '1-REGULAR', '2-SEMI-STRICT', '3-STRICT', '4-VERY-STRICT', '5-UBER-STRICT', '6-UBER-PLUS-STRICT']

/** Архив как у релиза: корень, 7 уровней по умолчанию, стиль Abyss, CustomSounds с mp3, прочие файлы. */
export function releaseEntries(): FixtureEntry[] {
  const out: FixtureEntry[] = [{ name: `${ROOT}/` }, { name: `${ROOT}/(STYLE) ABYSS/` }, { name: `${ROOT}/(STYLE) CUSTOMSOUNDS/` }]
  for (const code of LEVEL_CODES) {
    out.push({ name: `${ROOT}/(STYLE) ABYSS/NeverSink's filter - ${code} (abyss) .filter`, data: filterText(code, 'ABYSS') })
    out.push({ name: `${ROOT}/(STYLE) CUSTOMSOUNDS/NeverSink's filter - ${code} (CustomSounds) .filter`, data: filterText(code, 'CUSTOMSOUNDS') })
  }
  out.push({ name: `${ROOT}/(STYLE) CUSTOMSOUNDS/1maybevaluable.mp3`, data: Buffer.from([0xff, 0xfb, 0x90, 0x00]) })
  for (const code of LEVEL_CODES) out.push({ name: `${ROOT}/NeverSink's filter - ${code}.filter`, data: filterText(code) })
  out.push({ name: `${ROOT}/LICENSE`, data: 'The MIT License (MIT)' })
  out.push({ name: `${ROOT}/ADDITIONAL-FILES/Stupid Filters/(TROLLFILTER) WERE GONNA BE RICH.filter`, data: 'Show' })
  return out
}

export function gitSha(data: Buffer | string): string {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
  return createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')
}

/** Ответ git/trees для набора записей (пути без корня). */
export function treeJson(entries: FixtureEntry[], root = ROOT): unknown {
  return {
    sha: 'f'.repeat(40),
    truncated: false,
    tree: entries
      .filter((e) => !e.name.endsWith('/') && e.name.startsWith(`${root}/`))
      .map((e) => {
        const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf8')
        return { path: e.name.slice(root.length + 1), mode: '100644', type: 'blob', sha: gitSha(data), size: data.length }
      })
  }
}

export const RELEASE_JSON = {
  tag_name: '8.20.2',
  name: "NeverSink's PoE Filter - version 8.20.2 - Technical preparations",
  published_at: '2026-10-15T11:58:25Z',
  draft: false,
  prerelease: false,
  assets: []
}
