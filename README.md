# POETH — пакет данных (ветка `data`)

Эта ветка — **только данные** для обновления POETH без переустановки: приложение читает
манифест своей игры (версия, игра, sha256 и размер каждого файла), скачивает изменившиеся файлы
из `<game>/…`, проверяет sha256 и атомарно подменяет свои данные.

Не редактировать вручную: ветку собирает `.github/workflows/data.yml`
(`tools/data/publish-data.mjs` + `tools/data/push-data-branch.mjs`) из `resources/data` ветки main.
Источники и лицензии данных — `NOTICE.md` в ветке main (Awakened PoE Trade и Exiled Exchange 2 — MIT,
RePoE fork; цены PoE 2 — снимок poe.ninja).

Текущие пакеты:
- **poe1 2026.11.13** — `manifest.json`, файлы в `poe1/`
