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
| **S4** | Прайс-чек PoE1: фильтры/пресеты/bulk, виджет | Д5–7 | сессия s2-data-parser | `s4-pricecheck-ui` | ✅ слит 28.10 (integration-2) |
| **S5** | Избранное + трейд-окно (BaseWindow, сайдбар, импорт BT) | Д6–7 ∥ | сессия s7-regex | `s5-fav-trade-window` | ✅ слит 28.10 |
| **S6** | Live search | Д8–10 | сессия s3-net-auth | `s6-live` | ✅ слит 28.10 (integration-2) |
| **S7** | Regex (генератор, движок/atLeast, UI) | Д5–10 ∥ (старт Д2) | сессия s7-regex | `s7-regex` | ✅ слит 28.10 |
| **S8** | Менеджер сделок + подсветка стэша + blacklist | Д9–11 ∥ | сессия s8-deals | `s8-deals` | ✅ фазы 1–2 слиты 28.10 (долг: общий gameLog) |
| **S9** | Интеграция: настройки, мастер первого запуска, RU/EN, регресс PoE2, лог-файл | Д12 | лид + сессии s1-overlay, s7-regex | `main` | ✅ слит 28.10 (integration-1, -2) |
| **S11** | Учёт богатства: стэш, цены, снапшоты, доход/час (S11a) + трекер карт (S11b) | с Д2 ∥ | сессии s3-net-auth, s8-deals | `s11a-wealth-v3`, `s11b-maps-rebased` | ✅ слит 28.10 |
| **S12** | Канал обновления данных вживую: ветка `data`, workflow, скрипт «день лиги» | до 13.11 | сессия s7-regex | `s12-data-channel` | ✅ слит 28.10 |
| **S13** | Флиппинг валюты (v0.2 заранее): часовой фид GGG, маршруты, комиссии, вкладка «Обмен» | ∥ | сессия s3-net-auth | `s13-flip-v2` | ✅ слит 28.10 |
| **S14** | Оверлей прокачки PoE1 RU (v0.2 заранее): маршрут exile-leveling, зоны по логу | ∥ | сессия s8-deals | `s14-leveling` | ✅ слит 28.10 |
| **S15** | Окно цены: вердикт «что делать с предметом» (+ заметка `~price`), предупреждения «не тот вариант» | ∥ с 28.10 | сессия s15-pc-verdict | `s15-pc-verdict` | ✅ слит 28.10 |
| **S16** | Советник «что фармить»: каркас вкладки, модель стратегий, расчёт по ценам, связь с трекером карт (скрыт флагом до 3.30) | ∥ с 28.10 | сессия s16-advisor | `s16-advisor` | ✅ слит 28.10 (скрыт флагом) |
| **S17** | Стратегии игроков: редактор, код/ссылка `POETH1:`, импорт, каталог на сайте и во вкладке | с 28.10 | сессия s17-strategies (+ дизайнер: `design/strategies`) | `s17-strategies` | ✅ слит 29.10 (скрыт флагом) |
| **S18** | Понятная валюта: настоящие иконки сфер (кэш с web.poecdn.com через `poeth://`), названия на языке клиента с падежами, подсказки новичку, курс словами — во всех окнах | ∥ с 28.10 | сессия s18-currency | `s18-currency` | ✅ слит 29.10 |
| **S19** | Вёрстка компаньона на узком окне (от 560 px): строка вкладок не раздувает страницу, всё переносится, RU/EN | ∥ с 29.10 | сессия s19-narrow | `s19-narrow` | ✅ слит 29.10 |
| **S20** | Новая навигация компаньона: рельс слева (вариант Б, выбран пользователем 29.10), разделы «Торговля» / «Фарм» / «Прокачка» | с 29.10 | сессия s20-nav-rail | `s20-nav-rail` | ✅ слит 29.10 · макет: https://claude.ai/artifact/BYKiqFUe7J1gCueUiVcyR2 |
| **S21** | Окно цены по живой проверке rc.7: «Открыть лот» (Failed to load search state), карточка предмета продавца со сравнением с моим, список «Продавцы» в дизайн (`ui-select`) и понятные подписи | ∥ с 29.10 | сессия s21-pc-live | `s21-pc-live` | ✅ слит 29.10 |
| **S22** | Гид прокачки: синхронизация по логу при запуске, авто-прогресс по зонам, автоскрытие после кампании, прогресс по персонажам | ∥ с 29.10 | сессия s22-leveling-auto | `s22-leveling-auto` | ✅ слит 29.10 |
| **S23** | Окно цены, поиск редких по живой проверке rc.8: точная база по умолчанию, ценные свойства отмечены сразу, моды с числами, карточка лота с учётом псевдо-статов | ∥ с 29.10 | сессия s23-rare-search | `s23-rare-search` | ✅ слит 29.10 |
| **S24** | Окно цены, понятная цена: валюта по обмену у Фаустуса (фид GGG), а не по объявлениям сайта; «Купить сейчас / По whisper» переписаны под проверку цены; подсказка «цена может быть выше — учесть ещё» | ∥ с 29.10 | сессия s24-pc-price-clear | `s24-pc-price-clear` | ✅ слит 29.10 |
| **S25** | «Обмен»: реалистичная цена покупки/продажи (не лучший час за сутки), диапазон и «цена в игре сейчас» вручную с пересчётом прибыли | ∥ с 29.10 | сессия s25-flip-real-price | `s25-flip-real-price` | ✅ слит 29.10 |
| **S26** | Названия предметов на языке игры: общая настройка «язык клиента игры» (авто/RU/EN) отдельно от языка интерфейса | ∥ с 29.10 | сессия s26-game-lang | `s26-game-lang` | ✅ слит 29.10 |
| **S27** | Regex торговца: свойства предметов (жизнь, сопротивления, «+ к уровню камней» по типам, урон, скорость атаки/чар…) на EN и RU | ∥ с 29.10 | сессия s27-vendor-mods | `s27-vendor-mods` | ✅ слит 29.10 |
| **S28** | «Обмен»: стакан Market Ratio с экрана по хоткею (держишь Alt над «Рыночным курсом» — POETH распознаёт «Курс / Кол-во» локально, без действий в игре) → цена исполнения ордера по глубине стакана, обе стороны | с 29.10 | сессия s28-ratio-ocr | `s28-ratio-ocr` | ✅ слит 29.10 (бета) |
| **S29** | Аудит безопасности и приватности перед релизом: сеть, диск, hardening Electron, XSS → опасный IPC, обновления, `docs/security.md` | с 29.10 | сессия s29-security-audit | `s29-security-audit` | ✅ этапы 1–3 слиты 29–30.10 |
| **S30** | Тексты к релизу: README RU/EN, FAQ RU/EN, черновик заметок v0.1.0, тексты сайта | с 29.10 | сессия s30-release-docs | `s30-release-docs` | ✅ слит 29–30.10 (гайд на сайте, пометка «демо» — снять `git revert 40febbd`) |
| **S31** | Имена на языке клиента игры: гид прокачки (зоны, квесты, NPC, боссы) и находки live | с 29.10 | сессия s31-names-game-lang | `s31-names-game-lang` | ✅ слит 29.10 |
| **S32** | Рельс: счётчики на иконках и плашка «Сквозной режим»; гонка `profiles:create` при первом запуске | с 29.10 | сессия s32-rail-profiles | `s32-rail-profiles` | ✅ слит 29.10 |
| **S33** | Флиппинг предметов (v0.2 заранее, скрыт флагом): тиры уников, «ниже рынка» по клику, 6L, антискам | с 29.10 | сессия s33-item-flip | `s33-item-flip` | ✅ слит 30.10 (скрыт флагом, снимок цен по расписанию выключен) |
| **S34** | Electron 40 → поддерживаемая ветка (44): исправления безопасности Chromium, проверка нативных модулей, OCR, fuses | с 29.10 | сессия s34-electron-44 | `s34-electron-44` | ✅ слит 30.10 (Electron 44.10.0) |
| **S35** | Вкладка «Билд» (v0.2, скрыта флагом), B1: разбор кода PoB (безопасный XML), модель, этапы прокачки, ссылки на билды | с 29.10 | сессия s35-pob-parser | `s35-pob-parser` | ✅ слит 30.10 |
| **S37** | Шлифовка интерфейса перед демо: страница «Прайс-чек» PoE 1 вместо заглушки, тексты, расходящиеся с кодом | 30.10 | сессия s37-demo-polish | `s37-demo-polish` | ✅ слит 30.10 |
| **S36** | Вкладка «Билд», B2: данные дерева и камней (skilltree-export + RePoE RU), строки лога (вложение пассивок, `/passives`) | с 29.10 | сессия s36-build-data | `s36-build-data` | ✅ слит 30.10 |
| **S38** | Вкладка «Билд»: дерево этапа поверх игрового дерева пассивок по Alt+P (как Build Planner PoE 2) | с 30.10 | сессия s38-tree-overlay | `s38-tree-overlay` | ✅ фаза 2, правка «взято» и автоподгонка по снимкам слиты 30.10 · ⏳ проверка в игре, снимки упора панорамы и другим классом |
| **S39** | Вкладка «Билд», B3: интерфейс по макету v0.2 — вставка PoB, этапы, камни, связки, дерево, проверка | 30.10 | сессия s39-b3 | `s39-b3` | ✅ слит 30.10 (скрыта флагом) |
| **S40** | Вкладка «Билд»: «Предметы этапа» — ключевые предметы, «Купить первым», «Трейд», «что нужно от слота» | 30.10 | сессия s40 | `s40` | ✅ слит 30.10 (скрыта флагом) |
| **S41** | Вкладка «Билд», B4: «Против надетого» в окне Ctrl+D — «Запомнить как надетое», слоты, упрощённый расчёт, вердикт | с 30.10 | сессия s41-vs-equipped | `s41-vs-equipped` | ✅ слит 30.10 (скрыт флагом) |
| **S42** | Хвосты S37: клавиши в подсказках по настройкам, RU-строки в EN-интерфейсе, мёртвые ключи, portable и live, `whisperLastHit` | с 30.10 | сессия s42-polish | `s42-polish` | ✅ слит 30.10 |
| **S43** | B5: сайты внутри трейд-окна (poe.ninja, poedb, вики, Maxroll, poelab, Craft of Exile, PoE Scout), отдельная сессия, глубокие ссылки | с 30.10 | сессия s43-sites | `s43-sites` | ✅ слит 30.10 |
| **S44** | v0.2b: точный расчёт предмета движком PoB (LuaJIT дочерним процессом, без сети) в «Против надетого» | с 30.10 | сессия s44-pob-engine | `s44-pob-engine` | ✅ слит 30.10 (бета) |
| **S45** | Умная оценка timeless: свой калькулятор сида, лучшее гнездо, аналоги одним count-запросом | с 30.10 | сессия s45-timeless | `s45-timeless` | ✅ слит 30.10 |
| **S46** | Regex «Предметы»: базы под крафт, жёлтые, камни, флаконы — поиск в тайнике RU/EN | с 30.10 | сессия s46-regex-items | `s46-regex-items` | ✅ слит 30.10 |
| **S47** | Трейд PoE 2 на уровне PoE 1: данные Exiled Exchange 2 (RU/EN), прайс-чек с модами в окне Ctrl+D, вход через официальную страницу вместо поля POESESSID | с 30.10 | сессия s47-poe2-trade | `s47-poe2-trade` | ✅ слит 30.10 |
| **S48** | Гигиена зависимостей: уязвимости сборки и тестов 26 → 0, `npm audit` в CI, «Чужой код и зависимости» в security.md | 30.10 | сессия s48-ci | `s48-deps` | ✅ слит 30.10 |
| **S49** | Окно брандмауэра при первом трейд-окне: какой сокет слушает POETH и как его закрыть | с 30.10 | сессия s49 | `s49-firewall` | ✅ исправление слито 30.10 · ⏳ прогон «после-2» и check-sockets |
| **S50** | Окно цены: режим «Продаю» — цена для мерчант-вкладки, «не дешевле X», «Скопировать число», предупреждение по ~price | с 30.10 | сессия s50-selling | `s50-selling` | ✅ слит 30.10 |
| **S51** | Перевод предмета RU→EN по хоткею (для PoB и Discord) на основе пересборки S44 | с 30.10 | сессия s51-item-en | `s51-item-en` | ✅ слит 30.10 |
| **S52** | Гид прокачки: уровень зоны и штраф опыта, напоминание о лабиринте (+ раскладка poelab) | с 30.10 | сессия s52-zone-xp-lab | `s52-zone-xp-lab` | ✅ слит 30.10 |
| **S53** | Фильтр лута NeverSink в один клик: строгость, установка в папку фильтров, «есть новая версия» | с 30.10 | сессия s53-lootfilter | `s53-lootfilter` | ✅ слит 30.10 |
| **S54** | Анойнты: нота ↔ масла, стоимость по ценам, строка анойнта во вкладке «Билд» | с 30.10 | сессия s54-anoints | `s54-anoints` | ✅ слит 30.10 |
| **S55** | «Справочник» (статьи как данные, обновляются без переустановки) + «Старт лиги: первые дни» | с 30.10 | сессия s55-guidebook | `s55-guidebook` | ✅ слит 30.10 |
| **S56** | Сайт: гайд по функциям после rc.11; баг-репорты — форма GitHub, страница /bug/, кнопка в приложении | 30.10 | сессия s30-release-docs | `s56-site-bugs` | ✅ слит 30.10 |
| **S57** | Замер: сколько весит проект и что можно удалить (только отчёт) | 30.10 | сессия s57-disk-size | — | ✅ отчёт готов |
| _очередь_ | Средние идеи — после S50–S55: мои лоты против рынка; журнал «продано ниже рынка»; аудит дамп-вкладки; дорожная карта эндгейма, словарь сленга, Синдикат и механики (статьи «Справочника»); проверка связи; счётчик смертей с советом; regex для торговцев Экспедиции; помощник крафта (вместе с «подсказчиком заработка» D1–D4 после релиза) | — | лид | — | 🔜 |
| **S10** | Hardening + релиз: матрица EN/RU, DPI, NSIS, тег v0.1.0 | Д13–15 | лид | `main` | S10a ✅ · репо открыт 28.10 ✅ · ⏳ живые проверки, тег v0.1.0 |

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
7. **Живые проверки на этом ПК:** закрывай только свой процесс по PID, никогда не убивай POETH/electron по имени
   (`Stop-Process -Name`, `taskkill /IM`) — у пользователя установлен POETH, он тестирует в игре. Свой
   `POETH_USER_DATA_DIR`, приложение закрыть в конце проверки; пока пользователь в игре — не цепляться к окну PoE.

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
| **S15** | как у S4: `src/shared/poe1/pricecheck/**`, `src/renderer/src/overlay/pricecheck/**`, `src/main/ipc/trade.ts`, `src/shared/{ipc,types}/trade.ts`, `i18n/dict/trade.ts`, `tests/pricecheck/**`. Парсер — только чтение. |
| **S16** | `src/shared/advisor/**`, `resources/data/poe1/advisor/**`, `src/{main,shared}/ipc/advisor.ts`, `src/shared/types/advisor.ts`, `src/preload/domains/advisor.ts`, `panels/AdvisorTab.tsx` + `panels/advisor/**`, `store/useAdvisorStore.ts`, `i18n/dict/advisor.ts`, `tests/advisor/**`, `docs/advisor.md`. По разрешению лида — строки в агрегаторах, `tabs.ts`, `App.tsx`, флаг `advisor` в `games.ts`; метка стратегии в трекере карт. |
| **S23** | `src/shared/poe1/pricecheck/filters/**`, `src/shared/poe1/pricecheck/compare.ts`, в `overlay/pricecheck/` — блок свойств и фильтров (`ModRow`, `StatsBlocks`, `ItemFiltersRow`, `LotCard.tsx`), `tests/pricecheck/**` (свои файлы), фикстуры `tests/fixtures/poe1/{en,ru}`. Ключи i18n — отдельным блоком `pc1.s23.*`. Результаты окна (цены, вердикт, предупреждения) не трогает — это S24. |
| **S24** | `src/shared/poe1/pricecheck/{results,verdict,warnings,currency}.ts`, `query/bulk.ts`, в `overlay/pricecheck/` — блок результатов (`GroupLine`, `WhyHint`, `ListingRow`, `VerdictPlate`, `WarningList`, `TradeResult`, `BulkResult`, `Results`) и `store.ts`, `pricecheck.css`, `src/main/ipc/trade.ts`, `tests/pricecheck/**` (свои файлы). Ключи i18n — блоком `pc1.s24.*`. Фид обмена и `getPriceIndex` — только чтение. |
| **S25** | `src/shared/flip/**`, `src/shared/types/flip.ts`, `src/main/ipc/flip.ts`, `panels/FlipTab.tsx` + `panels/flip/**`, `i18n/dict/flip.ts`, `tests/flip/**`. Имена валют (`useCurrencyNames`, `Currency.tsx`) не трогает — это S26. |
| **S26** | `src/shared/currency/**`, `components/Currency.tsx`, определение языка клиента (новый модуль), места, где имена берутся по языку интерфейса. По разрешению лида: поле `gameLang` в Settings v2 и строка в `SettingsPanel.tsx`. Регекс — только перевод `prefs.gameLang` на общую настройку. |
| **S27** | `src/shared/regex/vendor.ts` (+ новые модули рядом), `VendorQuery` в `src/shared/types/regex.ts`, `panels/regex/VendorPage.tsx`, ключи `regex.vendor.*` в `i18n/dict/regex.ts`, `tools/regex/**`, `tests/regex/**`. |
| **S28** | новый домен `ocr`/`book` (main: захват области экрана и распознавание; shared: разбор «Курс / Кол-во», расчёт по глубине стакана), `panels/flip/**` и `src/shared/flip/**` — встраивание в «Цена в игре сейчас» (S25), `i18n/dict/flip.ts`, `tests/fixtures/ocr/**`, `tests/ocr/**`. Один новый пакет распознавания — в своей ветке (других сессий с правкой `package.json` сейчас нет). Хоткей — по `onHotkeyAction`, строка в агрегаторах и `defaultHotkeys` — с разрешения лида. |
| **S29** | `docs/security.md`, `tests/security/**`, точечные правки в `src/main/**` и `src/preload/**` под исправления; в renderer — только места XSS вне файлов S31/S32; по разрешению лида — `about.privacy` и `i18n/dict/onboarding.ts` (фразы о приватности). |
| **S30** | `README.md`, `README.en.md`, `docs/FAQ*.md`, `docs/release-notes/**`, тексты сайта (`site/**`). Код приложения не трогает. |
| **S31** | `panels/leveling/**`, `overlay/leveling/**`, `src/shared/leveling/**`, `resources/data/poe1/leveling/**`, `tools/leveling/**`, `i18n/dict/leveling.ts`; live — `src/shared/live/names.ts`, `panels/live/**`, `panels/LiveTab.tsx`, `overlay/live/**`; `tests/leveling/**`, `tests/live/**`. |
| **S32** | `panels/NavRail.tsx` + стили, `tabs.ts` (метаданные разделов), `services/profileStore.ts`, обработчик `profiles.create` в `src/main/ipc/campaign.ts`, место создания профиля в `useAppStore.ts`, словарь рельса, тесты. Сторы сделок и live — только чтение. |
| **S33** | `src/shared/flip/items/**`, `src/main/games/poe1/flip/items/**`, `panels/flip/items/**` (+ минимальное встраивание в `panels/flip/**`), ключи `flip.items.*` в `i18n/dict/flip.ts`, новые методы домена `flip` (shared/main/preload/types), `tests/flip/items/**`; снимок цен — `tools/data/**` и правка `.github/workflows/data.yml` (дифф — лиду). |
| **S34** | `package.json`, `package-lock.json`, правки под смену API Electron, тестовое окно «Path of Exile» и скрипты проверки. Файлы S29 (этап 2) — только если без этого не обойтись. |
| **S35** | `src/shared/pob/**`, `src/shared/build/flag.ts`, `src/main/pob/**`, `tests/pob/**`, `tests/fixtures/pob/**`, `docs/pob.md`, строка в `NOTICE.md`. IPC — через лида. |
| **S36** | `tools/build-data/**`, `resources/data/poe1/build/**`, `src/shared/build/**` (кроме `flag.ts`), `src/shared/leveling/log.ts`, `tests/build-data/**`, строки в `NOTICE.md` и `docs/league-update.md`. |
| **S37** | тексты в `i18n/dict/*` (кроме агрегатора), компоненты затронутых вкладок (страница «Прайс-чек» PoE 1 и др.). |
| **S38** | `src/shared/build/treeOverlay*.ts`, `src/main/build/treeOverlay*.ts`, домен `buildTree` (shared/main/preload/dict), `overlay/tree/**`, `tools/tree-bench/**`, `tests/build/treeOverlay*` (в т. ч. `treeOverlayMatch`, `treeOverlayFit*`); по разрешению лида — хоткей `buildTree`, подписки мыши в `gameInput.ts`, `OVERLAY_CHANNELS` в `policy.ts`. |
| **S39** | домен `build` (shared/main/preload/dict), `src/main/build/{buildLibrary,buildTaken}.ts`, `src/shared/build/{library,takenLog,view}.ts`, `panels/build/**`, `store/useBuildStore.ts`, `overlay/leveling/buildGuide.ts` + `buildLine.tsx`, `tests/build/*` (кроме treeOverlay); по разрешению лида — `GameFeatures.build`, `tabs.ts`, `AppTab`, `protocol.ts` (`DATA_SUBDIRS`), `COMPANION_CHANNELS`. |
| **S40** | `src/shared/build/{pobItem,stageItems,keyItems,keyUniques,itemTrade,itemLang,slotNeeds}.ts`, `panels/build/{ItemsBox.tsx,useItemsData.ts}`, ключи `bd.it.*` в `i18n/dict/build.ts`, `build.css`, `tests/build/{pobItem,keyItems,itemTrade}.test.ts`; по разрешению лида — `marks?` в `PobStageEdits` (S35) и `cleanEdits`. |
| **S41** | новый домен `equip` (shared/main/preload/dict), `src/shared/build/equipCompare*.ts`, `overlay/pricecheck/EquipBox*`, `tests/build/equip*`; по разрешению лида — по строке в агрегаторах, `policy.ts`, место монтирования в `PriceWindow.tsx`. |
| **S42** | строки `i18n/dict/*` (кроме словаря `equip`), диалоги main (`ipc/regex.ts`, `ipc/campaign.ts`), `profileStore.ts`, `useAppStore.ts`, `levelingStore.ts`, `LayoutViewerPanel.tsx`, `wealth/manager.ts`, блок `.coming-soon*` в `globals.css`; в `PriceWindow.tsx` — только вызовы строк. |

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
