import { createRequire } from 'module'
import { describe, expect, it, vi } from 'vitest'
import { HttpError } from 'builder-util-runtime'
import { GitHubProvider } from 'electron-updater/out/providers/GitHubProvider'
import { stableReleasesOnly, type UpdaterFlags } from '../../src/main/services/updaterPolicy'

// Демо 0.1.0-rc.N → v0.1.0 (S29): настоящий GitHubProvider electron-updater 6 на подставной сети GitHub.
// Без stableReleasesOnly electron-updater у версии «-rc.N» сам включает allowPrerelease и берёт из ленты только
// теги канала «rc» — обычный релиз v0.1.0 пропускается.

vi.mock('electron', () => ({}))

// semver той же копии, что внутри electron-updater (7.x): объект SemVer другой копии он не узнаёт
interface Semver {
  parse(v: string): object | null
  prerelease(v: unknown): ReadonlyArray<string | number> | null
  eq(a: unknown, b: unknown): boolean
  gt(a: unknown, b: unknown): boolean
  lt(a: unknown, b: unknown): boolean
}
const semver = createRequire(require.resolve('electron-updater'))('semver') as Semver

const OWNER = { provider: 'github' as const, owner: 'MAYZOSUPER', repo: 'POETH' }
const BASE = '/MAYZOSUPER/POETH/releases'

function atom(tags: string[]): string {
  const entries = tags
    .map(
      (t, i) =>
        `<entry><id>tag:github.com,2008:Repository/1/${i}</id><link rel="alternate" type="text/html" href="https://github.com${BASE}/tag/${t}"/><title>${t}</title><content type="html">notes ${t}</content></entry>`
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`
}

const yml = (v: string): string =>
  `version: ${v}\nfiles:\n  - url: POETH-Setup-${v}.exe\n    sha512: c2hh\n    size: 1\npath: POETH-Setup-${v}.exe\nsha512: c2hh\nreleaseDate: '2026-11-11T00:00:00.000Z'\n`

/** GitHub: лента всех релизов (новые сверху), /releases/latest — последний обычный, у каждого релиза latest.yml. */
function github(feed: string[], latest: string) {
  const asked: string[] = []
  const executor = {
    async request(opts: { path?: string }) {
      const p = opts.path ?? ''
      asked.push(p)
      if (p === `${BASE}.atom`) return atom(feed)
      if (p === `${BASE}/latest`) return JSON.stringify({ tag_name: latest })
      const m = /\/download\/v([^/]+)\/latest\.yml$/.exec(p)
      if (m) return yml(m[1])
      throw new HttpError(404, 'Not Found')
    }
  }
  return { executor, asked }
}

function updater(version: string, flags: Partial<UpdaterFlags> = {}) {
  const currentVersion = semver.parse(version)!
  // так electron-updater 6 инициализирует AppUpdater: allowPrerelease = есть ли у версии «-…»
  const u = {
    currentVersion,
    channel: null,
    fullChangelog: false,
    allowPrerelease: (semver.prerelease(currentVersion)?.length ?? 0) > 0,
    allowDowngrade: false,
    ...flags
  }
  return u
}

async function latestFor(u: ReturnType<typeof updater>, feed: string[], latest: string) {
  const net = github(feed, latest)
  const provider = new GitHubProvider(OWNER, u as never, { executor: net.executor, platform: 'win32', isUseMultipleRangeRequest: false } as never)
  const info = await provider.getLatestVersion()
  return { info, asked: net.asked }
}

/** То же решение, что AppUpdater.isUpdateAvailable (без rollout/minimumSystemVersion). */
function offered(u: ReturnType<typeof updater>, version: string): boolean {
  const latest = semver.parse(version)!
  if (semver.eq(latest, u.currentVersion)) return false
  return semver.gt(latest, u.currentVersion) || (u.allowDowngrade && semver.lt(latest, u.currentVersion))
}

describe('electron-updater по умолчанию у демо 0.1.0-rc.11 (почему нужна правка)', () => {
  it('allowPrerelease включён сам — v0.1.0 пропускается, берётся следующий rc', async () => {
    const u = updater('0.1.0-rc.11')
    expect(u.allowPrerelease).toBe(true)
    const { info } = await latestFor(u, ['v0.1.0', 'v0.1.0-rc.12', 'v0.1.0-rc.11'], 'v0.1.0')
    expect(info.tag).toBe('v0.1.0-rc.12')
  })

  it('когда новее rc нет — v0.1.0 не предлагается вовсе', async () => {
    const u = updater('0.1.0-rc.11')
    const { info } = await latestFor(u, ['v0.1.0', 'v0.1.0-rc.11'], 'v0.1.0')
    expect(info.tag).toBe('v0.1.0-rc.11')
    expect(offered(u, info.version)).toBe(false)
  })
})

describe('stableReleasesOnly', () => {
  it('выключает allowPrerelease и allowDowngrade, которые electron-updater включает сам', () => {
    const u = { allowPrerelease: true, allowDowngrade: true }
    stableReleasesOnly(u)
    expect(u).toEqual({ allowPrerelease: false, allowDowngrade: false })
  })

  it('rc.11 → 0.1.0: тег /releases/latest и его latest.yml', async () => {
    const u = updater('0.1.0-rc.11')
    stableReleasesOnly(u)
    const { info, asked } = await latestFor(u, ['v0.1.0', 'v0.1.0-rc.12', 'v0.1.0-rc.11'], 'v0.1.0')
    expect(info.tag).toBe('v0.1.0')
    expect(info.version).toBe('0.1.0')
    expect(asked).toContain(`${BASE}/latest`)
    expect(asked).toContain(`${BASE}/download/v0.1.0/latest.yml`)
    expect(asked.some((p) => p.endsWith('/rc.yml'))).toBe(false)
    expect(offered(u, info.version)).toBe(true)
  })

  it('rc.11 → rc.12 (обычный релиз): предлагается, канал latest, не rc', async () => {
    const u = updater('0.1.0-rc.11')
    stableReleasesOnly(u)
    const { info, asked } = await latestFor(u, ['v0.1.0-rc.12', 'v0.1.0-rc.11'], 'v0.1.0-rc.12')
    expect(info.version).toBe('0.1.0-rc.12')
    expect(asked).toContain(`${BASE}/download/v0.1.0-rc.12/latest.yml`)
    expect(offered(u, info.version)).toBe(true)
  })

  it('та же версия — не предлагается; старая — не предлагается (без отката)', async () => {
    const same = updater('0.1.0')
    stableReleasesOnly(same)
    expect(offered(same, (await latestFor(same, ['v0.1.0'], 'v0.1.0')).info.version)).toBe(false)
    const newer = updater('0.1.1')
    stableReleasesOnly(newer)
    expect(offered(newer, (await latestFor(newer, ['v0.1.1', 'v0.1.0'], 'v0.1.0')).info.version)).toBe(false)
  })

  it('appUpdater применяет stableReleasesOnly при загрузке electron-updater', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync(new URL('../../src/main/services/appUpdater.ts', import.meta.url), 'utf8')
    const load = src.slice(src.indexOf('function load()'))
    expect(load.indexOf('stableReleasesOnly(u)')).toBeGreaterThan(0)
    expect(load.indexOf('stableReleasesOnly(u)')).toBeLessThan(load.indexOf("u.on('update-available'"))
    // канал не задаём: сеттер channel включил бы allowDowngrade
    expect(src).not.toMatch(/\.channel\s*=/)
  })
})
