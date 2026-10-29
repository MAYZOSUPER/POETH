// Какие релизы GitHub предлагает автообновление (S29). Без electron — tests/updates/stableReleases.test.ts.
//
// Демо выходит версией 0.1.0-rc.N, но ОБЫЧНЫМ (не предварительным) релизом GitHub. У версии с «-rc.N»
// electron-updater 6 сам ставит allowPrerelease = true, и GitHubProvider тогда берёт из ленты релизов только
// теги того же канала «rc»: v0.1.0 (без «-rc») он пропустил бы, и демо не обновилось бы до выпуска.
// С allowPrerelease = false берётся тег /releases/latest (последний обычный релиз) и его latest.yml:
// rc.11 → rc.12 и rc.11 → 0.1.0 предлагаются, если релиз не помечен как предварительный.
// Канал не задаём: канал по умолчанию и так «latest», а сеттер channel включил бы allowDowngrade.

export interface UpdaterFlags {
  allowPrerelease: boolean
  allowDowngrade: boolean
}

/** Только обычные релизы GitHub и никаких откатов на старую версию. */
export function stableReleasesOnly(u: UpdaterFlags): void {
  u.allowPrerelease = false
  u.allowDowngrade = false
}
