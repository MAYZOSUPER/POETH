import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import type { Gray } from '@shared/ocr/cells'
import type { OcrFn } from '@shared/ocr/read'

// Распознаватель цифр стакана (S28): tesseract.js-core 6.1.2 (Apache-2.0, WebAssembly, только LSTM, SIMD) и
// модель eng best_int — локальные файлы из resources/ocr, без сети и без загрузок с CDN. Чистый Node (без
// electron): его грузит поток-воркер (worker.ts) и тесты на фикстурах (tests/ocr). Каждое число стакана
// читается отдельно (строка текста, белый список цифр и точки) — разбор таблицы делает shared/ocr.
//
// Файлы лежат вне app.asar (extraResources), поэтому перед загрузкой сверяем SHA-256: подменённый JS-код
// обвязки не выполнится, повреждённая модель не загрузится.

export const OCR_FILES = {
  glue: {
    name: 'tesseract-core-simd-lstm.js',
    sha256: 'be3504705d7111d1d1f3f7f9dff326c26d334031ede36e31c4d3cf883027e982'
  },
  wasm: {
    name: 'tesseract-core-simd-lstm.wasm',
    sha256: '187d76742dfc0d8929f0b49a619f145bb6370730776c7bd0d3e20c6b2098808d'
  },
  model: {
    name: 'eng.traineddata',
    sha256: '5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747'
  }
} as const

/** Режим разбора страницы tesseract: одна строка текста. */
const PSM_SINGLE_LINE = 7
/** Только LSTM (в этой сборке другого движка нет). */
const OEM_LSTM_ONLY = 1

interface TessApi {
  Init(dataPath: string, lang: string, oem: number): number
  SetVariable(name: string, value: string): boolean
  SetPageSegMode(mode: number): void
  SetImageFile(exif: number, angle: number): number
  Recognize(monitor: null): number
  GetUTF8Text(): string
  Clear(): void
  End(): void
}

interface TessModule {
  FS: { writeFile(path: string, data: Uint8Array | string): void }
  TessBaseAPI: new () => TessApi
}

type CoreFactory = (opts: { wasmBinary: Uint8Array; print?: (s: string) => void; printErr?: (s: string) => void }) => Promise<TessModule>

function readVerified(dir: string, f: { name: string; sha256: string }): Buffer {
  const buf = readFileSync(path.join(dir, f.name))
  const got = createHash('sha256').update(buf).digest('hex')
  if (got !== f.sha256) throw new Error(`ocr: ${f.name} checksum mismatch`)
  return buf
}

/** Обвязку emscripten (UMD) исполняем из проверенного текста, а не require() по пути. */
function loadGlue(dir: string): CoreFactory {
  const src = readVerified(dir, OCR_FILES.glue).toString('utf8')
  const mod: { exports: unknown } = { exports: {} }
  const file = path.resolve(dir, OCR_FILES.glue.name)
  // обвязка берёт только встроенные модули Node (fs, path) — require от её же пути
  new Function('module', 'exports', 'require', '__filename', '__dirname', src)(mod, mod.exports, createRequire(file), file, dir)
  if (typeof mod.exports !== 'function') throw new Error('ocr: unexpected tesseract core export')
  return mod.exports as CoreFactory
}

/** PGM (P5) — Leptonica внутри tesseract читает его без лишних кодеков. */
function toPgm(g: Gray): Uint8Array {
  const head = Buffer.from(`P5\n${g.width} ${g.height}\n255\n`, 'latin1')
  const out = new Uint8Array(head.length + g.data.length)
  out.set(head, 0)
  out.set(g.data, head.length)
  return out
}

export interface OcrEngine {
  read: OcrFn
  close(): void
}

/**
 * Загрузить распознаватель из папки с файлами (resources/ocr). Сотни миллисекунд на первый запуск
 * (компиляция wasm), дальше одно число — единицы миллисекунд.
 */
export async function createOcrEngine(dir: string): Promise<OcrEngine> {
  const factory = loadGlue(dir)
  const wasmBinary = readVerified(dir, OCR_FILES.wasm)
  const model = readVerified(dir, OCR_FILES.model)
  const quiet = (): void => undefined
  const m = await factory({ wasmBinary, print: quiet, printErr: quiet })
  m.FS.writeFile('/eng.traineddata', model)
  const api = new m.TessBaseAPI()
  if (api.Init('/', 'eng', OEM_LSTM_ONLY) !== 0) throw new Error('ocr: tesseract init failed')
  api.SetPageSegMode(PSM_SINGLE_LINE)
  // только цифры, разделитель дробной части (в RU-клиенте может быть запятая) и двоеточие курса
  api.SetVariable('tessedit_char_whitelist', '0123456789.,:')
  return {
    read(img) {
      m.FS.writeFile('/input', toPgm(img))
      if (api.SetImageFile(1, 0) !== 0) return ''
      api.Recognize(null)
      const text = api.GetUTF8Text()
      api.Clear()
      return text
    },
    close() {
      api.End()
    }
  }
}
