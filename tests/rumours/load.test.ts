import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { loadRumours } from '@shared/rumours/load'
import { DATA_FILE, rec } from './fixtures'

// Загрузка файла слухов (S65): встроенный файл, битый пакет данных, данные новее приложения.

const from = (s: string | null) => async () => s

describe('loadRumours', () => {
  it('встроенный файл — ready, 20 слухов', async () => {
    const r = await loadRumours(from(readFileSync(DATA_FILE, 'utf8')))
    expect(r.status).toBe('ready')
    expect(r.rumours).toHaveLength(20)
    expect(r.patch).toBe('0.5.5.5')
    expect(r.failed).toEqual([])
  })

  it('нет файла, не JSON, битая шапка — none с причиной', async () => {
    expect((await loadRumours(from(null))).failed[0].error).toBe('нет файла')
    expect((await loadRumours(from('{oops'))).failed[0].error).toBe('не JSON')
    expect((await loadRumours(from('{"schema":1}'))).status).toBe('none')
    const thrower = async (): Promise<string> => {
      throw new Error('EACCES')
    }
    expect((await loadRumours(thrower)).status).toBe('none')
  })

  it('схема новее — newer', async () => {
    expect((await loadRumours(from('{"schema":2,"rumours":[]}'))).status).toBe('newer')
  })

  it('битая запись не ломает остальные; BOM в начале не мешает', async () => {
    const file = { schema: 1, patch: '0.5.5.5', updatedAt: '2026-10-31', rumours: [rec('aa-a'), { id: 'x' }] }
    const r = await loadRumours(from('﻿' + JSON.stringify(file)))
    expect(r.status).toBe('ready')
    expect(r.rumours.map((x) => x.id)).toEqual(['aa-a'])
    expect(r.failed).toHaveLength(1)
  })

  it('слишком большой файл — отказ', async () => {
    const r = await loadRumours(from('x'.repeat(200 * 1024)))
    expect(r.status).toBe('none')
    expect(r.failed[0].error).toMatch(/больше/)
  })
})
