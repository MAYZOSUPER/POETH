# Новая лига и патчи: что ломается и что делаем

> Регламент лида на старт лиги и мид-лиговые патчи. Первый боевой прогон — **3.30, старт 13.11.2026 (PST, ≈22:00 МСК)**;
> анонс на ExileCon 7–8.11, патчноуты — за несколько дней до старта.

## Как было у прошлых лиг (по релизам Awakened PoE Trade)

| Лига | Старт | Данные APT обновлены | Что чинили в первые 1–2 недели |
|---|---|---|---|
| 3.29 Allflame | 24.07.2026 | 25.07 (v3.29.101, +1 день) | не-английские клиенты (в день данных); 27.07 — кластеры/карты/логбуки после того, как сайт трейда убрал выпадающие списки у статов; «Failed to load leagues»; кэш цен; 02.08 — Vestigial-уники, Scrying Orb, данные патча 3.29.1, работа после капчи |
| 3.28 | ~06.03.2026 | 08.03 (+2 дня) | фильтр «Split: No» по умолчанию |
| 3.27 | ~31.10.2025 | 01.11 (≈ в день старта) | 01.11 — мерчант-листинги (асинхронный трейд); 02.11 — Foulborn-уники; ещё 3 фикс-релиза за неделю |
| 3.25 | 26.07.2024 | 28.07 (+2 дня) | — |

**Вывод:** данные модов и предметов приходят через **0–3 дня**, ещё **1–2 недели** идут правки: новая механика лиги,
изменения сайта трейда, не-английские клиенты, капча/Cloudflare. Мид-лиговые патчи (3.x.1, 3.x.2) снова требуют
обновления данных.

## Что меняется в новой лиге и как POETH это переживает

| Что меняется | Последствие | Как у нас |
|---|---|---|
| Имя лиги | старая лига в запросах | **само**: `poe1.league:'auto'` выбирает новую челлендж-лигу (S3, обновление раз в час) |
| Новые моды/базы/уники | «не распознан», неточная цена | **сразу**: фолбэк на `/api/trade/data/{stats,items}` с `www` и `ru` хостов при старте и раз в сутки (S4); **через 1–3 дня**: `npm run sync:data -- --sha <новый APT>` + обновление данных без переустановки |
| Моды карт, механика атласа | regex-строки карт неполные | после обновления RePoE fork: `tools/regex/build-regex-data.mjs` → обновление данных |
| Сайт трейда (фильтры, статусы, поля листингов) | ошибки запросов, пропавшие фильтры | проверка в день старта по чек-листу ниже, хотфикс-релиз |
| Новые валюты/рынки обмена | флиппинг (v0.2) не знает пары | маппинг metadata-id обновляется вместе с данными |
| Формат Ctrl+C, строки `Client.txt` | парсер/сделки | фикстуры из новой лиги + тесты; whisper-форматы менялись редко |
| Дерево пассивок, камни | вкладка «Билд» (v0.2): ноды, имена, статы; новые и трансфигурированные камни | `node tools/build-data/build.mjs --refresh` по новому тегу skilltree-export и выгрузке RePoE → `build/{tree,gems}.json` едут каналом данных; timeless-калькулятор — перепроверить |
| Тексты журнала (вложение пассивок, очки, `/passives`) | «Билд» не видит прогресс | `node tools/build-data/log-strings.mjs` сверяет с таблицами клиента |
| Капча/Cloudflare | `blocked` | баннер «проверка сайта» → трейд-окно (S3) |
| Тексты «Справочника» | в статье «Старт лиги» нет раздела о новой лиге, советы могли устареть | правка `resources/data/poe1/guide/*.json` (`docs/guide.md`) → тем же каналом данных, без переустановки |

## Чек-лист лида

**До старта (11–13.11):**
- [ ] Прочитать патчноуты 3.30: новые классы предметов, механика лиги, изменения трейда, Ctrl+C, чата/whisper.
- [ ] Канал данных жив: `node tools/data/check-data-channel.mjs --exe=dist-release/win-unpacked/POETH.exe`
      (после `npm run package:dir`) — 16/16, манифест отдаётся, пакет = встроенные данные.

**«Справочник» к лиге (S55), D−2…D0 (11–13.11):**
- [ ] По патчноутам заполнить раздел «Что нового в 3.30» статьи `resources/data/poe1/guide/league-start.json`
      (`id: new-330`): блок `pending` заменить своими словами — механика лиги, что изменилось для новичка; ссылку на
      патчноуты оставить. Только факты из патчноутов GGG, тексты не копировать (`docs/guide.md`, «Как писать»).
- [ ] Сверить остальные пункты статьи с патчноутами: сопротивления после 5 и 10 актов, уровни Лабиринта, атлас
      (клавиша `G`), обмен валюты у Фаустуса, мерчант-вкладки. Изменилось — поправить; «Для 3.29 / 3.30» — по факту.
- [ ] `rev` статьи + 1; у раздела `new-330` (и у других изменённых) — `"rev": <новая>`; `updated` — дата правки.
      Кто читал статью, увидит «Обновлено» у статьи, у раздела и число на пункте рельса.
- [ ] `npx vitest run tests/guide` → посмотреть статью в приложении (RU/EN, 560 и 820 px) → коммит в main.
- [ ] Выпустить пакетом данных из main: Actions → «Data» → Run workflow с новой версией (например, `3.30.0-0`;
      если в тот же день выходят и данные APT — одним пакетом с ними). Лучше до D0: POETH проверяет данные при
      запуске, статья придёт после перезапуска. После выпуска — `check-data-channel.mjs`.

**«Стартеры» к лиге (S59), после анонса и tier-листов авторов (8–14.11):**
- [ ] Лид и пользователь выбирают 10–20 стартеров по tier-листам авторов (и poebuilds.cc как инструменту поиска).
      Нужна **ссылка на пасту PoB** (`pobb.in/…`, `pob.codes/b/…`, `maxroll.gg/poe/pob/…`), не на планнер.
- [ ] Каждый: `node tools/starters/add-starter.mjs <ссылка PoB> --author "Ник" --lang ru|en --budget low|medium|high
      --difficulty 1..3 [--newbie] --modes sc,hc,ssf --content mapping [--pick --note-ru "…" --note-en "…"]
      --video <ссылка> --guide <ссылка>`. Скрипт один раз качает PoB, сам берёт класс, восхождение, навык, этапы и
      отпечаток, предупреждает («PoB под 3.29 → Устарел», «нет этапов», «pick без --newbie»).
- [ ] `note` — **наш** текст своими словами, RU и EN, до 140 символов, без ссылок; тексты и рейтинги авторов не копировать.
- [ ] После данных 3.30 — проверить импорт, этапы, камни, ссылки (нет RMT) → повторить с `--checked --replace`
      («Проверено POETH»). Тем же `--replace` обновляется отпечаток, если автор перезалил пасту.
- [ ] `node tools/starters/add-starter.mjs --check` → `npm test` → коммит → пакет данных (Actions → «Data»).

**День старта (D0):**
- [ ] Лига переключилась сама (`/api/trade/data/leagues`).
- [ ] Ctrl+D на 10 разных предметах новой лиги (EN + RU клиент): что «не распознано» → покрывает ли фолбэк `/data/stats`.
- [ ] Поиск/fetch/bulk/live работают, нет новых ошибок шлюза; Cloudflare/капча — путь через трейд-окно.
- [ ] Whisper-сделка с альта на EN и RU — карточка появляется.
- [ ] PoE 2: лига trade2 переключилась сама (`/api/trade2/data/leagues`), Ctrl+D на 5 предметах EN и RU.

**D+1…D+3:**
- [ ] Вышел новый релиз APT (и/или обновился RePoE fork) → **день лиги одной командой** (см. ниже):
      `node tools/data/league-day.mjs --sha <коммит APT> --version 3.30.0-1 --patch 3.30`.
- [ ] `npm run collect:fixtures` в новой лиге (новые EN/RU пары) → тесты парсера.
- [ ] Вышел тег skilltree-export `3.30.x` и выгрузка RePoE fork 3.30 → данные «Билда»: поднять пины в
      `tools/build-data/sources.mjs` (и `DAT_COMMIT` в `tools/leveling/game-names.mjs`), `node tools/build-data/build.mjs
      --refresh`, `npx vitest run tests/build-data` (порядок и отчёт — `tools/build-data/README.md`). Скилл-три выходит
      в день патча, RePoE — обычно через 0–2 дня; дерево без RU-имён не публиковать.
- [ ] Анойнты (S54): после `node tools/build-data/build.mjs --refresh` смотреть отчёт `anoints.mjs` (новое масло → поднять
      `DAT_COMMIT`), после обновления данных APT — `npx vitest run tests/build-data/anoints.test.ts` (рецепты и RU-имена
      сверяются с APT; поправить число 472 и известные пары, если GGG поменяли рецепты).
- [ ] Timeless (S45), после данных «Билда»: новый коммит PoB с обновлёнными `src/Data/TimelessJewelData` → `POB_COMMIT` и
      SHA-256 в `tools/timeless/build.mjs`, `node tools/timeless/build.mjs --refresh`, `npx vitest run tests/timeless`;
      смотреть отчёт «нотаблы без исхода» и эталонные сиды (`tools/timeless/README.md`).
- [ ] Движок PoB (S44): релиз PoB под лигу (взять последний за 1–2 дня до выпуска POETH) → `tools/pob/pins.json` (`tag`,
      полный `commit`, `tree`), `node tools/pob/prepare.mjs --pin`, затем `node tools/pob/prepare.mjs` (нужен VS Build Tools)
      и `npx vitest run tests/pob/serverLua.test.ts`: selftest зелёный, RU = EN, «наш XML = исходный» ≥ 10. Упало —
      `pobSparse`/`pobKeep` в `prepare.mjs` или `STATS` ↔ `ENGINE_STATS`. release.yml соберёт и проверит движок сам.
- [ ] PoE 2 (S47, S67): релиз Exiled Exchange 2 под патч → `node tools/data/poe2-day.mjs --ee2 <коммит EE2> --version
      <версия>` (раздел «PoE 2: день 1.0» ниже); снапшоты `npx vitest run tests/poe2 -u` — глазами.
- [ ] Нужен код (не только данные) — релиз v0.1.1 (тег `v*`, release.yml).

**Неделя 1–2:** следить за issues APT/Sidekick и форумом GGG (изменения сайта трейда), хотфиксы. Мид-лиговые
патчи — повтор блока D+1…D+3.

## Канал обновлений данных (S12, работает)

Игроки получают новые данные **без переустановки**: POETH при запуске и раз в сутки (настройка «Проверять
обновления») читает манифест **своей игры**, качает только файлы, отличающиеся от встроенных, проверяет размер и sha256 и
атомарно подменяет надстройку `userData/data/<poe1|poe2>` (любая ошибка — откат, работают встроенные данные; сети
нет — тихо, только лог). Применили — тост «Данные обновлены (<версия>). Перезапустите POETH…».

- **Адрес:** `https://raw.githubusercontent.com/MAYZOSUPER/POETH/data/manifest.json` (links.DATA_MANIFEST_URL) — PoE 1;
  PoE 2 (S67) — `…/data/manifest-poe2.json` рядом (shared/updates `dataManifestUrl`; читают версии после S67).
  Ветка `data` публичного репо — orphan: `manifest.json` + `poe1/…`, `manifest-poe2.json` + `poe2/…`, README,
  `.gitattributes` (`* -text`). Выпуск одной игры не трогает пакет другой (`tools/data/data-channel.mjs`).
  Первый выпуск — `2026.10.27` (= данные v0.1.0, игрокам качать нечего). CDN raw кэширует до ~5 мин.
- **⚠ Перед выпуском v0.1.0** перевыпустить пакет PoE 1 из main (Run workflow, игра poe1): пакет `2026.10.27` старше
  main (`regex/maps.{en,ru}.json` изменены S46 30.10), а v0.1.0 подходит под его `minApp 0.1.0` и скачала бы старые
  regex-карты поверх новых встроенных.
- **Манифест:** `{version, game, minApp, files: {"en/stats.ndjson": {sha256, size}}}`; `minApp` — версия
  приложения, которая понимает пакет (старее — пакет пропускается).
- **Публикация — только CI:** `.github/workflows/data.yml` (Actions → «Data» → Run workflow с версией и игрой, или тег
  `data-<версия>` — PoE 1, `data-poe2-<версия>` — PoE 2). Из main или тега: проверка данных (`npm run verify:data` /
  `sync-ee2-data --verify`) → тесты → [PoE 2: снимок цен poe.ninja] → `tools/data/publish-data.mjs --game <игра>` →
  `tools/data/push-data-branch.mjs` → ждёт, пока публичный адрес отдаст новую версию. `GITHUB_TOKEN`, без секретов.
  Вручную тем же скриптом — `league-day.mjs --publish local` / `poe2-day.mjs --publish local` (если Actions недоступны).
- **Откат пакета:** перевыпустить прежние данные (workflow из коммита main со старыми `resources/data` и новой
  версией) — у игроков подменится обратно. У одного игрока — удалить `%APPDATA%/POETH/data/<poe1|poe2>`.
- **Проверка:** `node tools/data/check-data-channel.mjs [--exe=…] [--game poe2]` — настоящий канал + три сценария на
  локальном сервере (новее встроенного → применён и тост; неверный sha256 → откат; сети нет → тихо). Профиль проверки
  тихий: пустые хоткеи и команды чата, без привязки к окну игры, без заставки и окна компаньона.

### День лиги: `tools/data/league-day.mjs`

```
node tools/data/league-day.mjs --sha <коммит APT> --version 3.30.0-1 --patch 3.30 [--publish ci|local|none]
```
Шаги с остановкой на первой ошибке (продолжить: `--from <шаг>`, один шаг: `--only <шаг>`, план: `--dry-run`):
1. **apt** — `sync-apt-data --sha` (новые stats/items/client_strings EN+RU, индексы), пин `APT_PIN` ← полный SHA;
2. **verify** — sha256 файлов по `data.meta.json`;
3. **regex** — `build-regex-data --refresh --patch` (свежий RePoE fork → `regex/maps.{en,ru}.json`);
   данные «Билда» (`tools/build-data/build.mjs --refresh`) шагом пока не встроены — запускать вручную перед **tests**
   (пины версий — в `tools/build-data/sources.mjs`, они не «последние», а закреплённые);
4. **tests** — typecheck, vitest, test:trade;
5. **pack** — `publish-data --version` → `dist-data/`;
6. **publish** — `ci` (по умолчанию): данные закоммичены и коммит уже в origin/main → тег `data-<версия>` →
   workflow «Data»; `local` — сразу в ветку `data`; `none` — не публиковать.

Обычный порядок: `--publish none` в рабочей ветке → коммит «данные 3.30» → слить в main → `--from publish`.
После выпуска — `check-data-channel.mjs` на свежей сборке (канал = её данные) и Ctrl+D в игре на новых предметах.

- **Само приложение:** `electron-updater` + публичные GitHub Releases (без подписи — предупреждение SmartScreen
  остаётся, обновление работает), тег `v*` → release.yml.

## PoE 2: цены и день 1.0 (S67)

### Цены poe.ninja PoE 2 — в пакете данных

poe.ninja просит десктоп-приложения не звать их API с машин игроков — снимок делает CI, приложение читает его из пакета
данных PoE 2 (`resources/data/poe2/prices/`, надстройка `userData/data/poe2/prices/`).

- **Что в снимке:** обмен валюты (14 типов poe.ninja: валюта, фрагменты, кости, неогранённые камни и камни линии,
  эссенции, ядра душ, идолы, руны, знамения, Экспедиция, эмоции, катализаторы, Verisium) и уники (9 типов) для
  софткор-лиг из `/poe2/api/economy/leagues`. Цены — в divine, курсы exalted и chaos за divine. Без иконок, модов и
  flavour; лоты дороже 10⁶ divine (выставленные «для вида») — мимо. ~200 КБ на временную лигу.
- **Кто снимает:** `tools/data/ninja-snapshot-poe2.mjs` в workflow «Data» перед сборкой пакета PoE 2 (ETag прошлого
  снимка из ветки `data`, пауза 1,5 с, 23 запроса на лигу, UA `POETH-data/1 (+https://github.com/MAYZOSUPER/POETH; …)`).
  Свежесть = последний выпуск пакета PoE 2. Каждый день — переменная репозитория `POE2_DAILY_DATA = 1` (cron 04:41 UTC).
  Включать к 1.0 (цены первых дней лиги меняются быстро), но сначала убрать тост «Перезапустите POETH» для выпусков,
  где поменялись только `prices/` (читатели цен перезапуска не требуют) — иначе тост каждый день.
- **Формат и чтение:** `src/shared/poe2/prices` — `loadPoe2Prices(read, лига)` (HC → софткор-пара, 'auto'/частная →
  текущая временная лига), `Poe2PriceTable.byName('Liquid Paranoia' | 'LiquidParanoia' | 'liquid-paranoia')`, цена в
  divine/exalted/chaos, флаг «мало данных» (уник < 20 лотов, валюта — оборот < 0,25 шт.). Имена английские (refName EE2) —
  русское имя берите из данных EE2. Renderer: `poeth://data/poe2/prices/…` — после правки `DATA_SUBDIRS` в protocol.ts.
- **Нет снимка/битый** — `loadPoe2Prices` → `null`, функция работает без цен.

### День 1.0 (11.12.2026): `tools/data/poe2-day.mjs`

```
node tools/data/poe2-day.mjs --ee2 <коммит EE2> --version 2026.12.11-1 --patch 1.0 [--publish ci|local|none]
```
Шаги с остановкой на первой ошибке (продолжить: `--from <шаг>`, один шаг: `--only <шаг>`, план: `--dry-run`):
1. **ee2** — `sync-ee2-data --sha` (stats/items/client_strings EN+RU, индексы), пин `EE2_PIN` ← полный SHA;
2. **verify** — sha256 файлов по `resources/data/poe2/data.meta.json`;
3. **fixtures** — `make-poe2-ru-fixtures --check` (RU-фикстуры из новых данных EE2; отличаются — перегенерировать
   без `--check` и посмотреть дифф);
4. **repoe** — генераторы на RePoE PoE 2 и выгрузке дерева GGG, какие уже в main: regex путевых камней и табличек
   (S62, `--refresh --patch`), «Билд» и вложение (S66, `--refresh`; **до запуска** поднять `REPOE2_COMMIT` и
   `TREE2_COMMIT` в `tools/build-data/poe2/sources.mjs` на выгрузки 1.0);
5. **prices** — снимок poe.ninja PoE 2 (лиги 1.0 подхватятся сами; пока poe.ninja не завёл лигу 1.0 — останутся
   цены прошлых лиг, это нормально: CI переснимет при публикации);
6. **tests** — typecheck, vitest, test:trade;
7. **pack** — `publish-data --game poe2 --version` → `dist-data-poe2/`;
8. **publish** — `ci` (по умолчанию): данные закоммичены и в origin/main → тег `data-poe2-<версия>` → workflow «Data»
   (снимет свежие цены сам); `local` — сразу в ветку `data`; `none` — не публиковать.

Чек-лист 11.12:
- [ ] D−1…D0: релиз EE2 под 1.0 (обычно в день патча или через 1–2 дня) → коммит EE2 для `--ee2`; пока его нет —
      работает фолбэк `/api/trade2/data/stats` (www и ru) и встроенные данные.
- [ ] RePoE PoE 2 (`repoe-fork.github.io/poe2/`) и `grindinggear/poe2-skilltree-export` обновились под 1.0 → пины в
      `tools/build-data/poe2/sources.mjs` (и в генераторе regex S62, если он закреплён).
- [ ] `node tools/data/poe2-day.mjs --ee2 <sha> --version 2026.12.11-1 --patch 1.0 --publish none` в рабочей ветке →
      коммит «данные PoE 2 1.0» → слить в main → `--from publish`.
- [ ] После выпуска: `node tools/data/check-data-channel.mjs --game poe2` (настоящий канал = данные сборки), в игре —
      Ctrl+D на 5 предметах EN и RU, лига trade2 переключилась сама, цены «Слухов»/«Вложения» — новой лиги.
- [ ] Включить `POE2_DAILY_DATA = 1` на первые недели лиги (после правки тоста — см. выше).
