import { describe, expect, it } from 'vitest'
import { IPC, IPC_DOMAINS } from '@shared/ipc'

// Реестр IPC собирается спредом доменных объектов — коллизия ключей между
// доменами молча затёрла бы каналы. Эти тесты ловят это при слиянии веток.

type Tree = { [k: string]: string | Tree }

function leaves(tree: Tree, prefix = ''): [string, string][] {
  const out: [string, string][] = []
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out.push([prefix + k, v])
    else out.push(...leaves(v, `${prefix}${k}.`))
  }
  return out
}

describe('IPC registry', () => {
  it('ключи верхнего уровня каналов не пересекаются между доменами', () => {
    const owner = new Map<string, string>()
    for (const [domain, { channels }] of Object.entries(IPC_DOMAINS)) {
      for (const key of Object.keys(channels)) {
        expect(owner.get(key), `ключ "${key}" уже есть в домене ${owner.get(key)}`).toBeUndefined()
        expect(key).not.toBe('events')
        owner.set(key, domain)
      }
    }
  })

  it('ключи событий не пересекаются между доменами', () => {
    const owner = new Map<string, string>()
    for (const [domain, { events }] of Object.entries(IPC_DOMAINS)) {
      for (const key of Object.keys(events)) {
        expect(owner.get(key), `событие "${key}" уже есть в домене ${owner.get(key)}`).toBeUndefined()
        owner.set(key, domain)
      }
    }
  })

  it('строки каналов и событий уникальны', () => {
    const all = leaves(IPC as unknown as Tree)
    const seen = new Map<string, string>()
    for (const [path, channel] of all) {
      expect(seen.get(channel), `канал "${channel}" у ${path} и ${seen.get(channel)}`).toBeUndefined()
      seen.set(channel, path)
    }
    expect(all.length).toBeGreaterThan(30)
  })

  it('события имеют префикс event:, каналы — "<домен>:<метод>"', () => {
    for (const [path, channel] of leaves(IPC as unknown as Tree)) {
      if (path.startsWith('events.')) expect(channel).toMatch(/^event:/)
      else expect(channel).toMatch(/^[a-zA-Z]+:[a-zA-Z.]+$/)
    }
  })

  it('агрегат содержит все доменные каналы', () => {
    for (const { channels, events } of Object.values(IPC_DOMAINS)) {
      for (const key of Object.keys(channels)) expect(IPC).toHaveProperty(key)
      for (const key of Object.keys(events)) expect(IPC.events).toHaveProperty(key)
    }
  })
})
