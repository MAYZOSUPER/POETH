# POETH — снимок цен уников (ветка `prices`)

Только данные для вкладки «Обмен → Предметы» POETH: цены уников PoE 1 из poe.ninja, раз в час.
К poe.ninja обращается GitHub Actions этого репозитория, а не приложение у каждого игрока
(poe.ninja просит десктоп-приложения ходить через свой бэкенд: https://poe.ninja/docs/api).

Цены — оценка poe.ninja (https://poe.ninja), не финансовый совет. poe.ninja не связан с Grinding Gear Games.
Ветка перезаписывается каждый час одним коммитом (история не хранится). Не редактировать вручную:
собирает `.github/workflows/data.yml` (`tools/data/ninja-snapshot.mjs` + `tools/data/push-prices-branch.mjs`).

Снимок: 2026-10-31T15:21:30.997Z · лиги: Allflame, Hardcore Allflame, Standard, Hardcore.
