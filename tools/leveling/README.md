# Данные прокачки PoE1 (S14, S31)

```bash
npm run build:leveling          # node tools/leveling/build.mjs (кэш: tools/leveling/sources/, .cache/leveling/)
npm run build:leveling -- --refresh   # скачать источники заново
node tools/leveling/game-names.mjs    # только имена из клиента — в готовый leveling.json
```

Выход: `resources/data/poe1/leveling/leveling.json` — наш производный набор: зоны (id как в
`Generating level N area "<id>"`), квесты кампании с очками пассивов и наградами-камнями по классам, камни,
стартовые камни классов, имена EN/RU и маршрут актов 1–10 (шаги с частями, подсказками, условиями варианта
и тегами «пассив / испытание / флакон / камень»).

| Что | Откуда |
|---|---|
| маршрут, зоны, квесты, камни | [exile-leveling](https://github.com/HeartofPhos/exile-leveling) (MIT), коммит `EL_COMMIT` в `build.mjs` |
| имена EN/RU зон, квестов, боссов, NPC, предметов квестов, надписей объектов и арен, лабиринтов, классов | таблицы клиента PoE1 (`WorldAreas`, `Quest`, `MonsterVarieties`, `NPCs`, `BaseItemTypes`, `Chests`, `ClientStrings`, `Labyrinths`, `Characters`, `Ascendancy`) — выгрузка [repoe-fork/dat-export](https://github.com/repoe-fork/dat-export), коммит `DAT_COMMIT` в `game-names.mjs` (игра 3.29.3.3) |
| RU-имена камней | данные APT в репо (`resources/data/poe1/ru/items.ndjson`, namespace GEM/ITEM) |
| очки пассивов за квест | вывод `/passives` настоящего клиента (таблица `PASSIVE_QUESTS`) |
| русский текст шагов и подсказок | наш перевод — `phrases.ru.mjs` (`PIECES`, `SUBS`) |
| имена-описания, которых в клиенте нет («лодку», «всех», «3× глиф») | наш перевод — `phrases.ru.mjs` (`NAMES`), список в `data.plain` |

## Язык имён (S31)
Гид пишет текст шага на языке интерфейса, а имена — на языке клиента игры (`Settings.gameLang`), как их видно в
игре: «Найдите и убейте Hillock», «Find and kill Хиллок». Поэтому имена берутся только из клиента, без падежей
(RU-строки клиента с `<if:gen>{…}<else>{…}` → именительный). Имена из `data.plain` — описания, их нет в игре: они
идут на языке интерфейса и могут стоять в падеже («Возьмите лодку»).

`game-names.mjs` ищет имя по виду фрагмента маршрута (`{kill|…}` — монстры, потом NPC; `{arena|…}` — надписи
арен `ArenaName*`, `*AreaName`, `UnholySubBossDomain*`, `MapStair*`; `{quest_text|…}` — предметы квестов и надписи
объектов `ObjectDisplayText*`…): точно, потом без «The»/регистра, потом с опечаткой в одну букву (The Bring King's
Throne → The Brine King's Throne). Имя маршрута, найденное не точно, заменяется на имя клиента. Отчёт в конце
перечисляет, что поменялось и чего в клиенте нет.

Варианты маршрута (`#ifdef LEAGUE_START`, `BANDIT_KILL`…) не раскрываются: у шага остаются условия, а зону
после шага приложение считает по выбранному варианту (`src/shared/leveling/route.ts`).

## Обновление под патч
1. Новый коммит exile-leveling → `EL_COMMIT`; новая выгрузка клиента → `DAT_COMMIT`; `--refresh`.
2. Генератор перечислит непереведённые куски, подсказки и имена-описания — дописать в `phrases.ru.mjs`.
3. `npm test` (tests/leveling проверяет число пассивов 24/23, испытания, переходы, имена на языке клиента).
