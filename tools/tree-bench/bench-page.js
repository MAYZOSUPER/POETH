// Страница стенда S38 (tools/tree-bench/bench.cjs): упрощённое игровое дерево пассивок на canvas.
// Координаты нод — своя формула (центр группы + радиус орбиты под углом места), не src/shared/build:
// стенд независимо сверяет проекцию наложения. Единицы — CSS-пиксели окна (при любом масштабе Windows
// «высота / 10000» в CSS-пикселях та же, что в физических).

const { ipcRenderer } = require('electron')
const fs = require('fs')

const q = new URLSearchParams(location.search)
const IMAGE = q.get('image') || ''
// зум как у игры (снимки S38): z от 1 до 5, щелчок — ±0,625 к z
const ZOOM_STEP = Number(q.get('zoomStep') || 0.625)
const CLASS_ID = Number(q.get('classId') || 3)
const STAGE = new Set((q.get('nodes') || '').split(',').filter(Boolean).map(Number))
const TITLE = q.get('title') || ''

const raw = JSON.parse(fs.readFileSync(q.get('tree'), 'utf8'))
const radii = raw.constants.orbitRadii
const per = raw.constants.skillsPerOrbit

// места на орбитах по 16 и 40 нод — не равномерно (как в данных GGG skilltree-export)
const A16 = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]
const ANG40 = [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350]

function angle(n, i) {
  if (n === 16) return A16[i] ?? 0
  if (n === 40) return ANG40[i] ?? 0
  return n > 0 ? (360 * i) / n : 0
}

/** hash → {x, y, kind, asc, links} — только основное дерево. */
const nodes = new Map()
for (const [key, t] of Object.entries(raw.nodes)) {
  const extra = typeof t[10] === 'object' && t[10] ? t[10] : {}
  if (extra.a) continue // восхождения в игре — отдельное окно
  const g = raw.groups[String(t[6])]
  if (!g) continue
  const r = radii[t[7]] ?? 0
  const a = (angle(per[t[7]] ?? 0, t[8]) * Math.PI) / 180
  nodes.set(Number(key), { x: g[0] + Math.sin(a) * r, y: g[1] - Math.cos(a) * r, kind: t[2], links: t[9] })
}
const startHash = raw.classes[CLASS_ID]?.start
const start = nodes.get(startHash)

const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
const info = document.getElementById('info')
const img = IMAGE ? new Image() : null
if (img) {
  img.src = 'file:///' + IMAGE.replace(/\\/g, '/')
  img.onload = () => draw()
}

const minScale = () => innerHeight / 10000
let view = { scale: 0, ox: 0, oy: 0 }

function reset() {
  // как после входа: круг класса в центре, z = 2
  const s = minScale() * 2
  view = { scale: s, ox: innerWidth / 2 - start.x * s, oy: innerHeight / 2 - start.y * s }
}

const scr = (p) => ({ x: p.x * view.scale + view.ox, y: p.y * view.scale + view.oy })

function draw() {
  const dpr = devicePixelRatio || 1
  canvas.width = Math.round(innerWidth * dpr)
  canvas.height = Math.round(innerHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#07090b'
  ctx.fillRect(0, 0, innerWidth, innerHeight)
  if (img) {
    if (img.complete) ctx.drawImage(img, 0, 0, innerWidth, innerHeight)
    info.textContent = `картинка ${IMAGE}`
    return
  }
  const s = view.scale
  // рёбра
  for (const [h, n] of nodes) {
    for (const o of n.links) {
      const m = nodes.get(o)
      if (!m || n.kind === 5 || m.kind === 5 || n.kind === 3 || m.kind === 3) continue
      const both = STAGE.has(h) && STAGE.has(o)
      ctx.strokeStyle = both ? '#c9a24a' : '#2a2a28'
      ctx.lineWidth = both ? 3 : 1.5
      const a = scr(n)
      const b = scr(m)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }
  // ноды: 0 обычная, 1 нотабль, 2 кейстоун, 3 мастерство, 4 гнездо, 5 круг класса
  const R = [40, 60, 100, 80, 60, 200, 40]
  for (const [h, n] of nodes) {
    const p = scr(n)
    if (p.x < -50 || p.y < -50 || p.x > innerWidth + 50 || p.y > innerHeight + 50) continue
    const r = Math.max(1.5, R[n.kind] * s)
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    if (n.kind === 5) {
      ctx.strokeStyle = h === startHash ? '#e8d6a0' : '#3a3630'
      ctx.lineWidth = 2
      ctx.stroke()
    } else {
      ctx.fillStyle = STAGE.has(h) ? '#f0c35a' : '#4a4740'
      ctx.fill()
    }
  }
  info.textContent = `стенд S38 · ${TITLE} · масштаб ${s.toFixed(4)} (до упора ${minScale().toFixed(4)}) · ЛКМ — тянуть, колесо — зум`
}

function zoomAt(steps, x, y) {
  const z = Math.max(1, Math.min(5, view.scale / minScale() + steps * ZOOM_STEP))
  const next = minScale() * z
  const k = next / view.scale
  view = { scale: next, ox: x - (x - view.ox) * k, oy: y - (y - view.oy) * k }
  draw()
}

let drag = null
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) drag = { x: e.clientX, y: e.clientY }
})
addEventListener('mousemove', (e) => {
  if (!drag) return
  view.ox += e.clientX - drag.x
  view.oy += e.clientY - drag.y
  drag = { x: e.clientX, y: e.clientY }
  draw()
})
addEventListener('mouseup', () => (drag = null))
canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY)
})
addEventListener('resize', () => {
  reset()
  draw()
})

function state() {
  const pts = []
  for (const h of [startHash, ...STAGE]) {
    const n = nodes.get(h)
    if (n) pts.push({ hash: h, ...scr(n) })
  }
  return { view, dpr: devicePixelRatio, inner: { width: innerWidth, height: innerHeight }, points: pts }
}

ipcRenderer.on('cmd', (_e, msg) => {
  if (msg.cmd === 'pan') {
    view.ox += Number(msg.dx) || 0
    view.oy += Number(msg.dy) || 0
    draw()
  } else if (msg.cmd === 'zoom') {
    zoomAt(Number(msg.steps) || 0, Number(msg.x ?? innerWidth / 2), Number(msg.y ?? innerHeight / 2))
  } else if (msg.cmd === 'reset') {
    reset()
    draw()
  }
  ipcRenderer.send('reply', { id: msg.id, value: state() })
})

reset()
draw()
