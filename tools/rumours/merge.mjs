// Слияние строк игры с нашим файлом слухов (S65; чистый модуль, tests/rumours/tool.test.ts).
// Из игры обновляем: текст слуха EN/RU, остров, категорию, боссов, у наград-предметов — путь метаданных и RU-имя.
// Наше не трогаем: награды, опасности, сложность, тир, строка, «проверено». Запись узнаём по острову (area):
// если GGG поправит строку слуха, наш тир останется при острове. Новый остров — запись без оценки (её видно,
// тир «ещё не оценили»); остров пропал из игры — запись уходит, в отчёте это видно.

/** @typedef {{ area: string, text: {en: string, ru: string|null}, island: {en: string, ru: string|null}, category: string, bosses: {en: string, ru: string|null}[] }} GameRow */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * @param {object|null} current  файл слухов (как в JSON) или null — создаём новый
 * @param {{ patch: string, rows: GameRow[], items: Map<string, {meta: string, ru: string|null}> }} game
 * @param {string} today  YYYY-MM-DD
 * @param {(en: string) => string} idOf  id из английской строки (rumourIdOf из схемы)
 */
export function mergeGameRumours(current, game, today, idOf) {
  const report = { added: [], removed: [], changed: [], noRu: [], itemsMissing: [] }
  const old = new Map((current?.rumours ?? []).map((r) => [r.area, r]))
  const ids = new Set()
  const rumours = []
  for (const row of game.rows) {
    const prev = old.get(row.area)
    let id = prev?.id ?? idOf(row.text.en)
    for (let n = 2; ids.has(id); n++) id = `${idOf(row.text.en)}-${n}`
    ids.add(id)
    const rec = prev
      ? { ...prev }
      : { id, area: row.area, rewards: [], risks: [], difficulty: null, tier: null, note: null, checked: null }
    rec.id = id
    rec.text = { en: row.text.en, ru: row.text.ru ?? null }
    rec.island = { en: row.island.en, ru: row.island.ru ?? null }
    rec.category = row.category
    rec.bosses = row.bosses.map((b) => ({ en: b.en, ru: b.ru ?? null }))
    rec.rewards = (rec.rewards ?? []).map((rw) => {
      if (!rw.item) return rw
      const it = game.items.get(rw.item.ref)
      if (!it) {
        report.itemsMissing.push(`${id}: ${rw.item.ref}`)
        return rw
      }
      return { item: { ...rw.item, meta: it.meta, name: { en: rw.item.ref, ru: it.ru ?? null } } }
    })
    if (!prev) report.added.push(`${id} — ${row.text.en} → ${row.island.en}`)
    else {
      for (const k of ['text', 'island', 'category', 'bosses']) {
        if (!same(prev[k], rec[k])) report.changed.push(`${id}.${k}: ${JSON.stringify(prev[k])} → ${JSON.stringify(rec[k])}`)
      }
    }
    if (!rec.text.ru) report.noRu.push(`${id} — ${rec.text.en}`)
    rumours.push(orderKeys(rec))
  }
  const areas = new Set(game.rows.map((r) => r.area))
  for (const r of current?.rumours ?? []) if (!areas.has(r.area)) report.removed.push(`${r.id} — ${r.text?.en} (${r.area})`)

  const next = { schema: 1, patch: game.patch, updatedAt: current?.updatedAt ?? today, rumours }
  const changed = !current || current.patch !== game.patch || !same(current.rumours, rumours)
  if (changed) next.updatedAt = today
  return { file: next, report, changed }
}

const KEYS = ['id', 'area', 'text', 'island', 'category', 'bosses', 'rewards', 'risks', 'difficulty', 'tier', 'note', 'checked']

/** Поля записи в одном порядке — чтобы дифф файла после пересборки был только по сути. */
function orderKeys(rec) {
  const out = {}
  for (const k of KEYS) if (k in rec) out[k] = rec[k]
  for (const k of Object.keys(rec)) if (!(k in out)) out[k] = rec[k]
  return out
}

/** Английские имена наград-предметов из файла: для них генератор достаёт путь метаданных и RU-имя. */
export function rewardItemNames(file) {
  const names = new Set()
  for (const r of file?.rumours ?? []) for (const rw of r.rewards ?? []) if (rw.item?.ref) names.add(rw.item.ref)
  return [...names]
}
