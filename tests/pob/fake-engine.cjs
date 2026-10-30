// Заглушка движка PoB для тестов (S44): тот же протокол, что у resources/pob/server.lua, на node.
// Режим — первым аргументом: ok (обычный), noready (не пишет строку готовности), badready, slow (старт 300 мс).
// Поведение запроса — по полю item compare: "crash" — выйти, "hang" — молчать, "noise" — мусор в stdout перед
// ответом, "huge" — строка без перевода строки больше предела, "wrongid" — ответ с чужим id.
const mode = process.argv[2] || 'ok'
const out = (o) => process.stdout.write('@poeth ' + JSON.stringify(o) + '\n')

if (mode === 'noready') {
  setInterval(() => undefined, 1000)
} else {
  setTimeout(
    () => {
      if (mode === 'badready') out({ ready: true, tree: 'bad tree' })
      else out({ ready: true, tree: '3_29', ms: 12, mem: 1024 })
    },
    mode === 'slow' ? 300 : 0
  )
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    let req
    try {
      req = JSON.parse(line)
    } catch {
      out({ ok: false, error: 'bad-input', detail: 'json' })
      continue
    }
    if (req.cmd === 'quit') {
      out({ id: req.id, ok: true })
      process.exit(0)
    }
    if (req.cmd === 'ping') {
      out({ id: req.id, ok: true, mem: 2048, pid: process.pid })
      continue
    }
    if (req.cmd === 'compare') {
      if (req.item === 'crash') process.exit(7)
      if (req.item === 'hang') continue
      if (req.item === 'huge') {
        process.stdout.write('x'.repeat(600 * 1024))
        continue
      }
      if (req.item === 'noise') process.stdout.write('Loading passive tree data...\n{"id":' + req.id + ',"ok":true}\n@poeth not json\n')
      const id = req.item === 'wrongid' ? req.id + 1000 : req.id
      const results = (req.options || []).map((o, i) => ({ ok: true, new: { CombinedDPS: 1000 + i * 100, TotalEHP: 5000, Life: 1200, FireResist: 75 } }))
      out({
        id,
        ok: true,
        base: { CombinedDPS: 1000, TotalEHP: 5000, Life: 1200, FireResist: 75 },
        results,
        item: { base: 'Unset Ring', rarity: 'RARE', reqLevel: 48, level: 60, unsupported: [] },
        echo: { xmlLength: (req.xml || '').length, nonAscii: /[^\x00-\x7f]/.test(line) }
      })
      continue
    }
    out({ id: req.id, ok: false, error: 'bad-input', detail: 'cmd' })
  }
})
