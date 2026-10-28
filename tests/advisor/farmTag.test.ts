import { describe, expect, it } from 'vitest'
import { FarmTracker, cleanStrategy, normalizeFarmData } from '@shared/farm/tracker'
import { myResult } from '@shared/advisor/time'

// Метка стратегии советника (S16) у сессии фарма: «Начать сессию с этой стратегией», метка на идущую
// сессию, сохранение в farm.json и «Мой результат» по завершённым сессиям.

const P = '2026/10/28 21:01:00 74519921 1186a8a3 [DEBUG Client 19012] '
const t0 = new Date(2026, 9, 28, 21, 0, 0).getTime()
const MIN = 60_000

describe('советник: метка стратегии у сессии фарма', () => {
  it('сессия с меткой → в историю и в farm.json; без метки — как раньше', () => {
    const tr = new FarmTracker()
    const ev = tr.startSession(t0, 'essence-basic')
    expect(ev[0].type === 'session' && ev[0].session.strategy).toBe('essence-basic')
    tr.ingestLines([`${P}Generating level 83 area "MapWorldsStrand" with seed 1`], t0 + MIN)
    tr.stopSession(t0 + 10 * MIN)
    const st = tr.snapshot(t0 + 11 * MIN)
    expect(st.sessions[0].strategy).toBe('essence-basic')
    expect(st.sessions[0].stats.maps).toBe(1)
    expect(myResult('essence-basic', st)).toMatchObject({ sessions: 1, maps: 1, durationMs: 10 * MIN, live: false })

    const plain = new FarmTracker()
    plain.startSession(t0)
    expect(plain.snapshot(t0).session).not.toHaveProperty('strategy')
  })

  it('метка на идущую сессию и снятие; без сессии — false', () => {
    const tr = new FarmTracker()
    expect(tr.setSessionStrategy('essence-basic')).toBe(false)
    tr.startSession(t0)
    expect(tr.setSessionStrategy('strongbox-ambush')).toBe(true)
    expect(tr.snapshot(t0).session?.strategy).toBe('strongbox-ambush')
    expect(myResult('strongbox-ambush', tr.snapshot(t0))?.live).toBe(true)
    tr.setSessionStrategy(null)
    expect(tr.snapshot(t0).session).not.toHaveProperty('strategy')
  })

  it('битая метка не ставится и не читается с диска', () => {
    expect(cleanStrategy('Essence Basic')).toBeUndefined()
    expect(cleanStrategy(42)).toBeUndefined()
    const tr = new FarmTracker()
    tr.startSession(t0, '<script>')
    expect(tr.snapshot(t0).session).not.toHaveProperty('strategy')

    const ok = new FarmTracker()
    ok.startSession(t0, 'expedition-artifacts')
    const back = normalizeFarmData(JSON.parse(JSON.stringify(ok.toData())))
    expect(back.session?.strategy).toBe('expedition-artifacts')
    const raw = ok.toData() as unknown as { session: Record<string, unknown> }
    raw.session.strategy = 'Bad!'
    expect(normalizeFarmData(raw).session).not.toHaveProperty('strategy')
  })
})
