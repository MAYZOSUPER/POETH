# POETH — пакет данных (ветка `data`)

Эта ветка — **только данные** для обновления POETH без переустановки: приложение читает
`manifest.json` (версия, игра, sha256 и размер каждого файла), скачивает изменившиеся файлы
из `<game>/…`, проверяет sha256 и атомарно подменяет свои данные.

Не редактировать вручную: ветку собирает `.github/workflows/data.yml`
(`tools/data/publish-data.mjs` + `tools/data/push-data-branch.mjs`) из `resources/data` ветки main.
Источники и лицензии данных — `NOTICE.md` в ветке main (Awakened PoE Trade — MIT, RePoE fork).

Текущий пакет: **poe1 2026.10.27**.
