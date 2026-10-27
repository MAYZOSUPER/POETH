# Дизайн-система POETH — «Золото компаса»

Макеты всех окон v0.1 (RU/EN, простой и экспертный режим, заметки для разработки):
https://claude.ai/artifact/MXRL1ZdMzJtoLeeHkgXRTW — на странице работают ровно эти `tokens.css` и `components.css`.
Стиль и бренд: https://claude.ai/artifact/E3pqVxkC8CLw9XHPteKJzT, https://claude.ai/artifact/4M6dmGThWeL58snnyDbqww.

## Файлы
| Файл | Что |
|---|---|
| `src/renderer/src/styles/tokens.css` | токены (цвета, шрифты, размеры) + алиасы старых имён компаса; подключает `fonts.css` и `components.css` |
| `src/renderer/src/styles/fonts.css` | `@font-face` для локальных шрифтов из `resources/fonts/` |
| `src/renderer/src/styles/components.css` | базовые компоненты `ui-*` |
| `resources/brand/` | знак, логотип, трей, иконки действий (`icons/*.svg`) — см. `resources/brand/README.md` |

Подключение одно: первая строка `globals.css` — `@import './tokens.css';`. Все три страницы (компаньон, оверлей,
сайдбар трейд-окна) уже импортируют `globals.css`, отдельно ничего подключать не нужно.

## Главные правила
1. **Цвета и размеры только через токены.** Никаких `#hex` в CSS доменов. Нет нужного токена — попросить дизайнера.
2. **Панели поверх игры** — `background: var(--surface)` (непрозрачность из настройки `--panel-alpha`, 0.8–1)
   и `box-shadow: var(--halo)`. `backdrop-filter` не использовать: в прозрачном окне Electron он не размывает игру.
3. **Шрифты:** `--font-ui` для всего, `--font-display` (Cormorant SC) только для заголовков окон, имён предметов
   и крупных вкладок, от 15 px. `--font-mono` для regex, путей и id. Цифры в колонках — `font-variant-numeric: tabular-nums`
   (у `.ui-panel` уже включено).
4. **Цвет не единственный сигнал.** Состояние дублируется иконкой или текстом: галочка/крестик, тег, подпись.
5. **Русские строки длиннее английских на 15–30%.** Кнопки без фиксированной ширины, `flex-wrap`, обрезка с полным
   текстом в `title`. Каждый экран смотреть на RU и EN.
6. **Простой режим по умолчанию:** иконка + подпись, меньше колонок, подсказки `.ui-hint`. В экспертном — иконки
   с `title`, больше колонок.
7. **Орнамент** (линия с ромбом) только в шапке окна `.ui-panel__head` и `.ui-divider`; строки и списки плоские.

## Токены (основные)
| Группа | Токены |
|---|---|
| Поверхности | `--surface`, `--surface-solid`, `--page`, `--raised`, `--sunken`, `--hover`, `--selected`, `--border`, `--border-strong`, `--halo`, `--scrim` |
| Текст | `--fg`, `--fg-muted`, `--fg-faint` |
| Акцент | `--accent`, `--accent-hi`, `--accent-ink`, `--accent-grad`, `--accent-soft` |
| Смысл | `--good`, `--warn`, `--bad`, `--info`, `--live` (+ `--on-good`, `--on-bad` для текста на них) |
| Редкость | `--rarity-normal`, `--rarity-magic`, `--rarity-rare`, `--rarity-unique`, `--rarity-gem`, `--rarity-currency` |
| Шрифты и кегли | `--font-display/ui/mono`, `--fs-2xs … --fs-price`, `--lh` |
| Размеры | `--sp-1 … --sp-8`, `--h-row`, `--h-btn`, `--h-btn-sm`, `--h-input`, `--r-panel`, `--r-sm`, `--r-btn`, `--r-pill`, `--w-pricecheck`, `--w-pricecheck-expert`, `--w-toast` |

Старые имена темы компаса (`--gold`, `--gold-bright`, `--panel`, `--line`, `--text`, `--muted`, `--font-serif`,
`--font-sans`…) продолжают работать: в `tokens.css` они указывают на новые значения. В новом коде — только новые имена.

## Компоненты
| Класс | Разметка и состояния |
|---|---|
| `.ui-panel` (`--solid`, `--flat`), `__head` (`--plain` без орнамента), `__title`, `__body`, `__foot` | окно оверлея, карточка, тост |
| `.ui-label`, `.ui-label__grow` | подпись раздела внутри окна |
| `.ui-btn` + `--primary`, `--ghost`, `--danger`, `--live`, `--sm`, `--icon`, `--block` | `disabled` / `aria-disabled="true"` |
| `.ui-check` | `<button role="checkbox" aria-checked>` + `<svg class="ui-ico"><use href="#i-check"/></svg>` |
| `.ui-tri` + `__box` | три состояния: `data-state="want|avoid|any"`, иконки check / cross / dash |
| `.ui-switch` (`--live`) + `__track` | `<button role="switch" aria-checked>` |
| `.ui-chip` | фильтр-переключатель, `aria-pressed` |
| `.ui-seg` | взаимоисключающий выбор: кнопки внутри с `aria-pressed` |
| `.ui-input` (`--num`, `--lg`, `--mono`), `.ui-select`, `.ui-field` + `__label`, `__help`, `__error` | `aria-invalid="true"` для ошибки |
| `.ui-tabs` (`--main` для вкладок компаньона), `.ui-tab`, `.ui-count` (`--live`) | `role="tab" aria-selected`, `aria-disabled` |
| `.ui-q`, `.ui-tip`, `.ui-hint`, `.ui-banner` (`--bad`, `--info`) | подсказки, объяснения новичку, баннеры лимита/ошибки |
| `.ui-tier` (`--t1`, `--t3`), `.ui-roll` (`style="--v:78%"`), `.ui-tag` (`--merchant`, `--person`, `--good`, `--warn`, `--bad`), `.ui-coin` (`--div`, `--ex`, `--chaos`, `--gold`), `.ui-dot` (`--afk`, `--off`, `--bad`), `.ui-kbd` | мелкие метки |
| `.ui-mod` (`--expert`, `--off`, `--pseudo`), `__text`, `__from`, `.ui-mod-head`, `.ui-listing` + `__price`, `__meta`, `__who`, `__fee`, `.ui-summary` + `__price`, `__conf`, `.ui-pips` | строки прайс-чека |
| `.ui-toast` (`--paused`, `--done`) + `__pulse`, `__body`, `__meta`, `__kind`, `__item`, `__price`, `__actions`, `__note` | тост live search |
| `.ui-deal--out`, `.ui-deal--warn`, `.ui-deal__kind`, `__time`, `__body`, `__who`, `__item`, `__where`, `__actions` | карточка сделки (внутри `.ui-panel`) |
| `.ui-stash-hit` | подсветка ячейки тайника, `position: absolute` |
| `.ui-meter` (`data-level="warn|over"`, `style="--v:35%"`) + `__row`, `__bar` | счётчик 250 символов, лимит live |
| `.ui-menu` + `__item` (`--danger`), `__hint`, `__sep` | меню «⋯», контекстные меню |
| `.ui-credits` + `__head`, `__title`, `__lead`, `__list` (+ `.ui-scroll`), `__name` (имя в `<span>`, `since` — в `title`), `__empty`, `__note` | «Благодарности» в «О программе»: подписчики «Печать» из `resources/supporters.json` |
| `.ui-divider`, `.ui-empty` + `__title`, `.ui-skeleton`, `.ui-scroll` | орнамент, пустые состояния, загрузка, прокрутка |

Иконки: `resources/brand/icons/<имя>.svg` или спрайт `icons-sprite.svg` (`<use href="#i-<имя>"/>`), класс `.ui-ico`
(`--sm` 13 px, `--lg` 18 px). Список: check, cross, dash, close, min, max, search, star, bolt, external, chat, invite,
trade, kick, heart, sold, ask, home, grid, help, warn, copy, refresh, support, gear, folder, archive, chev-r, chev-d,
dots, plus, import, export, pin, lock, shield, logout, keyboard, layers, volume, info, game, pause, trash, edit, map,
book, coins, compass, seal, history.

## Кнопка «Поддержать проект»
Иконка `support` (монета с сердцем, своя, без логотипа Boosty). Места: «О программе» в настройках, пункт меню
настроек, меню трея, последний шаг мастера. Кнопка обычная или `--ghost`, никогда не `--primary`, без всплывающих
окон и напоминаний. Ссылка — `BOOSTY_URL` из `@shared/links`, открывается в системном браузере.

## «Благодарности»
Блок `.ui-credits` в «О программе» сразу под кнопкой поддержки (образец — макет «Настройки», переключатель
«С именами / Пока пусто»). Иконка `seal` («Печать»). Имена в сетке колонок по 150 px, после 7 строк — прокрутка
внутри блока; длинный ник обрезается, полный вместе с «с 10.2026» — в `title`. Без аватаров, сумм и сети.
В тексте прямо сказано, что подписка не открывает функций (все версии POETH открыты всем — правило GGG).
Пустой список — `.ui-credits__empty` вместо `__list`. Ссылку на лицензии в этом окне называть
«Лицензии открытого кода», чтобы она не путалась с благодарностями.
