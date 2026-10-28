# Данные прокачки PoE1 (S14)

```bash
npm run build:leveling          # node tools/leveling/build.mjs (кэш в tools/leveling/sources/)
npm run build:leveling -- --refresh   # скачать источники заново
```

Выход: `resources/data/poe1/leveling/leveling.json` — наш производный набор: зоны (id как в
`Generating level N area "<id>"`), квесты кампании с очками пассивов и наградами-камнями по классам, камни,
стартовые камни классов, имена RU/EN и маршрут актов 1–10 (шаги с частями, подсказками, условиями варианта
и тегами «пассив / испытание / флакон / камень»).

| Что | Откуда |
|---|---|
| маршрут, зоны, квесты, камни | [exile-leveling](https://github.com/HeartofPhos/exile-leveling) (MIT), коммит `EL_COMMIT` в `build.mjs` |
| RU-имена зон, квестов, боссов, предметов квестов | poedb.tw/ru: страницы `Act_N`, для недостающих — страница сущности (`og:title`) |
| RU-имена камней и предметов | данные APT в репо (`resources/data/poe1/ru/items.ndjson`, namespace GEM/ITEM) |
| очки пассивов за квест | вывод `/passives` настоящего клиента (таблица `PASSIVE_QUESTS`) |
| русский текст шагов и подсказок, арены | наш перевод — `phrases.ru.mjs` (арены — сверить в игре) |

Варианты маршрута (`#ifdef LEAGUE_START`, `BANDIT_KILL`…) не раскрываются: у шага остаются условия, а зону
после шага приложение считает по выбранному варианту (`src/shared/leveling/route.ts`).

## Обновление под патч
1. Новый коммит exile-leveling → `EL_COMMIT`, `--refresh`.
2. Генератор перечислит непереведённые куски, подсказки и имена — дописать в `phrases.ru.mjs`.
3. `npm test` (tests/leveling проверяет число пассивов 24/23, испытания, переходы).
