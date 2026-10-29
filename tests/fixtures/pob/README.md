# Фикстуры: коды Path of Building

Настоящие коды PoB для тестов `tests/pob/**` (S35). Каждый файл — код в одну строку, как его отдаёт PoB
(base64url от zlib XML). Скачаны разово 29–30.10.2026 — по одному запросу на ссылку, с User-Agent
`POETH-fixtures/0.1 (+https://github.com/MAYZOSUPER/POETH)`; ссылки взяты из публичных тем форума GGG,
где авторы сами выложили свои билды.

Источники — только сервисы обмена кодами PoB (pobb.in, pob.codes, pastebin, poedb) и тесты самого PoB (MIT).
Контента сайтов-гайдов (Maxroll, Mobalytics, poe.ninja) здесь нет: их условия запрещают распространение.

Перед сохранением из XML вырезан `<Import>` (хэши аккаунта и персонажа, ссылка импорта) — заменён на `<Import/>`,
после чего XML снова сжат (zlib, уровень 9). Остальное — как у автора: заметки, предметы, деревья.
В сборку приложения не попадают (только тесты). Если автор билда против — удалим файл.

| Файл | Источник | Что проверяет |
|---|---|---|
| `pobbin-acts-level-gems` | https://pobb.in/tQTLxLsIoZ8O (тема 3293805) | 10 деревьев «Act N - Level M (… Points with Quests)» (M — уровень к концу акта); этапы камней — разделители внутри одного набора «----- Act N Leveling Gems -----» (1–4 и 9 акты), 3.22 |
| `pobbin-acts-all-axes` | https://pobb.in/mgRsfu9CcuUO (тема 3791676) | «Act 1»…«Act 10» во всех трёх осях: дерево, камни, предметы; 3.26 |
| `pobbin-leveling-endgame-variants` | https://pobb.in/_YmEjejyB97N (тема 3566895) | «Leveling (1-13) {1}»…«Leveling (67+, Mapping)», варианты эндгейма, набор предметов «Leveling {1,2,3,4,5}» на всю прокачку, Forbidden Flame, 73 джуэла, 3.26 |
| `pobbin-short-acts` | https://pobb.in/Bslv6eVwC5Uh (тема 3491996) | короткая запись «A1»…«A10», наборы «leveling» без чисел, «Recommended Leveling Tree…», «A3ArmBrandSwap», 3.21 |
| `pobbin-leveling-acts` | https://pobb.in/QkR1t0pc5Xz3 (тема 3814504; в заметках — гайд ShakCentral, тема 2661120) | 4 дерева «Acts 1-2» с цветокодами `^xFF6600`, заметки 3 КБ, старый `<Config>` без `ConfigSet`, 3.23 |
| `pastebin-acts-lv` | https://pastebin.com/dzfTT720 (тема 3228456) | 12 деревьев «Act 1 Lv 1-13»…«LV 77+», старый формат `<Skills>` без `SkillSet` с разделителями «---- ACT 1 ----», бандит Alira, 3.16 |
| `pobbin-leveling-ranges` | https://pobb.in/23FSkzYDd1Q1 (тема 3346098; та же паста — https://pastebin.com/iXWZWriH) | этапы «Leveling 1 - 12»…«Final Tree» во всех трёх осях, Watcher's Eye 17 КБ, заметки 10 КБ, 3.21 |
| `pobcodes-nightblade` | https://pob.codes/b/x3sJLNbGfr3 (тема 2284176) | код с pob.codes, 3.29 |
| `pobbin-two-variants` | https://pobb.in/0c_jYl-BLFV6 (тема 3685029) | два варианта билда с одинаковыми названиями во всех осях — не этапы |
| `pobbin-crit` | https://pobb.in/1dX2SJQBtPTK (тема 3533131) | 1 дерево «Crit», 2 набора камней, набор предметов без названия |
| `nostats-pobbin-crit` | `pobbin-crit` без `<PlayerStat>` | код без посчитанных статов (как у сайтов, собирающих код без PoB) |
| `pobbin-death-oath-328` | https://pobb.in/7wnwKj2Fc1lj (тема 3873624) | 3.28, бандит Alira, без названий наборов |
| `pobbin-three-trees` | https://pobb.in/Ywau8-8eeNCT (тема 3873624) | 3 дерева разных версий (3_26…3_28) без названий |
| `pobbin-huge` | https://pobb.in/-3-2bo8JyyVe (тема 3401133) | крупный билд: XML 0,5 МБ, 151 предмет, Forbidden Flame (~30 тыс. символов), джуэлы, активное дерево 3 |
| `pobbin-guardian` | https://pobb.in/epXc9G_aR0Sv (тема 3914889) | Guardian, 2 дерева |
| `poedb-deadeye` | https://poedb.tw/pob/eQVFNoqVZrza | poedb (заголовок ответа `Content-type: text/plain` внутри значения), заметки |
| `pob-spec-occvortex` | PoB, `spec/TestBuilds/3.13/OccVortex.xml` (MIT), закодирован нами | старый билд 3.13 |
| `poe2-pobbin-amazon` | https://pobb.in/cfGX8dxpObcW (тема 3985106) | PoE 2: корень `PathOfBuilding2`, `targetVersion 0_1` → «это билд PoE 2» |
| `poe2-pobbin-stormweaver` | https://pobb.in/c2oP9ShIWk2A (тема 3964088) | PoE 2 |
| `poe2-pobbin-pathfinder` | https://pobb.in/IM7N3sAmty33 (тема 3951132) | PoE 2, глубина XML 6 (`<WeaponSet1>`) |

Темы — `https://www.pathofexile.com/forum/view-thread/<номер>`.

**Mobalytics нет:** страницы билдов за проверкой Cloudflare с капчей, а условия сайта не дают распространять его
контент; в приложении для Mobalytics только подсказка «скопируйте код». Формат «этапы по актам» покрыт
`pobbin-acts-level-gems`, `pobbin-acts-all-axes` и `pobbin-short-acts`.
