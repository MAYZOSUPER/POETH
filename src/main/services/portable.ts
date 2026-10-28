// Portable-версия (S10b): лаунчер POETH-Portable-….exe распаковывает приложение во %TEMP% и запускает копию,
// передав путь к себе в PORTABLE_EXECUTABLE_FILE. Отдельный модуль — без зависимостей, чтобы его могли
// импортировать и startup, и notify (иначе цикл импорта).

/** Запущен ли portable-exe: путь к самому POETH-Portable-….exe, не к распакованной копии. */
export function portableExe(): string | undefined {
  return process.env.PORTABLE_EXECUTABLE_FILE || undefined
}
