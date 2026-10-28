# Трейд-API Path of Exile 1 — справка для POETH

> Факты собраны из утверждённого плана ([PLAN-POETH.md](PLAN-POETH.md)), исходников Awakened PoE Trade (MIT)
> и опыта компаса с trade2 ([plan-companion.md](plan-companion.md)). Пункты с ⚠ — **проверить на живом API**
> в S3/S4 и поправить этот файл. URL'ы строит `src/shared/games.ts` (`siteUrl/apiUrl/liveUrl`) — руками не склеивать.

## Хосты и сегменты

| | PoE 1 | PoE 2 (компас) |
|---|---|---|
| Хост | `www.pathofexile.com` или `ru.pathofexile.com` (настройка `siteHost`; cookies привязаны к хосту) | `www.pathofexile.com` |
| API | `https://<host>/api/trade/<endpoint>` | `https://<host>/api/trade2/<endpoint>` — **без realm** |
| Сайт (поиск) | `https://<host>/trade/search/<league>/<id>` | `https://<host>/trade2/search/poe2/<league>/<id>` |
| Сайт (обмен) | `https://<host>/trade/exchange/<league>/<id>` | `https://<host>/trade2/exchange/poe2/<league>/<id>` |
| Live | `wss://<host>/api/trade/live/<league>/<id>` | ⚠ не используем в v0.1 |

Лига и id — через `encodeURIComponent`. Все запросы — только из **main** (`net.request` через сетевой стек
Chromium: проходит Cloudflare, нет CORS, можно ставить `Cookie`/`User-Agent`). Не ставить `Origin/Referer/sec-*`
в обычных запросах (это выглядит как браузер). ⚠ Для WebSocket live сервер может требовать `Origin` сайта.

## Эндпоинты

| Назначение | Метод | Путь (после `/api/trade/`) | Ответ |
|---|---|---|---|
| Лиги | GET | `data/leagues` | `{result:[{id, realm, text}]}` |
| Статы (RU-тексты на ru-хосте) | GET | `data/stats` | `{result:[{label, entries:[{id, text, type}]}]}` — фолбэк для неизвестных модов 3.30 |
| Статика (валюта, фрагменты…) | GET | `data/static` | `{result:[{id, label, entries:[{id, text, image}]}]}` |
| Предметы (базы/уники) | GET | `data/items` | `{result:[{label, entries:[{name?, type, text, flags?}]}]}` |
| Поиск | POST | `search/<league>` | `{id, result:[hash…], total, complexity?, inexact?}` |
| Листинги | GET | `fetch/<до 10 hash через запятую>?query=<searchId>` | `{result:[{id, listing, item} \| null]}` |
| Bulk-обмен | POST | `exchange/<league>` | см. ниже |

### Тело поиска (`search`)
```jsonc
{
  "query": {
    "status": { "option": "online" },          // см. «Статусы»
    "name": "…", "type": "…",                  // английские refName (даже для RU-клиента)
    "stats": [{ "type": "and", "filters": [{ "id": "explicit.stat_…", "value": { "min": 10 }, "disabled": false }] }],
    "filters": {
      "type_filters":   { "filters": { "category": { "option": "…" }, "rarity": { "option": "nonunique" } } },
      "misc_filters":   { "filters": { "ilvl": { "min": 84 }, "corrupted": { "option": "false" } } },
      "socket_filters": { "filters": { "links": { "min": 6 } } },
      "trade_filters":  { "filters": { "price": { "option": "chaos", "max": 100 } } }
    }
  },
  "sort": { "price": "asc" }
}
```
Группы статов: `and`, `count` (`{"type":"count","value":{"min":1},"filters":[…]}` — так ищутся timeless-джуэлы
по сиду), `weight`, `not`, `if`. Псевдо-статы — id `pseudo.pseudo_…`. Точные id и формат фильтров берём из
порта APT (`trade/pathofexile-trade.ts`) — S4.

### Ответ `fetch`
`listing`: `indexed` (ISO-время), `account {name, online?, lastCharacterName}`, `price {type:'~price'|'~b/o',
amount, currency}` (цена опциональна — листинги без цены пропускать), `stash {name, x, y}`, `whisper` (только у
in-person листингов). У лота торговца (`available`/`securable`) — `listing.fee` (комиссия в золоте), `method`, без
`whisper`. `item` — полный предмет; `item.extended.text` — **base64** текста предмета с `
` (проверено в S6;
разбирается парсером S2).

### Bulk-обмен (`exchange`) — валюта, фрагменты, карты, карточки
```jsonc
{ "query": { "status": { "option": "online" }, "have": ["chaos"], "want": ["divine"], "minimum": 1 },
  "sort": { "have": "asc" }, "engine": "new" }
```
Ответ с `engine:"new"` — `{id, total, result: {<id>: {listing: {account, whisper?, offers: [{exchange:
{currency, amount}, item: {currency, amount, stock}}]}}}}` — отдельный `fetch` не нужен (⚠ сверить с портом APT).
Курс = `exchange.amount / item.amount`, глубина — `item.stock`. С 3.29 почти вся валюта торгуется через
Currency Exchange (Фаустус), поэтому bulk для валюты почти пуст — нужен для карт, карточек и т.п.

## Статусы (`query.status.option`)

| Значение | Смысл | Как покупать |
|---|---|---|
| `online` | продавец в игре (классический трейд) | whisper → обмен лично |
| `available` | ⚠ «доступно сейчас»: онлайн-продавцы + мерчант-листинги (уточнить точный состав) | по типу листинга |
| `securable` | только **мерчант-листинги** (асинхронный трейд: предмет во вкладке торговца) | купить на сайте (в трейд-окне), **без whisper**, комиссия в **золоте** |
| `any` | всё, включая офлайн | — |

Мерчант-листинги не имеют `whisper` — в UI вместо кнопки whisper показываем комиссию в золоте и
«купить в трейд-окне» (открыть поиск в `siteView`). ⚠ Поле комиссии в ответе `fetch` — найти в S4.

## Лимиты (rate limit)

Заголовки ответа: `x-rate-limit-policy`, `x-rate-limit-rules` (напр. `Ip` или `Account,Ip`),
`x-rate-limit-<rule>` = список `hits:period:restriction`, `x-rate-limit-<rule>-state` = `current:period:restricted`,
`retry-after` (сек, при 429). Лимитер держит **все окна** правила и ресинкается по заголовкам каждого ответа;
`retry-after` → `blockedUntil` для политики.

Стартовые значения (проверенные, из плана; формат `hits:period_s:restriction_s`):

| Политика | Окна |
|---|---|
| search | `5:10:60, 15:60:300, 30:300:1800, 600:21600:3600` |
| fetch | `12:4:10, 16:12:300, 50:300:300, 1000:21600:1800` |
| exchange | `5:15:60, 10:90:300, 30:300:1800` |
| live-fetch | свой лимитер с окнами `fetch`; если сервер отвечает тем же `x-rate-limit-policy`, что и `fetch`, лимитеры сливаются (общий бюджет) |
| data | `data/leagues`, `data/stats`… — без заголовков лимитов (ответ из кэша Cloudflare), свой потолок `10:60:60` |

Правила POETH: интерактивный запрос (Ctrl+D) вперёд очереди; ждать > 1.5 с — сразу ошибка с обратным отсчётом;
фоновые (live) — только если остаётся ≥ 25 % окна; кэш 5 мин по хэшу запроса. Реализация — `src/main/net/`
(`rateLimit.ts`, `tradeGateway.ts`; вход для этапов — `src/main/net/index.ts`: `tradeRequest({kind, priority, req})`).

**Проверено на живом API (S3, 28.10.2026, анонимно, через шлюз):** `POST search/Standard` → 200,
`x-rate-limit-policy: trade-search-request-limit`, правило `Ip`, окна совпадают со стартовыми; `GET fetch/<10 id>?query=`
→ 200, `trade-fetch-request-limit`, окна совпадают. `GET data/leagues` → 200 из кэша Cloudflare
(`cache-control: public, max-age=120`), **без** заголовков лимитов. exchange — ещё не вызывался (S4).

## Live search (WebSocket)

- `wss://<host>/api/trade/live/<league>/<searchId>` с cookie `POESESSID` из сессии аккаунта (только main).
- Сообщения: ⚠ `{"auth": true}` после подключения; `{"new": ["hash", …]}` — новые листинги → батч 300 мс →
  `fetch` (до 10 за запрос) → разбор `item.extended.text` → тост + звук в оверлее, Windows-уведомление, если игра
  не в фокусе.
- Поведение клиента: до 10 поисков (настройка до 20), подключения с шагом 2.5 с, реконнект 3 с + jitter,
  **429** → бэкофф 30 с … 10 мин, **401** → ждём входа, **404** → поиск недействителен.
- Транспорт — за интерфейсом; фолбэк — скрытое окно на сайте, если Cloudflare не пустит `ws`.

**Проверено (S6, 28.10.2026, без входа):** рукопожатие `ws` из Node TLS (Electron main) с `Origin: https://<host>`,
UA приложения и cookies partition аккаунта Cloudflare пропускает; без входа сервер отвечает **401** (пустое тело) —
это и есть «нужен вход». С входом: `{"auth": true}` и `{"new": […]}` — ⚠ проверит пользователь (2–3 дешёвых
поиска в Standard). Id поиска, который сейчас отдаёт `POST search`, — длинная строка вида `H4sIAAAA…` (~130 символов);
она же работает в URL сайта и live. Реализация — `src/main/games/poe1/{liveSearch,wsTransport}.ts` + `live/**`.

## Лиги (`data/leagues`)

Ответ: `{result:[{id, realm, text}]}` — по набору на `realm` `pc` / `xbox` / `sony`. Порядок (28.10.2026):
`Allflame, Hardcore Allflame, Ruthless Allflame, HC Ruthless Allflame, Standard, Hardcore, Ruthless,
Hardcore Ruthless`. POETH берёт только `realm: pc`, без Ruthless и приватных `(PLxxxx)`; `poe1.league: 'auto'` =
первая софткор-лига, не Standard/Hardcore и не SSF (`src/main/net/leagueRules.ts`). Обновление — при старте,
раз в час и после выхода из сна; последний список — `userData/leagues-poe1.json`.

## Вход и cookies (проверено в S3)

- `POESESSID` сайт выдаёт **любому** посетителю: `domain=.pathofexile.com; secure; HttpOnly; SameSite=Lax`, **без
  Expires** (сессионный). Домен общий для `www` и `ru` — вход на одном хосте действует на обоих. Наличие cookie ≠ вход.
- Проверка входа: `GET /my-account` сессией аккаунта — анонимно **401** (HTML), после входа — 200.
  `GET /character-window/get-account-name` больше нет (**404**).
- Chromium не пишет сессионные cookies на диск → POETH пересохраняет `POESESSID` постоянным (30 дней), иначе вход
  пропадал бы после перезапуска. На диске cookie зашифрован (fuse `EnableCookieEncryption`, проверено в
  `package:dir`: `value` пустой, `encrypted_value` заполнен).
- Страница `/login`: способы входа Email / Steam / Epic Games / Xbox Live / PlayStation Network. В окне POETH
  работает только Email (навигация ограничена pathofexile.com); остальным — фолбэк «вставить POESESSID».

## Ошибки и Cloudflare

- 401/403 с JSON → сессия устарела; 403/HTML («Just a moment», `cf-…`) → Cloudflare-челлендж → UI предлагает
  «Открыть трейд-окно» и пройти проверку там (общий UA окна и API, `cf_clearance` привязан к UA).
- Признаки **страницы-челленджа** (`guards.ts`): заголовок `cf-mitigated: challenge`, `window._cf_chl_opt`, путь
  `/cdn-cgi/challenge-platform/h/…/orchestrate/`, `<title>Just a moment` (локализуется: «Один момент…»). **Не**
  признаки: Turnstile с `challenges.cloudflare.com` и `/cdn-cgi/challenge-platform/scripts/jsd/main.js` — они есть
  на обычных страницах GGG (`/login`, 401 `/my-account`). Для JSON-API любой HTML = `blocked`.
- Страница трейда `/trade/search/…` для curl отдаёт managed challenge; API (`/api/trade/…`) через сетевой стек
  Chromium (`net.request`) проходит без него. В окне входа Turnstile иногда проходит сам, иногда просит отметить
  «Подтвердите, что вы человек» — это делает пользователь.
- 429 → `retry-after`; 5xx → «сервер недоступен».

## Учёт богатства (проверено в S11a, 28.10.2026)

**Стэш (legacy, только main, сессия аккаунта):**
`GET https://www.pathofexile.com/character-window/get-stash-items?accountName=<Name#1234>&realm=pc&league=<лига>&tabs=<0|1>&tabIndex=<n>`
→ `{numTabs, tabs?: [{n, i, id, type, colour:{r,g,b}}], items: [...]}`. Без входа — **403** `{"error":{"code":6,"message":"Forbidden"}}`
(и с пустым, и с выдуманным именем). Политика **`backend-item-request-limit`**, правило `Ip`: `30:60:120,90:1800:600,180:7200:3600`
(после входа может добавиться `Account` — лимитер ресинкается). Берём у **www** — имена и свойства предметов на английском
(для сопоставления цен; cookie `POESESSID` общий для `.pathofexile.com`). `get-account-name` без входа — 404 (с входом не проверено);
имя берём из входа (ссылка профиля `Name-1234` → `Name#1234`) или ввода. MapStash/UniqueStash legacy-эндпоинт не отдаёт.
Снимок = по запросу на выбранную вкладку (первая — вместе со списком, `tabs=1`); 25 вкладок при резерве 25 % → авто-снимок не чаще раза в 23 мин.

**Фид обмена GGG (без авторизации):** `GET https://web.poecdn.com/api/currency-exchange/<hourId>` (hourId — unix-секунды начала часа).
Без hourId отдаёт **самый первый** час (Settlers, 2024) — листать вперёд по `next_change_id`. Текущий час — 404, прошлый — 200
(`cache-control: max-age=31536000`, ~0,8–1 МБ JSON, gzip). `market_pair` — полные metadata-пути (`Metadata/Items/Currency/CurrencyRerollRare`
= chaos, `…/CurrencyModValues` = divine); `volume_traded {A:a, B:b}` — a штук A обменяли на b штук B. 571 id за час, все есть
в RePoE `base_items.json` (сопоставление — `tools/wealth/sync-exchange-ids.mjs` → `resources/data/poe1/wealth/exchange-ids.json`).

**poe.watch:** публичный API (OpenAPI `https://poe.watch/docs.yaml`, документация docs.poe.watch), условий использования и лимитов
не объявлено, вопросы — их Discord. `GET https://api.poe.watch/compact?league=<лига>` — все категории одним ответом
(Cloudflare `max-age=1200`, **zstd**; Allflame ~8 МБ, Standard ~20 МБ JSON). Поля: `name, category, group, frame (3 — уник),
mean (chaos), linkCount, gemLevel, gemQuality, gemIsCorrupted, mapTier, lowConfidence`. Берём не чаще раза в час.
poe.ninja просит десктоп-приложения ходить через свой бэкенд — прямых массовых запросов к нему нет (заготовка прокси).

## Политика GGG (обязательно)

Одно действие пользователя = одно действие приложения: никаких авто-покупок, авто-whisper'ов, «бот-подобного»
опроса поиска. Whisper последней находки — **вставляется в чат, но не отправляется**. Резерв лимитов, лимит
live-поисков.
