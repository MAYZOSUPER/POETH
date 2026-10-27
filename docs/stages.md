# Этапы POETH (S0–S10) и «свои файлы»

> Ведёт лид-сессия (куратор). План — [PLAN-POETH.md](PLAN-POETH.md), архитектура —
> [ARCHITECTURE.md](ARCHITECTURE.md). Д1 = 27.10.2026, релиз v0.1.0 — **11.11.2026**.

## Таблица этапов

| Этап | Что | Когда | Владелец | Ветка | Статус |
|---|---|---|---|---|---|
| **S0** | Репо + каркас (этот документ) | Д1 | сессия S0 | `main` | ✅ готово |
| **S1** | Платформа оверлея: нативные модули, attach к окну игры, Ctrl+D → копия предмета → восстановление буфера | Д2–3 | сессия s1-overlay | `s1-overlay-v2` | ✅ слит 28.10 |
| **S2** | Данные APT (en/ru) + порт парсера, ≥30 фикстур на язык | Д2–4 ∥ | сессия s2-data-parser | `s2-data-parser` | ✅ слит 28.10 |
| **S3** | Сеть + вход: изолированная сессия, лимитер, шлюз, лиги, Cloudflare, fuses | Д3–4 ∥ | сессия s3-net-auth | `s3-net-auth` | ✅ слит 28.10 |
| **S4** | Прайс-чек PoE1: фильтры/пресеты/bulk, виджет | Д5–7 | сессия s2-data-parser | `s4-pricecheck` | фаза 1 ✅ слита · 🔄 фаза 2 |
| **S5** | Избранное + трейд-окно (BaseWindow, сайдбар, импорт BT) | Д6–7 ∥ | сессия s7-regex | `s5-fav-trade-window` | 🔄 в работе |
| **S6** | Live search | Д8–10 | сессия s3-net-auth | `s6-live` | 🔄 в работе |
| **S7** | Regex (генератор, движок/atLeast, UI) | Д5–10 ∥ (старт Д2) | сессия s7-regex | `s7-regex` | ✅ слит 28.10 |
| **S8** | Менеджер сделок + подсветка стэша + blacklist | Д9–11 ∥ | сессия s8-deals | `s8-deals` | фаза 1 ✅ слита · 🔄 фаза 2 |
| **S9** | Интеграция: настройки, мастер первого запуска, RU/EN, регресс PoE2, лог-файл | Д12 (integration-1 ✅ 28.10) | лид + сессия s1-overlay | `main` | integration-1 ✅ · команды чата 🔄 (`s1-chat-commands`) · мастер ⏳ |
| **S10** | Hardening + релиз: матрица EN/RU, DPI, NSIS, тег v0.1.0 | Д13–15 | лид | `main` | ⏳ |

∥ — параллельно с другими этапами, каждый в своём git worktree. Последовательные S1 → S4 → S6 —
по одной сессии. Дизайнер — отдельная сессия: дизайн-система «Золото компаса» в `main` (`styles/tokens.css`, `components.css`, правила — [design-system.md](design-system.md)). **Макеты всех окон утверждены пользователем 28.10:** https://claude.ai/artifact/MXRL1ZdMzJtoLeeHkgXRTW — UI каждого этапа делаем по ним (классы `ui-*`, RU/EN, простой/экспертный режим).

## Правила для каждого этапа

1. **Работай только в своих файлах** (таблица ниже). Нужна правка «замороженного» файла — напиши лиду,
   он внесёт её в `main`, ты сделаешь merge/rebase.
2. **Каждый этап зелёный по всем проверкам:** `npm run typecheck`, `npm test`, `npm run test:trade`,
   `npm run build`. Новые чистые модули — с тестами в `tests/<домен>/…` (vitest).
3. **RU и EN** — каждая функция проверяется на обоих клиентах игры (фикстуры `tests/fixtures/poe1/{en,ru}`).
4. Коммиты по-русски, небольшими шагами; в конце — строка в Changelog `MEMORY.md` присылается лиду в отчёте
   (сам `MEMORY.md` правит лид, чтобы не было конфликтов).
5. Параллельный запуск `npm run dev` из нескольких worktree: задай свой профиль
   `POETH_USER_DATA_DIR=<папка>` (single-instance lock — на профиль), иначе второй экземпляр молча выйдет.
6. Зависимости (`package.json`/`package-lock.json`): новые пакеты согласуй с лидом — он ставит их в `main`
   (иначе конфликты в lock-файле при слиянии).

## Как домен подключается к каркасу (без правки общих файлов)

| Что | Куда (свой файл домена) |
|---|---|
| IPC-каналы, события, кусок `OverlayApi` | `src/shared/ipc/<домен>.ts` (`<домен>Channels`, `<домен>Events`, `<Домен>IpcApi`) |
| Обработчики main | `src/main/ipc/<домен>.ts` → `register()` (ipcMain.handle) + `setupForGame(def)` (хоткеи, сервисы) |
| Мост preload | `src/preload/domains/<домен>.ts` → `<домен>Bridge()` |
| Типы | `src/shared/types/<домен>.ts` (реэкспортируются из `@shared/types`) |
| Строки UI | `src/renderer/src/i18n/dict/<домен>.ts` (ru + en, ключи уникальны между доменами) |
| Хоткей | `onHotkeyAction('<действие>', fn)` в `setupForGame` — регистрируется только действие с обработчиком |
| Стили | свой CSS-файл рядом с компонентами (`import './x.css'`), токены — из `globals.css` |
| Состояние renderer | свой zustand-стор `src/renderer/src/store/use<Домен>Store.ts` |

Соглашение по именам: каналы `'<домен>:<метод>'` во вложенном объекте с ключом домена
(`live: { start: 'live:start' }`), события `'event:<домен>.<имя>'`. Уникальность ключей и строк каналов
между доменами проверяет `tests/ipc.test.ts`, полноту RU/EN и дубли ключей — `tests/i18n.test.ts`.

## «Свои файлы» этапов

| Этап | Свои файлы/папки |
|---|---|
| **S1** | `src/main/windows/gameOverlay.ts`, `src/main/input/**` (hostClipboard, gameInput), `src/main/focus/**`, `src/main/hotkeys.ts` (гейтинг по фокусу игры, запрет зарезервированных игрой сочетаний), `src/main/ipc/overlay.ts`, `src/shared/ipc/overlay.ts`, `src/shared/types/overlay.ts`, `src/preload/domains/overlay.ts`, `src/renderer/overlay.html`, `src/renderer/src/overlay/**`, `i18n/dict/overlay.ts`, `tests/overlay/**`. Через лида: deps (`electron-overlay-window@4.1.0`, `uiohook-napi@1.5.5`, `ws`), `asarUnpack` в `electron-builder.yml`. |
| **S2** | `tools/data/**` (sync-apt-data.mjs), `resources/data/poe1/**`, `src/shared/poe1/data/**`, `src/shared/poe1/parser/**`, `tests/fixtures/poe1/**`, `tests/poe1/**`. |
| **S3** | `src/main/net/**` (session, http, rateLimit, tradeGateway, leagues), `src/main/ipc/auth.ts`, `src/shared/ipc/auth.ts`, `src/shared/types/auth.ts`, `src/preload/domains/auth.ts`, `i18n/dict/auth.ts`, `src/renderer/src/panels/account/**` (лид подключит в настройки), `build/**` (fuses-хук), `tests/net/**`. |
| **S4** | `src/shared/poe1/pricecheck/**`, `src/shared/trade/**` (types, urls, parseTradeUrl), `src/main/ipc/trade.ts`, `src/shared/ipc/trade.ts`, `src/shared/types/trade.ts`, `src/preload/domains/trade.ts`, `src/renderer/src/overlay/pricecheck/**`, `src/renderer/src/panels/Poe1PriceCheckTab.tsx`, `i18n/dict/trade.ts`, `tests/pricecheck/**`. PoE2-прайс-чек (`tradeClient.ts`/`tradeCore.ts`) не ломать. |
| **S5** | `src/main/windows/tradeWindow.ts`, `src/main/services/favoritesStore.ts`, `src/shared/favorites/**`, `src/main/ipc/fav.ts`, `src/shared/ipc/fav.ts`, `src/shared/types/fav.ts`, `src/preload/domains/fav.ts`, `src/renderer/trade-sidebar.html`, `src/renderer/src/trade-sidebar/**`, `i18n/dict/fav.ts`, `tests/fav/**`. |
| **S6** | `src/main/games/poe1/{liveSearch,wsTransport}.ts`, `src/main/ipc/live.ts`, `src/shared/ipc/live.ts`, `src/shared/types/live.ts`, `src/preload/domains/live.ts`, `src/renderer/src/panels/LiveTab.tsx` + `panels/live/**`, `src/renderer/src/overlay/live/**`, `i18n/dict/live.ts`, `tests/live/**`. |
| **S7** | `src/shared/regex/**`, `tools/regex/**`, `resources/data/poe1/regex/**`, `src/main/services/regexLibraryStore.ts`, `src/main/ipc/regex.ts`, `src/shared/ipc/regex.ts`, `src/shared/types/regex.ts`, `src/preload/domains/regex.ts`, `src/renderer/src/panels/RegexTab.tsx` + `panels/regex/**`, `i18n/dict/regex.ts`, `tests/regex/**`. |
| **S8** | `src/shared/deals/**` (whisperParse EN/RU), `src/main/services/dealsStore.ts`, `src/main/ipc/deals.ts`, `src/shared/ipc/deals.ts`, `src/shared/types/deals.ts`, `src/preload/domains/deals.ts`, `src/renderer/src/panels/DealsTab.tsx` + `panels/deals/**`, `src/renderer/src/overlay/deals/**`, `i18n/dict/deals.ts`, `tests/deals/**`. Чтение `Client.txt` PoE1: обобщение `logTailer.ts` под `GameDef.logSubdirs` — через лида (регресс кампании PoE2). |

## Замороженные общие файлы (меняет только лид)

| Файл | Зачем |
|---|---|
| `src/shared/games.ts` | таблица игр `GameDef`, `siteUrl/apiUrl/liveUrl` |
| `src/shared/links.ts` | внешние ссылки (`BOOSTY_URL`) и allowlist хостов `openExternal` |
| `src/shared/settings.ts`, `src/shared/types/settings.ts` | Settings v2: поля, дефолты, миграция, патч |
| `src/shared/ipc.ts`, `src/shared/types.ts`, `src/preload/index.ts`, `src/main/ipc/index.ts`, `src/main/ipc/types.ts` | агрегаторы доменов |
| `src/shared/ipc/app.ts`, `src/main/ipc/app.ts`, `src/preload/domains/app.ts` | настройки, окно, смена игры |
| `src/shared/ipc/campaign.ts`, `src/main/ipc/campaign.ts`, `src/preload/domains/campaign.ts`, `src/main/services/{logTailer,profileStore,questDataset,bossMatcher,layoutResolver}.ts` | PoE2-кампания (регресс) |
| `src/main/index.ts`, `src/main/protocol.ts`, `src/main/gameContext.ts`, `src/main/windows/{companionWindow,rendererPage}.ts`, `src/main/tray.ts`, `src/main/clickThrough.ts` | ядро main |
| `src/renderer/src/App.tsx`, `src/renderer/src/tabs.ts`, `src/renderer/src/store/useAppStore.ts`, `src/renderer/src/i18n/{index,dicts,types}.ts`, `i18n/dict/{common,campaign}.ts`, `panels/{Toolbar,AppTabs,SettingsPanel}.tsx`, `components/GameSwitch.tsx` | оболочка компаньона |
| `src/renderer/src/styles/globals.css` | токены темы — дизайнер (через лида) |
| `package.json`, `package-lock.json`, `electron.vite.config.ts`, `electron-builder.yml`, `tsconfig*.json`, `vitest.config.ts` | сборка |
| `MEMORY.md`, `docs/stages.md`, `docs/PLAN-POETH.md`, `docs/ARCHITECTURE.md` | документация лида |

## Журнал этапов

- **S0** (27.10.2026) — репо и каркас: ребрендинг, `poeth://`, миграция userData, IPC/типы/preload/i18n по
  доменам, Settings v2 + миграция, `GameDef`, переключатель PoE1/PoE2 с relaunch, заглушки вкладок PoE1,
  vitest, multi-page, Electron 40.10.6, документация. Коммиты — в Changelog `MEMORY.md`.
