// Точка входа бандла для сайта (ST3): site/starters/starters-core.js собирает tools/starters/build-site.mjs —
// тот же строгий валидатор, та же загрузка списка (текущая лига → прошлая до анонса) и те же знаки, фильтры и
// сортировки, что во вкладке «Билд» (никаких копий). На странице — глобальный объект POETHStarters.
// Файлы списка сайт берёт из site/starters/data/ — это копии resources/data/poe1/starters (build-site.mjs).

export { STARTERS_INDEX, STARTER_BUDGETS, STARTER_CLASSES } from './schema'
export { findStarter, loadStarters } from './load'
export { NO_FILTERS, ascendanciesOf, classesOf, filterStarters, picksOf, sortStarters, starterBadges, toCard } from './view'
