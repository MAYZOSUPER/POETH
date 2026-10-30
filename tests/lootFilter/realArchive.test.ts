import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { listZipEntries, readZipEntry } from '../../src/main/lootFilter/zip'
import { pickFilterEntry } from '@shared/lootFilter/archive'
import { LEVELS, STYLES } from '@shared/lootFilter/levels'
import { MAX_FILTER_BYTES, looksLikeNeverSinkFilter, parseFilterHeader } from '@shared/lootFilter/rules'

// S53: настоящий архив релиза NeverSink (по желанию). Скачайте ZIP тега в пустую папку и укажите путь:
//   POETH_LF_REAL_ZIP=<путь>\NeverSink-Filter-8.20.2.zip npx vitest run tests/lootFilter/realArchive.test.ts
// Без переменной тест пропускается (в CI архива нет — сеть в тестах не используется).

const file = process.env.POETH_LF_REAL_ZIP

describe.skipIf(!file)('настоящий архив релиза', () => {
  it('каждый уровень каждого стиля находится, распаковывается и похож на фильтр', () => {
    const buf = readFileSync(file as string)
    const entries = listZipEntries(buf)
    const names = entries.map((e) => e.name)
    let checked = 0
    for (const s of STYLES) {
      for (const d of LEVELS) {
        const pick = pickFilterEntry(names, d.level, s.id)
        expect(pick.ok, `${s.id} ${d.code}`).toBe(true)
        if (!pick.ok) continue
        const e = entries.find((x) => x.name === pick.entry)
        const bytes = readZipEntry(buf, e!, MAX_FILTER_BYTES)
        expect(looksLikeNeverSinkFilter(bytes), pick.entry).toBe(true)
        expect(parseFilterHeader(bytes.toString('utf8')).type).toBe(d.code)
        // стиль, который мы ставим, не ссылается на звуки рядом с файлом
        expect(bytes.toString('utf8').includes('CustomAlertSound "'), pick.entry).toBe(false)
        checked++
      }
    }
    expect(checked).toBe(STYLES.length * LEVELS.length)
  })
})
