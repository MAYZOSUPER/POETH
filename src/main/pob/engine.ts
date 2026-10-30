import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { cleanReady, encodeRequest, parseEngineLine, type EngineReady } from '@shared/pob/engineProtocol'

// Процесс движка PoB (S44): LuaJIT дочерним процессом (resources/pob/server.lua поверх HeadlessWrapper.lua PoB).
//  - ленивый старт — по первому точному сравнению, остановка после простоя (5 мин);
//  - один процесс; закрываем только его (child.kill — наш PID, никаких поисков процессов по имени);
//  - запросы по одному (PoB однопоточный), у каждого таймаут; таймаут или падение — процесс убит, запрос с ошибкой,
//    следующий запрос стартует движок заново; 3 падения за 10 мин — пауза 10 мин («точный расчёт недоступен»);
//  - stdout — только строки «@poeth {json}» (prefix + предел длины), stderr — последние 4 КБ для журнала ошибок;
//  - окружение процесса пустое (без LUA_INIT/LUA_PATH), окно не создаётся. Сети у движка нет (server.lua).
// Модуль без electron: пути и запуск передаются снаружи (enginePaths.ts), тесты подставляют заглушку на node.

export interface EngineSpawn {
  command: string
  args: string[]
  cwd: string
}

export interface EngineOptions {
  /** старт PoB: 3–4 с на обычном диске, холодный старт дольше */
  startTimeoutMs: number
  /** один запрос (загрузка билда 0,6–0,8 с + пересчёты по 40–80 мс) */
  requestTimeoutMs: number
  /** простой до остановки */
  idleMs: number
  maxCrashes: number
  crashWindowMs: number
  cooldownMs: number
  /** строка stdout без перевода строки длиннее — сбой протокола */
  maxLineBytes: number
}

export const ENGINE_DEFAULTS: EngineOptions = {
  startTimeoutMs: 60_000,
  requestTimeoutMs: 30_000,
  idleMs: 5 * 60_000,
  maxCrashes: 3,
  crashWindowMs: 10 * 60_000,
  cooldownMs: 10 * 60_000,
  maxLineBytes: 512 * 1024
}

export type EngineFailure = 'no-engine' | 'unavailable' | 'timeout' | 'crashed' | 'bad-input'

export class EngineError extends Error {
  constructor(public readonly code: EngineFailure) {
    super(`pob engine: ${code}`)
    this.name = 'EngineError'
  }
}

interface Pending {
  id: number
  resolve: (v: Record<string, unknown>) => void
  reject: (e: EngineError) => void
  timer: NodeJS.Timeout
}

interface Running {
  child: ChildProcessWithoutNullStreams
  ready: Promise<EngineReady>
  /** мс от запуска до строки готовности (null — ещё не готов) */
  startMs: number | null
  stopping: boolean
}

export class PobEngine {
  private run: Running | null = null
  private pending: Pending | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private nextId = 1
  private idleTimer: NodeJS.Timeout | null = null
  private crashes: number[] = []
  private pausedUntil = 0
  private stderrTail = ''
  private readonly o: EngineOptions

  constructor(
    private readonly locate: () => EngineSpawn | null,
    opts: Partial<EngineOptions> = {},
    private readonly now: () => number = Date.now
  ) {
    this.o = { ...ENGINE_DEFAULTS, ...opts }
  }

  /** PID нашего процесса движка (null — не запущен). */
  pid(): number | null {
    return this.run?.child.pid ?? null
  }

  /** Последние строки stderr движка (для журнала; текста предметов там нет — PoB его не печатает). */
  stderr(): string {
    return this.stderrTail
  }

  /**
   * Запрос движку. Старт — если не запущен; started — сколько мс занял старт в этом вызове (null — уже работал).
   * Ошибки — EngineError.
   */
  request(cmd: string, payload: Record<string, unknown> = {}, timeoutMs = this.o.requestTimeoutMs): Promise<{ reply: Record<string, unknown>; started: number | null; ready: EngineReady }> {
    const job = this.chain.then(() => this.doRequest(cmd, payload, timeoutMs))
    this.chain = job.catch(() => undefined)
    return job
  }

  /** Остановить движок (простой, выход из приложения). Ожидающий запрос получает «crashed». */
  stop(): void {
    this.clearIdle()
    const run = this.run
    if (!run) return
    run.stopping = true
    this.run = null
    const p = this.pending
    if (p) {
      clearTimeout(p.timer)
      this.pending = null
      p.reject(new EngineError('crashed'))
    }
    try {
      run.child.stdin.end(encodeRequest({ cmd: 'quit' }) ?? '')
    } catch {
      /* уже закрыт */
    }
    // не вышел сам за 2 с — снимаем (только этот PID)
    const t = setTimeout(() => this.kill(run), 2000)
    t.unref?.()
    run.child.once('exit', () => clearTimeout(t))
  }

  private kill(run: Running): void {
    if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill()
  }

  private async doRequest(cmd: string, payload: Record<string, unknown>, timeoutMs: number) {
    this.clearIdle()
    const id = this.nextId++
    const line = encodeRequest({ ...payload, id, cmd })
    if (!line) throw new EngineError('bad-input')
    const fresh = !this.run
    const run = this.run ?? this.start()
    const ready = await run.ready
    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null
        this.crash(run)
        reject(new EngineError('timeout'))
      }, timeoutMs)
      this.pending = { id, resolve, reject, timer }
      run.child.stdin.write(line)
    })
    this.armIdle()
    return { reply, started: fresh ? run.startMs : null, ready }
  }

  private start(): Running {
    if (this.now() < this.pausedUntil) throw new EngineError('unavailable')
    const spec = this.locate()
    if (!spec) throw new EngineError('no-engine')
    const t0 = this.now()
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      // пустое окружение: ни LUA_INIT, ни LUA_PATH/LUA_CPATH пользователя движок не увидит
      env: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false
    })
    let onReady: (r: EngineReady) => void = () => undefined
    let onFail: (e: EngineError) => void = () => undefined
    const ready = new Promise<EngineReady>((res, rej) => {
      onReady = res
      onFail = rej
    })
    ready.catch(() => undefined)
    const run: Running = { child, ready, startMs: null, stopping: false }
    this.run = run
    this.stderrTail = ''

    const startTimer = setTimeout(() => {
      onFail(new EngineError('timeout'))
      this.crash(run)
    }, this.o.startTimeoutMs)

    let buf = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const msg = parseEngineLine(buf.slice(0, nl))
        buf = buf.slice(nl + 1)
        if (!msg) continue
        if (run.startMs === null) {
          const r = cleanReady(msg)
          clearTimeout(startTimer)
          if (r) {
            run.startMs = this.now() - t0
            onReady(r)
          } else {
            onFail(new EngineError('crashed'))
            this.crash(run)
          }
          continue
        }
        const p = this.pending
        if (p && msg.id === p.id) {
          clearTimeout(p.timer)
          this.pending = null
          p.resolve(msg)
        }
      }
      if (buf.length > this.o.maxLineBytes) {
        buf = ''
        this.crash(run)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-4096)
    })
    child.stdin.on('error', () => undefined)
    child.on('error', () => {
      clearTimeout(startTimer)
      onFail(new EngineError('crashed'))
      this.crash(run)
    })
    child.on('exit', () => {
      clearTimeout(startTimer)
      onFail(new EngineError('crashed'))
      if (this.run === run) this.crash(run)
    })
    return run
  }

  /** Процесс упал, завис или нарушил протокол: снять (только наш PID), ожидающему — ошибка, учесть падение. */
  private crash(run: Running): void {
    const own = this.run === run
    if (own) this.run = null
    this.kill(run)
    if (run.stopping || !own) return
    const p = this.pending
    if (p) {
      clearTimeout(p.timer)
      this.pending = null
      p.reject(new EngineError('crashed'))
    }
    const t = this.now()
    this.crashes = this.crashes.filter((x) => t - x < this.o.crashWindowMs)
    this.crashes.push(t)
    if (this.crashes.length >= this.o.maxCrashes) {
      this.pausedUntil = t + this.o.cooldownMs
      this.crashes = []
      console.warn('[pob] engine keeps failing, paused', this.stderrTail.slice(-500))
    }
  }

  private armIdle(): void {
    this.clearIdle()
    this.idleTimer = setTimeout(() => this.stop(), this.o.idleMs)
    this.idleTimer.unref?.()
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }
}
