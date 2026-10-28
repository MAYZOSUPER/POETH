# POETH (POE Trade Helper) — память проекта (handoff)

> Прочитай это первым в новой сессии. Здесь — что это, статус, как запускать, где что лежит, подводные
> камни и журнал изменений. План — [docs/PLAN-POETH.md](docs/PLAN-POETH.md), этапы и «свои файлы» —
> [docs/stages.md](docs/stages.md), архитектура — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Что это

**POE Trade Helper (POETH)** — оверлей-помощник по трейду для **Path of Exile 1 и 2** с переключателем игры
в шапке. Одинаково хорошо работает с **русским и английским** клиентом игры (каждая функция проверяется на
RU- и EN-фикстурах). Аудитория — прежде всего новички: простой режим по умолчанию, понятные подсказки
«почему это выгодно». **Никаких авто-покупок и ботов** — одно действие игрока = одно действие приложения (GGG).
Приложение **бесплатное**, без платных функций; поддержка — добровольно через Boosty (`src/shared/links.ts`),
без всплывающих просьб.

- **Репозиторий:** приватный `MAYZOSUPER/POETH` (полная история компаса `MAYZOSUPER/POE-2-ACT-Compas` —
  remote `compas-upstream`, только чтение). Ветка `main`.
- **Релиз v0.1.0 (PoE 1): 11.11.2026** (лига 3.30 стартует ~13.11) → v0.1.1 с данными 3.30.
- В v0.1 обязательно: прайс-чек с модами по **Ctrl+D**, трейд-окно в игре + избранное, live search +
  уведомления, regex-строки (карты, торговец, библиотека), менеджер входящих сделок.
- PoE 2: трекер кампании (компас) + прайс-чек trade2 — работают как в Exile Companion.
- После релиза (v0.2+): «Советник: что фармить», флиппинг валюты/предметов, умная оценка timeless,
  учёт богатства, трейд PoE 2.

**Организация:** лид-сессия (куратор) ставит задачи, ревьюит и сливает; код этапов пишут отдельные сессии,
параллельные — в своих git worktree (см. [docs/stages.md](docs/stages.md)); дизайнер — отдельная сессия.
Общение, отчёты и коммиты — **по-русски** (код/идентификаторы — как есть).

## Статус (2026-10-27)

- ✅ **S0 — каркас готов:** ребрендинг, протокол `poeth://`, миграция userData, IPC/типы/preload/i18n по
  доменам, Settings v2 + миграция v1→v2, таблица игр `GameDef`, переключатель PoE1/PoE2 с перезапуском,
  заглушки вкладок PoE1, vitest, multi-page renderer, **Electron 40.10.6**, документация.
- ⏳ Дальше параллельно: S1 (платформа оверлея), S2 (данные + парсер), S3 (сеть + вход), S7 (regex);
  затем S4, S5, S6, S8; S9–S10 — интеграция и релиз.

## Для следующего Claude (на любом ПК)

Между машинами едет **только git-репозиторий**. Полный handoff = этот `MEMORY.md` + `docs/` + код.
**Не едет:** авто-память Claude (`~/.claude/projects/…/memory/`), планы в `~/.claude/plans/`,
`node_modules/`, `dist-release/`, `%APPDATA%/POETH/` (настройки, профили, `secret.json`).

```bash
npm install            # если бинарь Electron не докачался: node node_modules/electron/install.js
npm run dev            # dev с hot-reload
npm run typecheck      # tsc: main/preload/shared + renderer + tests
npm test               # vitest (tests/**)
npm run test:trade     # ядро прайс-чека PoE2 (31 проверка)
npm run build          # сборка main/preload/renderer (3 страницы)
npm run package:dir    # распакованная сборка в dist-release/win-unpacked/POETH.exe
npm run package        # NSIS-инсталлятор
```

## ⚠️ Соглашение по ведению этого файла

**После КАЖДОГО изменения в `main` — строка в раздел [«Changelog»](#changelog)** (что сделано + хэш коммита),
при необходимости — обновить «Статус» и `docs/stages.md`. Этот файл правит **лид** (сессии этапов присылают
строку для Changelog в отчёте), чтобы параллельные ветки не конфликтовали.

## Структура (кратко; подробно — docs/ARCHITECTURE.md)

```
src/shared/    games.ts (GameDef) · settings.ts (Settings v2) · ipc.ts + ipc/<домен>.ts · types.ts + types/<домен>.ts
src/main/      index.ts · protocol.ts (poeth://) · gameContext.ts · hotkeys.ts · tray.ts · clickThrough.ts
               windows/{companionWindow,rendererPage}.ts · ipc/{index,types,<домен>}.ts · services/*
src/preload/   index.ts + domains/<домен>.ts  →  window.overlayApi
src/renderer/  index.html (компаньон) · overlay.html (S1) · trade-sidebar.html (S5)
               src/{App.tsx, tabs.ts, i18n/{index,dicts}.ts + i18n/dict/<домен>.ts, panels/, components/, store/}
resources/     data/ (датасет кампании PoE2; data/poe1/ — S2) · brand/
tests/         *.test.ts (vitest) · fixtures/{settings, poe1/{en,ru}}
docs/          PLAN-POETH · ARCHITECTURE · stages · poe1-trade-api · regex · plan-companion (trade2) · compass/ (архив)
```
Домены: `app`, `campaign` (PoE2), `trade`, `overlay` (S1), `auth` (S3), `fav` (S5), `live` (S6), `regex` (S7),
`deals` (S8). Новый функционал подключается только через свои доменные файлы (таблица в docs/stages.md).

## Настройки (`%APPDATA%/POETH/settings.json`, v2)

`game` (`poe1` по умолч.) · `siteHost` (`www`/`ru.pathofexile.com`) · `poe1.league` (`auto`) · `poe2.league` ·
`hotkeys` `{[action]: {accel, scope:'game'|'always'}}` · `sound` · `live.maxSearches` · `deals` · `regex` · `ui.simpleMode`
+ поля компаса (`uiLang`, `nameLang`, `opacity`, `locked`, `tailerEnabled`, `logPath`, …).
Дефолты/миграция/патч — `src/shared/settings.ts` (тесты `tests/settings.test.ts`). Новые поля добавляет лид.

## Хоткеи (по умолчанию)

`Ctrl+D` прайс-чек (game) · `Shift+Space` оверлей (game) · `whisperLastHit`, `pasteSearch1..5` (game, не заданы) ·
`Ctrl+Shift+O` компаньон · `Ctrl+Shift+L` замок · `Ctrl+Shift+T` трейд-окно · `Ctrl+Shift+[`/`]` шаги кампании.
Регистрируются **только действия с обработчиком для текущей игры** (`onHotkeyAction` в домене). Гейтинг
`scope:'game'` по фокусу игры — S1.

## Подводные камни (важно!)

- **Игра — в режиме «Окно» или «Окно без рамки».** В эксклюзивном fullscreen оверлеи Windows не видны.
- **Прозрачность — только через CSS** (`.app` opacity). Нативный `win.setOpacity()` на прозрачном окне валит
  приложение — НЕ возвращать.
- **Один экземпляр:** процесс упакованной версии — `POETH.exe`, держит single-instance lock (на каталог
  userData). Второй запуск молча выходит («another instance holds the single-instance lock») — закрыть:
  `Get-Process POETH, electron | Stop-Process`. Для тестов и параллельных `npm run dev` из разных worktree —
  `POETH_USER_DATA_DIR=<папка>` (свой профиль = свой lock).
- **Смена игры в dev — мягкая:** electron-vite завершает dev-сервер, когда Electron выходит, поэтому в dev
  `app.switchGame` не делает `app.relaunch()`, а перенастраивает домены и перезагружает окна. Настоящий relaunch
  проверяется на собранной версии (`npm run build` → `electron .` или `npm run package:dir`).
- **userData:** `%APPDATA%/POETH/`; при первом старте один раз копируется `Exile Companion` или `Act Compass`
  (маркер `migrated-from.json`). Запись JSON атомарная, `readJson` срезает BOM; старый settings v1 остаётся в `.bak`.
- **POESESSID (PoE2-прайс-чек компаса)** — в `secret.json` через safeStorage (per-ПК, не в git). Никаких
  паролей/POESESSID в репозитории и в логах. В PoE1 вход — только через официальный сайт в изолированной сессии (S3).
- **`poeth://` и fetch:** схема с `corsEnabled` + `Access-Control-Allow-Origin` — иначе `<img>` работает,
  а `fetch()` падает «Failed to fetch».
- **Автоопределение зоны (кампания PoE2) по умолчанию ВЫКЛ** (opt-in); в режиме PoE1 тейлер кампании не запускается.
- **Упаковка на Windows без режима разработчика:** electron-builder не может распаковать `winCodeSign`
  (симлинки macOS) → «Cannot create symbolic link». Обход: распаковать последний
  `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\*.7z` 7-Zip'ом (`node_modules/7zip-bin/win/x64/7za.exe x -snld`)
  в папку `winCodeSign-2.6.0` рядом (ошибки двух darwin-симлинков игнорировать). На этом ПК уже сделано.
- **Иконки приложения пока нет** (`build/icon.ico` отсутствует → стандартная иконка Electron) — даст дизайнер.
- **Переводы строк:** `core.autocrlf=true` — в рабочей копии CRLF. Скрипты правок файлов должны нормализовать
  `\r\n`, иначе замены строк «не находятся».
- **npm 11 `allow-scripts`:** предупреждение про postinstall electron/esbuild — бинари всё равно ставятся;
  если нет — `node node_modules/electron/install.js`.

## Лицензии

Свой код — **MIT** ([LICENSE](LICENSE)). Атрибуция — [NOTICE.md](NOTICE.md): Awakened PoE Trade (MIT, порт
кода/данных с шапкой-атрибуцией в каждом файле, пин `3188208957`), RePoE fork (данные), формат Better Trading
(MIT), poe.re — **не используется**, ассеты кампании (Exile-UI, MIT), дисклеймер GGG.

## Changelog

> Новые изменения добавляй сверху: `<коммит> — что сделано`. История компаса (Exile Companion / Act Compass) —
> [docs/compass/MEMORY.md](docs/compass/MEMORY.md).

- _(лид, 28.10)_ **репозиторий открыт**: https://github.com/MAYZOSUPER/POETH (MIT). История переписана — все коммиты от
  `MAYZOSUPER <291924623+MAYZOSUPER@users.noreply.github.com>`, личных данных и секретов нет (проверено чистым клоном).
  Старый приватный репо с исходной историей — `MAYZOSUPER/POETH-archive` (remote `archive`), полный бэкап —
  `H:\POETH-backup\poeth-before-publish-2026-10-28.bundle`. Хэши коммитов до этой записи в Changelog относятся к старой
  истории (содержимое то же). Новые ветки — только от свежего `origin/main`. LICENSE: «POETH contributors».
- _(лид, 28.10)_ слит `integration-2` (`b3769b3`, сессия S1) — **все функции v0.1 в main**, 1116 тестов:
  S8 `4dd0c8e` (сделки на общем `gameLog`), S4 фаза 2 (окно цены PoE1 в оверлее, «честная цена» мгновенный выкуп vs whisper,
  «Скопировать whisper», фолбэк `/api/trade/data/stats`, PoE2 на авто-копии), S6 (live search: `ws` + редьюсер, бэкоффы,
  тосты/звук/уведомления Windows, вкладка Live, адаптер молний избранного), S10a (трей, экран загрузки, тост запуска,
  автозапуск/свёрнутым, `electron-updater` с окном «Вышло обновление», пакеты данных с sha256, CI release.yml),
  S9 (мастер первого запуска, «О программе» + «Благодарности» из `resources/supporters.json`, полировка RU/EN).
  Связки: «Открыть лот»/«Открыть в трейд-окне»/«В избранное»/«Следить (live)», AUMID, один флаг первого запуска.
  Ждут: живые автопроверки (нужен простой ПК), живая проверка в игре, перезапись автора истории и открытие репо.
- _(лид, 28.10)_ слиты S5 (`a85fbbc`…`8bc7b62`): трейд-окно `BaseWindow` (сайдбар избранного + официальный сайт на
  partition аккаунта, без preload), `openTradeWindow`/`addFavorite`/`openTradeLogin`, «Открыть лот» через `?q=`,
  импорт/экспорт Better Trading, сторож `tests/fav/siteGuard.test.ts` (никаких программных кликов/инъекций/whisper-
  hideout-запросов); подсказка про цветные гнёзда в regex «Торговец». И S8 фаза 2 (`1546124`, `01cff1a`): карточки
  сделок поверх игры, кнопки = одна команда в чат, игнор проданного, чёрный список на карточке, подсветка и калибровка
  тайника, звук; хоткеи сделок Alt+1/2/3 (патч S8). 1002 теста. Долг: сделки держат свой `LogTailer` — перевести на
  общий `subscribeGameLog`.
- `0ec6eb2` — _(лид, 28.10)_ слиты команды чата (S1 `d343ecb`…`005e685`): F5 → `/hideout` + 11 пресетов,
  Settings v2 `chatCommands`, подстановки `@last`/`<char>` из лога (тост, если неизвестно), динамические хоткеи,
  раздел «Команды чата», общий тейлер `services/gameLog.ts` (`subscribeGameLog`). 959 тестов.
  С 28.10 коммиты в репо — от `MAYZOSUPER <291924623+MAYZOSUPER@users.noreply.github.com>` (перед открытием репо
  история будет переписана на этот адрес — см. PLAN «Новая лига и обновления»).
- `d642004` — _(лид, 28.10)_ слит `integration-1` (`05886dd`…`4d805a5`, сессия S1): `initNetIdentity` + fuses-хук
  `afterPack` + `npmRebuild:false`; `Settings.overlay.pricePosition`; в настройках — запрет занятых игрой сочетаний,
  позиция окна цены, `AccountPanel` (PoE1), дисклеймер GGG RU/EN; `logTailer` под `GameDef.logSubdirs` + событие
  `lines` (регресс кампании PoE2 зелёный); `pasteSearch1..5` → regex-библиотека → Ctrl+F+вставка. `.gitattributes`
  `*.snap eol=lf`. 936 тестов. `disableHardwareAcceleration` не нужен (вернуться в S10 при чёрном фоне/просадке FPS).
- `81bf07f` — _(лид, 28.10)_ слиты без конфликтов (927 тестов зелёные):
  - S3 `1990117` — сеть: изолированная сессия `persist:poe-account`, `http`/allowlist, лимитер по политикам + fail-fast,
    `tradeGateway` с кэшем, лиги с авто-выбором, вход/выход/вставка POESESSID, `AccountPanel`, `SiteCheckBanner`, fuses-хук.
  - S1 `8f0de38` — игровой оверлей (`electron-overlay-window`), Ctrl+D → `captureItemText` с восстановлением буфера, окно
    цены у курсора (`overlay/placement.ts`), закрытие Esc/клик мимо/повторный Ctrl+D, гейтинг хоткеев по фокусу игры,
    `typeInChat`/`stashSearch`, тестовое окно «Path of Exile» и `tools/overlay/check-overlay.mjs`.
  - S7 `195c3b9` — regex: генератор данных карт EN/RU из RePoE, движок (`atLeast`, покрытие, эмулятор поиска игры, 250),
    вкладка Regex (Карты/Торговец/Библиотека), стор библиотеки.
  - S8 (фаза 1) `5861e89` — whisper-парсер EN/RU, история сделок, чёрный список PoE Hub, геометрия стэша, вкладка «Сделки».
  - S4 (фаза 1) `f033a29` — порт фильтров/пресетов/pseudo APT, запросы trade/bulk, timeless (legacy + Abyss).
  Патчи замороженных файлов (S1, S3, S8 logTailer, вставка regex, `Settings.overlay`) — в ветке `integration-1`.
- _(лид, 28.10)_ — слит `design/system` `938c5cc`: блок «Благодарности» для «О программе», иконка «Печать».
- `cdcc57b` — S2: данные APT en/ru (`tools/data/sync-apt-data.mjs` → `resources/data/poe1`, `data.meta.json`, пин
  `3188208957…`), загрузчик `src/shared/poe1/data` и порт парсера `src/shared/poe1/parser` (EN/RU, расширенный и
  обычный формат, текст с трейда, timeless), 108 пар фикстур EN/RU, тесты `tests/poe1` (412 тестов). Скрипты
  `sync:data`, `verify:data`, `collect:fixtures`. Не распознаются: 5 legacy-завоевателей timeless (решаем в S4),
  legacy-моды флаконов, статы камней. Подробности — `S2-handover.md` в общей папке заметок.
- _(лид, 28.10)_ — слит `design/system` (дизайнер): токены «Золото компаса» + компоненты `ui-*`, шрифты OFL
  (Golos Text, Cormorant SC, JetBrains Mono — с кириллицей), знак «ромб обмена»/логотип/трей/иконки действий,
  `build/icon.ico`, `docs/design-system.md` (`43695ed`…`a2e5a82`); `globals.css` подключает `tokens.css`,
  трей берёт `tray.png` раньше `app_icon.png`.
- `d4aaa76` — (лид) зависимости для S1/S3/S6: `electron-overlay-window@4.1.0`, `uiohook-napi@1.5.5`, `ws`,
  `@electron/fuses`; `asarUnpack` нативных модулей. Репо `MAYZOSUPER/POETH` создан, `main` запушен с историей.
- `aea5366` — поддержка проекта: `src/shared/links.ts` (`BOOSTY_URL`, allowlist `openExternal` + тест),
  пункт «♥ Поддержать проект» в трее (меню трея теперь RU/EN и строится при каждом открытии), блок внизу
  настроек, README, раздел «Монетизация» в плане.
- `31a688c` — документация POETH: этот `MEMORY.md`, `docs/{PLAN-POETH,ARCHITECTURE,stages,poe1-trade-api,regex}.md`;
  `PLAN.md` и старый `MEMORY.md` компаса → `docs/compass/` (архив).
- `144e5a9` — **Electron 33 → 40.10.6** (как у APT); кода менять не пришлось; проверены dev, собранная версия и
  `electron-builder --dir`.
- `1915163` — `poeth://`: CORS для `fetch()` из renderer (данные S2).
- `94d4592` — **переключатель PoE 1 / PoE 2** в шапке (подтверждение → relaunch, в dev — мягкий перезапуск);
  вкладки по `GameDef.features`, заглушки PoE1 (Прайс-чек/Live/Regex/Сделки); i18n по доменам; **vitest**
  (games, settings v1→v2, ipc, i18n); multi-page (`overlay.html`, `trade-sidebar.html`); `POETH_USER_DATA_DIR`.
- `3261a69` — **каркас по доменам**: `src/shared/ipc/*`, `src/shared/types/*`, `src/preload/domains/*`,
  `src/main/ipc/*` (контракт `IpcDomain`), `windows/companionWindow.ts`, `gameContext.ts`; **Settings v2** +
  миграция; хоткеи v2 через `onHotkeyAction`; `src/shared/games.ts` (`GameDef`, `siteUrl/apiUrl/liveUrl`),
  PoE2-`tradeClient` переведён на хелперы (URL'ы те же).
- `33c2e5f` — **ребрендинг** Exile Companion → POETH: `poeth`, `com.poeth.app`, протокол `poeth://`
  (+ `data/<game>/<lang>/<file>`), миграция userData Act Compass → Exile Companion → POETH, README, NOTICE.
- `7306ea1` — последний коммит компаса (база POETH).
