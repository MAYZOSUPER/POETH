# Фикстуры PoE1 (тексты предметов EN / RU)

Одинаковое имя файла в `en/` и `ru/` — **один и тот же предмет** (пара). Тесты (`tests/poe1/parser.test.ts`)
требуют, чтобы у пары совпали EN-имя (`refName`), stat `ref` и trade id; каждый файл — снапшот разбора.

| Префикс | Источник | Формат |
|---|---|---|
| `armour-`, `weapon-`, `jewellery-`, `unique-`, `gem-`, `map-`, `jewel-`, `timeless-`, `flask-`, `card-` | **реальные тексты** с трейда: анонимный поиск в лиге Standard (28.10.2026), `item.extended.text` одного и того же id с `www.pathofexile.com` (EN) и `ru.pathofexile.com` (RU). Скрипт — `tools/data/collect-fixtures.mjs` (10 поисков, 20 fetch) | обычный, **урезанный**: у собственных/крафтовых/расколотых модов нет суффиксов `(implicit)`/`(crafted)`/`(fractured)`, у чар — есть `(enchant)` |
| `adv-` | **ручные** примеры расширенного формата Ctrl+C (строки `{ Prefix Modifier "…" (Tier: N) — теги }`, роллы `+64(60-69)`), собраны по формату парсера APT; строки модов RU/EN взяты из данных APT. Имена аффиксов и теги в RU — условные | расширенный |
| `manual-currency-` | **ручные** тексты валюты (подсказки — приблизительные, парсер их не читает) | обычный |

Реальные захваты из игры (Ctrl+D) даст флаг `POETH_SAVE_CAPTURES` из S1 — ими стоит заменить/дополнить `adv-*`
и `manual-*`. Новую фикстуру: положить пару файлов, `npx vitest run tests/poe1 -u` и проверить снапшот глазами.

Особые случаи в реальных текстах: `timeless-02` — legacy-завоеватель (Venarius, данных в APT нет →
`timeless.recognized = false`), `flask-07`/`flask-10` — legacy-моды флаконов (нет в данных APT → «не распознан»),
`map-*` — «Natural inhabitants of this area have been removed» (нет в данных APT).
