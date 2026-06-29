# Exile Companion — план «companion» (прайс-чек + стэш) и проверенная справка по trade2 API

> Этот файл **в репозитории** — его видит любой клон на любом ПК. Краткий статус и обзор — в
> корневом [MEMORY.md](../MEMORY.md). Здесь — детали, чтобы продолжить без повторного исследования.

## Статус
- **Фаза 1 — прайс-чек предметов: ГОТОВО** (коммит `a4b3af1`). См. ниже «Как реализовано».
- **Фаза 2 — оценка стэша: спроектировано, не начато.** См. «Фаза 2» внизу.

---

## Зачем / решения
Приложение из чистого трекера кампании превратилось в **companion**: кампания + прайс-чек предметов,
дальше — оценка стэша. Делаем **фазами**. Авторизация — **POESESSID** (cookie сессии PoE), вводит
пользователь, хранится зашифрованно. Захват предмета — пользователь сам жмёт **Ctrl+C**, затем хоткей
читает буфер (без нативных либ/инжекта). Опора по технике (оба MIT): **Exiled Exchange 2**
(kvan7 — PoE2-парсер предметов) и **Awakened PoE Trade** (SnosMe — `net.request`+rate-limit паттерн).

---

## Проверенная справка по PoE2 trade2 API (из исходников EE2/Awakened + офиц. доков)

**Самое важное:** на API-путях trade2 **НЕТ `?realm=poe2`** — сегмент `trade2` уже означает PoE2.
`realm=poe2` встречается только в URL сайта (для человека), не в API-запросах.

### Эндпоинты (хост `https://www.pathofexile.com`)
| Назначение | Метод | URL |
|---|---|---|
| Лиги | GET | `/api/trade2/data/leagues` → `{result:[{id,realm,text}]}` |
| Поиск | POST | `/api/trade2/search/<encodeURIComponent(league)>` → `{id, result:[hashIds], total}` |
| Получение листингов | GET | `/api/trade2/fetch/<ids,через запятую,≤10>?query=<searchId>` |
| URL сайта (для кнопки «открыть») | — | `/trade2/search/poe2/<league>/<searchId>` (тут `poe2` ЕСТЬ) |

### Заголовки (всё из main через Electron `net.request`)
- `User-Agent: app.userAgentFallback` (Chrome-подобный UA Electron — проходит Cloudflare).
- `Accept: application/json`; для POST — `Content-Type: application/json`.
- **`Cookie: POESESSID=<значение>`** — POESESSID **явным заголовком** (у нас нет cookie-jar, поэтому
  `useSessionCookies` НЕ годится). Не ставить `Origin/Referer/sec-*` (это пометит запрос как браузерный).
- Почему main, а не renderer: renderer = веб-origin → CORS + запрет ставить `Cookie`/`User-Agent`;
  `net.request` из main свободен от CORS и идёт через сетевой стек Chromium (проходит Cloudflare).

### Тело поиска (`query`), по типам предмета
Инварианты: `status.option='online'`, всегда `stats:[{type:'and',filters:[]}]`, `sort:{price:'asc'}`.
- **Уник (опознан):** `name`=имя, `type`=база.
- **Валюта/стак:** `type`=база (имя).
- **Рарка/мэджик:** `type`=база + `filters.type_filters.filters.rarity.option` (`nonunique`|`magic`) +
  `ilvl.min ≈ itemLevel-2` (модов НЕ шлём → оценка приблизительная).
- **Камень:** `type`=имя + `type_filters.filters.category.option` (`gem.activegem`/`gem.supportgem`/
  `gem.metagem`) + `misc_filters.filters.gem_level.min`.

### Ответ fetch
`{result:[{ id, listing:{ indexed, whisper?, price?:{type,amount,currency(slug)}, account:{name,...} }, item:{name,typeLine,baseType,...} } | null]}`.
Цена опциональна (`price?`) — листинги без цены пропускать. `currency` — слаг (`exalted`,`divine`,`chaos`…).

### Rate-limit
Заголовки `x-rate-limit-rules`, `x-rate-limit-<rule>` (триплеты `limit:period:restime`),
`x-rate-limit-<rule>-state` (`currentHits:period:timeout`), `retry-after` (сек, при 429).
Синкать лимитер по самому строгому правилу; на 429 ждать `retry-after` и повторить один раз.

### Парс предмета из буфера (EN ∪ RU client_strings, дословно, с хвостовыми пробелами)
- Секции разделены строкой из дефисов (`--------`). Нейм-плейт (секция 0): строка1 `Item Class: `/
  `Класс предмета: `, строка2 `Rarity: `/`Редкость: `, строка3 — имя, строка4 — база (если есть).
- `Item Level: `/`Уровень предмета: `; уровень камня `Level: `/`Уровень: ` (не путать с `Item Level`).
- Рарность EN/RU: Normal/Обычный, Magic/Волшебный, Rare/Редкий, Unique/Уникальный, Gem/Камень,
  Currency/Валюта, Divination Card/Гадальная карта.
- Осквернение: `Corrupted`/`Осквернено` (триммить — у RU хвостовой пробел). Неопознан:
  `Unidentified`/`Неопознано`. Off-class строка `You cannot use this item…`/`Вы не можете…` — выкинуть
  (иначе сдвигает нейм-плейт). Имя/базу прогонять через `stripMarkup` (`<<set:..>>`, `<if:..>{..}`).
- Поиск по: уник(опознан) → по `name`; всё остальное → по `baseType` (фолбэк `name`).
- Детект «это предмет»: секция0[0] начинается с `Item Class:`/`Класс предмета:` ИЛИ `Rarity:`/`Редкость:`.

### Маппинг ошибок → `PriceCheckResult`
нет POESESSID → `no-session`; не предмет → `not-an-item`; 401/403 (JSON) → `error` «сессия устарела»;
HTML/Cloudflare → `error` «blocked»; пусто/нет цен → `empty`; иначе ок → `ok`.

---

## Как реализовано (Фаза 1, готово)
- `src/main/services/tradeCore.ts` — **чистое ядро без electron** (тестируемо): `parseItem`,
  `buildSearchBody`, `summarizeListings` (мин/медиана по модальной валюте), `RateLimiter`,
  `filterLeagues`. Тесты: `scripts/test-trade.mjs` → `npm run test:trade` (31 проверка).
- `src/main/services/tradeClient.ts` — IO: `request()` (net.request), `apiCall` (rate-limit+429),
  `getLeagues`, `priceCheck` (search→fetch→summary, маппинг ошибок, локализация RU/EN).
- `src/main/services/secretStore.ts` — POESESSID через `safeStorage` (DPAPI) в `secret.json`.
- IPC: namespace `trade` (`priceCheck/setSession/hasSession/getLeagues`) + событие `events.priceResult`
  + `window.openExternal` (только https + хост pathofexile.com). Хоткей `priceCheck` (`Alt+D`).
- Renderer: `panels/AppTabs.tsx` (вкладки), `panels/PriceCheckTab.tsx` (UI), store `useAppStore.ts`
  (`appTab`,`sessionSet`,`leagues`,`priceResult`,`priceLoading`,`setSession`,`runPriceCheck`).
- **Прошло состязательное ревью (14 фиксов).** typecheck+build+тесты зелёные.

### Осталось по фазе 1
- Живой end-to-end с реальным POESESSID+лигой (без аккаунта не проверить; парсер/логика — юнит-тесты).
- RU-клиент: trade API ждёт английские названия → RU-имена не матчатся (помечается note). Маппинг RU→EN — позже.
- Magic-предметы: ищутся по полному магическому имени (нет строки базы) → часто пусто. Извлечение базы — позже.

---

## Фаза 2 — оценка стэша (спроектировано, не начато)
По POESESSID: `GET /api/account/stashes` → вкладки → предметы. Оценка: poe.ninja PoE2 economy API
(валюта/уники точно) + trade для рарок (**приблизительно**, по лимитам). UI: новая вкладка `appTab:'stash'`
+ namespace `stash` + сервис `stashClient.ts`: селектор вкладок, строки предметов с ценой, итог
**по вкладке + общий**. Честно помечать приблизительность рарок. Уважать rate-limit (как в прайс-чеке).

---

## Приложение: исследование лога игры (для автопрогрессии — уже реализовано)
`Client.txt` пишет: вход в зону `Generating level N area "<areaId>"` (язык-независимо), уровень
`is now level N`, награду пассивок `You have received N Passive Skill Points.`, **имена боссов в
репликах** `"<Имя>: <речь>"`, открытие гейта `The entrance to <Area> has been revealed.`.
⚠️ `<Имя> has been slain.` = смерть ИГРОКА, НЕ убийство босса — не парсить. Реализация: `logTailer.ts`
+ `bossMatcher.ts` (двуязычный индекс EN+RU). Детект боссов триггерится по **реплике**, не по награде
(многие боссы дают камень, award не приходит). Дебаунс 60с.

## Источники / лицензии
Свой код — MIT. Опора (MIT): Exiled Exchange 2 (парсер/данные предметов), Awakened PoE Trade
(net.request+rate-limit), Exile-UI (картинки лейаутов), poe2-leveling-overlay (areaId/подсказки),
факты/RU-имена с poe2db. Дисклеймер GGG (см. [NOTICE.md](../NOTICE.md)).
