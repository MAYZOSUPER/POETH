# Журнал PoE 2 для тестов сделок (S63)

Строки в формате `Client.txt` (префикс — как у PoE 1; EE2 разбирает журнал PoE 2 тем же шаблоном).
Живого `Client.txt` PoE 2 с whisper'ами пока нет — строки собраны из фактов:

- **whisper'ы трейда** — шаблоны с живых лотов trade2 (`listing.whisper`, анонимный запрос 31.10.2026):
  EN `Hi, I would like to buy your … listed for … in … (stash tab "…"; position: left N, top M)`,
  RU `Здравствуйте, хочу купить у вас … за … в лиге … (секция "…"; позиция: N столбец, M ряд)`.
  Язык whisper'а trade2 — язык аккаунта продавца; имя лиги не переводится; валюта — id сайта (`exalted`).
- **имена предметов** — данные EE2 PoE 2 (`resources/data/poe2/{en,ru}/items.ndjson`): Wanderlust / Странники,
  Wrapped Sandals / Плетёные сандалии, Whisper of the Brotherhood / Шёпот братства, Sapphire Ring / Кольцо с сапфиром,
  Gold Ring / Золотое кольцо;
- **каналы** `@From`/`@To`/`@От кого`/`@Кому` — `client_strings` EE2 PoE 2;
- **системные строки** — backenderrors игры (LocalIdentity/poe2-data, EN и russian): PlayerJoined, TradeAccepted,
  PlayerDisconnected, DNDModeEnabled.

Ники и приписки покупателей выдуманы. После первого живого whisper'а PoE 2 — заменить строку настоящей
(без ников игроков).
