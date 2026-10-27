import { describe, expect, it } from 'vitest'
import {
  UNSORTED_TITLE,
  archiveFolder,
  archiveSearch,
  deleteFolder,
  deleteSearch,
  emptyFavorites,
  exportAllBt,
  exportFolderBt,
  folderSearches,
  importBt,
  moveSearch,
  normalizeFavorites,
  reorderFolders,
  saveFolder,
  saveSearch,
  setLiveFlags
} from '@shared/favorites'
import type { FavData } from '@shared/types'

// Стор избранного (чистые правки): папки, поиски, перенос и порядок, архив, live, импорт BT.

function ids(): () => string {
  let n = 0
  return () => `id${++n}`
}

function sample(): { data: FavData; id: () => string; boots: string; flips: string } {
  const id = ids()
  let data = emptyFavorites()
  const f1 = saveFolder(data, { title: 'Сапоги', game: 'poe1' }, id)
  data = f1.data
  const f2 = saveFolder(data, { title: 'Флипы', game: 'poe1' }, id)
  data = f2.data
  for (const [folderId, title, slug] of [
    [f1.id, 'Сапоги 30%', 'A1'],
    [f1.id, 'Сапоги 25%', 'A2'],
    [f2.id, 'Divine → Chaos', 'B1']
  ]) {
    data = saveSearch(data, { folderId, title, type: 'search', slug }, id).data
  }
  return { data, id, boots: f1.id, flips: f2.id }
}

describe('избранное', () => {
  it('битый файл → пусто; сироты уходят в «без папки», дубли id чинятся', () => {
    for (const raw of [null, 1, [], { folders: 'x' }]) expect(normalizeFavorites(raw, ids())).toEqual(emptyFavorites())
    const data = normalizeFavorites(
      {
        folders: [
          { id: 'f', title: 'Папка', game: 'poe1', order: 5 },
          { id: 'f', title: 'Дубль', game: 'poe1' },
          { id: 'g', title: '', game: 'poe1' }
        ],
        searches: [
          { id: 's', folderId: 'f', title: 'Поиск', game: 'poe1', type: 'search', slug: 'A1', live: { enabled: true } },
          { id: 's', folderId: 'f', title: 'Дубль id', game: 'poe1', type: 'exchange', slug: 'A2' },
          { id: 'o', folderId: 'нет', title: 'Сирота', game: 'poe1', type: 'search', slug: 'A3' },
          { id: 'b', folderId: 'f', title: 'Плохой slug', game: 'poe1', type: 'search', slug: 'a/b' }
        ]
      },
      ids()
    )
    expect(data.folders.map((f) => [f.title, f.order])).toEqual([
      ['Папка', 0],
      [UNSORTED_TITLE, 1]
    ])
    expect(data.searches.map((s) => s.title)).toEqual(['Поиск', 'Дубль id', 'Сирота'])
    expect(new Set(data.searches.map((s) => s.id)).size).toBe(3)
    expect(data.searches[0].live).toEqual({ enabled: true, notify: true })
  })

  it('сохранить поиск: без дублей по slug, лига «текущая» по умолчанию', () => {
    const { data, id, boots } = sample()
    const again = saveSearch(data, { folderId: boots, title: 'Сапоги 30% (новое имя)', type: 'search', slug: 'A1' }, id)
    expect(again.data.searches.length).toBe(3)
    expect(again.search?.title).toBe('Сапоги 30% (новое имя)')
    expect(again.search?.league).toBeUndefined()
    const other = saveSearch(data, { folderId: boots, title: 'HC', type: 'search', slug: 'C9', league: 'Hardcore' }, id)
    expect(other.search?.league).toBe('Hardcore')
    expect(saveSearch(data, { title: '', type: 'search', slug: 'X' }, id).search).toBeNull()
    expect(saveSearch(data, { title: 'x', type: 'search', slug: 'bad slug' }, id).search).toBeNull()
  })

  it('без папки — создаётся «без папки»', () => {
    const id = ids()
    const r = saveSearch(emptyFavorites(), { title: 'Поиск', type: 'exchange', slug: 'Z1' }, id)
    expect(r.data.folders.map((f) => f.title)).toEqual([UNSORTED_TITLE])
    expect(r.search?.folderId).toBe(r.data.folders[0].id)
  })

  it('переименовать, перенести, порядок', () => {
    const { data, boots, flips } = sample()
    const [a1, a2] = folderSearches(data, boots)
    let next = moveSearch(data, a2.id, boots, 0)
    expect(folderSearches(next, boots).map((s) => s.slug)).toEqual(['A2', 'A1'])
    next = moveSearch(next, a1.id, flips)
    expect(folderSearches(next, boots).map((s) => [s.slug, s.order])).toEqual([['A2', 0]])
    expect(folderSearches(next, flips).map((s) => [s.slug, s.order])).toEqual([
      ['B1', 0],
      ['A1', 1]
    ])
    next = moveSearch(next, a1.id, flips, 0)
    expect(folderSearches(next, flips).map((s) => s.slug)).toEqual(['A1', 'B1'])
    expect(moveSearch(next, 'нет', flips)).toBe(next)
    const renamed = saveFolder(next, { id: boots, title: '  Сапоги  на продажу ', game: 'poe1' }, ids())
    expect(renamed.data.folders.find((f) => f.id === boots)?.title).toBe('Сапоги на продажу')
    const reordered = reorderFolders(next, 'poe1', [flips, boots])
    expect([...reordered.folders].sort((a, b) => a.order - b.order).map((f) => f.id)).toEqual([flips, boots])
  })

  it('архив и удаление; архив выключает live', () => {
    const { data, boots } = sample()
    const s = folderSearches(data, boots)[0]
    let next = setLiveFlags(data, s.id, { enabled: true })
    next = archiveSearch(next, s.id, true, 123)
    const arch = next.searches.find((x) => x.id === s.id)!
    expect(arch.archivedAt).toBe(123)
    expect(arch.live?.enabled).toBe(false)
    next = archiveSearch(next, s.id, false)
    expect(next.searches.find((x) => x.id === s.id)!.archivedAt).toBeUndefined()
    next = archiveFolder(next, boots, true, 5)
    expect(next.folders.find((f) => f.id === boots)!.archivedAt).toBe(5)
    next = deleteSearch(next, s.id)
    expect(next.searches.length).toBe(2)
    next = deleteFolder(next, boots)
    expect(next.folders.length).toBe(1)
    expect(next.searches.map((x) => x.slug)).toEqual(['B1'])
  })

  it('экспорт → импорт Better Trading: папки и поиски без дублей', () => {
    const { data, boots } = sample()
    const one = exportFolderBt(data, boots)!
    expect(one.startsWith('3:')).toBe(true)
    const all = exportAllBt(data, 'poe1')
    expect(all.split('\n').length).toBe(2)
    // в то же избранное — всё уже есть
    expect(importBt(data, all, ids())).toMatchObject({ folders: 0, searches: 0, invalid: 0 })
    // в пустое — две папки, три поиска; мусорная строка считается
    const r = importBt(emptyFavorites(), `${all}\n3:%%%`, ids())
    expect(r).toMatchObject({ folders: 2, searches: 3 })
    expect(r.data.folders.map((f) => f.title)).toEqual(['Сапоги', 'Флипы'])
    expect(r.data.folders.map((f) => folderSearches(r.data, f.id).map((s) => s.title))).toEqual([
      ['Сапоги 30%', 'Сапоги 25%'],
      ['Divine → Chaos']
    ])
  })
})
