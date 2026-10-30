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
  `common/src/route-processing`. Russian step texts are our own translation. Zone, quest, boss, NPC and
  item names (EN and RU) are facts read by `tools/leveling/game-names.mjs` from the PoE 1 client tables
  exported by [repoe-fork/dat-export](https://github.com/repoe-fork/dat-export) (pinned commit; names only).
- **Passive skill tree data** — [grindinggear/skilltree-export](https://github.com/grindinggear/skilltree-export),
  the official Path of Exile data export by Grinding Gear Games (tag `3.29.1`, pinned commit). POETH is not
  affiliated with or endorsed by Grinding Gear Games. `tools/build-data/tree.mjs` reduces it to node ids, names,
  stat texts, groups and orbits in `resources/data/poe1/build/tree.json`; no sprites or images are used.
  Russian node names, string ids, stat ids and stat translations come from the
  **[RePoE fork](https://github.com/repoe-fork/repoe-fork)** (MIT; pinned commit of repoe-fork.github.io), mastery
  effects and ascendancy names — from the PoE 1 client tables exported by
  [repoe-fork/dat-export](https://github.com/repoe-fork/dat-export) (pinned commit; facts only).
- **Gem data** (`resources/data/poe1/build/gems.json`, `tools/build-data/gems.mjs`) — RePoE fork (MIT): names,
  transfigured variants, level requirements; gem variant ids from the client tables (dat-export). Gem keys follow
  the format of [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding)
  (MIT, Copyright (c) 2016 David Gowor; only the id convention, no code or data copied). Where to get a gem
  (quest rewards and vendors by class) — from our exile-leveling dataset above.
- **[Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding)** — **MIT License**,
  Copyright (c) 2016 David Gowor. The «Build» tab reads PoB build codes with its own parser (`src/shared/pob/`); no
  PoB code is copied. Knowledge of the format comes from PoB: the code is base64url(zlib(XML)) (`ImportTab.lua`),
  XML sections and attributes (`Build.lua`, `PassiveSpec.lua`, `SkillsTab.lua`, `ItemsTab.lua`), equipment slot names,
  the `resistancePenalty` option (`ConfigOptions.lua`) and the list of build-sharing sites with their raw-code URLs
  (`src/Modules/BuildSiteTools.lua`). The MIT test build `spec/TestBuilds/3.13/OccVortex.xml` is used as a test fixture.
  **Since v0.2b (beta «Exact calculation (PoB)», S44) POETH ships an unmodified, trimmed copy of PoB** — its Lua code
  and data only (`src/Modules`, `src/Classes`, `src/Data` without timeless jewel archives, the current passive tree
  `tree.lua`/`sprites.lua`, `HeadlessWrapper.lua`, `Launch.lua`, `GameVersions.lua`, `runtime/lua` without `socket.lua`;
  no images, executables or DLLs) — in `resources/pob-engine/pob/` together with PoB's `LICENSE.md` (which also lists the
  licenses of the Lua libraries PoB bundles: dkjson, xml, base64, sha1, sha2). Pinned tag and commit, SHA-256 of the
  file set: `tools/pob/pins.json`. It runs headless in a separate local process via our own `resources/pob/server.lua`
  (written from scratch; no code from PoE Upgrade Checker, which is GPL).
- **Timeless jewel outcomes** (`resources/data/poe1/build/timeless*.{json,bin}`, `tools/timeless/build.mjs`, S45) — derived
  from the lookup tables of Path of Building Community (`src/Data/TimelessJewelData`, pinned commit `3dbca44`, files checked
  by SHA-256), **MIT License**, Copyright (c) 2016 David Gowor; the license text ships next to the data
  (`timeless-LICENSE.txt`). Outcome texts EN/RU — RePoE fork (MIT) stat translations; Russian names of replaced notables —
  PoE 1 client tables (facts only). No PoB code is used. The [Timeless Jewels calculator by Vilsol](https://github.com/Vilsol/timeless-jewels)
  (GPL-3.0) is only linked to and used as a source of reference numbers in tests; none of its code is copied.
- **[LuaJIT](https://github.com/LuaJIT/LuaJIT)** — **MIT License**, Copyright (C) 2005-2026 Mike Pall. `luajit.exe` in
  `resources/pob-engine/bin/` is built by `tools/pob/prepare.mjs` from the pinned source commit (`tools/pob/pins.json`,
  `msvcbuild.bat static`); its `COPYRIGHT` file ships next to it as `COPYRIGHT-LuaJIT.txt`.
- **[Piety](https://github.com/sethryder/piety)** — **MIT License**, Copyright (c) 2026 Seth Ryder. The idea of matching
  PoB tree/gem/item sets to leveling stages by their titles («Act N», «Level N», «Early Maps», «Endgame») and the table
  of typical character levels at the end of acts 1–10 (`src/shared/trees.ts`) are reimplemented in
  `src/shared/pob/stages.ts`.
- **Public PoB builds as test data** — `tests/fixtures/pob/` holds a few build codes that their authors shared publicly
  (pobb.in, pob.codes, pastebin, poedb, PoB's own tests; no content from guide sites); sources are listed in
  `tests/fixtures/pob/README.md`. Character import data (`<Import>`) is removed. They are used only by unit tests and
  are not shipped with the app.
- **[tesseract.js-core](https://github.com/naptha/tesseract.js-core)** 6.1.2 — **Apache License 2.0**
  (Tesseract OCR compiled to WebAssembly). The unmodified `tesseract-core-simd-lstm.{js,wasm}` and the
  `eng.traineddata` model (`4.0.0_best_int` from [tessdata](https://github.com/naptha/tessdata), based on
  [tessdata_best](https://github.com/tesseract-ocr/tessdata_best), Apache 2.0) ship in `resources/ocr/`
  with the license text. They read the digits of the in-game «Ratio / Stock» list on the player's PC only
  (hotkey, no network); files are checked by SHA-256 before loading.
- **poe.re is NOT used.** It has no license, so none of its code or data is copied;
  POETH's regex engine is implemented independently.
- **Native modules** (added in later stages): `electron-overlay-window`, `uiohook-napi`
  (both MIT), `ws` (MIT).

## Third-party data & assets (campaign tracker, PoE 2)

- **Map layout images** — [Lailloken/Exile-UI](https://github.com/Lailloken/Exile-UI)
  (Act-Decoder), MIT License. Layout images are loaded from the upstream
  repository (pinned commit) and cached locally; each image is credited in-app.
  The passive-tree overlay (PoE 1 "Build" tab) follows Exile-UI's approach of drawing
  a PoB tree over the in-game one (scale = window height / 10000 with the tree fully
  zoomed out, class start as the anchor); no Exile-UI code is used.
- **Quest / reward / zone facts** — cross-referenced from community resources
  including [nicolasbagatello/poe2-helper](https://github.com/nicolasbagatello/poe2-helper)
  and validated against publicly documented campaign reward tables. Only factual
  game data (boss names, reward values) is re-derived into this project's own
  schema; no upstream prose, tables, or proprietary content is redistributed.
- **Schema / approach references** —
  [HeartofPhos/exile-leveling](https://github.com/HeartofPhos/exile-leveling) (MIT),
  [Lechkolion/poe2-leveling-overlay](https://github.com/Lechkolion/poe2-leveling-overlay) (MIT).

## Third-party code & data (trade helper, PoE 2)

- **[Exiled Exchange 2](https://github.com/Kvan7/Exiled-Exchange-2)** — Kvan7, **MIT License**
  (a fork of Awakened PoE Trade; Copyright (c) 2020 Alexander Drozdov and contributors). Parts of its
  code (PoE 2 item parser, price-check filters/presets/pseudo stats, trade2 query builder) are **ported**
  to POETH (`src/shared/poe2/**`) with attribution: every ported file carries a header naming the source
  file and pinned commit (`cca30662bf`). Its data (`renderer/public/data/{en,ru}/{stats,items}.ndjson`,
  `client_strings.js`) is synced by `tools/data/sync-ee2-data.mjs` into `resources/data/poe2/{en,ru}`
  (pin and SHA-256 of every file in `resources/data/poe2/data.meta.json`).
- **Test fixtures (PoE 2)** — English item texts from Exiled Exchange 2's tests
  (`renderer/specs/Parser/items.ts`, MIT) and, where noted in `tests/fixtures/poe2/README.md`,
  [Sidekick](https://github.com/Sidekick-Poe/Sidekick) tests (MIT). Russian fixtures are generated from
  them with the Exiled Exchange 2 data; Russian item class names are facts from the PoE 2 client tables
  ([LocalIdentity/poe2-data](https://github.com/LocalIdentity/poe2-data), pinned commit `6a49dbd`, names only).
  Sidekick fixtures are pinned to `4ee98ca`. Test data only, not shipped.

Maxroll, Mobalytics, Exilence CE (CC BY-NC) and similar sites/tools are used only as
references; none of their text, code, images, or layouts are copied or redistributed.

If you are a rights holder and have a concern about attribution, please open an
issue.
