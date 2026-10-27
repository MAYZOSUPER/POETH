> **Архив.** План трекера кампании PoE2 (компас). План POETH — [docs/PLAN-POETH.md](../PLAN-POETH.md).

# PoE2 Quest Overlay — План разработки

> Десктоп-оверлей для Path of Exile 2: трекер кампании по актам (обязательные/необязательные
> квесты с наградами), лейауты карт зон, подсказки по камням и маршруту. Прозрачное окно
> поверх игры, несколько профилей персонажей. Цель — со временем выложить публично.

---

## 1. Контекст и цель

Игрок проходит кампанию PoE2 (сейчас Early Access, патч **0.5**: 4 акта + 3 интерлюдии; в релизе 1.0
будет 6 актов). По ходу есть **обязательные** квесты (двигают сюжет, дают камни умений) и
**необязательные** (дают постоянные бонусы: очки пассивок, дух/spirit, сопротивления, жизнь/мана,
чармы). Держать это в голове неудобно — нужен трекер, который:

1. показывает чек-лист квестов по актам с разделением обязательные / необязательные и наградами;
2. позволяет вручную отмечать выполнение (галочки), с несколькими профилями персонажей;
3. показывает картинки-лейауты зон;
4. даёт подсказки по камням умений и маршруту прохождения;
5. (позже) автоматически подсказывает текущую зону, читая лог-файл игры.

## 2. Ключевые решения (и почему)

| Решение | Выбор | Причина |
|---|---|---|
| Стек | **Electron + TypeScript + React + Vite** (electron-vite) | Есть прямой MIT-референс под оверлей PoE2 (`Lechkolion/poe2-leveling-overlay`); зрелые API прозрачного клик-сквозь окна; максимум готового кода. |
| Данные квестов/маршрута | scrape **`domistae/poe2-leveling`** (MIT, 0.5) | Актуально под 0.5, лицензия чистая, данные структурированы в HTML. |
| Схема данных | по образцу `nicolasbagatello/poe2-helper` + `exile-leveling` | Готовая модель act→zone→quest с флагами reward/optional. |
| Лейауты карт | **`Lailloken/Exile-UI`** (MIT, 359 картинок) | Единственный крупный openly-licensed набор; ключ = внутренний areaID игры. |
| Сверка наград | maxroll (только проверка чисел) | Авторитетная таблица постоянных наград; копировать нельзя, числа — факты. |
| ⚠️ Твой репозиторий `derek-etherton/...` | только идея, **не код/картинки** | Нет лицензии = all rights reserved. Копировать нельзя. Берём только подход. |
| Автоопределение квестов | **только ручные галочки** | В логе/API **нет** сигнала о завершении квеста. Авто можно только: вход в зону + уровень. Это «подсказка», не истина. |
| Отображение | прозрачный оверлей always-on-top, клик-сквозь | Требует игру в режиме **Окно / Без рамки** (эксклюзивный fullscreen прячет оверлеи). |

## 3. Что реально умеет автоопределение (честно)

Читаем `Client.txt` игры (безопасно, не нарушает TOS, так делают все оверлеи). Из лога надёжно ловятся:

- **Вход в зону** → `Generating level (\d+) area "([^"]+)"` (запасной: `[SCENE] Set Source [..]`);
- **Уровень персонажа** → `: (\S+) is now level (\d+)`.

**Нельзя** определить из лога/API: завершение квеста, выбор награды/камня, взятие очка пассивки,
аскенданси. Поэтому эти галочки всегда ручные, а лог-тейлер — строго **совещательный**:
подсвечивает текущую зону, может *предложить* квест, но **никогда не снимает ручную галочку**.

Путь к логу не фиксирован (Steam/standalone/Epic, разные диски) → авто-поиск + ручной выбор файла.

## 4. Архитектура приложения

### 4.1 Структура проекта

```
poe2-quest-overlay/
  package.json  electron.vite.config.ts  electron-builder.yml  tsconfig*.json
  LICENSE (MIT)  NOTICE  THIRD_PARTY_LICENSES.md
  resources/                      # read-only в рантайме (process.resourcesPath)
    data/                         # СОБРАННЫЙ датасет (см. §5)
    layouts/                      # картинки Act 1 (остальное — ленивая загрузка+кэш)
  src/
    shared/   ipc.ts  types.ts  questId.ts        # импортится и main, и renderer
    main/
      index.ts  overlayWindow.ts  clickThrough.ts  hotkeys.ts  ipcHandlers.ts
      services/  profileStore.ts  settingsStore.ts  questDataset.ts  logTailer.ts
    preload/  index.ts  api.d.ts                  # contextBridge -> window.overlayApi
    renderer/
      index.html  src/main.tsx  src/App.tsx
      store/ useAppStore.ts  ipcBridge.ts
      panels/ QuestChecklistPanel  LayoutViewerPanel  ProfileSwitcher  SettingsPanel
              OpacitySlider  DragHandle            # единственные кликабельные области
      components/ QuestGroup  QuestRow  RewardBadge  ZoneBanner
  tools/dataset-build/            # dev-only пайплайн сборки данных (§5)
  scripts/  build-layouts.mjs  validate-dataset.mjs
```

Бандлер — **electron-vite** (три изолированных бандла main/preload/renderer, HMR, TS).
Зависимости: `react`, `react-dom`, `zustand`, `chokidar` (фаза 3). Dev: `electron`, `electron-vite`,
`vite`, `@vitejs/plugin-react`, `electron-builder`, `typescript`.

### 4.2 Окно-оверлей (Windows 11)

`frame:false, transparent:true, alwaysOnTop:true, skipTaskbar:true, hasShadow:false`,
+ `setAlwaysOnTop(true,'screen-saver')` (поверх borderless-игр),
+ `webPreferences:{ contextIsolation:true, nodeIntegration:false }`. Старт — полностью клик-сквозь.

**Выборочный клик-сквозь — опрос позиции курсора в main-процессе (~30 Гц):** каждый тик берём
`screen.getCursorScreenPoint()`, переводим в координаты окна, проверяем попадание в прямоугольники
интерактивных панелей (renderer присылает их через `updateInteractiveRects` при монтировании/resize).
Внутри панели → `setIgnoreMouseEvents(false)`, иначе → `setIgnoreMouseEvents(true,{forward:true})`.
Переключаем только при смене состояния. *(Это надёжнее, чем mouseenter/leave у референса — тот залипает.)*

**Глобальные хоткеи:** `Ctrl+Shift+O` показать/скрыть, `Ctrl+Shift+L` lock (полный клик-сквозь, чтобы
оверлей не воровал клики в бою), `Ctrl+Shift+[` / `]` пред/след шаг. Прозрачность — `win.setOpacity()`.

### 4.3 IPC (единый источник правды — `shared/ipc.ts`)

Preload отдаёт один namespaced `window.overlayApi`; renderer не трогает `ipcRenderer` напрямую.

```ts
window.overlayApi = {
  profiles:  { list, create, rename, delete, setActive, getActive },
  progress:  { get, setQuestDone, setAct, setLevel },
  settings:  { get, set },
  dataset:   { getQuests },                              // read-only
  window:    { setOpacity, setLocked, updateInteractiveRects, toggleVisible },
  onZoneChange(cb), onLevelChange(cb), onHotkey(cb), onActiveProfileChanged(cb),  // события
}
```
`invoke/handle` для CRUD/чтения; `send/on` для управления окном; `webContents.send` для событий
тейлера/хоткеев. В main валидируем каждый payload (для публичного релиза).

### 4.4 Профили и хранение

Всё изменяемое — в `app.getPath('userData')` → `%APPDATA%/PoE2 Quest Overlay/` (никогда не в папке
установки). **Атомарная запись:** `*.tmp` → `fsync` → `rename`, плюс `.bak` и восстановление при
повреждении; дебаунс ~250 мс.

```
%APPDATA%/PoE2 Quest Overlay/
  profiles.json            # индекс профилей
  settings.json
  progress/<profileId>.json   # completedQuestIds по СТАБИЛЬНЫМ id квестов
  layout-cache/<areaId>/...    # кэш картинок Exile-UI
```

Прогресс хранится по **стабильному строковому id квеста** (`a1q-beira`, `a1q-unas-lute`), а не по
индексу/`data-step` источника — тогда обновление датасета не ломает сохранённые галочки.

## 5. Данные: схема и пайплайн сборки

### 5.1 Схема (TS-типы — источник правды, валидируется ajv)

```
resources/data/
  dataset.meta.json   # gamePatch "0.5", schemaVersion, pinned SHA источников, actCount
  index.json          # упорядоченный список актов  ← делает число актов ПЕРЕМЕННЫМ
  acts/act-1.json … interlude-1.json …
  route.json          # глобальный маршрут (упорядоченные шаги)
  gems.json           # каталог камней + рекомендации по классам
  layouts/index.json  # areaId -> { files[], rotationLocked, attribution }
```

Ключевые типы: `Act { actNumber, actName, kind:"act"|"interlude", zones[], quests[] }`,
`Quest { id(стабильный), name, type:"mandatory"|"optional", zone(areaId), reward{kind,value,numeric,swappable}, gems[], notes, autoComplete{onZoneEnter} }`,
`Reward.kind`: `skill_point|passive_point|spirit|resistance|attribute|life|mana|charm_slot|weapon_set_point|skill_gem|support_gem|uncut_gem|crafting|unique_item|...`.

**Лейауты ключуем по `areaId`, не по имени зоны** — имена зон повторяются между актами, а areaID
уникален. Свой areaId (`a1-clearfell`), а апстрим-ключи (`g1_2` у Exile-UI) держим в `zone.xref` для джойна.

### 5.2 Пайплайн (`tools/dataset-build/`, запуск через `tsx`)

1. **fetch** — тянем raw-файлы по **закреплённому SHA** (воспроизводимость): domistae `poe2_act{1..4}_guide.html` + интерлюдии; exile-leveling `gems/areas/gem-colours.json`; Exile-UI `file-list 2.json`.
2. **parse-domistae** (`cheerio`) — зоны = `div.zone-header[id]` + `span.lvl`; квесты/шаги = `div.step[data-step]` → `div.step-content`; награды = `span.reward-tag` (+ класс `gem|optional|...`), регексами вытаскиваем числа (`+30 Spirit`, `10% Cold Res`, `or`→swappable).
3. **map-areas** — назначаем свой areaId + джойн через ручную таблицу `area-xref.0.5.ts` (~61 зона — единственная ручная склейка на патч).
4. **map-layouts** — группируем картинки из `file-list 2.json` по areaID, `rota_block`→`rotationLocked`, перекеиваем на наш areaId.
5. **build-gems** — трансформируем `gems.json` exile-leveling; **рекомендации пишем сами** (и обходим проприетарные гайды).
6. **merge-validate** — сверяем числа наград с `fixtures/maxroll-rewards.0.5.ts`; инварианты по актам (Act 1: +4 пассивки, +30 spirit, +10% cold, +20 life); ajv-валидация. **Сборка падает при расхождении.**
7. **emit** — пишем `resources/data/*` + meta.

Новый патч: обновить SHA + тег патча в `config.ts`, обновить `area-xref` и fixtures, перезапустить — код приложения не меняется.

### 5.3 Картинки лейаутов

Bundle только **Act 1** (офлайн-старт), остальное — **ленивая загрузка** с
`raw.githubusercontent.com/Lailloken/Exile-UI/<SHA>/...` и кэш в `%APPDATA%/.../layout-cache`.
Подпись под каждой: «Layout © Lailloken / Exile-UI (MIT)». **Не авто-вращаем** — показываем как
эталон формы (инстанс может быть повёрнут/отзеркален); ручной поворот, если `rotationLocked:false`.

## 6. Порядок сборки (фазы)

- **Фаза 0 — Каркас.** electron-vite запускается; прозрачное безрамочное always-on-top окно; preload-мост; одна тестовая `.interactive` панель.
- **Фаза 1 — Механика оверлея.** `overlayWindow.ts` + `clickThrough.ts` (опрос курсора) + хоткеи + прозрачность + перетаскивание. Проверка поверх PoE2 в Windowed-Borderless.
- **Фаза 2 — MVP (ручной трекер, уже рабочий).** Типы + датасет Актов 1–3 (стабильные id, награды, areaId) + картинки Act 1 + LayoutViewerPanel; `profileStore`/`settingsStore` (атомарно, userData); несколько профилей + прогресс на профиль; полный IPC; QuestChecklistPanel + ProfileSwitcher + SettingsPanel + прозрачность. **Полноценное приложение — здесь можно пользоваться.**
- **Фаза 3 — Лог-тейлер (совещательный).** `logTailer.ts` за IPC-швом; авто-поиск/ручной выбор `Client.txt`; авто-подсветка зоны + показ уровня; контракт «не трогать ручные галочки». Опционально — детект, что PoE2 в фокусе.
- **Фаза 4 — Подсказки/полировка.** камни/маршрут, суммы очков пассивок/аскенданси, настраиваемые хоткеи, темы, импорт/экспорт профилей.
- **Фаза 5 — Упаковка/релиз.** NSIS-инсталлятор (electron-builder), подпись кода (EV-сертификат против SmartScreen), NOTICE + дисклеймер GGG, контрольные суммы.

## 7. Лицензии и атрибуция (для публичного релиза)

- Наш код — **MIT** (`LICENSE`).
- `NOTICE` + `THIRD_PARTY_LICENSES.md` с MIT-текстами апстримов: **domistae/poe2-leveling**, **exile-leveling**, **Exile-UI**.
- Дисклеймер GGG: «Неофициальный фанатский инструмент, не аффилирован с Grinding Gear Games. PoE2 и все ассеты © GGG.»
- Можно ship: картинки Exile-UI (MIT). Надо ре-деривить: данные квестов/маршрута (свои строки/схема). Нельзя: тексты/таблицы maxroll/mobalytics и значения poe2-helper.

## 8. Риски и заметки

- **Дрейф патчей:** названия квестов/наград/areaID меняются. Датасет тегируется патчем; есть валидация чисел.
- **Завершение квеста не автодетектится** — авто только «подсказка». Ожидания выставить честно.
- **Точную строку лога** проверить на живом `Client.txt` перед релизом (GGG иногда меняет формулировки).
- **Лейаут поворачивается/зеркалится** по инстансу — показываем как эталон.
- **Хот-линк raw.githubusercontent** может отвалиться → кэш + фолбэк + bundle Act 1.
- **Неподписанный установщик** → предупреждения SmartScreen, пока нет сертификата.
- **Эксклюзивный fullscreen** прячет оверлей → требуем Окно/Без рамки (подсказка при первом запуске).

## 9. Как проверять

- Фаза 1: запустить `npm run dev`, открыть PoE2 в Windowed-Borderless, убедиться, что окно поверх игры, клик проходит сквозь пустые места и ловится на панелях, хоткеи работают.
- Фаза 2: отметить квесты, переключить профиль, перезапустить — галочки сохранились (проверить `%APPDATA%/PoE2 Quest Overlay/progress/*.json`); открыть лейаут зоны Act 1.
- Данные: `npm run validate:data` (уникальные id, файлы лейаутов на месте, инварианты наград сходятся).
- Фаза 3: играя, войти в зону → оверлей подсвечивает её; ручная галочка не снимается авто-логикой.
- Фаза 5: собрать `npm run package`, поставить из NSIS, проверить запуск и запись в `%APPDATA%`.
