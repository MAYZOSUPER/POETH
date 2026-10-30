# POETH — разработка

Для игроков — [README](../README.md) ([English](../README.en.md)); картинки README — `docs/img/` (пока из
утверждённых макетов, позже — скриншоты из игры). Здесь — как собрать, проверить и выпустить POETH.

## Запуск

```bash
npm install
npm run dev      # запуск с hot-reload
```

Бинарь Electron (с версии 42) при `npm install` не скачивается: он докачивается при первом запуске
(`npm run dev`, `npx electron`). Скачать заранее:

```bash
node node_modules/electron/install.js
```

> Игра должна работать в режиме **«Окно»** или **«Окно без рамки»** — в эксклюзивном
> полноэкранном режиме оверлей не отображается.

Профиль для опытов (миграции, несколько `npm run dev` из разных worktree) — переменная
`POETH_USER_DATA_DIR=<папка>`.

## Проверки

```bash
npm run typecheck   # TypeScript (main/preload/shared + renderer + тесты)
npm test            # юнит-тесты (vitest)
npm run test:trade  # тесты ядра прайс-чека PoE2
npm run build       # сборка main/preload/renderer
node tools/ci/scan-secrets.mjs   # поиск секретов (как в CI)
npm audit --omit=dev --audit-level=high   # уязвимости в пакетах приложения (как в CI)
npm audit                                 # все пакеты, включая сборку и тесты
```

Electron и React записаны в devDependencies, но попадают в установщик — CI проверяет их отдельно:
`npm audit --json > audit.json && node tools/ci/audit-shipped.mjs audit.json`. Что и как проверяем в чужом
коде — `docs/security.md`, раздел «Чужой код и зависимости».

Живые проверки на тестовом окне «Path of Exile» (настоящие нажатия клавиш, запускать, когда за ПК
никто не работает): `node tools/overlay/check-overlay.mjs`; обновления без клавиатуры —
`node tools/updates/check-updates.mjs [--exe=dist-release/win-unpacked/POETH.exe]`.
После смены версии Electron: `npx electron tools/electron/check-runtime.cjs [--app=…/app.asar] [--interactive]`
(нативные модули, attach и снимок окна, поток OCR, safeStorage, буфер обмена) и
`node tools/electron/check-live.mjs --exe=dist-release/win-unpacked/POETH.exe` (собранная версия через CDP:
вкладки, оверлей, трейд-окно и вход GGG, проверки отправителя IPC; `--seed`/`--expect` — cookies и секрет
профиля прошлой версии).

## Сборка

```bash
npm run package:dir   # распакованная сборка dist-release/win-unpacked (быстро, для проверки)
npm run package       # POETH-Setup-<версия>.exe (+ .blockmap, latest.yml) и POETH-Portable-<версия>.exe
```

- Настройки сборки — `electron-builder.yml`: fuses (`build/afterPack.cjs`), ProductName «POE Trade Helper» в
  ресурсах exe (`build/afterSign.cjs`, resedit), нативные модули из prebuilds (`npmRebuild: false`),
  `asarUnpack` для `electron-overlay-window` и `uiohook-napi`.
- Установщик — NSIS-мастер «как у APT»: только для текущего пользователя
  (`%LOCALAPPDATA%\Programs\POETH`, без прав администратора; страницу «для меня / для всех» скрывает
  `build/installer.nsh`), выбор папки, язык мастера RU/EN по языку Windows, ярлыки «POE Trade Helper»
  на рабочем столе и в «Пуске», «Запустить POETH» в конце. При удалении `%APPDATA%\POETH` остаётся.
- Картинки мастера (`build/installerSidebar.bmp` 164×314, `build/installerHeader.bmp` 150×57) —
  когда появятся, раскомментировать строки в `electron-builder.yml`.
- Portable — один exe без установки: распаковывается во `%TEMP%` и запускается; настройки — в обычном
  `%APPDATA%\POETH`. Автообновления нет (ограничение electron-updater): окно обновления ведёт на
  страницу релиза («Скачать новую версию»).
- Установщик на своём ПК без нужды не запускайте — он ставит программу в систему. Содержимое можно
  посмотреть 7-Zip 24+: `7za l dist-release/POETH-Setup-<версия>.exe`. С electron-builder 26 пакета `7zip-bin`
  нет — 7za лежит в его кэше: `%LOCALAPPDATA%\electron-builder\Cache\7zip@1.0.0\7zip-win-x64-*\bin\7za.exe`.

## Выпуск

1. Поднять `version` в `package.json`.
2. Обновить `build/release-notes.md`: первая строка `**POETH v<версия>**`, разделы «Что нового» и
   «What's new» (одна строка — один пункт; окно обновления показывает раздел языка интерфейса).
3. Commit → `git tag v<версия>` → `git push --tags`.

`.github/workflows/release.yml` проверит тег, описание релиза, секреты, типы и тесты, соберёт и опубликует
в GitHub Releases `POETH-Setup-<версия>.exe`, `.blockmap`, `latest.yml` и `POETH-Portable-<версия>.exe`.
Установленные копии увидят новую версию через electron-updater (проверка при запуске и раз в 6 ч).

Данные игры обновляются без переустановки: `node tools/data/publish-data.mjs --version <версия-данных>` →
содержимое `dist-data/` в ветку `data` (см. `src/main/services/dataUpdater.ts`).

## Благодарности (`resources/supporters.json`)

Имена подписчиков Boosty уровня «Печать» показываются в «О программе» → «Благодарности». Список обновляется
вручную к каждому релизу, приложение его не скачивает. Формат — массив (в JSON нет комментариев, поэтому
описание здесь):

```json
[
  { "name": "Ник подписчика", "since": "10.2026" },
  { "name": "Другой ник" }
]
```

`name` — до 40 символов (длиннее обрезается), `since` — необязательно, «ММ.ГГГГ», видно в подсказке.
Пустой массив `[]` — в приложении спокойный текст «Пока здесь пусто…».

## Документация

- [MEMORY.md](../MEMORY.md) — handoff: что это, статус, как запускать, подводные камни, журнал
- [docs/PLAN-POETH.md](PLAN-POETH.md) — утверждённый план
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — окна, безопасность входа, сеть, данные, структура
- [docs/stages.md](stages.md) — этапы S0–S10 и «свои файлы» каждого
- [docs/poe1-trade-api.md](poe1-trade-api.md), [docs/regex.md](regex.md), [docs/deals.md](deals.md)
- [docs/plan-companion.md](plan-companion.md) — справка по trade2 (PoE2)

Данные и настройки хранятся в `%APPDATA%\POETH\` (при первом запуске копируются из `Exile Companion` /
`Act Compass`).
