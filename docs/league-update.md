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

## Чек-лист лида

**До старта (11–13.11):**
- [ ] Прочитать патчноуты 3.30: новые классы предметов, механика лиги, изменения трейда, Ctrl+C, чата/whisper.
- [ ] Канал данных жив: `node tools/data/check-data-channel.mjs --exe=dist-release/win-unpacked/POETH.exe`
      (после `npm run package:dir`) — 16/16, манифест отдаётся, пакет = встроенные данные.

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
- [ ] Timeless (S45), после данных «Билда»: новый коммит PoB с обновлёнными `src/Data/TimelessJewelData` → `POB_COMMIT` и
      SHA-256 в `tools/timeless/build.mjs`, `node tools/timeless/build.mjs --refresh`, `npx vitest run tests/timeless`;
      смотреть отчёт «нотаблы без исхода» и эталонные сиды (`tools/timeless/README.md`).
- [ ] Движок PoB (S44): релиз PoB под лигу (взять последний за 1–2 дня до выпуска POETH) → `tools/pob/pins.json` (`tag`,
      полный `commit`, `tree`), `node tools/pob/prepare.mjs --pin`, затем `node tools/pob/prepare.mjs` (нужен VS Build Tools)
      и `npx vitest run tests/pob/serverLua.test.ts`: selftest зелёный, RU = EN, «наш XML = исходный» ≥ 10. Упало —
      `pobSparse`/`pobKeep` в `prepare.mjs` или `STATS` ↔ `ENGINE_STATS`. release.yml соберёт и проверит движок сам.
- [ ] PoE 2 (S47): релиз Exiled Exchange 2 под патч → `node tools/data/sync-ee2-data.mjs --sha <коммит EE2>`, пин
      `EE2_PIN`, `node tools/data/make-poe2-ru-fixtures.mjs --check`, `npx vitest run tests/poe2 -u` — снапшоты глазами.
- [ ] Нужен код (не только данные) — релиз v0.1.1 (тег `v*`, release.yml).

**Неделя 1–2:** следить за issues APT/Sidekick и форумом GGG (изменения сайта трейда), хотфиксы. Мид-лиговые
патчи — повтор блока D+1…D+3.

## Канал обновлений данных (S12, работает)

Игроки получают новые данные **без переустановки**: POETH при запуске и раз в сутки (настройка «Проверять
обновления») читает манифест, качает только файлы, отличающиеся от встроенных, проверяет размер и sha256 и
атомарно подменяет надстройку `userData/data/poe1` (любая ошибка — откат, работают встроенные данные; сети
нет — тихо, только лог). Применили — тост «Данные обновлены (<версия>). Перезапустите POETH…».

- **Адрес:** `https://raw.githubusercontent.com/MAYZOSUPER/POETH/data/manifest.json` (links.DATA_MANIFEST_URL).
  Ветка `data` публичного репо — orphan, только `manifest.json`, `poe1/…`, README, `.gitattributes` (`* -text`).
  Первый выпуск — `2026.10.27` (= данные v0.1.0, игрокам качать нечего). CDN raw кэширует до ~5 мин.
- **Манифест:** `{version, game, minApp, files: {"en/stats.ndjson": {sha256, size}}}`; `minApp` — версия
  приложения, которая понимает пакет (старее — пакет пропускается).
- **Публикация — только CI:** `.github/workflows/data.yml` (Actions → «Data» → Run workflow с версией, или тег
  `data-<версия>`). Из main или тега: `npm run verify:data` → тесты → `tools/data/publish-data.mjs` →
  `tools/data/push-data-branch.mjs` → ждёт, пока публичный адрес отдаст новую версию. `GITHUB_TOKEN`, без секретов.
  Вручную тем же скриптом — `league-day.mjs --publish local` (если Actions недоступны).
- **Откат пакета:** перевыпустить прежние данные (workflow из коммита main со старыми `resources/data` и новой
  версией) — у игроков подменится обратно. У одного игрока — удалить `%APPDATA%/POETH/data/poe1`.
- **Проверка:** `node tools/data/check-data-channel.mjs [--exe=…]` — настоящий канал + три сценария на
  локальном сервере (новее встроенного → применён и тост; неверный sha256 → откат; сети нет → тихо).

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
