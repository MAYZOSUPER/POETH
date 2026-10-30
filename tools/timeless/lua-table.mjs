// Разбор литерала таблицы Lua (`return { ["id"] = "…", [1] = { … }, … }`) в объекты JS — для данных Path of
// Building (LegionPassives.lua, NodeIndexMapping.lua). Только данные: строки, числа, true/false/nil и вложенные
// таблицы; код Lua не исполняется. Ключи `[n]` дают объект с числовыми ключами (как в Lua), без перевода в массив.

export function parseLuaTable(src, start = src.indexOf('{')) {
  let i = start
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++
      if (src.startsWith('--', i)) {
        const nl = src.indexOf('\n', i)
        i = nl < 0 ? src.length : nl + 1
        continue
      }
      return
    }
  }
  const fail = (what) => {
    throw new Error(`lua-table: ${what} в позиции ${i}: ${JSON.stringify(src.slice(i, i + 40))}`)
  }
  function str() {
    const q = src[i++]
    let out = ''
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') {
        const c = src[i + 1]
        out += c === 'n' ? '\n' : c === 't' ? '\t' : c
        i += 2
      } else {
        out += src[i++]
      }
    }
    if (src[i] !== q) fail('нет конца строки')
    i++
    return out
  }
  function value() {
    ws()
    const c = src[i]
    if (c === '{') return table()
    if (c === '"' || c === "'") return str()
    const m = /^-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/.exec(src.slice(i, i + 40))
    if (m) {
      i += m[0].length
      return Number(m[0])
    }
    for (const [word, v] of [['true', true], ['false', false], ['nil', null]]) {
      if (src.startsWith(word, i)) {
        i += word.length
        return v
      }
    }
    return fail('неизвестное значение')
  }
  function table() {
    i++ // {
    const out = {}
    let auto = 1
    for (;;) {
      ws()
      if (src[i] === '}') {
        i++
        return out
      }
      let key
      if (src[i] === '[') {
        i++
        key = value()
        ws()
        if (src[i] !== ']') fail('ожидалась ]')
        i++
        ws()
        if (src[i] !== '=') fail('ожидалось =')
        i++
      } else {
        const m = /^[A-Za-z_]\w*\s*=/.exec(src.slice(i, i + 80))
        if (m) {
          key = m[0].replace(/\s*=$/, '')
          i += m[0].length
        } else {
          key = auto++
        }
      }
      out[key] = value()
      ws()
      if (src[i] === ',' || src[i] === ';') i++
    }
  }
  return value()
}

/**
 * NodeIndexMapping.lua PoB: строки вида `nodeIDList[6] = { index = 0, size = … }` и
 * `nodeIDList["localIdToGlobalId"][2][5] = 42` (присваивания, а не один литерал).
 */
export function parseNodeIndexMapping(src) {
  const index = new Map()
  let sizeNotable = null
  const localToGlobal = {}
  for (const line of src.split(/\r?\n/)) {
    let m = /^nodeIDList\[(\d+)\] = \{ index = (\d+), size = (\d+) \}/.exec(line)
    if (m) {
      index.set(Number(m[1]), Number(m[2]))
      continue
    }
    m = /^nodeIDList\["sizeNotable"\] = (\d+)/.exec(line)
    if (m) {
      sizeNotable = Number(m[1])
      continue
    }
    m = /^nodeIDList\["localIdToGlobalId"\]\[(\d+)\]\[(\d+)\] = (\d+)/.exec(line)
    if (m) (localToGlobal[m[1]] ??= {})[m[2]] = Number(m[3])
  }
  return { index, sizeNotable, localToGlobal }
}
