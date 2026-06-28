# Act Compass — память проекта (handoff)

> Прочитай это первым в новой сессии. Здесь — что это, что готово, как запускать,
> где что лежит и какие есть подводные камни. Детальный план — в [PLAN.md](PLAN.md).

## Что это
**Act Compass** (*"Your path. Nothing missed."*) — десктоп-**оверлей** для **Path of Exile 2**:
трекер кампании по актам (обязательные/необязательные квесты с наградами), лейауты карт зон,
гид «Что дальше?», автоопределение текущей зоны/уровня по логу игры. Прозрачное окно поверх игры,
несколько профилей персонажей. Цель — личное использование + публичный релиз.

- **GitHub:** https://github.com/MAYZOSUPER/POE-2-ACT-Compas (ветка `main`, логин MAYZOSUPER)
- **Статус:** рабочий MVP+ . Собирается, проходит typecheck, запускается, упаковывается в `.exe`.

## Стек
Electron + TypeScript + React + Vite (**electron-vite**). Main/preload — **CommonJS**
(в `package.json` НЕТ `"type":"module"` — намеренно). Состояние UI — **zustand**.
Без сторонних UI-библиотек. Node 24, Electron 33.

## Что уже сделано (фичи)
- **Квесты по 4 актам + 3 интерлюдиям** (129 квестов): метки **обяз/опц**, бейджи наград
  (очки пассивок/набора оружия, дух, сопротивления, жизнь/мана, камни). Чек-лист, сгруппированный по зонам.
- **Ручные галочки**, сохраняются; **несколько профилей** (создание/переключение/переименование/удаление).
- **Лейауты карт для всех актов и интерлюдий** (77 зон) — картинки Exile-UI (MIT), ленивая загрузка
  с GitHub raw + кэш в `%APPDATA%`, отдаются через кастомный протокол `poe2img://`.
- **Автоопределение (опционально, пилюля «Авто»)** — чтение `Client.txt`: текущая зона + уровень.
  Сам находит лог в любых Steam-библиотеках (читает `libraryfolders.vdf`, у пользователя игра на `E:`).
  Завершение квестов **всегда вручную** (в игре нет такого сигнала) — тейлер только подсказывает.
- **Гид «Что дальше?»** — пошаговый режим: текущая зона + её задачи (⚔ Обязательно / ✦ Необязательно)
  + карточка «Дальше». Авто-едет за игроком; ◀/▶ и хоткеи `Ctrl+Shift+[ /]`; «📍 Вы сейчас здесь»
  и «Вернуться к вашей зоне». Переключатель «Что дальше? ↔ Чек-лист».
- **Навигационные подсказки по зоне** (79 зон): 🎯 цель, ➡️ выход, тип лейаута, визуальные ориентиры
  («🌿 светящиеся корни → Дерево Душ»), советы. Источник — poe2-leveling-overlay (MIT).
- **Счётчик наград кампании** (сворачиваемый): собрано/всего по очкам пассивок, набору оружия, духу, сопротивлениям.
- **Подсказки по камням** умений по классам (редакторские, наши).
- **Оверлей:** прозрачное always-on-top окно, **сквозной режим** по 🔒/`Ctrl+Shift+L`, прозрачность
  (через CSS), сворачивание, перетаскивание за шапку. Двухпанельный вид (слева трекер, справа карта/компас).
- **Системный трей**: клик — показать/скрыть; меню — показать/скрыть, сквозной режим, автоопределение, выход.
- **Ребренд Act Compass** + тёмно-золотая готическая тема.

## Хоткеи
`Ctrl+Shift+O` — показать/скрыть · `Ctrl+Shift+L` — сквозной режим · `Ctrl+Shift+[` / `]` — пред./след. шаг.

## Структура
```
src/main/        главный процесс: overlayWindow, clickThrough (lock-модель), hotkeys,
                 ipcHandlers, tray, services/{profileStore,settingsStore,questDataset,
                 layoutResolver,logTailer,atomicJson}
src/preload/     contextBridge → window.overlayApi
src/renderer/    React UI: panels/ (Toolbar, ProfileBar, ActTabs, ZoneBanner, RewardsSummary,
                 WhatsNextPanel, QuestChecklistPanel, GemHintsPanel, SettingsPanel, RightPanel,
                 LayoutViewerPanel), components/, store/useAppStore.ts, styles/globals.css
src/shared/      types.ts, ipc.ts (контракт IPC — единый источник правды)
resources/data/  СОБРАННЫЙ датасет (index, acts/*, areas, layouts/index, hints, gems, route, meta)
resources/brand/ tray-default.png (+ сюда класть PNG-ассеты бренда)
tools/dataset-build/  пайплайн данных (см. ниже); tools/make-tray-icon.mjs
```

## Данные (как пересобрать)
Датасет генерируется, **не** правится вручную:
```
npm run build:data      # tools/dataset-build/build.mjs → resources/data/*
npm run validate:data   # проверка
```
Исходники-сырьё кладутся в `tools/dataset-build/sources/` (**gitignored**):
`helper_zones.json` (nicolasbagatello/poe2-helper) и `exile-ui-filelist.json`
(Lailloken/Exile-UI `file-list 2.json`). Производные модули (наши, коммитятся):
`area-id-map.mjs` (areaId↔зона, авторитетная карта), `interludes.mjs`, `gem-recs.mjs`,
`hints.0.5.mjs`. Тег патча **0.5**, данные community-derived — **сверять с живой игрой**.
Лейауты привязаны к Exile-UI commit (pinned SHA в build.mjs).

## Запуск / сборка
```
npm install            # если бинарь Electron не докачался: node node_modules/electron/install.js
npm run dev            # дев с hot-reload
npm run start          # запуск собранной версии
npm run build          # сборка main/preload/renderer
npm run package        # NSIS-инсталлятор + портативный .exe в dist-release/ (gitignored)
```
Итог упаковки: `dist-release/win-unpacked/Act Compass.exe` (портативный) и
`dist-release/Act Compass Setup 0.1.0.exe` (инсталлятор). Подписи нет → SmartScreen ругается (ок для своей сборки).

## Подводные камни (важно!)
- **Игра должна быть в режиме «Окно»/«Окно без рамки»** — в эксклюзивном fullscreen оверлей не виден.
- **Один экземпляр:** упакованный процесс называется **`Act Compass.exe`** (не `electron`) и держит
  single-instance lock. Если dev `npm run start` молча выходит (exit 0, лог «another instance holds the
  single-instance lock») — закрой запущенный `Act Compass` (`Get-Process "Act Compass" | Stop-Process`).
  Пересборка `.exe` тоже требует закрыть запущенный (файл занят).
- **Прозрачность — только через CSS** (`.app style opacity`). Нативный `win.setOpacity()` на прозрачном
  окне в Windows валит приложение — НЕ возвращать его.
- **Данные/настройки:** `%APPDATA%/Act Compass/` (профили, settings, progress). Запись атомарная,
  `readJson` срезает BOM. Смена `productName` меняет эту папку (профили «теряются» — пересоздаются).
- **Автоопределение по умолчанию ВЫКЛ** (opt-in пилюлей «Авто»).

## Лицензии
Свой код — **MIT** ([LICENSE](LICENSE)). Атрибуция — [NOTICE.md](NOTICE.md). Используем MIT-апстримы
(Exile-UI — картинки; poe2-leveling-overlay — areaId-карта/интерлюдии/подсказки; exile-leveling — схема)
и факты (boss/награды). Дисклеймер GGG (фан-контент). Лист `derek-etherton/PoE2-Map-Layout-Utility` —
**без лицензии**, только идея, код/картинки не брать.

## Что дальше (TODO)
- [ ] Подключить брендовые PNG из `resources/brand/` (логотип в шапку, иконки боссов/POI в строки квестов).
- [ ] Иконка приложения (`build/icon.ico`) для окна/ярлыка/инсталлятора (сейчас стандартная Electron).
- [ ] Перевести англ. навигационные подсказки/ориентиры на русский.
- [ ] Отслеживание ascendancy / трайлов.
- [ ] Подпись кода (убрать предупреждение SmartScreen).
- [ ] Релиз 1.0 PoE2 будет 6 актов без интерлюдий → пересобрать датасет.
- [ ] Точечный клик-сквозь (клики сквозь пустые места, ловятся на панели) — опционально.

## История (коммиты)
Начальный MVP → фиксы (drag/scroll/layout) → акты 2–4 + интерлюдии + автодетект → старт-синк зоны →
ребренд Act Compass + тема → «Что дальше?» → метки обяз/опц + «вы здесь» → подсказки + счётчик наград →
фикс прозрачности (CSS) → системный трей. Подробности — `git log`.
