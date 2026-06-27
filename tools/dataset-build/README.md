# Dataset build pipeline

Generates the read-only dataset under `resources/data/` from open-licensed
community sources. We ship only the **derived factual dataset** (in our own
schema), never the upstream source files.

## Sources

Download these into `tools/dataset-build/sources/` (gitignored):

| File | From | Notes |
|---|---|---|
| `helper_zones.json` | [nicolasbagatello/poe2-helper](https://raw.githubusercontent.com/nicolasbagatello/poe2-helper/main/data/zones.json) | acts → zones → points_of_interest (reward/optional). Schema + facts reference. |
| `exile-ui-filelist.json` | [Lailloken/Exile-UI](https://github.com/Lailloken/Exile-UI) `img/GUI/act-decoder/file-list 2.json` | MIT layout image manifest, keyed by game areaID. |

```bash
# example fetch (PowerShell / bash with curl)
curl -L "https://raw.githubusercontent.com/nicolasbagatello/poe2-helper/main/data/zones.json" \
  -o tools/dataset-build/sources/helper_zones.json
curl -L "https://raw.githubusercontent.com/Lailloken/Exile-UI/main/img/GUI/act-decoder/file-list%202.json" \
  -o tools/dataset-build/sources/exile-ui-filelist.json
```

## Build

```bash
npm run build:data     # node tools/dataset-build/build.mjs
npm run validate:data  # sanity-check the output
```

Outputs: `resources/data/{index,dataset.meta,route,gems}.json`,
`resources/data/acts/act-*.json`, `resources/data/layouts/index.json`.

## How it works

1. Parse `helper_zones.json` → acts/zones/quests; classify each reward into our
   `RewardKind` (resistance / spirit / life / passive_point / weapon_set_point /
   uncut_gem / support_gem / …).
2. Mint our own stable ids: zone `aN-<slug>`, quest `act-Nq-<slug>`. **Quest ids
   are the persistence key** — keep them stable so saved progress survives data
   updates.
3. Map zones → Exile-UI areaID via `EXILE_UI_AREA` in `build.mjs` (Act 1 verified;
   other acts pending), then pull matching image filenames from the manifest into
   `layouts/index.json`.
4. Gem recommendations come from `gem-recs.mjs` (our own editorial content).
5. Layout images are pinned to a specific Exile-UI commit (`EXILE_UI_COMMIT`) and
   fetched/cached at runtime via the `poe2img://` protocol.

## Updating for a new patch

1. Refresh the two source files.
2. Bump `GAME_PATCH` and `EXILE_UI_COMMIT` in `build.mjs`.
3. Extend/fix `EXILE_UI_AREA` (zone → areaID) — the only manual glue per patch.
4. `npm run build:data && npm run validate:data`.

> ⚠️ Reward values should be validated against the live game. The current dataset
> is community-derived for patch 0.5 and may contain inaccuracies.
