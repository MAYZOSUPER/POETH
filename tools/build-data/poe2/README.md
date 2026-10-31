# Данные «Билда» PoE 2 (S66)

```bash
node tools/build-data/poe2/build.mjs              # дерево + камни + вложение (кэш: .cache/build-data/poe2/)
node tools/build-data/poe2/build.mjs --refresh    # скачать источники заново
node tools/build-data/poe2/tree.mjs               # только дерево
node tools/build-data/poe2/gems.mjs               # только камни
node tools/build-data/poe2/instill.mjs            # только вложение
```

Выход — `resources/data/poe2/build/{tree,gems,instill}.json`: минимальный JSON одной строкой. Схемы и загрузчики —
`src/shared/poe2/build/data.ts` (дерево, камни) и `src/shared/poe2/build/instill.ts` (вложение), тесты —
`tests/build2/`. Генераторы и данные отдельно от кода: к 1.0 (11.12.2026) пересобрать одной командой.

| Файл | Что | Откуда (закреплено в `sources.mjs`) |
|---|---|---|
| `tree.json` | ноды: hash (как в коде PoB2) → строковый id из таблицы PassiveSkills (как в игровом `.build`: `melee17`), имя EN заметных нод и RU из данных EE2 (нотаблы — «Активирует X» стата «Allocates #», кейстоуны — статы `keystone_*`; у ~130 нотаблов, которых нельзя вложить, RU в открытых данных нет — окно пишет EN с пометкой), флаги (нотабл, кейстоун, гнездо, старт класса и восхождения, атрибут, выбор), восхождение, соседи; классы (индекс = classId PoB2) и восхождения (`Huntress1`, имя EN, RU — из `resources/data/ascendancy.json`); стартовые ноды классов; уровни актов и интерлюдий, уровень первых карт | [poe2-skilltree-export](https://github.com/grindinggear/poe2-skilltree-export) `0.5.5` (Data Export GGG) + RePoE PoE 2 `world_areas` ([repoe-fork/poe2](https://github.com/repoe-fork/poe2) `0.5.5.5`) |
| `gems.json` | камни по id предмета BaseItemTypes (`Metadata/Items/Gems/SkillGemEarthquake` — как `gemId` PoB2 и `skills[].id` в `.build`): имя EN, RU, вид (умение, поддержка, мета) | RePoE PoE 2 `base_items` + имена RU данных EE2 (`resources/data/poe2/ru/items.ndjson`) |
| `instill.json` | вложение: 13 эмоций по силе (id рецепта GGG, id предмета, имя EN/RU, tradeTag), рецепты нотаблов (**порядок эмоций значим**), имена нотаблов EN/RU и тексты статов EN | поле `recipe` выгрузки дерева GGG + RePoE `base_items` (эмоции) + EE2 (`items.ndjson` — эмоции, `stats.ndjson` — «Allocates #» / «Активирует #» с hash ноты) |

## Как собирается
- **Ноды без строкового id** (240 в 0.5.5 — неактивные восхождения в выгрузке) в файл не попадают: в `.build` их не
  записать.
- **Акты:** конец акта N — самая высокая область `G<N>_*` (корабль `G4_ship` уровня 1 — служебный), начало —
  следующий уровень после конца прошлого акта; интерлюдии — области `P1_*`…`P3_*`; первые карты — 65 (T1 путевого
  камня, патчноут 0.5.0).
- **Камни:** выпущенные (`release_state: released`) камни умений, поддержки и мета; без стандартных атак оружия
  (`PlayerDefault…`), камней уников и восхождений, шаблонов (`Spectre: {0}`) и невыпущенных (`[DNT] …`).
  У ~170 камней нет RU-имени в данных EE2 — покажем EN.
- **Вложение:** id эмоции в рецепте = имя без пробелов («LiquidParanoia» = «Liquid Paranoia»), «древние» эмоции
  (TimeLost) в рецептах не встречаются. Индексы эмоций совпадают с полем `oils` у EE2 — тест сверяет все рецепты.

## Обновление под 1.0 (11.12.2026)
1. Новый коммит `grindinggear/poe2-skilltree-export` → `TREE2_COMMIT`, `TREE2_VERSION`; новый «Version …» в
   `repoe-fork/poe2` → `REPOE2_COMMIT`, `REPOE2_VERSION`; данные EE2 — `tools/data/sync-ee2-data.mjs` (S47).
2. `node tools/build-data/poe2/build.mjs --refresh`. Смотреть отчёт: «нет RU-имени», «одинаковые наборы эмоций»
   (генератор останавливается), новые акты (5–6) должны появиться в строке «акты …».
3. `npx vitest run tests/build2 tests/pob` — известные id, уровни актов и снапшоты `.build` поменяются: проверить
   глазами и обновить (`npx vitest run tests/build2 -u`).
4. **Формат `.build`** («Version 1 (Experimental)») может поменяться к 1.0 — генератор файла один:
   `src/shared/poe2/build/gameBuild.ts` (`GAME_BUILD_VERSION`, `toGameBuild`).
