// Данные «умной оценки» timeless-самоцветов PoE1 (S45): формат файлов tools/timeless/build.mjs и разбор.
//
//   resources/data/poe1/build/timeless.json — гнёзда (21), нотаблы в их радиусе, исходы с текстами EN/RU;
//   resources/data/poe1/build/timeless-<вид>.bin — zlib: байт на (нотабл × сид) = номер исхода самоцвета.
//
// Источник исходов — лукап-таблицы Path of Building (MIT), см. NOTICE.md. Отдаёт их renderer'у протокол
// poeth://data/poe1/build/… (сначала надстройка канала обновления, потом файлы в пакете).

/** Самоцветы с оценкой: Lethal Pride, Brutal Restraint, Militant Faith, Elegant Hubris, Heroic Tragedy. */
export const TIMELESS_KINDS = ['LP', 'BR', 'MF', 'EH', 'HT'] as const
export type TimelessDataKind = (typeof TIMELESS_KINDS)[number]

export const TIMELESS_DATA_FILE = 'build/timeless.json'
export const TIMELESS_FORMAT = 1
/** код «нет данных»: нотабл новее лукапа PoB */
export const TIMELESS_UNKNOWN = 255

/** [en, ru] */
export type Pair = [string, string]

export interface TimelessOutcome {
  /** id исхода в данных игры / PoB (`karui_notable_add_double_damage`) */
  id: string
  /** 1 — нотабл заменён целиком (у заменённого есть имя), 0 — к нотаблу добавлен стат */
  rep: 0 | 1
  name?: Pair
  /** строки описания [en, ru] */
  lines: Pair[]
  /** stat id → значение (как в игре) */
  stats: Record<string, number>
  /** доля этого исхода среди всех нотаблов в радиусе гнёзд по всем сидам (насколько он обычен) */
  share: number
}

export interface TimelessSocket {
  /** hash гнезда на дереве */
  id: number
  /** hash ближайшего кейстоуна в радиусе (иначе нотабла) — подпись гнезда */
  near: number
  /** строки нотаблов в радиусе (индексы в `rows`) */
  notables: number[]
  keystones: number[]
  /** мелкие атрибутные ноды («+10 к силе» и т. п.) и прочие мелкие */
  attr: number
  small: number
}

export interface TimelessJewelData {
  /** сиды в данных [мин, макс]; на предмете и на трейде — сид × `scale` (у Elegant Hubris «монеты» × 20) */
  seeds: [number, number]
  scale: number
  file: string
  sha256: string
  /** исход мелких атрибутных и прочих мелких нод (единственный у этих самоцветов) */
  attr: TimelessOutcome
  small: TimelessOutcome
  outcomes: TimelessOutcome[]
}

export interface TimelessDataRaw {
  v: number
  meta: { tree: string; radius: number; sources: string[] }
  /** hash нотабла по строке лукапа */
  rows: number[]
  /** hash → [en, ru] (нотаблы строк и подписи гнёзд) */
  names: Record<string, Pair>
  sockets: TimelessSocket[]
  jewels: Record<TimelessDataKind, TimelessJewelData>
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** JSON timeless.json → данные; null — не наш формат или формат новее приложения. */
export function parseTimelessData(raw: unknown): TimelessDataRaw | null {
  if (!isObj(raw) || raw.v !== TIMELESS_FORMAT) return null
  if (!Array.isArray(raw.rows) || !Array.isArray(raw.sockets) || !isObj(raw.names) || !isObj(raw.jewels)) return null
  for (const kind of TIMELESS_KINDS) {
    const j = raw.jewels[kind]
    if (!isObj(j) || !Array.isArray(j.seeds) || !Array.isArray(j.outcomes) || typeof j.file !== 'string') return null
  }
  return raw as unknown as TimelessDataRaw
}

/** Лукап одного самоцвета: исход нотабла-строки при сиде. */
export interface TimelessTable {
  kind: TimelessDataKind
  seedMin: number
  seedMax: number
  rows: number
  bytes: Uint8Array
}

export function makeTable(kind: TimelessDataKind, jewel: TimelessJewelData, rows: number, bytes: Uint8Array): TimelessTable | null {
  const seeds = jewel.seeds[1] - jewel.seeds[0] + 1
  if (bytes.length !== rows * seeds) return null
  return { kind, seedMin: jewel.seeds[0], seedMax: jewel.seeds[1], rows, bytes }
}

/** Номер исхода (или TIMELESS_UNKNOWN) для строки и сида в данных. */
export function outcomeAt(t: TimelessTable, row: number, seed: number): number {
  return t.bytes[row * (t.seedMax - t.seedMin + 1) + (seed - t.seedMin)]
}

/** Распаковать .bin (zlib) средствами платформы: DecompressionStream есть в Chromium/Electron и Node 18+. */
export async function inflateZlib(buf: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const parts = [buf] as unknown as ConstructorParameters<typeof Blob>[0]
  const stream = new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
