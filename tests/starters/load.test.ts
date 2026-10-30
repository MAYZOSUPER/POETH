import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { findStarter, loadStarters } from '@shared/starters/load'
import { STARTER_LIMITS } from '@shared/starters/schema'
import { readFix, reader } from './fixtures'

// Загрузка «Стартеров» (S59): индекс → список текущей лиги; до анонса — прошлая лига; битые данные не роняют вкладку.

const files = (map: Record<string, string>) => async (f: string) => map[f] ?? null

describe('загрузка списка', () => {
  it('есть стартеры текущей лиги — ready', async () => {
    const r = await loadStarters(reader('good'))
    expect(r).toMatchObject({ status: 'ready', league: '3.30', updatedAt: '2026-11-12', previous: null, failed: [] })
    expect(r.starters).toHaveLength(4)
    expect(findStarter(r, 'test-guardian-dom')?.author).toBe('Test Author D')
    expect(findStarter(r, 'https://pobb.in/FakeStarterD4')).toBeNull()
  })

  it('до анонса: список лиги пуст — empty и стартеры прошлой лиги', async () => {
    const r = await loadStarters(reader('empty'))
    expect(r).toMatchObject({ status: 'empty', league: '3.30', starters: [] })
    expect(r.previous?.league).toBe('3.29')
    expect(r.previous?.starters.map((s) => s.id)).toEqual(['test-old-champion'])
    expect(findStarter(r, 'test-old-champion')?.patch).toBe('3.29')
  })

  it('встроенный список в resources — пустой 3.30: «появятся после анонса»', async () => {
    const dir = resolve(__dirname, '../../resources/data/poe1/starters')
    const r = await loadStarters(async (f) => {
      try {
        return readFileSync(resolve(dir, f), 'utf8')
      } catch {
        return null
      }
    })
    expect(r).toMatchObject({ status: 'empty', league: '3.30', failed: [] })
  })

  it('битая запись — в failed, остальные видны', async () => {
    const r = await loadStarters(reader('bad'))
    expect(r.status).toBe('ready')
    expect(r.starters.map((s) => s.id)).toEqual(['test-hiero-brand', 'test-assassin-flurry', 'test-guardian-dom'])
    expect(r.failed).toEqual([{ file: '3.30.json', id: 'test-champion-boneshatter', error: expect.stringContaining('links.guide') }])
  })

  it('нет индекса, не JSON, не та схема, слишком большой файл — none', async () => {
    expect((await loadStarters(files({}))).status).toBe('none')
    expect((await loadStarters(files({ 'index.json': '{' }))).status).toBe('none')
    expect((await loadStarters(files({ 'index.json': '{"schema":1,"current":"3.30","leagues":["3.30"]}' }))).status).toBe('none')
    const big = `{"x":"${'a'.repeat(STARTER_LIMITS.bytes)}"}`
    const r = await loadStarters(files({ 'index.json': readFix('good', 'index.json'), '3.30.json': big }))
    expect(r.status).toBe('none')
    expect(r.failed[0].error).toContain('байт')
  })

  it('данные новее приложения — newer (индекс или список лиги)', async () => {
    expect((await loadStarters(files({ 'index.json': '{"schema":2}' }))).status).toBe('newer')
    const r = await loadStarters(files({ 'index.json': readFix('good', 'index.json'), '3.30.json': '{"schema":2,"league":"3.30"}' }))
    expect(r).toMatchObject({ status: 'newer', league: '3.30' })
  })

  it('чтение бросило — как нет файла', async () => {
    const r = await loadStarters(async () => {
      throw new Error('EACCES')
    })
    expect(r.status).toBe('none')
  })

  it('BOM в начале файла не мешает', async () => {
    const r = await loadStarters(files({ 'index.json': `﻿${readFix('good', 'index.json')}`, '3.30.json': readFix('good', '3.30.json') }))
    expect(r.status).toBe('ready')
  })
})
