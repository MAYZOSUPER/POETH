import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type {
  BlacklistHit,
  Deal,
  DealActionResult,
  DealCardAction,
  DealLang,
  DealStatus,
  DealsConfigPatch,
  DealsState,
  GameInputResult
} from '@shared/types'
import type { GameId } from '@shared/games'
import {
  addDeal,
  applyDealsConfigPatch,
  applySystemEvent,
  clearDeals,
  dealFromWhisper,
  dealGame,
  dealsToCsv,
  emptyDealsFile,
  normalizeDealsFile,
  removeDeal,
  setCardHidden,
  setDealStatus,
  withConfig,
  type DealsFileData
} from '@shared/deals/history'
import { cardEffect } from '@shared/deals/cards'
import { chatCommand } from '@shared/deals/commands'
import { parseLogLine, type LogEvent } from '@shared/deals/whisperParse'
import { readJson, writeJsonAtomic } from './atomicJson'

// История сделок (userData/deals.json): сделки, игнор проданного, память о quad-вкладках и
// настройки менеджера, которых нет в Settings v2. Логика — чистые функции @shared/deals/history,
// здесь — файл, очередь записи и события. Без electron: путь к файлу задаёт ipc/deals.ts.
//
// События: 'changed' (DealsState) — после любой правки; 'deal' (Deal) — новая сделка
// (для карточки поверх игры и звука, S8 фаза 2).
//
// S63: игра журнала (setGame). Сделки PoE 2 помечены game:'poe2'; состояние, экспорт и «очистить»
// касаются только сделок запущенной игры — вкладка, карточки и счётчики видят свои сделки, а история
// другой игры лежит в том же файле нетронутой.

export type BlacklistChecker = (who: { account?: string; character?: string }) => BlacklistHit | null

/** Ввод одной команды в чат игры (S1: typeInChat(text, { send: true })). */
export type ChatSender = (command: string) => GameInputResult | Promise<GameInputResult>


export class DealsStore extends EventEmitter {
  private data: DealsFileData = emptyDealsFile()
  private loaded: Promise<void> | null = null
  private writing: Promise<void> = Promise.resolve()
  private blacklist: BlacklistChecker | null = null
  /** игра, чей журнал читаем и чьи сделки показываем */
  private game: GameId = 'poe1'

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now
  ) {
    super()
  }

  /** Прочитать файл (один раз). */
  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = readJson<unknown>(this.file, null).then((raw) => {
        this.data = normalizeDealsFile(raw, this.now())
      })
    }
    return this.loaded
  }

  setBlacklistChecker(fn: BlacklistChecker | null): void {
    this.blacklist = fn
  }

  /**
   * Игра журнала (setupForGame домена). Без события: при смене игры окна перезагружаются и сами
   * спрашивают состояние, а до load() разослать было бы нечего.
   */
  setGame(game: GameId): void {
    this.game = game
  }

  getGame(): GameId {
    return this.game
  }

  /** Сделки запущенной игры. */
  private own(): Deal[] {
    return this.data.deals.filter((d) => dealGame(d) === this.game)
  }

  getState(): DealsState {
    return {
      deals: this.own(),
      config: this.data.config,
      ignoredCount: this.data.ignored.length,
      quadTabs: this.data.quadTabs
    }
  }

  getDeal(id: string): Deal | undefined {
    return this.data.deals.find((d) => d.id === id)
  }

  /** Строки Client.txt → сделки и события. Возвращает новые сделки. */
  async ingestLines(lines: string[], extra: Partial<Deal> = {}): Promise<Deal[]> {
    await this.load()
    const added: Deal[] = []
    let changed = false
    for (const line of lines) {
      const ev = parseLogLine(line, this.game)
      if (!ev) continue
      const r = this.applyEvent(ev, extra)
      if (r.changed) changed = true
      if (r.added) added.push(r.added)
    }
    if (changed) await this.commit()
    for (const d of added) this.emit('deal', d)
    return added
  }

  private applyEvent(ev: LogEvent, extra: Partial<Deal>): { changed: boolean; added?: Deal } {
    const now = this.now()
    if (ev.type === 'system') {
      const r = applySystemEvent(this.data, ev.event, now, this.game)
      this.data = r.data
      return { changed: r.changedId !== null }
    }
    const deal = dealFromWhisper(ev, randomUUID(), now)
    if (!deal) return { changed: false }
    if (this.game === 'poe2') deal.game = 'poe2'
    Object.assign(deal, extra)
    if (deal.dir === 'in' && this.data.config.checkBlacklist && this.blacklist) {
      const hit = this.blacklist({ account: deal.account, character: deal.player })
      if (hit) deal.blacklist = hit
    }
    const r = addDeal(this.data, deal, now)
    this.data = r.data
    return { changed: true, added: r.kind === 'added' ? r.deal : undefined }
  }

  async setStatus(id: string, status: DealStatus): Promise<DealsState> {
    await this.load()
    this.data = setDealStatus(this.data, id, status, this.now())
    await this.commit()
    return this.getState()
  }

  /** Закрыть карточку поверх игры (✕). */
  async hideCard(id: string, hidden = true): Promise<DealsState> {
    await this.load()
    this.data = setCardHidden(this.data, id, hidden)
    await this.commit()
    return this.getState()
  }

  /**
   * Кнопка карточки: ровно одна команда в чат через `send`, затем — смена статуса/закрытие
   * карточки по @shared/deals/cards.cardEffect (только если команда ушла).
   */
  async cardAction(id: string, action: DealCardAction, send: ChatSender): Promise<DealActionResult> {
    await this.load()
    const deal = this.getDeal(id)
    if (!deal) return { result: 'no-deal', state: this.getState() }
    const command = chatCommand(action, deal, this.data.config)
    const result = await send(command)
    if (result !== 'ok') return { result, command, state: this.getState() }
    const eff = cardEffect(action, deal, this.data.config)
    const now = this.now()
    if (eff.status && eff.status !== deal.status) this.data = setDealStatus(this.data, id, eff.status, now)
    if (eff.hide) this.data = setCardHidden(this.data, id, true)
    if (eff.status || eff.hide) await this.commit()
    return { result, command, state: this.getState() }
  }

  async remove(id: string): Promise<DealsState> {
    await this.load()
    this.data = removeDeal(this.data, id)
    await this.commit()
    return this.getState()
  }

  /** Очистить историю запущенной игры; demoOnly — убрать только примеры. */
  async clear(demoOnly = false): Promise<DealsState> {
    await this.load()
    this.data = clearDeals(this.data, demoOnly, this.game)
    await this.commit()
    return this.getState()
  }

  async setConfig(patch: DealsConfigPatch): Promise<DealsState> {
    await this.load()
    this.data = withConfig(this.data, applyDealsConfigPatch(this.data.config, patch))
    await this.commit()
    return this.getState()
  }

  /** Примеры сделок для знакомства с вкладкой (идут через тот же разбор строк лога). */
  async addDemo(lang: DealLang): Promise<DealsState> {
    await this.load()
    const now = this.now()
    const lines = demoLines(lang, now, this.game)
    const added = await this.ingestLines(lines.map((l) => l.line), { demo: true })
    // статусы и пометки — как на макете
    for (const [i, d] of added.entries()) {
      const spec = lines.find((l) => l.line.includes(d.player)) ?? lines[i]
      if (spec?.status) this.data = setDealStatus(this.data, d.id, spec.status, now)
      if (spec?.blacklisted) {
        this.data = {
          ...this.data,
          deals: this.data.deals.map((x) =>
            x.id === d.id
              ? { ...x, blacklist: { account: x.player, reason: 'Swap scam(s)', since: '01/09/2026', matchedBy: 'account' } }
              : x
          )
        }
      }
    }
    await this.commit()
    return this.getState()
  }

  /** Экспорт — сделки запущенной игры (как во вкладке). */
  exportJson(): string {
    return JSON.stringify({ exportedAt: new Date(this.now()).toISOString(), deals: this.own() }, null, 2)
  }

  exportCsv(): string {
    return dealsToCsv(this.own())
  }

  /** Записать файл (по очереди) и сообщить подписчикам. */
  private async commit(): Promise<void> {
    const snapshot = this.data
    this.writing = this.writing
      .then(() => writeJsonAtomic(this.file, snapshot))
      .catch((e) => console.error('[deals] не удалось сохранить историю:', e))
    await this.writing
    this.emit('changed', this.getState())
  }
}

// ---------------------------------------------------------------------------
// Примеры (тексты как у настоящих сообщений с сайта трейда; ники выдуманы)
// ---------------------------------------------------------------------------

export interface DemoLine {
  line: string
  status?: DealStatus
  blacklisted?: boolean
}

function logPrefix(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} 1000 0000demo [INFO Client 1] `
}

export function demoLines(lang: DealLang, now: number, game: GameId = 'poe1'): DemoLine[] {
  const at = (minAgo: number): string => logPrefix(now - minAgo * 60_000)
  if (game === 'poe2') return demoLinesPoe2(lang, at)
  if (lang === 'ru') {
    return [
      {
        line:
          at(1) +
          '@От кого <РУС> Ведьма_Ладоги: Здравствуйте, хочу купить у вас Шаг Бури Двухцветные сапоги за 2 divine в лиге Поселенцы (секция "Продажа"; позиция: 7 столбец, 3 ряд)'
      },
      {
        line: at(5) + '@Кому ЛунныйСтраж: Здравствуйте, хочу купить у вас Путь Странника за 45 chaos в лиге Поселенцы (секция "1"; позиция: 2 столбец, 5 ряд)'
      },
      {
        line:
          at(29) +
          '@От кого Руслан_Кузнец: Здравствуйте, хочу купить у вас Петля Рока за 1,5 divine в лиге Поселенцы (секция "Продажа"; позиция: 14 столбец, 3 ряд)',
        status: 'sold'
      },
      {
        line:
          at(43) +
          '@От кого Пример_Мошенник: Здравствуйте, хочу купить у вас Корона Грёз за 5 divine в лиге Поселенцы (секция "Продажа"; позиция: 1 столбец, 1 ряд)',
        blacklisted: true
      },
      {
        line: at(70) + '@Кому Кассия_Фан: Здравствуйте, хочу купить у вас 10 Карта Т16 за 30 chaos в лиге Поселенцы.',
        status: 'traded'
      }
    ]
  }
  return [
    {
      line:
        at(1) +
        '@From <GG> MarshWitch: Hi, I would like to buy your Storm Stride Two-Toned Boots listed for 2 divine in Settlers (stash tab "Sale"; position: left 7, top 3)'
    },
    {
      line: at(5) + '@To MoonWarden: Hi, I would like to buy your Wanderer Path Hubris Circlet listed for 45 chaos in Settlers (stash tab "1"; position: left 2, top 5)'
    },
    {
      line:
        at(29) +
        '@From Ruslan_Smith: Hi, I would like to buy your Doom Loop Ruby Ring listed for 1.5 divine in Settlers (stash tab "Sale"; position: left 14, top 3) can you do 1.3?',
      status: 'sold'
    },
    {
      line:
        at(43) +
        '@From Example_Scammer: Hi, I would like to buy your Dream Crown Royal Burgonet listed for 5 divine in Settlers (stash tab "Sale"; position: left 1, top 1)',
      blacklisted: true
    },
    {
      line: at(70) + "@To KassiaFan: Hi, I'd like to buy your 10 Tier 16 Map for my 30 Chaos Orb in Settlers.",
      status: 'traded'
    }
  ]
}

/**
 * Примеры PoE 2 (S63): шаблоны — как у живых лотов trade2 (31.10.2026), имена предметов — данные EE2 (EN/RU),
 * лига — Runes of Aldur (в whisper'е trade2 имя лиги не переводится), ники выдуманы. Bulk-обмена нет: шаблон
 * обмена trade2 вживую не сверен.
 */
function demoLinesPoe2(lang: DealLang, at: (minAgo: number) => string): DemoLine[] {
  if (lang === 'ru') {
    return [
      {
        line:
          at(1) +
          '@От кого <РУС> Ведьма_Ладоги: Здравствуйте, хочу купить у вас Странники Плетёные сандалии за 3 exalted в лиге Runes of Aldur (секция "Продажа"; позиция: 7 столбец, 3 ряд)'
      },
      {
        line: at(5) + '@Кому ЛунныйСтраж: Здравствуйте, хочу купить у вас Шёпот братства Кольцо с сапфиром за 40 exalted в лиге Runes of Aldur (секция "1"; позиция: 2 столбец, 5 ряд)'
      },
      {
        line:
          at(29) +
          '@От кого Руслан_Кузнец: Здравствуйте, хочу купить у вас Золотое кольцо за 1 exalted в лиге Runes of Aldur (секция "Продажа"; позиция: 14 столбец, 3 ряд)',
        status: 'sold'
      },
      {
        line:
          at(43) +
          '@От кого Пример_Мошенник: Здравствуйте, хочу купить у вас Сумеречный дозор Пепельный посох за 2 divine в лиге Runes of Aldur (секция "Продажа"; позиция: 1 столбец, 1 ряд)',
        blacklisted: true
      }
    ]
  }
  return [
    {
      line:
        at(1) +
        '@From <GG> MarshWitch: Hi, I would like to buy your Wanderlust Wrapped Sandals listed for 3 exalted in Runes of Aldur (stash tab "Sale"; position: left 7, top 3)'
    },
    {
      line: at(5) + '@To MoonWarden: Hi, I would like to buy your Whisper of the Brotherhood Sapphire Ring listed for 40 exalted in Runes of Aldur (stash tab "1"; position: left 2, top 5)'
    },
    {
      line:
        at(29) +
        '@From Ruslan_Smith: Hi, I would like to buy your Gold Ring listed for 1 exalted in Runes of Aldur (stash tab "Sale"; position: left 14, top 3) can you do 0.5?',
      status: 'sold'
    },
    {
      line:
        at(43) +
        '@From Example_Scammer: Hi, I would like to buy your Dusk Vigil Ashen Staff listed for 2 divine in Runes of Aldur (stash tab "Sale"; position: left 1, top 1)',
      blacklisted: true
    }
  ]
}
