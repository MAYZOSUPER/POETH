# Менеджер сделок (S8)

Фаза 1: разбор Client.txt, история, чёрный список PoE Hub, геометрия стэша, вкладка «Сделки».
Фаза 2: карточки поверх игры (`overlay/deals/`), кнопки и хоткеи → одна команда в чат (`typeInChat` S1),
подсветка ячейки, калибровка кликами, звук, чтение Client.txt PoE1 (после патча logTailer).

## Карточки поверх игры
- Какие показываются — `@shared/deals/cards.activeCards`: открытые (new/invited), свежие сверху, не старше 30 мин
  с последнего события, не закрытые ✕; исходящие — если «Показывать исходящие»; завершённые — если «Скрывать
  после Продано» выключено; примеры и игнор (сообщения о проданном) — никогда. Видно до 4, дальше «ещё N».
- Кнопка → `deals:action(id, action)`: main сам строит команду (`chatCommand` из истории и шаблонов RU/EN) и
  печатает её через `typeInChat(cmd, { send: true })` — renderer не может отправить в чат произвольный текст.
  Статус меняется, только если команда ушла (`cardEffect`): «Пригласить»/«Обмен» → в группе, «Спасибо» →
  состоялась, «Продано» → продано + предмет в игнор, «Кик»/✕ — карточка закрыта (сделка остаётся в истории).
- Чёрный список: красная рамка, «⚠ в чёрном списке PoE Hub: <причина>», кнопки «Не отвечать» и
  «Пригласить всё равно».
- Хоткеи верхней карточки `dealInvite` / `dealTrade` / `dealDismiss` (область game, Alt+1/2/3) — после патча
  Settings v2 (`S8-hotkeys-settings.patch`, через лида).
- Звук — в оверлее (по «Звук при входящей сделке» и общей громкости). Никаких автоответов и таймеров.
- Подсветка ячейки — по геометрии/калибровке в **физических** пикселях клиентской области (`innerWidth ×
  devicePixelRatio`), рамка — в CSS px оверлея. Калибровка: «Калибровать поверх игры» (компаньон) или ✎ на
  карточке → два клика по углам сетки → `settings.deals.calibration`; Esc — отмена.
- Client.txt PoE1: общий тейлер процесса `services/gameLog.ts` (`subscribeGameLog`, его же читают команды чата
  с `@last`). Файл, выбранный во вкладке, — «свой путь» игры (`setGameLogPath`, хранится в `deals.json`
  `config.logPath`, не `Settings.logPath` — это лог PoE2 для кампании); он же работает и для команд чата.
  Статус во вкладке — `getGameLogStatus()` / `onGameLogStatus()`.

## Код
| Что | Где |
|---|---|
| Разбор строк Client.txt (префикс, каналы, трейд EN/RU, камни, bulk, системные события) | `src/shared/deals/whisperParse.ts` |
| История: сделка из whisper'а, повторы, статусы, игнор проданного, лимит, quad-вкладки, CSV | `src/shared/deals/history.ts` |
| Команды чата для кнопок (одна команда на нажатие) | `src/shared/deals/commands.ts` |
| Чёрный список: разбор `blacklist.csv`, индекс, проверка | `src/shared/deals/blacklist.ts` |
| Геометрия стэша и калибровка | `src/shared/deals/stashGrid.ts` |
| Файл истории `userData/deals.json`, события `changed` / `deal` | `src/main/services/dealsStore.ts` |
| Кэш списка `userData/cache/poehub-blacklist.json`, обновление раз в сутки | `src/main/services/dealsBlacklist.ts` |
| IPC `deals:*`, события `event:deals.*` | `src/shared/ipc/deals.ts`, `src/main/ipc/deals.ts`, `src/preload/domains/deals.ts` |
| Вкладка | `src/renderer/src/panels/DealsTab.tsx`, `panels/deals/*`, `store/useDealsStore.ts`, `i18n/dict/deals.ts` |
| Карточки: что показывать, верхняя, кнопки и их последствия | `src/shared/deals/cards.ts` |
| Карточки поверх игры, подсветка, калибровка | `src/renderer/src/overlay/deals/{widget.tsx,store.ts,deals-overlay.css}` |

## Разбор сообщений
- Каналы: `@From` / `@To`, RU `@От кого` / `@Кому`, необязательный тег `<TAG>`. Регэкспы трейда взяты из
  APT `renderer/src/web/client-log/client-log.ts` (SnosMe/awakened-poe-trade @ 3188208957, MIT). Отличия: цена и
  лига ленивые (лига с « in », точка в приписке), сообщения без цены и без «Hi, ».
- Язык сделки определяется по шаблону, а не по клиенту: RU-клиент получает EN-сообщения с www-сайта.
- Системные: EN `has joined/left the area`, `Trade accepted/cancelled`, `AFK/DND mode is now ON/OFF` — сверено по
  настоящему Client.txt. RU `присоединился.` — PoE-Overlay и SlimTrade (MIT). **Не проверено в RU-клиенте:**
  `покинул область`, `Режим "отошёл" включён/выключен` (строки из POE-Trades-Companion), RU `Trade accepted/cancelled`
  и DND — не найдены нигде, проверить в игре.

## Стэш
Интерфейс PoE масштабируется по высоте окна H; панель прижата к левому краю области интерфейса.
| Величина | Значение | Источник |
|---|---|---|
| ширина боковой панели | 986/1600·H | APT `OverlayWindow.vue` (MIT) |
| левый край сетки | 17/1119·H | Poe-Lurker `StashTabGridViewModel.cs` (MIT, © Wohs Inc.) |
| верх сетки | 154/1119·H | Poe-Lurker |
| вкладка в папке | +42/1119·H | Poe-Lurker |
| предел ширины интерфейса | 3455/1440·H, дальше чёрные поля | Poe-Lurker `DockingHelper.cs` |
| сторона сетки | панель − 2 отступа = 0.5859·H (632.7 px при 1080p) | выведено; у Poe-Lurker 637/1119·H ≈ 614.8 px |

Обычная вкладка 12×12, quad 24×24 на той же площади; «Авто» — позиция > 12 или вкладка уже встречалась как quad.
Автоматика не проверена в игре — точный путь: калибровка по двум углам (`settings.deals.calibration`, с размером
окна при калибровке; при другом размере масштаб по высоте с учётом чёрных полей).

## Чёрный список PoE Hub
`https://raw.githubusercontent.com/The-Forbidden-Trove/ForbiddenTroveBlacklist/main/blacklist.csv` (MIT):
`account_name, discord_id, blacklisted_on, reason, active`. В списке **имена аккаунтов**, в логе — персонажи:
точное совпадение по аккаунту, совпадение имени персонажа с аккаунтом — «возможно». Для входящих нужен запрос
имени аккаунта по персонажу (сеть S3, фаза 2).
