// Лимитер запросов к трейд-API GGG (чистый модуль, без electron; тесты — tests/net/rateLimit.test.ts).
//
// Модель: у каждой политики (search / fetch / exchange / live-fetch / data) — набор
// правил (`Ip`, после входа ещё `Account`), у правила — несколько окон
// `hits:period:restriction`. Запрос можно отправить, только если во ВСЕХ окнах всех
// правил есть место. Стартовые окна — проверенные анонимные лимиты; дальше лимитер
// ресинкается по заголовкам ответа:
//   x-rate-limit-policy           имя серверной политики (две наши политики с одним
//                                 именем сливаются в один лимитер — общий бюджет)
//   x-rate-limit-rules            список правил ('Ip' или 'Account,Ip')
//   x-rate-limit-<rule>           окна правила
//   x-rate-limit-<rule>-state     текущее состояние окон 'hits:period:restricted'
//   retry-after                   секунды блокировки → blockedUntil
// Мы только добавляем «невидимые» нам хиты (с других устройств/вкладок сайта) и
// никогда не уменьшаем свой счёт — так безопаснее (резерв лимитов — политика GGG).

export type PolicyKind = 'search' | 'fetch' | 'exchange' | 'live-fetch' | 'data'

/** interactive — действие пользователя (Ctrl+D), background — live search и прочий фон. */
export type Priority = 'interactive' | 'background'

export interface RateWindow {
  /** сколько запросов разрешено за окно */
  hits: number
  periodSec: number
  /** на сколько секунд сервер блокирует при превышении */
  restrictSec: number
}

export interface RateState {
  hits: number
  periodSec: number
  /** > 0 — сервер уже ограничил нас на столько секунд */
  restrictedSec: number
}

/** Проверенные анонимные IP-лимиты (2026-10). live-fetch стартует с окон fetch. */
export const DEFAULT_RULES: Record<PolicyKind, string> = {
  search: '5:10:60,15:60:300,30:300:1800,600:21600:3600',
  fetch: '12:4:10,16:12:300,50:300:300,1000:21600:1800',
  exchange: '5:15:60,10:90:300,30:300:1800',
  'live-fetch': '12:4:10,16:12:300,50:300:300,1000:21600:1800',
  // data/leagues, data/stats… отдаются из кэша Cloudflare без заголовков лимитов —
  // держим свой скромный потолок.
  data: '10:60:60'
}

/** Фоновый запрос разрешён, только если в каждом окне после него остаётся ≥ 25 %. */
export const BACKGROUND_RESERVE = 0.25

/** Верхняя граница блокировки из заголовков (защита от мусора в retry-after). */
const MAX_BLOCK_MS = 6 * 3600 * 1000

/** Правило до первого ответа сервера. */
const INITIAL_RULE = 'ip'

function toInt(s: string | undefined): number {
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

/** '5:10:60,15:60:300' → окна (некорректные куски пропускаются). */
export function parseRateRules(header: string | undefined | null): RateWindow[] {
  if (!header) return []
  const out: RateWindow[] = []
  for (const part of header.split(',')) {
    const [h, p, r] = part.trim().split(':').map(toInt)
    if (h > 0 && p > 0 && r >= 0) out.push({ hits: h, periodSec: p, restrictSec: r })
  }
  return out
}

/** '1:10:0,3:60:0' → состояние окон. */
export function parseRateState(header: string | undefined | null): RateState[] {
  if (!header) return []
  const out: RateState[] = []
  for (const part of header.split(',')) {
    const [h, p, r] = part.trim().split(':').map(toInt)
    if (h >= 0 && p > 0 && r >= 0) out.push({ hits: h, periodSec: p, restrictedSec: r })
  }
  return out
}

/** retry-after в мс (только секунды; дата HTTP не используется GGG). */
export function parseRetryAfterMs(header: string | undefined | null): number {
  const n = Number(header)
  if (!header || !Number.isFinite(n) || n <= 0) return 0
  return Math.min(n * 1000, MAX_BLOCK_MS)
}

/** Сколько запросов окна доступно данному приоритету. */
export function capacityFor(hits: number, priority: Priority): number {
  return priority === 'background' ? Math.floor(hits * (1 - BACKGROUND_RESERVE)) : hits
}

/** Одно окно: отметки времени запросов, которые ещё в нём считаются. */
class WindowTracker {
  stamps: number[] = []
  constructor(
    public hits: number,
    public periodMs: number,
    public restrictMs: number
  ) {}

  prune(now: number): void {
    let i = 0
    while (i < this.stamps.length && this.stamps[i] + this.periodMs <= now) i++
    if (i) this.stamps.splice(0, i)
  }

  /**
   * Через сколько мс можно отправить запрос, перед которым в очереди ещё `ahead`
   * таких же. 0 — можно сейчас, Infinity — приоритету это окно недоступно вовсе.
   */
  waitMs(now: number, priority: Priority, ahead: number): number {
    this.prune(now)
    const cap = capacityFor(this.hits, priority)
    if (cap <= 0) return Infinity
    const count = this.stamps.length
    const need = count + ahead + 1 - cap // столько отметок должно истечь
    if (need <= 0) return 0
    if (need <= count) return this.stamps[need - 1] + this.periodMs - now
    // запросам из очереди не хватит даже пустого окна — грубая оценка по периодам
    const last = count ? this.stamps[count - 1] + this.periodMs - now : 0
    return last + this.periodMs * Math.ceil((need - count) / cap)
  }

  add(at: number): void {
    // вставка с сохранением порядка (отметки почти всегда приходят по возрастанию)
    let i = this.stamps.length
    while (i > 0 && this.stamps[i - 1] > at) i--
    this.stamps.splice(i, 0, at)
  }

  /** Перенести отметку запроса со времени отправки на время ответа. */
  move(from: number, to: number): void {
    const i = this.stamps.indexOf(from)
    if (i < 0) return
    this.stamps.splice(i, 1)
    this.add(to)
  }

  /** Сервер видит больше хитов, чем мы (другие вкладки/устройства) — догоняем. */
  syncHits(serverHits: number, now: number): void {
    this.prune(now)
    for (let n = this.stamps.length; n < serverHits; n++) this.add(now)
  }
}

class RuleTracker {
  windows: WindowTracker[] = []
  constructor(
    public name: string,
    windows: RateWindow[],
    seed: number[],
    now: number
  ) {
    this.setWindows(windows, seed, now)
  }

  /** Новый набор окон: окна с тем же периодом сохраняют отметки, новые — из журнала. */
  setWindows(windows: RateWindow[], seed: number[], now: number): void {
    const old = new Map(this.windows.map((w) => [w.periodMs, w]))
    this.windows = windows.map((w) => {
      const periodMs = w.periodSec * 1000
      const kept = old.get(periodMs)
      if (kept) {
        kept.hits = w.hits
        kept.restrictMs = w.restrictSec * 1000
        return kept
      }
      const t = new WindowTracker(w.hits, periodMs, w.restrictSec * 1000)
      for (const s of seed) if (s + periodMs > now) t.add(s)
      return t
    })
  }
}

/** Достать заголовок по имени в нижнем регистре. */
export type HeaderGetter = (name: string) => string | undefined

export function headerGetter(headers: Record<string, string | string[] | undefined>): HeaderGetter {
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) lower[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v
  }
  return (name) => lower[name.toLowerCase()]
}

export interface WindowSnapshot {
  rule: string
  hits: number
  periodSec: number
  used: number
}

export interface PolicySnapshot {
  kinds: PolicyKind[]
  serverPolicy: string | null
  blockedForMs: number
  windows: WindowSnapshot[]
}

/** Лимитер одной серверной политики. */
export class PolicyLimiter {
  /** имя политики с сервера (x-rate-limit-policy), когда уже известно */
  serverPolicy: string | null = null
  blockedUntil = 0
  private rules = new Map<string, RuleTracker>()
  /** наш журнал отправок (для новых окон/правил), не длиннее самого длинного окна */
  private log: number[] = []

  constructor(
    public readonly kind: PolicyKind,
    initial: RateWindow[],
    now = 0
  ) {
    this.rules.set(INITIAL_RULE, new RuleTracker(INITIAL_RULE, initial, [], now))
  }

  private maxPeriodMs(): number {
    let m = 0
    for (const r of this.rules.values()) for (const w of r.windows) m = Math.max(m, w.periodMs)
    return m
  }

  /** Через сколько мс можно отправить (учитывая `ahead` запросов перед этим). */
  waitMs(priority: Priority, now: number, ahead = 0): number {
    let wait = Math.max(0, this.blockedUntil - now)
    for (const r of this.rules.values()) {
      for (const w of r.windows) wait = Math.max(wait, w.waitMs(now, priority, ahead))
    }
    return wait
  }

  /** Занять место во всех окнах. Возвращает «билет» = время отправки. */
  record(now: number): number {
    for (const r of this.rules.values()) for (const w of r.windows) w.add(now)
    this.log.push(now)
    const keep = this.maxPeriodMs()
    while (this.log.length && this.log[0] + keep <= now) this.log.shift()
    return now
  }

  /**
   * Ответ получен: отметка запроса переезжает на время ответа (сервер считает хит
   * не раньше, чем получил запрос) — так окно освобождается не раньше, чем у сервера.
   */
  complete(ticket: number, now: number): void {
    if (now <= ticket) return
    for (const r of this.rules.values()) for (const w of r.windows) w.move(ticket, now)
    const i = this.log.indexOf(ticket)
    if (i >= 0) {
      this.log.splice(i, 1)
      this.log.push(now)
    }
  }

  block(untilMs: number, now: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, Math.min(untilMs, now + MAX_BLOCK_MS))
  }

  /** Ресинк по заголовкам ответа. */
  applyHeaders(h: HeaderGetter, now: number): void {
    const policy = h('x-rate-limit-policy')
    if (policy) this.serverPolicy = policy

    const rulesH = h('x-rate-limit-rules')
    if (rulesH) {
      const names = rulesH
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[a-z0-9-]+$/.test(s))
      const seen = new Set<string>()
      for (const name of names) {
        const windows = parseRateRules(h(`x-rate-limit-${name}`))
        if (!windows.length) continue
        seen.add(name)
        let rule = this.rules.get(name)
        if (rule) rule.setWindows(windows, this.log, now)
        else {
          rule = new RuleTracker(name, windows, this.log, now)
          this.rules.set(name, rule)
        }
        const states = parseRateState(h(`x-rate-limit-${name}-state`))
        for (const st of states) {
          const w = rule.windows.find((x) => x.periodMs === st.periodSec * 1000)
          if (!w) continue
          w.syncHits(st.hits, now)
          if (st.restrictedSec > 0) this.block(now + st.restrictedSec * 1000, now)
        }
      }
      // правила, которых сервер больше не присылает (например, Account после выхода), — убрать
      if (seen.size) for (const name of [...this.rules.keys()]) if (!seen.has(name)) this.rules.delete(name)
    }

    const ra = parseRetryAfterMs(h('retry-after'))
    if (ra > 0) this.block(now + ra, now)
  }

  /** Перенять журнал и блокировку другого лимитера (две наши политики = одна серверная). */
  absorb(other: PolicyLimiter, now: number): void {
    for (const t of other.log) {
      for (const r of this.rules.values()) for (const w of r.windows) if (t + w.periodMs > now) w.add(t)
      this.log.push(t)
    }
    this.log.sort((a, b) => a - b)
    this.blockedUntil = Math.max(this.blockedUntil, other.blockedUntil)
  }

  ruleNames(): string[] {
    return [...this.rules.keys()]
  }

  snapshot(now: number, kinds: PolicyKind[]): PolicySnapshot {
    const windows: WindowSnapshot[] = []
    for (const r of this.rules.values()) {
      for (const w of r.windows) {
        w.prune(now)
        windows.push({ rule: r.name, hits: w.hits, periodSec: w.periodMs / 1000, used: w.stamps.length })
      }
    }
    return {
      kinds,
      serverPolicy: this.serverPolicy,
      blockedForMs: Math.max(0, this.blockedUntil - now),
      windows
    }
  }
}

/** Лимитеры всех политик. Политики с одним серверным именем сливаются. */
export class RateLimitRegistry {
  private byKind = new Map<PolicyKind, PolicyLimiter>()
  private byPolicy = new Map<string, PolicyLimiter>()

  constructor(
    rules: Partial<Record<PolicyKind, string>> = {},
    now = 0
  ) {
    const all = { ...DEFAULT_RULES, ...rules }
    for (const kind of Object.keys(all) as PolicyKind[]) {
      this.byKind.set(kind, new PolicyLimiter(kind, parseRateRules(all[kind]), now))
    }
  }

  get(kind: PolicyKind): PolicyLimiter {
    const lim = this.byKind.get(kind)
    if (!lim) throw new Error(`unknown rate-limit policy: ${kind}`)
    return lim
  }

  /** Применить заголовки ответа на запрос вида `kind`. Возвращает актуальный лимитер. */
  applyHeaders(kind: PolicyKind, h: HeaderGetter, now: number): PolicyLimiter {
    let lim = this.get(kind)
    const policy = h('x-rate-limit-policy')
    if (policy) {
      const owner = this.byPolicy.get(policy)
      if (owner && owner !== lim) {
        owner.absorb(lim, now)
        for (const [k, l] of this.byKind) if (l === lim) this.byKind.set(k, owner)
        lim = owner
      } else if (!owner) {
        this.byPolicy.set(policy, lim)
      }
    }
    lim.applyHeaders(h, now)
    return lim
  }

  snapshot(now: number): PolicySnapshot[] {
    const groups = new Map<PolicyLimiter, PolicyKind[]>()
    for (const [kind, lim] of this.byKind) groups.set(lim, [...(groups.get(lim) ?? []), kind])
    return [...groups].map(([lim, kinds]) => lim.snapshot(now, kinds))
  }
}
