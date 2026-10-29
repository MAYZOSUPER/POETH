// Текст статов по stat id и значениям — как описания статов игры (переводы RePoE fork, stat_translations).
// Для пассивок игра сначала ищет в passive_skill_stat_descriptions, потом в общих — так же и здесь:
// makeTranslator([passive_skill, stat_translations]).
//
// Проверка: EN-текст, собранный здесь, сравнивается с официальным текстом skilltree-export (tree.mjs
// печатает расхождения) — тогда и RU, собранный тем же способом, совпадает с игрой.

const HANDLERS = {
  negate: (v) => -v,
  double: (v) => v * 2,
  negate_and_double: (v) => -v * 2,
  times_twenty: (v) => v * 20,
  times_one_point_five: (v) => v * 1.5,
  plus_two_hundred: (v) => v + 200,
  '30%_of_value': (v) => v * 0.3,
  '60%_of_value': (v) => v * 0.6,
  per_minute_to_per_second: (v) => round(v / 60, 1),
  per_minute_to_per_second_0dp: (v) => round(v / 60, 0),
  per_minute_to_per_second_1dp: (v) => round(v / 60, 1),
  per_minute_to_per_second_2dp: (v) => round(v / 60, 2),
  per_minute_to_per_second_2dp_if_required: (v) => round(v / 60, 2),
  'permyriad_per_minute_to_%_per_second': (v) => round(v / 6000, 2),
  milliseconds_to_seconds: (v) => round(v / 1000, 2),
  milliseconds_to_seconds_0dp: (v) => round(v / 1000, 0),
  milliseconds_to_seconds_1dp: (v) => round(v / 1000, 1),
  milliseconds_to_seconds_2dp: (v) => round(v / 1000, 2),
  milliseconds_to_seconds_2dp_if_required: (v) => round(v / 1000, 2),
  deciseconds_to_seconds: (v) => round(v / 10, 2),
  divide_by_one_hundred: (v) => round(v / 100, 2),
  divide_by_one_hundred_2dp: (v) => round(v / 100, 2),
  divide_by_one_hundred_2dp_if_required: (v) => round(v / 100, 2),
  divide_by_one_hundred_and_negate: (v) => -round(v / 100, 2),
  divide_by_one_thousand: (v) => round(v / 1000, 2),
  divide_by_two_0dp: (v) => round(v / 2, 0),
  divide_by_three: (v) => round(v / 3, 2),
  divide_by_four: (v) => round(v / 4, 2),
  divide_by_five: (v) => round(v / 5, 2),
  divide_by_six: (v) => round(v / 6, 2),
  divide_by_ten_0dp: (v) => round(v / 10, 0),
  divide_by_ten_1dp: (v) => round(v / 10, 1),
  divide_by_ten_1dp_if_required: (v) => round(v / 10, 1),
  divide_by_twelve: (v) => round(v / 12, 2),
  divide_by_fifteen_0dp: (v) => round(v / 15, 0),
  divide_by_twenty: (v) => round(v / 20, 2),
  divide_by_twenty_then_double_0dp: (v) => round(v / 20, 0) * 2,
  locations_to_metres: (v) => round(v / 10, 1),
  old_leech_percent: (v) => round(v / 5, 2),
  old_leech_permyriad: (v) => round(v / 50, 2),
  multiplicative_damage_modifier: (v) => v + 100,
  canonical_stat: (v) => v
}

function round(v, dp) {
  const k = 10 ** dp
  return Math.round(v * k) / k
}

function conditionOk(cond, v) {
  if (!cond) return true
  let ok = true
  if (cond.min !== null && cond.min !== undefined && v < cond.min) ok = false
  if (cond.max !== null && cond.max !== undefined && v > cond.max) ok = false
  return cond.negated ? !ok : ok
}

/** Строка варианта перевода со значениями; null — обработчик неизвестен (такой стат не переводим). */
function render(variant, vals, unknown) {
  let bad = false
  let s = variant.string.replace(/\{(\d+)(?::[^}]*)?\}/g, (_, idx) => {
    const i = Number(idx)
    const fmt = variant.format[i] ?? '#'
    if (fmt === 'ignore') return ''
    let v = vals[i] ?? 0
    for (const h of variant.index_handlers[i] ?? []) {
      const fn = HANDLERS[h]
      if (!fn) {
        unknown.add(h)
        bad = true
        return ''
      }
      v = fn(v)
    }
    return (fmt === '+#' && v >= 0 ? '+' : '') + String(v)
  })
  if (bad) return null
  // разметка игры: [Ключ|Текст] → Текст, [Текст] → Текст
  s = s.replace(/\[([^\]|]*)\|([^\]]*)\]/g, '$2').replace(/\[([^\]]*)\]/g, '$1')
  return s
}

/**
 * Переводчик по спискам stat_translations (первый — приоритетный, как файлы описаний статов игры). Запись
 * RU берётся из RU-списка с тем же номером и тем же набором ids. Скрытые записи (hidden) игра не
 * показывает — пропускаем, стат ищется в следующем списке.
 */
export function makeTranslator(enLists, ruLists) {
  const byStat = new Map()
  enLists.forEach((list, i) => {
    const ruByIds = new Map()
    for (const t of ruLists[i] ?? []) if (t.Russian?.length) ruByIds.set(t.ids.join('|'), t.Russian)
    for (const t of list) {
      if (!t.English?.length || t.hidden) continue
      const entry = { ids: t.ids, English: t.English, Russian: ruByIds.get(t.ids.join('|')) ?? null }
      for (const id of t.ids) {
        if (!byStat.has(id)) byStat.set(id, [])
        byStat.get(id).push(entry)
      }
    }
  })
  const unknown = new Set()

  /**
   * Статы ноды {id: value} → строки [{en, ru, ids}] в порядке статов ноды. Скрытые статы (нет перевода
   * или все значения «ignore») пропускаются.
   */
  function lines(stats) {
    const present = new Map(Object.entries(stats))
    const used = new Set()
    const out = []
    for (const id of present.keys()) {
      if (used.has(id)) continue
      let best = null
      let bestScore = -1
      for (const t of byStat.get(id) ?? []) {
        const sc = t.ids.filter((x) => present.has(x)).length * 100 - t.ids.length
        if (sc > bestScore) {
          bestScore = sc
          best = t
        }
      }
      if (!best) continue
      for (const x of best.ids) used.add(x)
      const vals = best.ids.map((x) => present.get(x) ?? 0)
      const vEn = best.English.find((v) => v.condition.every((c, i) => conditionOk(c, vals[i])))
      if (!vEn) continue
      const en = render(vEn, vals, unknown)
      if (!en || !en.trim()) continue
      const vRu = best.Russian?.find((v) => v.condition.every((c, i) => conditionOk(c, vals[i])))
      const ru = vRu ? render(vRu, vals, unknown) : null
      out.push({ en, ru: ru && ru.trim() ? ru : null, ids: best.ids.filter((x) => present.has(x)) })
    }
    return out
  }

  return { lines, unknown }
}
