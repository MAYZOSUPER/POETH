# Фикстуры PoE2 (тексты предметов EN / RU)

Одинаковое имя файла в `en/` и `ru/` — **один и тот же предмет** (пара). Тесты (`tests/poe2/parser.test.ts`)
требуют, чтобы у пары совпали EN-имя (`refName`), stat `ref` и trade id; каждый файл — снапшот разбора
(`summarizeItem`). Сейчас 39 пар: 20 со строками `{ … }` (расширенный Ctrl+Alt+C), 19 без них (обычный Ctrl+C или предмет без модов).

## EN — тексты из открытых тестов (MIT)

| Префикс | Источник | Формат |
|---|---|---|
| `ee2-` | Exiled Exchange 2 (Kvan7/Exiled-Exchange-2, MIT) — `renderer/specs/Parser/items.ts` @ `cca30662bf31eaf38bd711e2ec1a6b899a06c40e`, тексты `TestItem` как есть | расширенный; у `ee2-helmet-normal`, `ee2-shield-normal`, `ee2-boots-unidentified`, `ee2-gem-*` строк `{ … }` нет (в них нет модов) |
| `sk-` | Sidekick (Sidekick-Poe/Sidekick, MIT) — `tests/Sidekick.Apis.Poe.Tests/Poe2English/Parser/*.cs` @ `4ee98cab1b1c4b00a3f361bad2609365251f1902`, строки `ParseItem(@"…")` (`""` → `"`) | в основном обычный Ctrl+C; `sk-jewel-unique-enchant`, `sk-tablet-*` — расширенный |

Соответствие `ee2-*` ↔ экспорт в `items.ts`: helmet-normal = NormalItem, mace-magic = MagicItem, bow-rare = RareItem,
focus-unique = UniqueItem, ring-implicit = RareWithImplicit, gem-uncut-skill = UncutSkillGem, gem-meta =
MetaSkillGem (мета-камень без строки «Item Class»), crossbow-runes = HighDamageRareItem, body-armour-runes =
ArmourHighValueRareItem, wand-skill = WandRareItem, shield-normal = NormalShield, belt-charm-slots = TwoImplicitItem,
waystone = RareMap, waystone-all-props = RareMapFakeAllProps (**синтетический** в EE2: все свойства путевого камня
сразу), bow-fractured = FracturedItem, boots-unidentified = RequiresOneAttribute, amulet-desecrated =
NewExplicitTypeDefinitions, crossbow-all-types = ItemAllTheModifierTypes, sceptre-spirit = SpectreIncSpirit,
ring-unidentified-tier = UnidentifiedTier, charm-quality = CharmQuality, bow-three-runes = BowThreeAugments.
`TwoLineOneImplicitItem` (Delirium Precursor Tablet) не взят: базы нет в данных EE2 — вместо него `sk-tablet-rare`.

Тексты Sidekick частью из ранних версий PoE2 — старый формат, его парсер тоже разбирает: «Requirements:» + «Level: N»
/ «Dex: N» по строкам (`sk-boots-unique-plain`, `sk-flask-life-plain`), «Waystone Tier: N» и «Monster Pack Size:»
у путевого камня (`sk-waystone-plain`), устаревшие формулировки модов («additional Attack Fire Damage», «increased
number of Magic Monsters») — их нет в данных EE2, они честно уходят в «не распознан».

## RU — машинные близнецы, НЕ захваты из игры

Реальных RU-текстов PoE2 под MIT не нашлось, поэтому RU-файлы сделаны скриптом
`node tools/data/make-poe2-ru-fixtures.mjs` (детерминированно, без сети; `--check` — сверка с диском,
`--verbose` — список непереведённых строк) **из данных EE2**:

- заголовки, свойства, строки `{ … }` — по ключам `resources/data/poe2/{en,ru}/client_strings.json`;
- имена баз, уников, камней, валюты — `items.ndjson` по `refName`;
- строки модов — EN-строка → стат (`ref`) → RU-матчер того же варианта (`value`/`negate`) с подстановкой чисел
  и диапазонов (`+57(41-60)`) как в EN;
- `Класс предмета:` — названия классов из LocalIdentity/poe2-data @ `6a49dbd72e745d338958525c4c570b4891719c72`
  (`data/itemclasses.json` ↔ `data/russian/itemclasses.json`, только названия); для неогранённых камней — свои
  (в этой версии poe2-data у них пустые названия).

Не переводятся (парсер этого не читает): имена аффиксов в `{ … "Name" … }`, слова аффиксов в именах волшебных
предметов («Crackling Храмовая дубина of the Brute»), случайные имена редких, описания, подсказки, флейвор, теги и
описания камней, строки свойств флаконов/оберегов кроме «Содержит зарядов: N», «Требуется: Any Martial Weapon»;
`(augmented)` / `(unmet)` / `(fire)` и суффиксы `(implicit)` / `(rune)` / `(enchant)` / `(desecrated)` оставлены
английскими (так в EE2 для всех языков).

**При проверке в игре заменить реальными захватами** (флаг `POETH_SAVE_CAPTURES`): особенно расширенный формат
и строки «Требуется:».

### Известные проблемы RU-разбора (по данным EE2, не проверено на клиенте)

- Формат строк — допущения по `client_strings` EE2: `{ Расколотое Префикс "…" (Уровень: 2) — … }`, «Требуется:
  Уровень 75, 67 (augmented) Сила, 67 (augmented) Инт», «Неопознано (Ранг 4)», «Корона божества высокого качества»,
  «Образцовое …» (род прилагательного в шаблоне EE2 один на все базы). Реальный клиент может писать иначе — тогда
  `requires`/тип мода не разберутся (разбор при этом не падает).
- RU-матчеры с обобщённым мн. числом («секунд(-ы)») оставлены как в данных; в игре будет согласованная форма —
  её ловит фолбэк `Poe2Data.statByMatchStr`.
- В RU `stats.ndjson` EE2 нет 4 локальных статов (`Leeches #% of Physical Damage as Life/Mana`, `#% chance to
  cause Bleeding on Hit`, `Grants # Rage on Hit`): в `ee2-bow-three-runes` и `ee2-crossbow-all-types` строка
  похищения осталась английской и в RU уходит в «не распознан» (тест пар это учитывает и проверяет, что пробел
  в данных ещё есть). Нет и вариантов «… in Map» (`sk-tablet-rare`: «повышение редкости найденных предметов»).
- У ~18 статов trade id в EN- и RU-данных EE2 различаются уже в данных (напр. `#% increased Experience gain`:
  в RU нет id варианта для карт; `#% increased Rarity of Items found`: дубль id) — в тесте пар trade id таких статов
  не сравниваются.
- «Осквернено » в RU `client_strings` с пробелом на конце; в фикстурах — без пробела, парсер понимает оба.

Новая фикстура: положить EN-файл, `node tools/data/make-poe2-ru-fixtures.mjs`, `npx vitest run tests/poe2 -u`
и проверить оба снапшота глазами.
