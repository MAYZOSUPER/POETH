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
  userData). Второй запуск молча выходит («another instance holds the single-instance lock»). Для тестов и
  параллельных `npm run dev` из разных worktree — `POETH_USER_DATA_DIR=<папка>` (свой профиль = свой lock).
  **Закрывать только свой процесс по PID.** Никогда не убивать по имени (`Stop-Process -Name POETH/electron`,
  `taskkill /IM`): на этом ПК стоит установленный POETH пользователя, он тестирует в игре — 29.10 у него из-за
  запусков сессий вылетело трейд-окно. Пока пользователь в игре, проверки сессий не цепляются к окну PoE.
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

- _(лид, 29.10)_ слит S28 (`ca188f4`…`4bbd170`) — «Обмен»: стакан Market Ratio с экрана по Alt+D. Собран rc.10.
  - Игрок держит Alt над «Рыночным курсом», POETH снимает область у курсора (`OverlayController.screenshot`, только в памяти).
  - Разметка таблицы — своя, цифры — tesseract.js-core 6.1.2 (`resources/ocr`, проверка SHA-256, поток-воркер) с голосованием.
  - Неуверенные ячейки — «проверьте», до подтверждения в расчёт не идут.
  - Фикстуры 1×–3× читаются ровно, ≤ 0,66× — «не удалось прочитать».
  - Нога маршрута — по цене исполнения: 12 Valdo = 301,5 c. Правка руками, «устарел» через 5 мин, тост у курсора.
  - Хоткей не отпускает Alt (`hotkeys.ts`, `keepKeys`). Бета, установщик +3,4 МБ. 2459 тестов.
- _(лид, 29.10)_ по живой проверке rc.8 слиты S23–S27, стыковка `c0f152e`. 2418 тестов, test:trade 31/31, сборка.
  Собран rc.9.
  - **S23** (`9a60292`, `f7f621b`, `8533be7`):
    - редкие по Ctrl+D ищутся по той же базе (броня, оружие, бижутерия; самоцветы и исключения APT — как было);
    - галочки по ценности для покупателя (`defaults.ts`): всегда жизнь, мана, ES, сопротивления, скорости;
      урон, крит, уровни камней, подавление — только T1–T3; мусор не отмечается;
    - моды с числами: «Adds 3 to 34 …», «+40 to …» (`filters/mod-text.ts`);
    - карточка лота сравнивает суммами, гибриды идут в обе стихии, другая база — отдельной строкой;
    - 10 фикстур rare-* EN+RU в расширенном формате копии.
  - **S24** (`72ce4e8`…`3dddf0a`):
    - валюта и всё, что меняют у Фаустуса, — по почасовому фиду GGG, без запроса к сайту (IPC `trade.poe1Faustus`);
    - Divine = курс шапки; рынки «за chaos / за div»; объявления сайта — по кнопке;
    - у редких — «Цена на рынке» (10 самых дешёвых, одна единица в строке) и «Цена может быть выше: не отмечены …»
      (один клик — один поиск);
    - заголовок списка — «сначала дешёвые».
  - **S25** (`af3d568`…`34b0c38`) — «Обмен»:
    - покупка — между свежей средней ценой (полураспад 2 ч) и hi, продажа — между lo и средней;
    - на неделе Allflame исполнение в 71% часов против 19% раньше;
    - диапазон «в игре, скорее всего»; флипы внутри одного рынка отсеиваются; шаг ордера до 200 шт.;
    - «Цена в игре сейчас» вручную с пересчётом; подсказка «Рыночный курс + Alt».
  - **S26** (`4f00c5f`…`ee7b1fd`) — `Settings.gameLang` (авто / EN / RU + что определено):
    - автоопределение в main по Ctrl+D и Client.txt; в `production_Config.ini` языка нет;
    - названия валют и предметов — на языке клиента, пояснения — на языке интерфейса;
    - `prefs.gameLang` вкладки Regex перенесён в общую настройку;
    - домен `gameLang` в `main/ipc/index.ts` и `i18n/dicts.ts` — с разрешения лида.
  - **S27** (`a41d078`…`7999709`) — regex торговца:
    - 39 свойств EN/RU, класс и редкость (условия «И»), 4 набора;
    - генератор `tools/regex/build-vendor-data.mjs`;
    - фикстуры в расширенном формате (`{ … }`) генератор и тест пропускают по содержимому.
- _(лид, 29.10)_ слит S20 `8992901` (сессия s20-nav-rail, `dd7987c`): навигация компаньона — рельс слева по макету Б
  (`NavRail.tsx` вместо `AppTabs.tsx`): свёрнут 52 px, развёрнут 188 px с разделами «Торговля / Фарм / Прокачка», от 820 px
  рядом, уже — поверх на затемнении; `localStorage` `poeth.nav.rail`; разделы — данные `tabs.ts`; клавиатура, `aria-current`,
  при замке без подсказок; шапка на иконках спрайта; панели перестраиваются по ширине вкладки (`@container body`). Конфликт
  `leveling.css` с S22 разрешён лидом (прокрутка колонок S22 + порог S20). 1684 теста. Собран rc.8 — на проверку в игре.
- _(лид, 29.10)_ слит S21b (`3278943`): избранное принимает id поиска с `-` и `_` (сейчас id = gzip+base64url
  запроса, до ~500 символов; `src/shared/favorites/slug.ts`, лимит 4096) — «В избранное» в окне цены снова активна. 1666 тестов.
- _(лид, 29.10)_ слиты S21 (сессия s21-pc-live, `fa53b25`, `0bb42a9`): «Открыть лот» — адрес в формате сайта
  `…/search/<лига>/<id>` = исходный поиск + продавец + ilvl + статус «Все», без имени редкого (причина «Failed to load search
  state»: сайт проверяет запрос, `400 Unknown item name`), карточка предмета продавца при наведении/клике со сравнением по
  stat id (`compare.ts`, «похоже 4/6»), общий `components/Select.tsx` (`ui-select`) для «Продавцов» и лиги с понятными
  подписями; и S22 (сессия s22-leveling-auto, `f995797`…`8b48dea`): гид прокачки — синхронизация по хвосту `Client.txt`,
  авто-прогресс по зонам, автоскрытие после кампании, прогресс по персонажам, режим «авто/всегда/никогда», правая колонка
  «Кампании» прокручивается. 1664 теста. «Открыть лот» на настоящем сайте не проверен (Cloudflare во встроенном браузере).
- _(лид, 29.10)_ слиты S19 `805ff1b` (сессия s19-narrow): компаньон от 560 px — `.body > * {min-width:0}`, `.app`
  `overflow:clip`, `overflow-wrap:break-word`, таблицы «Что прибавилось» и находок Live прокручиваются внутри, строка вкладок —
  прокрутка (минимум до новой навигации), «Кампания» PoE 1 < 900 px; и S17 `bc62500` (сессия s17-strategies): код `POETH1:`
  (лимиты до/после распаковки, валидатор), свои стратегии в userData, редактор-мастер, «Поделиться» (код, ссылка, ник, форма
  каталога через main), «Импорт» (7 состояний), протокол `poeth-strategy://` (только импорт, без автодобавления; регистрируется
  лишь установленной версией с включённым советником), каталог `community/*.json` + `tools/advisor/add-strategy.mjs` + форма
  issue (метка `strategy` создана), страницы `site/strategies/` (бандл общего кода, только textContent; в меню сайта не
  ссылаются). Вкладка скрыта флагом. 1608 тестов. Собран rc.7. Долг: ключ `HKCU\Software\Classes\poeth-strategy` при
  удалении (`build/installer.nsh`) — к включению советника; гонка `profiles:create` ENOENT при первом запуске (на работу не влияет).
  Макет навигации (3 варианта, рекомендован А — блоки-разделы) — у пользователя на выборе.
- _(лид, 29.10)_ слиты `design/strategies` `df26ba9` (дизайнер: `ui-steps`, `ui-dialog`, `ui-code`, `ui-mech`, `ui-pips--accent`,
  7 иконок механик, `empty-route.svg`; макеты стратегий утверждены пользователем 28.10) и S18 `d704017` (сессия s18-currency,
  `09bf847`…`ff22efe`): понятная валюта — иконки сфер через кэш main `userData/icons` (только web.poecdn.com, без cookies и
  редиректов, PNG/WebP ≤256 КБ, `poeth://icon`; `protocol.ts` +1 маршрут), общий `<Currency>` с названиями из данных APT и
  падежами RU, подсказка новичку, курс словами — окно цены, «Обмен», «Богатство», фарм, «Сделки», live, «Что фармить».
  Язык названий = язык интерфейса (не `nameLang`). 1557 тестов. Запущен S19 (вёрстка компаньона на узком окне).
- _(лид, 28.10)_ слит S16 `5b28d3c` (сессия s16-advisor, `5ed186f`…`10e51ae`): советник «что фармить» — вкладка
  `advisor` (скрыта: `features.advisor=false`, в dev `POETH_ADVISOR=1`), `strategies.json` схема 1 (предметы по `ref`,
  source official/community/imported/wealthy, patch/«может устареть», тексты `{ru?,en?}`, `measured`), строгий
  `validateStrategy` для недоверенного импорта, расчёт по ценам учёта богатства (`getPriceIndex`), метка стратегии у
  сессии фарма, сортировка «Дешёвый вход»; 3 демо-стратегии 3.29. Wealthy Exile: открытого формата и условий нет —
  импорт не делаем (варианты в `docs/advisor.md`). Тронуты по разрешению: агрегаторы, `tabs.ts`, `App.tsx`, `games.ts`,
  `AppTab` в settings. Макеты «Стратегий фарма» (S17) — у пользователя на утверждении. 1451 тест.
- _(лид, 28.10)_ слит S15 `b6b252d` (сессия s15-pc-verdict, `1a15b81`…`6987c1f`): окно цены PoE1 — вердикт «что делать
  с предметом» (хлам / дешёвка / выставьте за ~X + «Скопировать заметку цены» `~price X chaos|divine` / ценная вещь / мало
  данных / таких никто не продаёт) и жёлтые предупреждения «не тот вариант» (связи, Foulborn и зачарование уника,
  осквернённость, широкий поиск вместе с inexact, накрутка, старые лоты) — только по ответу fetch, без новых запросов;
  честная цена с курсом chaos↔divine. Legacy-уники и имплициты не сравниваются (сайт не отдаёт признак). 1390 тестов.
- _(лид, 28.10)_ доливка `s1-hotkey-conflict` (`0b77624`, слита `f776a65`): автопроверка оверлея ждёт кнопки окна
  цены до 12 с при медленном сайте — живая автопроверка 57/57. Запущены S15 (`s15-pc-verdict`: вердикт и предупреждения
  «не тот вариант» в окне цены) и S16 (`s16-advisor`: каркас советника «что фармить», скрыт флагом до 3.30).
- _(лид, 28.10)_ слиты S13 `83c162e` (сессия s3-net-auth): флиппинг валюты — общий часовой фид GGG, статистика пар,
  маршруты C/D с комиссией в золоте, курс divine с коридором и тостом, вкладка «Обмен» (только PoE1); и S14 `b2aa2fe`
  (сессия s8-deals): прокачка PoE1 RU — маршрут exile-leveling (MIT), зоны/уровень по логу, гид поверх игры (Ctrl+Shift+G),
  вкладка «Кампания», 23+1 пассив. Конфликт агрегаторов разрешён лидом (обе регистрации). 1350 тестов.
- _(лид, 28.10)_ слиты: `s1-hotkey-conflict` (`42d8415`: предупреждение «хоткей занят другой программой» — APT/Sidekick,
  повторный Ctrl+D закрывает окно), `s4-lot-actions` (`5cbb061`: «Написать» = whisper в чат через `typeInChat` без Enter
  или сразу по настройке, «Открыть лот» → трейд-окно, «Выкуп» для instant buyout), `s8-outgoing` (`94c1d38`: исходящая
  карточка как у PoE Overlay — убежище продавца, обмен, выйти из группы), `s12-data-channel` (`07c110f`, `92bd194`: ветка
  `data` с манифестом опубликована, workflow «Data», `tools/data/league-day.mjs`, сквозная проверка 16/16). 1291 тест.
- _(лид, 28.10)_ исправления по живой проверке пользователя: `s1-popup-fixes` (`8abf290`: окно цены не исчезает при работе,
  перетаскивание за шапку и «где оставил», тосты Windows в dev выключены), `s4-fixes` (`9218320`: умолчания фильтров по типу,
  «Искать заново» + Enter, курс chaos↔divine с дробями, IPC `trade.currencyRate`), `s5-fixes` (`9dfae35`: трейд-окно поверх игры
  по образцу PoE Overlay, вход через Steam внутри окна — подтверждено пользователем). 1267 тестов.
- _(лид, 28.10)_ слиты `s11b-ui` (`a8cb8ed`: правки дизайнера по трекеру карт, панель/виджет на `ui-*`) и `s10c-toast`
  (`c52a5dc`: ProductName exe «POE Trade Helper» — один ярлык и шапка тостов, portable без тостов Windows, деинсталлятор чистит
  ключ `Electron Notification Activator`; следы тестов в «Пуске»/HKCU удалены с разрешения пользователя). 1238 тестов.
- _(лид, 28.10)_ слиты S11a `0cfd605` (сессия s3-net-auth): учёт богатства — `StashProvider` (legacy стэш на сессии аккаунта),
  `PriceSource` (почасовой фид обмена GGG + poe.watch), снапшоты, «что прибавилось», доход в час и прибыль за карту через трекер
  S11b, вкладка «Богатство» на компонентах `ui-*` (`features.wealth` — только PoE1). И S10c `3bde142` (сессия S1): знак POETH
  во всех окнах и уведомлениях, AUMID `com.poeth.app.dev` в dev. 1237 тестов. **Все функции v0.1 в main.**
- _(лид, 28.10)_ слит сайт `design/site` (`f2e736b`…`8f855c3`): GitHub Pages https://mayzosuper.github.io/POETH/ (RU/EN,
  `site/` + `pages.yml`) — опубликован. Слит S11b `9507cbd` (сессия s8-deals): трекер карт и сессия фарма по `Client.txt`
  (забег = areaId+seed; порталы и перезаход — один забег; время, ярус, смерти EN/RU), «Начать/Пауза/Завершить», карт/час,
  API `onFarmEvent`/`getFarmState`/`setRunProfit` для S11a, раздел «Сессия фарма», мини-виджет (выкл.), `farm.json`.
  1171 тест. Связку с доходом/час (`attachFarm` + `FarmPanel` во вкладке «Богатство») добавит S11a при слиянии.
- _(лид, 28.10)_ слит S10b (`213c3fd`…`d99c5c1`, сессия S1): NSIS как у APT — мастер RU/EN по языку Windows, без страницы
  «для меня/для всех» (хук `customInstallMode`), `%LOCALAPPDATA%\Programs\POETH` без админа, картинки мастера от дизайнера,
  настройки при удалении сохраняются; `POETH-Portable-<ver>.exe` (обновление вручную по ссылке); релиз с описанием RU/EN;
  README по образцу APT (RU + EN), `docs/DEVELOPMENT.md`. Подпись кода не делаем. 1121 тест.
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
