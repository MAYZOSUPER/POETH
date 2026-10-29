# Код Path of Building во вкладке «Билд» (S35)

> Ядро разбора без UI: `src/shared/pob/*`, загрузка по ссылке — `src/main/pob/*`, флаг вкладки —
> `src/shared/build/flag.ts`. Тесты — `tests/pob/**`, фикстуры — `tests/fixtures/pob/` (20 настоящих кодов,
> источники в README). Исследование — раздел 1 и 11 заметки лида `build-tab-research.md`.

## 1. Поток

```
текст игрока ─ parsePobInput (links.ts) ─┬─ код ─────────────────────────────┐
                                          ├─ ссылка pobb.in/… ─ fetchPobCode ─┤ (main, сеть по клику)
                                          ├─ планнер Maxroll / Mobalytics / poe.ninja → «скопируйте код»
                                          ├─ ссылка на билд PoE 2 → «это билд PoE 2» (без сети)
                                          └─ чужой сайт → «сайт не из списка»
                                                                              ▼
            decodePobCode (decode.ts): base64url → zlib с пределом → XML (строка)
                                                                              ▼
            parsePobXml (model.ts → xml.ts): безопасный разбор → PobBuild | «PoE 2» | «не PoB» | «слишком большой»
                                                                              ▼
            resolveStages (stages.ts): этапы прокачки + правки игрока → currentStage(уровень, акт)
```

Всё это делает `importPob(text)` в main (`src/main/pob/import.ts`); renderer получает готовую модель — только
строки и числа, показывает их как текст (никакого `innerHTML`).

## 2. Формат

- **Код** = `base64url(zlib(XML))`: PoB пишет `base64.encode(Deflate(xml)):gsub("+","-"):gsub("/","_")`
  (`ImportTab.lua`). Обёртка zlib, код начинается с `eN`. Принимаем и стандартный base64 (`+/`, `=`), и код,
  разбитый переносами строк (из чата).
- **XML**: корень `<PathOfBuilding>` (PoE 1) или `<PathOfBuilding2>` (PoE 2). Глубина у PoB1 — 5, у PoB2 — 6.

| Раздел | Берём в `PobBuild` | Не берём |
|---|---|---|
| `<Build>` | `level`, `className`, `ascendClassName` (`None` → null), `bandit` (`None`/`Oak`/`Kraityn`/`Alira`), `pantheonMajorGod/MinorGod` (или из `<Config>`), `mainSocketGroup`, `targetVersion`; `<PlayerStat stat value>` → `stats` (имена `[A-Za-z0-9:]`, например `Life`, `FireResist`, `Spec:LifeInc`) | `MinionStat`, `FullDPSSkill`, `TimelessData`, `viewMode` |
| `<Tree activeSpec>` → `<Spec>` | `title` (без цветокодов), `treeVersion`, `classId`, `ascendClassId`, `secondaryAscendClassId`, `nodes` (hash, без повторов), `masteryEffects` `{нода,эффект}`, `<Sockets><Socket nodeId itemId>` (джуэлы) | `<URL>`, `<Overrides>` (тату), `<WeaponSet*>` (PoE 2) |
| `<Skills activeSkillSet>` → `<SkillSet id title>` → `<Skill>` → `<Gem>` | группы: `slot`, `label`, `enabled`, `includeInFullDPS`, `mainActiveSkill`, `source`; камни: `nameSpec`, `gemId` (`Metadata/Items/Gems/…` — ключ `gems` в `leveling.json`), `skillId`, `variantId`, `level`, `quality`, `enabled`, `count`. Старый формат без `<SkillSet>` — один набор | `qualityId`, `enableGlobal*`, `skillPart`, `skillMinion` |
| `<Items activeItemSet>` → `<Item id>` + `<ItemSet id title>` → `<Slot name itemId>` | текст предмета как есть (с `{range:…}`, `Prefix:` — разбирать будет парсер Ctrl+D); слоты `POB_SLOTS`: Weapon 1/2 (+ Swap), Helmet, Body Armour, Gloves, Boots, Amulet, Ring 1–3, Belt, Graft 1–2, Flask 1–5; прочее (абисс-гнёзда) — `otherSlots`. Старый формат без `<ItemSet>` — один набор | `<ModRange>`, `<SocketIdURL>`, `itemPbURL`, `<TradeSearchWeights>` |
| `<Config activeConfigSet>` → `<ConfigSet>` → `<Input>` (или `<Input>` прямо в `<Config>`) | `resistancePenalty`: `0` / `−30` / нет = `−60`; `enemyIsBoss`; число опций (`inputs`) — повод подписать «конфигурация автора» | `<Placeholder>`, `<CustomModifierBlock>` |
| `<Notes>` | текст без цветокодов `^0…^9` и `^xRRGGBB`, ≤ 64 КБ (длиннее — обрезается) | — |
| `<Import>`, `<Calcs>`, `<TreeView>`, `<Party>` | — | **не берём**: в `<Import>` хэши аккаунта и персонажа и ссылка импорта |

**PoE 2** узнаётся по корню `PathOfBuilding2`, `targetVersion 0_x` или `treeVersion 0_x` → ошибка `poe2`
(«это билд PoE 2»). Ссылки `maxroll.gg/poe2/…`, `poe2db.tw/…`, `poe.ninja/poe2/…`, `mobalytics.gg/poe-2/…`
узнаются ещё до сети.

**`PlayerStat`** — снимок одного этапа (активные Spec/ItemSet/навык и конфигурация автора на момент сохранения
в PoB). Код, собранный сайтом без PoB, статов не содержит — `stats = {}` (фикстура `nostats-pobbin-crit`).

## 3. Пределы (безопасность ввода)

| Что | Предел | Почему |
|---|---|---|
| вставленный текст / ответ сайта | ≤ 1 МБ (`POB_CODE_MAX_CHARS`) | обычный код 5–70 КБ |
| XML после распаковки | ≤ 16 МБ (`POB_XML_MAX_BYTES`), zlib обрывает распаковку сам (`maxOutputLength`) | zip-бомба; крупнейший реальный — 0,5 МБ |
| глубина XML | ≤ 8 | PoB1 — 5, PoB2 — 6 |
| элементов | ≤ 50 000 | крупнейший реальный — 3,5 тыс. |
| атрибут | ≤ 64 КБ | `nodes` < 1 тыс. символов |
| собственный текст элемента | ≤ 1 МБ (XML), предмет ≤ 64 КБ (длиннее — пропускается), заметки ≤ 64 КБ (обрезаются) | **отличие от исследования** (там «предмет ≤ 16 КБ»): уник Forbidden Flame со всеми вариантами — 31 КБ, Watcher's Eye — 17 КБ, предел 16 КБ ломал реальные билды |
| имя элемента/атрибута, атрибутов у элемента | ≤ 64, ≤ 64 | |
| строки модели (названия, подписи, имена камней) | ≤ 200 символов, без управляющих | |
| нод в одном Spec | ≤ 4000 | в дереве PoE 1 ~3,4 тыс. нод |

**XML — свой парсер (`xml.ts`, ~200 строк), не `fast-xml-parser`.** Причины:
- `<!DOCTYPE`, `<!ENTITY`, `<!ELEMENT`, `<!ATTLIST`, `<!NOTATION` отвергаются до разбора (PoB их не пишет) —
  XXE и «billion laughs» невозможны в принципе, а не «выключены опцией»;
- раскрываются только `&lt; &gt; &amp; &quot; &apos;` и числовые ссылки на допустимые символы; любое другое
  `&…;` остаётся текстом;
- все пределы выше — в самом парсере; у `fast-xml-parser` (v4) пределов глубины и числа элементов нет, и у него
  были CVE (prototype pollution CVE-2023-26920, ReDoS CVE-2023-34104 и CVE-2024-41818); у нас атрибуты — в `Map`,
  имя `__proto__` безвредно;
- линейный разбор без рекурсии: 100 000 вложенных тегов — ошибка `too-deep`, а не переполнение стека;
- ноль новых зависимостей (цепочка поставок), лиду не нужно ставить пакет.

Разбор — только в main (`importPob`), не в renderer.

## 4. Ссылки

| Сайт | Ссылка игрока | Сырой код | Вердикт |
|---|---|---|---|
| pobb.in | `pobb.in/<id>`, `pobb.in/u/<user>/<id>`, `pobb.in/pob/<id>` | `https://pobb.in/<id>/raw` | качаем (публичный API, просят UA с контактом) |
| pastebin | `pastebin.com/<id>`, `/raw/<id>` | `https://pastebin.com/raw/<id>` | разово по клику |
| pob.codes | `pob.codes/b/<id>`, `api.pob.codes/<id>/raw` | `https://api.pob.codes/<id>/raw` | разово |
| poedb | `poedb.tw/pob/<id>`, `poedb.tw/<lang>/pob/<id>` | `https://poedb.tw/pob/<id>/raw` | разово (отвечает заголовком `Content-type: text/plain` внутри значения — принимаем) |
| Maxroll PoB-паста | `maxroll.gg/poe/pob/<id>` | `https://maxroll.gg/poe/api/pob/<id>` | разово по клику |
| rentry | `rentry.co/<id>` (+ `rentry.org`) | `https://rentry.co/paste/<id>/raw` | разово |
| Maxroll планнер и гайды | `maxroll.gg/poe/planner/…`, `/poe/build-guides/…` | — | **не тянем** → `copy-code: maxroll-planner` («ссылка PoB есть в гайде») |
| Mobalytics | `mobalytics.gg/…` | — | **не тянем** → `copy-code: mobalytics` (кнопка «Copy Code» на странице билда) |
| poe.ninja | `poe.ninja/…` | — | **не тянем** (API билдов закрыт для третьих лиц) → `copy-code: poeninja` |

Загрузка (`src/main/pob/fetch.ts`):
- только `https` и хосты `POB_FETCH_HOSTS` = `pobb.in`, `pastebin.com`, `api.pob.codes`, `poedb.tw`, `maxroll.gg`,
  `rentry.co`; без логина в адресе и нестандартного порта;
- анонимная сессия `poeth-anon` (в памяти, без cookies, как иконки и данные): `credentials: 'omit'`,
  `cache: 'no-store'`, `referrerPolicy: 'no-referrer'`;
- редиректы вручную, только внутри allowlist и только https, не больше 3; иначе запрос обрывается;
- таймаут 10 с на всё; ответ ≤ 1 МБ (по `Content-Length` и по потоку); только `200` и `text/plain`;
- `User-Agent: POETH/<версия> (+https://github.com/MAYZOSUPER/POETH)`;
- один запрос на одно действие игрока: пока идёт загрузка, вторая сразу получает `busy`; повторов нет;
- в лог — только хост и код ошибки, без адреса пасты.

## 5. Этапы прокачки (`stages.ts`)

Этап — тройка Spec + набор камней + набор предметов. Бывает и так, что этапы — группы-разделители без камней
внутри одного набора («----- Act 1 Leveling Gems -----», «---- ACT 2 ----», «Level 1-8»): такой набор режется на
разделы (`skillSections`), если узнанных разделителей ≥ 2.

- `guessStage(title)`: «Act N», «Acts 1-2», «Acts 1&2», «A3», «Акт N», «Level N-M», «Leveling (1-13)», «Lvl N»,
  «Уровень N», «N-M», «65+», «38 - …», «Early Maps», «Ранние карты», «Maps», «Endgame», «Min Max», «Final», «$$$»,
  «Эндгейм»; «Swap» — флаг. Один уровень рядом с актом («Act 2 - Level 22», «Lvl 13 (Act 1)») — уровень к концу
  акта, а не начало. «Pre-Maps» и «Leveling» / «Прокачка» без чисел — набор на всю кампанию (`campaign`): годится
  любому этапу прокачки, но текущим этапом не выбирается, если есть этапы по актам и уровням. Неузнанное
  («Crit», «AG/zealotry», «Leveling 1» как номер этапа читается уровнем 1 — правка руками) — `unknown`.
- С какого уровня: уровни из названия, иначе начало акта по таблице конца актов Piety
  (`13, 23, 33, 40, 45, 50, 54, 60, 64, 69`), ранние карты — 70, эндгейм — 90.
- **Прокачка** — акты, уровни до 70 и ранние карты. Эндгейм и неузнанное — нет («эндгейм — не прокачка»).
- Основная ось — та, где больше узнанных названий (дерево > камни > предметы при равенстве). Для двух других осей:
  то же название → для этапа эндгейма — эндгейм-набор или активный набор автора, если он не из прокачки → набор,
  действующий на начало этапа (акт сравнивается с актом, уровень с уровнем) → тот же вид → активный набор.
- Ничего не узнано — `primary: 'none'`: по этапу на дерево, всё не прокачка; `currentStage` → `null`.
- **Текущий этап** (`currentStage`): выбранный игроком; иначе последний пройденный этап прокачки по акту из
  Client.txt (если у этапа акт в названии) или по уровню. После кампании — ранние карты, иначе последний этап
  прокачки («Leveling (67+, Mapping)»), иначе первый этап эндгейма.
- **Ручная правка** (`PobStageEdits`, хранит UI рядом с билдом): `current` — ключ выбранного этапа; `stages[key]` —
  `spec` / `skills {set, section}` / `items` / `leveling` / `from`. У этапа видны `auto` (что выбрал автомат) и
  `edited` (что поправил игрок). Правки с диска проверяются: индексы вне диапазона и мусор отбрасываются.

## 6. Ошибки для UI

| `PobImportResult.error` | Что показать |
|---|---|
| `empty` | — (кнопка неактивна) |
| `not-pob` | «Это не код PoB» |
| `too-large` | «Слишком большой код» |
| `poe2` | «Это билд PoE 2 — вкладка пока только для PoE 1» |
| `copy-code` + `copySite` | «Скопируйте код PoB»: `maxroll-planner` — ссылка PoB в гайде; `mobalytics` — кнопка Copy Code; `poeninja` — экспорт в PoB на странице персонажа |
| `unknown-link` + `host` | «Сайт <host> не из списка» + список поддерживаемых |
| `fetch` + `fetchError` | `not-found` — «паста удалена»; `blocked` / `rate-limited` — «сайт не пустил, попробуйте позже или вставьте код»; `timeout` / `network` — «нет связи»; `not-text` — «по ссылке не код»; `busy` — загрузка уже идёт |

## 7. Подключение (для лида)

- **IPC** (агрегаторы заморожены): домен `build`, канал `build: { importPob: 'build:importPob' }` —
  `invoke(text: string) → PobImportResult`. Обработчик в `src/main/ipc/build.ts`: проверка отправителя S29
  (страница компаньона `index`; сеть по ссылке — только по кнопке игрока), `typeof text === 'string'`,
  длина ≤ `POB_CODE_MAX_CHARS + 4096`, затем `importPob(text)`. Правки этапов — локально в renderer
  (`resolveStages(build, edits)` чистая) или отдельным каналом сохранения, когда будет UI (B3).
- **Флаг**: `buildOn(def, buildDevFlag(process.env))`, переменная `POETH_BUILD=1`; в `GameFeatures` нужно поле
  `build: false` (`src/shared/games.ts`, заморожен) — `buildOn` уже его читает.
- **openExternal** для «Открыть источник» (`PobImportResult.source.pageUrl`) — хосты из таблицы 4 в allowlist
  `src/shared/links.ts` (заморожен), если понадобится.
