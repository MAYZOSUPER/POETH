import { describe, expect, it } from 'vitest'
import {
  LATEST_RELEASE_URL,
  LOOT_FILTER_HOSTS,
  findTreeBlob,
  isLootFilterUrl,
  isNewerTag,
  isSafeTag,
  ladderUrl,
  linkUrl,
  parseRelease,
  treeUrl,
  zipUrl
} from '@shared/lootFilter/source'
import { RELEASE_JSON } from './zipFixture'

// S53: источник фильтра — только GitHub (api.github.com и codeload.github.com), только репозиторий NeverSink.

describe('хосты только GitHub', () => {
  it('allowlist — ровно два хоста', () => {
    expect([...LOOT_FILTER_HOSTS]).toEqual(['api.github.com', 'codeload.github.com'])
  })

  it('свои адреса проходят', () => {
    expect(isLootFilterUrl(LATEST_RELEASE_URL)).toBe(true)
    expect(isLootFilterUrl(zipUrl('8.20.2'))).toBe(true)
    expect(isLootFilterUrl(treeUrl('8.20.1d'))).toBe(true)
    expect(zipUrl('8.20.2')).toBe('https://codeload.github.com/NeverSinkDev/NeverSink-Filter/zip/refs/tags/8.20.2')
    expect(treeUrl('8.20.2')).toBe('https://api.github.com/repos/NeverSinkDev/NeverSink-Filter/git/trees/8.20.2?recursive=1')
  })

  it.each([
    ['http://api.github.com/repos/NeverSinkDev/NeverSink-Filter/releases/latest'],
    ['https://github.com/NeverSinkDev/NeverSink-Filter/archive/refs/tags/8.20.2.zip'],
    ['https://raw.githubusercontent.com/NeverSinkDev/NeverSink-Filter/8.20.2/x.filter'],
    ['https://objects.githubusercontent.com/x'],
    ['https://api.github.com.evil.com/repos/NeverSinkDev/NeverSink-Filter/releases/latest'],
    ['https://evil.com/repos/NeverSinkDev/NeverSink-Filter/releases/latest'],
    ['https://api.github.com:8443/repos/NeverSinkDev/NeverSink-Filter/releases/latest'],
    ['https://user:pw@api.github.com/repos/NeverSinkDev/NeverSink-Filter/releases/latest'],
    ['https://api.github.com/repos/Someone/NeverSink-Filter/releases/latest'],
    ['https://api.github.com/repos/NeverSinkDev/NeverSink-Filter/../../user'],
    ['https://api.github.com/repos/NeverSinkDev/NeverSink-Filter/%2e%2e/%2e%2e/user'],
    ['https://codeload.github.com/Someone/Else/zip/refs/tags/1.0.0'],
    ['https://codeload.github.com/NeverSinkDev/NeverSink-Filter/tar.gz/refs/tags/8.20.2'],
    ['https://api.github.com/user'],
    ['file:///C:/x.zip'],
    ['not a url'],
    [42]
  ])('отвергает %j', (u) => {
    expect(isLootFilterUrl(u)).toBe(false)
  })

  it('тег проверяется перед подстановкой в адрес', () => {
    expect(isSafeTag('8.20.2')).toBe(true)
    expect(isSafeTag('8.20.1d')).toBe(true)
    for (const bad of ['../x', '8.20/2', '', 'x'.repeat(50), '8..2', ' 8.20.2', '8.20.2?x=1', 'abc']) expect(isSafeTag(bad), bad).toBe(false)
    expect(() => zipUrl('../../evil')).toThrow()
    expect(() => treeUrl('8.20.2#x')).toThrow()
  })
})

describe('parseRelease', () => {
  it('берёт тег, имя, дату', () => {
    expect(parseRelease(RELEASE_JSON)).toEqual({
      tag: '8.20.2',
      name: "NeverSink's PoE Filter - version 8.20.2 - Technical preparations",
      publishedAt: '2026-10-15T11:58:25Z'
    })
  })
  it('черновик, pre-release, плохой тег, нет даты — null', () => {
    expect(parseRelease({ ...RELEASE_JSON, draft: true })).toBeNull()
    expect(parseRelease({ ...RELEASE_JSON, prerelease: true })).toBeNull()
    expect(parseRelease({ ...RELEASE_JSON, tag_name: '../../x' })).toBeNull()
    expect(parseRelease({ ...RELEASE_JSON, published_at: 'вчера' })).toBeNull()
    expect(parseRelease(null)).toBeNull()
    expect(parseRelease('8.20.2')).toBeNull()
  })
  it('имя без управляющих символов и не длиннее 160', () => {
    const r = parseRelease({ ...RELEASE_JSON, name: 'a\u0000b\nc' + 'x'.repeat(300) })
    expect(r?.name.startsWith('a b c')).toBe(true)
    expect(r?.name.length).toBe(160)
  })
})

describe('findTreeBlob', () => {
  const tree = {
    truncated: false,
    tree: [
      { path: "NeverSink's filter - 1-REGULAR.filter", type: 'blob', sha: 'a'.repeat(40), size: 10 },
      { path: '(STYLE) ABYSS', type: 'tree', sha: 'b'.repeat(40) }
    ]
  }
  it('находит файл', () => {
    expect(findTreeBlob(tree, "NeverSink's filter - 1-REGULAR.filter")).toEqual({
      path: "NeverSink's filter - 1-REGULAR.filter",
      size: 10,
      sha: 'a'.repeat(40)
    })
  })
  it('папка, обрезанное дерево, плохой SHA — null', () => {
    expect(findTreeBlob(tree, '(STYLE) ABYSS')).toBeNull()
    expect(findTreeBlob({ ...tree, truncated: true }, "NeverSink's filter - 1-REGULAR.filter")).toBeNull()
    expect(findTreeBlob({ tree: [{ path: 'x', type: 'blob', sha: 'zz', size: 1 }] }, 'x')).toBeNull()
    expect(findTreeBlob({}, 'x')).toBeNull()
  })
})

describe('isNewerTag', () => {
  it.each([
    ['8.20.2', '8.20.1d', true],
    ['8.20.1d', '8.20.1', true],
    ['8.20.1', '8.20.1d', false],
    ['8.20.2', '8.20.2', false],
    ['9.0.0', '8.99.99', true],
    ['8.19.2', '8.20.0', false],
    ['8.20.10', '8.20.9', true]
  ])('%s новее %s → %s', (a, b, want) => {
    expect(isNewerTag(a, b)).toBe(want)
  })
})

describe('ссылки', () => {
  it('ладдер фильтров — на сайте игры по языку сайта', () => {
    expect(ladderUrl('ru.pathofexile.com')).toBe('https://ru.pathofexile.com/item-filter/ladder/follower')
    expect(ladderUrl('www.pathofexile.com')).toBe('https://www.pathofexile.com/item-filter/ladder/follower')
    expect(ladderUrl('evil.com')).toBe('https://www.pathofexile.com/item-filter/ladder/follower')
  })
  it('ссылки main — точные адреса', () => {
    expect(linkUrl('repo')).toBe('https://github.com/NeverSinkDev/NeverSink-Filter')
    expect(linkUrl('license')).toBe('https://github.com/NeverSinkDev/NeverSink-Filter/blob/master/LICENSE')
    expect(linkUrl('release', '8.20.2')).toBe('https://github.com/NeverSinkDev/NeverSink-Filter/releases/tag/8.20.2')
    expect(linkUrl('release', '../x')).toBe('https://github.com/NeverSinkDev/NeverSink-Filter/releases')
    expect(linkUrl('filterblade')).toBe('https://www.filterblade.xyz/?game=Poe1')
  })
})
