# Архитектура POETH

> Источник решений — [PLAN-POETH.md](PLAN-POETH.md). Здесь — сжатая инженерная картина: что уже есть
> после S0 (✅) и что строят следующие этапы (⏳ + номер этапа). Кто какие файлы меняет — [stages.md](stages.md).

## 1. Процессы и окна

Electron 40 (main — CommonJS, без `"type":"module"`), TypeScript, React 18, electron-vite (multi-page), zustand.

| Окно | Реализация | Мышь / фокус | Содержимое | Статус |
|---|---|---|---|---|
| **Компаньон** | `src/main/windows/companionWindow.ts`, страница `index.html` | прозрачное always-on-top (`screen-saver`), режим «замок» (сквозные клики) — `clickThrough.ts` | вкладки по игре: PoE2 — Кампания, Прайс-чек; PoE1 — Прайс-чек, Live, Regex, Сделки; Настройки | ✅ |
| **Игровой оверлей** | `windows/gameOverlay.ts`: `BrowserWindow` + `OverlayController.attachByTitle(win, GameDef.windowTitle)`; страница `overlay.html` | по умолчанию пропускает мышь; `Ctrl+D`/`Shift+Space` активируют; `Esc`/`Shift+Space`/клик по фону → `focusTarget()` | окно прайс-чека, тосты live, карточки сделок, подсветка ячейки стэша | ⏳ S1 |
| **Трейд-окно** | `windows/tradeWindow.ts`: `BaseWindow` + `sidebarView` (`trade-sidebar.html`, с preload) + `siteView` (pathofexile.com, **без preload**, сессия `persist:poe-account`) | игра запущена — **поверх игры** (как браузер PoE Overlay, но в её границах): размер как у браузера PoE Overlay — `min(h·1.3, w·0.7) × 0.7·h` окна игры, по центру (`tradeBounds.ts`; растянул — запоминается доля), без системной рамки, шапка — адресная строка (перетаскивание, ×); Esc (и при фокусе у игры, как у PoE Overlay) / хоткей прячут и возвращают фокус игре (`focusTarget`); игры нет — обычное окно тоже без системной рамки (S58): своя шапка (`TitleBar.tsx`: «свернуть / развернуть / закрыть», перетаскивание, двойной клик и Aero Snap — системные), «закрепить поверх»; колонка избранного сворачивается; рельс сайтов (PoE 1) раскрывается с названиями, как рельс компаньона (`@shared/rail`, разметка — `tradeLayout.ts`); хоткей `toggleTradeWindow` | официальный сайт трейда + папки избранного | ⏳ S5 |

- Загрузка страниц: `windows/rendererPage.ts` → `loadRendererPage(win|view, 'index'|'overlay'|'trade-sidebar')`
  (dev-сервер electron-vite или `out/renderer/*.html`).
- Карточки сделок кликабельны без активации всего оверлея: main опрашивает курсор (~30 Гц), renderer шлёт
  `updateInteractiveRects` → временно `setIgnoreMouseEvents(false)`; после клика — `focusTarget()` (⏳ S1/S8).
- **Single-instance:** второй запуск фокусирует компаньон. Lock — на каталог userData
  (`POETH_USER_DATA_DIR` даёт отдельный профиль для тестов/параллельных dev-запусков).

## 2. Игра: PoE 1 / PoE 2

- `src/shared/games.ts` — `GameDef`: `windowTitle` (`'Path of Exile'` | `'Path of Exile 2'`), `tradeSeg`
  (`trade` | `trade2`), `siteRealm` (PoE2: `poe2` только в URL сайта), `logSubdirs`, `dataDir`, флаги
  `features {campaign, priceCheck, live, regex, deals}`; хелперы `siteUrl / apiUrl / liveUrl`.
- `Settings.game` выбирает игру; процесс живёт с одной игрой (`src/main/gameContext.ts`).
  Смена — переключатель в шапке → подтверждение → IPC `app.switchGame` → сохранить → `app.relaunch(); app.exit(0)`.
  **В dev** (`ELECTRON_RENDERER_URL`) настоящий relaunch невозможен: electron-vite завершает dev-сервер, когда
  Electron выходит (`ps.on('close', process.exit)`), поэтому делается мягкий перезапуск: `setupGame(game)`
  заново настраивает домены и перезагружает окна. Нативный attach (S1) должен это пережить или попросить
  перезапустить `npm run dev`.
- Хост сайта — настройка `siteHost`: `www.pathofexile.com` | `ru.pathofexile.com` (cookies привязаны к хосту).
  PoE2-прайс-чек компаса работает только с `www` (там выдан POESESSID).

## 3. IPC: домены

```
src/shared/ipc.ts            агрегатор IPC (каналы + события) и тип OverlayApi = сумма кусков доменов
src/shared/ipc/<домен>.ts    <домен>Channels, <домен>Events, <Домен>IpcApi
src/main/ipc/index.ts        реестр доменов: registerIpcHandlers() (раз), setupGame(game) (старт/смена)
src/main/ipc/<домен>.ts      IpcDomain { register(); setupForGame?(def) }
src/preload/index.ts         window.overlayApi = { ...campaignBridge(), ...tradeBridge(), ... }
src/preload/domains/<домен>.ts
```
Домены: `app` (настройки, окно, хоткеи, смена игры), `campaign` (PoE2-компас), `trade` (прайс-чек: PoE2 сейчас,
PoE1 — S4), `overlay` (S1), `auth` (S3), `fav` (S5), `live` (S6), `regex` (S7), `deals` (S8).
`settings.set` игнорирует поле `game` (только через `app.switchGame`).

**Хоткеи** (`src/main/hotkeys.ts`): домен вешает обработчик `onHotkeyAction(action, fn)` в `setupForGame`;
глобально регистрируются только действия **с обработчиком для текущей игры** (иначе мы впустую перехватывали бы
`Shift+Space`, `Ctrl+Shift+T` во всей системе). После обработчика действие пересылается в renderer
(`event:hotkey`). ⏳ S1: область `scope:'game'` — регистрировать только пока окно игры в фокусе
(focus/blur контроллера), запрет зарезервированных игрой сочетаний (Ctrl+C/V/F/A, Enter, стрелки…).

## 4. Настройки (Settings v2)

`%APPDATA%/POETH/settings.json`, чистый модуль `src/shared/settings.ts` (+ тесты `tests/settings.test.ts`):
`game` (по умолч. `poe1`), `siteHost`, `poe1.league` (`'auto'`), `poe2.league`, `hotkeys` v2
`{[action]: {accel, scope}}`, `sound {enabled, volume}`, `live {maxSearches}`, `deals {enabled, stashGrid,
calibration}`, `regex {}`, `ui {simpleMode}` + поля компаса. Миграция v1→v2: `league` → `poe2.league`,
`toggleVisible` → `toggleCompanion`, `Alt+D` (старый дефолт) → `Ctrl+D`; любой вход нормализуется
(типы, перечисления, диапазоны), патч сливает разделы на один уровень. Старый файл остаётся в `settings.json.bak`.

**Миграция userData** (`services/userDataMigration.ts`): при первом старте копируется самая новая из папок
`Exile Companion` → `Act Compass` (один раз, без перезаписи, маркер `migrated-from.json`), до single-instance
lock. `secret.json` компаса (POESESSID, safeStorage) копируется, но расшифруется только вместе с
перенесённым `Local State` (там ключ safeStorage); если не вышло — POESESSID просто вводится заново.

## 5. Протокол `poeth://`

`src/main/protocol.ts` (схема privileged: standard, secure, fetch, CORS, stream):
- `poeth://brand/<file>` → `resources/brand/`
- `poeth://img/<areaId>/<file>` → лейауты PoE2 (bundled → кэш userData → скачать с Exile-UI)
- `poeth://data/<game>/<lang>/<file>` → `userData/data/…` (обновления данных без переустановки), затем
  `resources/data/<game>/<lang>/…`. Имена проверяются (`poe1|poe2`, код языка, имя файла без путей).

## 6. Вход в аккаунт и безопасность (⏳ S3)

Без входа работают прайс-чек, bulk-обмен, regex, менеджер сделок. Вход нужен для live search и Direct whisper.
- Пароль приложение не видит: вход только на официальной `pathofexile.com/login` в `siteView`; логин/пароль/2FA
  вводит пользователь на сайте GGG. Ничего из этого не храним.
- Изолированная сессия `session.fromPartition('persist:poe-account')` — её используют только `siteView` и сетевой
  слой (`net.request({session, useSessionCookies:true})`, `ws` с cookie из неё). Наши окна — на другой сессии
  (там и зарегистрирован `poeth://`). Cookies на диске шифруются fuse `EnableCookieEncryption` (DPAPI).
- **POESESSID никогда не попадает в renderer:** IPC `auth.status()/login()/logout()` + событие смены статуса.
- Allowlist хостов: сессия аккаунта — только `*.pathofexile.com` (+ `challenges.cloudflare.com`); poe.ninja /
  poeprices / GitHub — отдельная сессия без cookies.
- `siteView`: `sandbox`, `contextIsolation`, без `nodeIntegration`/preload; навигация только внутри
  pathofexile.com, остальное → системный браузер; `window.open`/загрузки/разрешения запрещены.
  Исключение — вход через Steam: по действию страницы можно на `https://steamcommunity.com/oauth/…`
  и `/openid/…` (`isSteamLoginUrl` в `net/guards.ts`); прочий Steam → системный браузер (`isSiteExternalUrl`, `@shared/links`);
  свои переходы (адресная строка, «Открыть лот») — только pathofexile.com (`isSitePageUrl`).
- Hardening (S3/S10): fuses `RunAsNode=off`, `EnableNodeCliInspectArguments=off`, `OnlyLoadAppFromAsar=on`,
  `EmbeddedAsarIntegrityValidation=on`; CSP в наших окнах (✅ есть); проверка `event.senderFrame` во всех IPC;
  `openExternal` — только https + allowlist (✅ есть: `src/shared/links.ts` — `www|ru.pathofexile.com`, `boosty.to`).
- Выход чистит partition. Фолбэк «вставить POESESSID» → `cookies.set` в partition + копия в `safeStorage`
  (`secretStore.ts`). Без телеметрии и своих серверов; логи маскируют cookie.
- UA: `app.userAgentFallback` = Chromium UA + ` POETH/<ver>` (один на окно и API — `cf_clearance` привязан к UA);
  `disable-blink-features=AutomationControlled`; убрать атрибут `Partitioned` у cookies pathofexile.com.
  На Cloudflare-челлендж (HTML 403 / «Just a moment») — «Открыть трейд-окно» и пройти проверку там.

## 7. Сеть и лимиты (⏳ S3, `src/main/net/`)

- `rateLimit.ts` (чистый, тестируемый): лимитер на политику (search / fetch / exchange / live-fetch) с
  несколькими окнами; стартовые значения и ресинк по заголовкам — [poe1-trade-api.md](poe1-trade-api.md).
- `tradeGateway.request({kind, priority:'interactive'|'background'})`: интерактивные (Ctrl+D) вперёд;
  **fail-fast** — если ждать > 1.5 с, сразу ошибка с обратным отсчётом и «повторить»; фоновые (live) — только
  если остаётся ≥ 25 % окна. Кэш 5 мин по хэшу запроса. Лиги — авто-выбор новой лиги, обновление раз в час.
- Основа — `RateLimiter`/`applyRateHeaders` из `services/tradeClient.ts` + `tradeCore.ts` (PoE2, компас).

## 8. Данные и два языка клиента (⏳ S2)

- `tools/data/sync-apt-data.mjs`: данные Awakened PoE Trade по пину (`en`, `ru`) → `resources/data/poe1/{en,ru}/`
  (`stats.ndjson`, `items.ndjson`, `client_strings.js`, `*.index.bin`) + `data.meta.json {aptSha,date,sha256}`.
  Формат: `stats` = `{ref:EN, matchers:[{string:RU/EN с #}], trade:{ids:{explicit,implicit,fractured,crafted,
  enchant,pseudo}}}`, `items` = `{name, refName:EN, namespace, tradeDisc}` — это и есть RU/EN ↔ trade stat id.
- Язык предмета — по первой строке (`Item Class:` / `Класс предмета:`) → нужный набор данных. В запросы всегда
  идут **английские** `refName` и trade stat id → русские предметы ищутся корректно.
- Датасет кампании PoE2 остаётся в `resources/data/*.json` (корень), данные PoE1 — в `resources/data/poe1/`.

## 9. Структура кода

```
src/shared/   games.ts settings.ts ipc.ts ipc/<домен>.ts types.ts types/<домен>.ts       ✅ S0
              trade/{types,urls,parseTradeUrl}.ts favorites/{types,btImport}.ts            ⏳ S4/S5
              poe1/{data,parser,pricecheck/{filters,query}}/…  (порт APT, чистый TS)        ⏳ S2/S4
              regex/{engine,atLeast,emulator,types}.ts                                     ⏳ S7
              deals/{whisperParse,types}.ts                                                ⏳ S8
src/main/     index.ts protocol.ts gameContext.ts hotkeys.ts tray.ts clickThrough.ts       ✅
              windows/{companionWindow,rendererPage}.ts  ipc/<домен>.ts                     ✅
              windows/{gameOverlay,tradeWindow}.ts input/{hostClipboard,gameInput}.ts       ⏳ S1/S5
              focus/gameFocus.ts net/{session,http,rateLimit,tradeGateway,leagues}.ts       ⏳ S1/S3
              games/poe1/{liveSearch,wsTransport}.ts                                       ⏳ S6
              services/{settingsStore,profileStore,logTailer,tradeClient,tradeCore,…}.ts   ✅ (компас)
src/preload/  index.ts domains/<домен>.ts subscribe.ts                                     ✅
src/renderer/ index.html overlay.html trade-sidebar.html                                   ✅ (стабы S1/S5)
              src/{App.tsx,tabs.ts,i18n/{index,dicts}.ts,i18n/dict/<домен>.ts,panels,components,store}
tools/data/   tools/regex/   resources/data/poe1/{en,ru}/                                  ⏳ S2/S7
tests/        *.test.ts  fixtures/{settings,poe1/{en,ru}}/                                 ✅ vitest
```

## 10. Проверки

`npm run typecheck` (node + web + tests), `npm test` (vitest), `npm run test:trade` (PoE2-ядро),
`npm run build`. Живая проверка UI без игры: запустить собранную версию с
`--remote-debugging-port=<порт>` и `POETH_USER_DATA_DIR=<папка>` и смотреть страницу через CDP.
