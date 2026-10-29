// Код PoB → билд и этапы одним вызовом (S35; чистый модуль, tests/pob/model.test.ts).
// Вызывается в main (src/main/pob/import.ts) — разбор недоверенного кода не идёт в renderer.

import { decodePobCode, type PobDecodeError, type PobInflate } from './decode'
import type { PobCopySite, PobSite } from './links'
import { parsePobXml, type PobBuild, type PobParseError } from './model'
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
