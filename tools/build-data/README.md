# Данные вкладки «Билд» PoE1 (S36)

```bash
node tools/build-data/build.mjs              # дерево + анойнты + камни + сверка текстов журнала (кэш: .cache/build-data/src/)
node tools/build-data/build.mjs --refresh    # скачать источники заново
node tools/build-data/tree.mjs               # только дерево
node tools/build-data/anoints.mjs            # только рецепты анойнта (S54)
node tools/build-data/gems.mjs               # только камни (после npm run build:leveling — камни берут награды маршрута)
node tools/build-data/log-strings.mjs        # тексты журнала в src/shared/leveling/log.ts = таблицы клиента?
```

Выход — `resources/data/poe1/build/{tree,anoints,gems}.json`: минимальный JSON одной строкой (переводы строк git не
трогает, sha256 в канале данных совпадает с собранным). Схема — `src/shared/build/types.ts`, загрузчики и
сопоставления — `src/shared/build/data.ts`, тесты — `tests/build-data/`.

| Файл | Что | Откуда (закреплено в `sources.mjs`) |
|---|---|---|
| `tree.json` | ноды дерева: hash, строковый id (как в журнале), имя EN/RU, вид (обычная, нотабл, кейстоун, мастерство, гнездо самоцвета, стартовая класса и восхождения), восхождение, тексты статов EN/RU, stat id для расчёта защит, группа/орбита/место, соседи; эффекты мастерств; классы и восхождения в порядке PoB (`classId`, `ascendClassId`); родословные | [skilltree-export](https://github.com/grindinggear/skilltree-export) `3.29.1` (Data Export GGG) + [RePoE fork](https://repoe-fork.github.io) `3.29.3.3` (MIT) + таблицы клиента [dat-export](https://github.com/repoe-fork/dat-export) |
| `anoints.json` | рецепты анойнта (S54): hash ноты → три масла по тиру (масла повторяются, порядок не важен); масла по тиру (Prismatic 0, Clear 1 … Golden 13) — id выгрузки GGG, английское имя (цена у Фаустуса), tradeTag (имя на языке клиента и иконка — данные APT); ноты только для анойнта (`isBlighted`). Имена нот — в `tree.json` | skilltree-export (поле `recipe` нод) + таблица клиента `BlightCraftingItems` (тир и назначение масел; Tainted/Reflective не рецепты) |
| `gems.json` | камни по ключу PoB (`Metadata/Items/Gems/SkillGem` + variantId), имена EN/RU, цвет, поддержка/Vaal/трансфигурированный, требуемый уровень по уровням камня, id предмета и эффекта, где взять (награда квеста или продавец по классам, уровень квеста по маршруту) | RePoE fork `gems.json` + `Russian/gems_minimal.json`, таблицы клиента `GemEffects`/`GrantedEffects`, наш `leveling/leveling.json` (exile-leveling, MIT) |

## Как собирается
- **Ноды:** берём ноды RePoE (у них есть группа). Ноды skilltree-export без группы (keystone самоцветов,
  помазания) — не на дереве, отбрасываются. Рёбра — объединение `out`/`in`, одно ребро хранится у ноды с меньшим
  hash; переходы «стартовая нода класса ↔ старт восхождения» не храним.
- **Тексты статов:** EN — официальный текст skilltree-export (разметка `[Ключ|Текст]` снята). RU собираем сами по
  stat id и значениям (`translate.mjs`: сначала `stat_translations/passive_skill`, потом общий; скрытые записи
  пропускаем). Тот же способ даёт EN — он сверяется с официальным: строки, которые собрать не удалось (баффы аур:
  «Nearby Enemies have…», их статов в RePoE нет), печатаются и остаются без RU (~70 строк) — загрузчик покажет EN.
  «Grants N Passive Skill Point» — строки клиента `PassiveNodeGrantsPassivePoint(s)`.
- **Эффекты мастерств:** EN — skilltree-export, stat id и значения — таблица клиента `PassiveSkillMasteryEffects`.
- **Статы для расчёта:** только защиты и атрибуты (`CALC_STAT` в `tree.mjs`): жизнь, ES, мана, сопротивления,
  атрибуты, броня, уклонение, подавление, блок, скорость передвижения. Остальное — только текстом.
- **Камни:** ключ — как в PoB (проверено на всех 821 ключе `Data/Gems.lua`); он не всегда равен id предмета:
  Blade Flurry — `SkillGemBladeFlurry` при предмете `SkillGemChargedAttack`, а `SkillGemVulnerability` в PoB —
  Vulnerability, у игры — предмет Despair. Поэтому в данных два поиска: `findGem` (код PoB) и `gemByGameId`
  (leveling.json, APT). Камни PoE Royale не берём; невыпущенные — только если они есть в маршруте (Blade Trap).
  Трансфигурированные в кампании не выдают и не продают — «где взять» у базового камня.

## Обновление под патч (3.30 — 13.11.2026)
1. Новый тег skilltree-export → `TREE_TAG` и `TREE_COMMIT`; новая выгрузка RePoE → `REPOE_COMMIT`, `REPOE_VERSION`
   (коммит репо `repoe-fork/repoe-fork.github.io` с «Version 3.30…»); новая выгрузка клиента — `DAT_COMMIT` в
   `tools/leveling/game-names.mjs` (общий с гидом прокачки).
2. `npm run build:leveling -- --refresh` (если менялся маршрут), затем `node tools/build-data/build.mjs --refresh`.
   Смотреть отчёт: «EN собран не полностью», «нет RU-имени», «камень маршрута не найден», «тексты журнала
   изменились» (перенести в `BUILD_LOG_STRINGS`).
3. `npx vitest run tests/build-data` — известные ноды и камни могли поменяться (ноды меняют hash редко, но
   кейстоуны и нотаблы переделывают — поправить ожидания).
   **Анойнты:** `anoints.mjs` останавливается (файл не пишет), если масло рецепта не найдено в `BlightCraftingItems`
   (новое масло — поднять `DAT_COMMIT`), рецепт не из трёх масел или два рецепта совпали. Тест сверяет все рецепты
   и RU-имена нот с данными APT (`stats.ndjson`: «Allocates X») — после обновления данных APT под лигу оба источника
   должны совпасть; число рецептов (472 в 3.29) и известные пары в `tests/build-data/anoints.test.ts` поправить, если
   GGG их поменяли. Новое масло — ещё и в `exchange-ids.json` (цена у Фаустуса) и в данных APT (имя, иконка).
4. Файлы попадают в пакет данных сами (`publish-data.mjs` берёт всё из `resources/data/poe1`) — дальше как в
   `docs/league-update.md`.
