# Данные «умной оценки» timeless-самоцветов PoE1 (S45)

```bash
node tools/timeless/build.mjs              # кэш: .cache/timeless/ (+ .cache/build-data/src/ — переводы RePoE)
node tools/timeless/build.mjs --refresh    # скачать источники заново
```

Нужен уже собранный `resources/data/poe1/build/tree.json` (S36, `node tools/build-data/build.mjs`).

| Файл | Что |
|---|---|
| `timeless.json` | 21 гнездо (ноды в радиусе 1800, подпись — ближайший кейстоун/нотабл), нотаблы-строки, исходы самоцветов с текстами EN/RU, stat id и значениями игры, доля исхода по всем сидам, SHA-256 лукапов |
| `timeless-{lp,br,mf,eh,ht}.bin` | zlib: байт на (нотабл × сид) — номер исхода; 255 — нотабла нет в лукапе PoB (новее) |
| `timeless-LICENSE.txt` | уведомление MIT Path of Building Community — едет рядом с данными |

Схема и разбор — `src/shared/poe1/timeless/data.ts`, правила — `rules.ts`, расчёт — `evaluate.ts`, тесты —
`tests/timeless/`.

## Источники (закреплены в `build.mjs`)
- **Path of Building Community** (MIT, Copyright (c) 2016 David Gowor), коммит `POB_COMMIT`:
  `src/Data/TimelessJewelData/{LethalPride,BrutalRestraint,MilitantFaith,ElegantHubris,HeroicTragedy}.zip`,
  `NodeIndexMapping.lua`, `LegionPassives.lua`, `LICENSE.md` — каждый файл сверяется по SHA-256. Код PoB не берём:
  Lua-файлы — данные, их разбирает свой парсер литералов (`lua-table.mjs`), ничего не исполняется.
- **RePoE fork** (MIT) — переводы статов EN/RU (общие с `tools/build-data`, `REPOE_COMMIT`).
- **Таблицы клиента PoE1** (`repoe-fork/dat-export`, `DAT_COMMIT`) — `AlternatePassiveSkills/Additions` (значения статов,
  RU-имена заменённых нотаблов, однозначность исхода мелких нод), `Stats`.
- Glorious Vanity и Abyss-самоцветы (3.29) не собираются: лукапы PoB для них по 20–30 МБ, а свой генератор не
  повторяет ГСЧ игры (см. S45-handover). Калькулятор Vilsol (GPL) не используется — только как эталон чисел в тестах.

## Обновление под патч (3.30 — 13.11.2026)
1. Сначала дерево (`tools/build-data`, новый тег skilltree-export).
2. Новый коммит PoB с обновлёнными лукапами (`git log -- src/Data/TimelessJewelData` в PoB) → `POB_COMMIT` и SHA-256 в
   `SOURCES` (печатает ошибку с новым хэшем), новый `DAT_COMMIT` — общий с гидом прокачки.
3. `node tools/timeless/build.mjs --refresh`. Смотреть отчёт: «EN не совпал с PoB», «нет RU», «нотаблы без исхода в
   лукапе» (новые нотаблы дерева — пока PoB их не добавит, в окне «в радиусе N нотаблов без данных»).
4. `npx vitest run tests/timeless` — эталонные сиды (Vilsol) могут поменяться, если GGG переделает дерево или таблицы.
