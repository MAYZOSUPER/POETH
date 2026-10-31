# Фикстуры: билды PoB2 (PoE 2, S66)

Тесты `tests/build2/**` и `tests/pob/poe2.test.ts` берут:

| Фикстура | Откуда | Что проверяет |
|---|---|---|
| `poe2-pobbin-amazon` | `tests/fixtures/pob/` (S35): https://pobb.in/cfGX8dxpObcW, тема форума GGG 3985106 | Amazon (`Huntress1`), наборы оружия, выбор атрибутов, стандартная атака посоха, умения от предметов |
| `poe2-pobbin-stormweaver` | `tests/fixtures/pob/` (S35): https://pobb.in/c2oP9ShIWk2A, тема 3964088 | Stormweaver, мета-камень Cast on Critical, умение от дерева |
| `poe2-pobbin-pathfinder` | `tests/fixtures/pob/` (S35): https://pobb.in/IM7N3sAmty33, тема 3951132 | Pathfinder, 367 камней, глубина XML 6 |
| `leveling-amazon.txt` (здесь) | **сборная**: `make-leveling.mjs` из `poe2-pobbin-amazon` | этапы прокачки: деревья «Act 1» / «Act 3» / «Endgame», наборы камней и предметов «Act 1» / «Endgame» |

**Почему сборная:** публичного кода PoB2 с деревьями по актам в источниках фикстур (пасты из тем форума GGG) не
нашлось, а гайды Maxroll и Mobalytics брать нельзя (условия сайтов). Скрипт детерминированно режет ноды автора по
порядку взятия от стартовой ноды класса — получается настоящий по форме билд с этапами. Пересобрать:

```bash
node tests/fixtures/pob2/make-leveling.mjs
```

Снапшоты результата — `tests/build2/__snapshots__/*.build` (так файл увидит игра). В сборку приложения не попадают.
Если автор исходного билда против — удалим файл.
