import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { FullHour } from '@shared/flip/feed'
import type { DivineTrack } from '@shared/types/flip'
import { divineTrack } from '@shared/flip/divine'
import { httpRequest, netLog } from '../../../net'
import { FeedStore, KEEP_HOURS } from './feedStore'

// Боевой экземпляр общего хранилища фида обмена GGG (учёт богатства S11a, флиппинг S13, курс для окна цены S4).
// Часы — userData/exchange/feed/<hourId>.json (только рынки с активностью), web.poecdn.com — без cookies
// pathofexile.com. Курс divine:chaos — один на всё приложение: getDivineTrack.

let store: FeedStore | null = null

function dir(): string {
  return path.join(app.getPath('userData'), 'exchange', 'feed')
}

const HOUR_FILE = /^(\d{10})\.json$/

export function getFeedStore(): FeedStore {
  if (store) return store
  store = new FeedStore({
    getJson: async (url) => {
      const res = await httpRequest({ url, timeoutMs: 45_000 })
      let json: unknown = null
      try {
        json = JSON.parse(res.body)
      } catch {
        json = null
      }
      return { status: res.status, json }
    },
    readHour: async (hour) => {
      try {
        const v = JSON.parse(await fs.readFile(path.join(dir(), `${hour}.json`), 'utf8')) as FullHour
        return v && v.hour === hour && Array.isArray(v.markets) ? v : null
      } catch {
        return null
      }
    },
    writeHour: async (h) => {
      await fs.mkdir(dir(), { recursive: true })
      const file = path.join(dir(), `${h.hour}.json`)
      await fs.writeFile(`${file}.tmp`, JSON.stringify(h), 'utf8')
      await fs.rename(`${file}.tmp`, file)
    },
    listHours: async () => {
      try {
        return (await fs.readdir(dir())).map((f) => HOUR_FILE.exec(f)?.[1]).filter((x): x is string => !!x).map(Number)
      } catch {
        return []
      }
    },
    removeHour: async (hour) => {
      await fs.rm(path.join(dir(), `${hour}.json`), { force: true })
    },
    log: (msg) => netLog('debug', msg)
  })
  // старый кэш часов учёта богатства (до общего хранилища) больше не нужен
  void fs.rm(path.join(app.getPath('userData'), 'wealth', 'prices', 'feed'), { recursive: true, force: true }).catch(() => undefined)
  return store
}

/** Курс divine:chaos по фиду (сейчас, коридоры за сутки и неделю); null — сделок chaos↔divine нет. */
export async function getDivineTrack(league: string): Promise<DivineTrack | null> {
  const feed = getFeedStore()
  await feed.refresh(league)
  return divineTrack(feed.hours(league, KEEP_HOURS), league)
}
