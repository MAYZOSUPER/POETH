// Код PoB → билд и этапы одним вызовом (S35; чистый модуль, tests/pob/model.test.ts).
// Вызывается в main (src/main/pob/import.ts) — разбор недоверенного кода не идёт в renderer.

import { decodePobCode, type PobDecodeError, type PobInflate } from './decode'
import type { PobCopySite, PobSite } from './links'
import { parsePobXml, type PobBuild, type PobParseError } from './model'
import type { Pob2Site } from './links2'
import { parsePob2Xml, type Pob2Build, type Pob2ParseError } from './poe2'
import { resolveStages, type PobStagePlan } from './stages'

/** Откуда загрузка по ссылке не удалась (src/main/pob/fetch.ts). */
export type PobFetchError =
  | 'bad-url' // не https или хост не из allowlist
  | 'busy' // предыдущая загрузка ещё идёт (один запрос на одно действие игрока)
  | 'network'
  | 'timeout'
  | 'redirect' // редирект за пределы allowlist или слишком много редиректов
  | 'not-found' // 404/410: паста удалена или ссылка с ошибкой
  | 'blocked' // 401/403: сайт закрыл доступ (Cloudflare и т. п.)
  | 'rate-limited' // 429
  | 'http' // прочие ответы, кроме 200
  | 'too-large' // ответ больше 1 МБ
  | 'not-text' // не text/plain (страница вместо кода)

export type PobImportError =
  | PobDecodeError
  | PobParseError
  | 'copy-code' // ссылка на планнер Maxroll, Mobalytics или poe.ninja — нужен сам код (copySite)
  | 'unknown-link' // сайт не из списка (host)
  | 'fetch' // загрузка по ссылке не удалась (fetchError)

export interface PobSource {
  kind: 'code' | 'link'
  site?: PobSite
  /** страница сайта (для «Открыть источник» через allowlist openExternal) */
  pageUrl?: string
}

export type PobImportResult =
  | { ok: true; build: PobBuild; stages: PobStagePlan; source: PobSource }
  | { ok: false; error: PobImportError; copySite?: PobCopySite; host?: string; fetchError?: PobFetchError; detail?: string }

/** Код → модель + этапы (без правок игрока: их UI применяет через resolveStages). */
export function importPobCode(code: string, inflate: PobInflate, source: PobSource = { kind: 'code' }): PobImportResult {
  const dec = decodePobCode(code, inflate)
  if (!dec.ok) return { ok: false, error: dec.error }
  const res = parsePobXml(dec.xml)
  if (!res.ok) return { ok: false, error: res.error, detail: res.detail }
  return { ok: true, build: res.build, stages: resolveStages(res.build), source }
}

// ---------------------------------------------------------------------------- PoE 2 (S66)

export type Pob2ImportError =
  | PobDecodeError
  | Pob2ParseError
  | 'copy-code' // ссылка на планнер Maxroll, Mobalytics или poe.ninja — нужен сам код (copySite)
  | 'unknown-link' // сайт не из списка (host)
  | 'fetch' // загрузка по ссылке не удалась (fetchError)

/** Откуда билд PoE 2 (у ссылок — ещё сайт poe2db). */
export interface Pob2Source {
  kind: 'code' | 'link'
  site?: Pob2Site
  /** страница пасты (для «Открыть источник» и поля `link` в `.build`) */
  pageUrl?: string
}

export type Pob2ImportResult =
  | { ok: true; build: Pob2Build; source: Pob2Source }
  | { ok: false; error: Pob2ImportError; copySite?: PobCopySite; host?: string; fetchError?: PobFetchError; detail?: string }

/** S66: код PoB2 → модель билда PoE 2 (этапы, экспорт в `.build` — src/shared/poe2/build). */
export function importPob2Code(code: string, inflate: PobInflate, source: Pob2Source = { kind: 'code' }): Pob2ImportResult {
  const dec = decodePobCode(code, inflate)
  if (!dec.ok) return { ok: false, error: dec.error }
  const res = parsePob2Xml(dec.xml)
  if (!res.ok) return { ok: false, error: res.error, detail: res.detail }
  return { ok: true, build: res.build, source }
}
