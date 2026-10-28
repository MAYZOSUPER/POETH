# Attribution & Notices / Атрибуция

**POE Trade Helper (POETH)** is an unofficial, fan-made tool. It is **not affiliated
with, endorsed by, or sponsored by Grinding Gear Games**. Path of Exile, Path of Exile 2
and all related assets, names, and imagery are © Grinding Gear Games.

POETH — неофициальный фанатский инструмент, **не связан с Grinding Gear Games**.
Никаких авто-покупок, ботов и авто-whisper'ов: одно действие игрока = одно действие
приложения (правила GGG).

This project's own code is licensed under the [MIT License](LICENSE).
POETH is based on the author's earlier project *Exile Companion* (formerly *Act Compass*),
whose full history is kept in this repository.

## Third-party code & data (trade helper, PoE 1)

- **[Awakened PoE Trade](https://github.com/SnosMe/awakened-poe-trade)** — SnosMe, **MIT License**.
  Parts of its code (item parser, price-check filters/presets/pseudo stats, trade query
  builder, clipboard helper, chat/copy shortcuts, rate-limit header sync, whisper regexes)
  and its data (`data/{en,ru}/{stats,items}.ndjson`, `client_strings.js`) are **ported**
  to POETH with attribution: every ported file carries a header naming the source file
  and pinned commit (`3188208957`). Copyright (c) SnosMe and contributors.
- **[RePoE fork](https://github.com/repoe-fork/repoe-fork)** — open game data
  (`mods.min.json`, `stat_translations.min.json`, Russian translations) used to generate
  our own regex data.
- **[Better Trading](https://github.com/exile-center/better-trading)** — MIT License.
  Only the bookmark import/export **format** (`"3:"+base64(JSON)`) is supported; no code copied.
- **[ForbiddenTroveBlacklist](https://github.com/The-Forbidden-Trove/ForbiddenTroveBlacklist)** (PoE Hub) —
  MIT License. The trade blacklist (`blacklist.csv`) is downloaded at runtime for the trade manager
  and cached locally; it is not redistributed with POETH.
- **[PoE Overlay Community Fork](https://github.com/PoE-Overlay-Community/PoE-Overlay-Community-Fork)** —
  MIT License, Copyright (c) 2020 Nicklas Ronge. The **behaviour** of the in-game trade window is
  modelled on its built-in browser (v0.9.0: `src/app/core/service/browser.service.ts` — centred,
  `min(h·1.3, w·0.7) × 0.7·h`; `src/app/core/service/dialog/dialog-ref.service.ts` — Esc closes it;
  `main.ts` `create-browser-window`). No code is copied; POETH sizes it to the game window and keeps
  its own security rules (isolated session, no preload, navigation allowlist). Its whisper/hideout
  chat commands (clipboard + Enter + Ctrl+V) match what POETH already does via `typeInChat`.
- **[exile-leveling](https://github.com/HeartofPhos/exile-leveling)** — HeartofPhos, **MIT License**,
  Copyright (c) 2025 HeartofPhos. The PoE 1 leveling route (acts 1–10), areas, quests with gem rewards
  and class start gems (`common/data/json/*.json`, `common/data/routes/act-N.txt`, pinned commit
  `b7b2dd0`) are converted by `tools/leveling/build.mjs` into our own dataset
  `resources/data/poe1/leveling/leveling.json`; the route syntax handling follows its
  `common/src/route-processing`. Russian step texts are our own translation; Russian zone, quest and boss
  names are facts taken from [poedb.tw/ru](https://poedb.tw/ru).
- **poe.re is NOT used.** It has no license, so none of its code or data is copied;
  POETH's regex engine is implemented independently.
- **Native modules** (added in later stages): `electron-overlay-window`, `uiohook-napi`
  (both MIT), `ws` (MIT).

## Third-party data & assets (campaign tracker, PoE 2)

- **Map layout images** — [Lailloken/Exile-UI](https://github.com/Lailloken/Exile-UI)
  (Act-Decoder), MIT License. Layout images are loaded from the upstream
  repository (pinned commit) and cached locally; each image is credited in-app.
- **Quest / reward / zone facts** — cross-referenced from community resources
  including [nicolasbagatello/poe2-helper](https://github.com/nicolasbagatello/poe2-helper)
  and validated against publicly documented campaign reward tables. Only factual
  game data (boss names, reward values) is re-derived into this project's own
  schema; no upstream prose, tables, or proprietary content is redistributed.
- **Schema / approach references** —
  [HeartofPhos/exile-leveling](https://github.com/HeartofPhos/exile-leveling) (MIT),
  [Lechkolion/poe2-leveling-overlay](https://github.com/Lechkolion/poe2-leveling-overlay) (MIT).
- **Price-check (PoE 2) research references** — Exiled Exchange 2 (kvan7) and
  Awakened PoE Trade (SnosMe), both MIT.

Maxroll, Mobalytics, Exilence CE (CC BY-NC) and similar sites/tools are used only as
references; none of their text, code, images, or layouts are copied or redistributed.

If you are a rights holder and have a concern about attribution, please open an
issue.
