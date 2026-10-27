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
in-person листингов). `item` — полный предмет; `item.extended.text` — текст предмета (⚠ кодировка: base64 —
проверить; используем в live search для парсинга находки).

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
| live-fetch | отдельная политика для `fetch` находок live (⚠ значения — по заголовкам) |

Правила POETH: интерактивный запрос (Ctrl+D) вперёд очереди; ждать > 1.5 с — сразу ошибка с обратным отсчётом;
фоновые (live) — только если остаётся ≥ 25 % окна; кэш 5 мин по хэшу запроса.

## Live search (WebSocket)

- `wss://<host>/api/trade/live/<league>/<searchId>` с cookie `POESESSID` из сессии аккаунта (только main).
- Сообщения: ⚠ `{"auth": true}` после подключения; `{"new": ["hash", …]}` — новые листинги → батч 300 мс →
  `fetch` (до 10 за запрос) → разбор `item.extended.text` → тост + звук в оверлее, Windows-уведомление, если игра
  не в фокусе.
- Поведение клиента: до 10 поисков (настройка до 20), подключения с шагом 2.5 с, реконнект 3 с + jitter,
  **429** → бэкофф 30 с … 10 мин, **401** → ждём входа, **404** → поиск недействителен.
- Транспорт — за интерфейсом; фолбэк — скрытое окно на сайте, если Cloudflare не пустит `ws`.

## Ошибки и Cloudflare

- 401/403 с JSON → сессия устарела; 403/HTML («Just a moment», `cf-…`) → Cloudflare-челлендж → UI предлагает
  «Открыть трейд-окно» и пройти проверку там (общий UA окна и API, `cf_clearance` привязан к UA).
- 429 → `retry-after`; 5xx → «сервер недоступен».

## Политика GGG (обязательно)

Одно действие пользователя = одно действие приложения: никаких авто-покупок, авто-whisper'ов, «бот-подобного»
опроса поиска. Whisper последней находки — **вставляется в чат, но не отправляется**. Резерв лимитов, лимит
live-поисков.
