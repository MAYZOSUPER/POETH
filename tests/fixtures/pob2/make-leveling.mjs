// Фикстура «билд PoE 2 с этапами прокачки» (S66) из настоящего кода tests/fixtures/pob/poe2-pobbin-amazon.txt.
//
//   node tests/fixtures/pob2/make-leveling.mjs
//
// Публичного кода PoB2 с деревьями по актам в источниках фикстур (pobb.in и т. п. из тем форума GGG) не нашлось —
// собираем этапы сами, детерминированно: ноды автора в порядке взятия от стартовой ноды класса (по связям дерева
// resources/data/poe2/build/tree.json), первые 14 — «Act 1», первые 45 и 4 ноды восхождения — «Act 3»,
// все — «Endgame»; наборы камней «Act 1» (две первые группы, по две поддержки) и «Endgame» (как у автора);
// наборы предметов «Act 1» (оружие и нагрудник автора) и «Endgame». Итог — код PoB (base64url от zlib XML).
// Пишет tests/fixtures/pob2/leveling-amazon.txt. Только для тестов, в сборку не попадает.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')

const code = readFileSync(path.join(ROOT, 'tests/fixtures/pob/poe2-pobbin-amazon.txt'), 'utf8').trim()
let xml = zlib.inflateSync(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString('utf8')

const tree = JSON.parse(readFileSync(path.join(ROOT, 'resources/data/poe2/build/tree.json'), 'utf8'))
const near = new Map()
const flags = new Map()
const asc = new Map()
for (const [h, , , f, a, n] of tree.nodes) {
  flags.set(h, f)
  asc.set(h, a)
  near.set(h, near.get(h) ?? [])
  for (const x of n) {
    near.get(h).push(x)
    near.set(x, [...(near.get(x) ?? []), h])
  }
}

const spec = /<Spec [^>]*>[\s\S]*?<\/Spec>/.exec(xml)[0]
const attr = (s, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(s)?.[1]
const nodes = attr(spec, 'nodes').split(',').map(Number)
const classId = Number(attr(spec, 'classId'))
const want = new Set(nodes)

function bfs(seed, filter) {
  const out = []
  const seen = new Set([seed])
  const q = [seed]
  while (q.length) {
    const h = q.shift()
    for (const n of [...(near.get(h) ?? [])].sort((a, b) => a - b)) {
      if (seen.has(n) || !want.has(n) || !filter(n)) continue
      seen.add(n)
      out.push(n)
      q.push(n)
    }
  }
  return out
}
const start = tree.starts.find((s) => s[0] === classId)[1]
const mainOrder = bfs(start, (h) => !asc.get(h))
const ascStart = tree.nodes.find((n) => n[3] & 16 && n[4] === attr(spec, 'ascendancyInternalId'))[0]
const ascOrder = bfs(ascStart, (h) => asc.get(h) === attr(spec, 'ascendancyInternalId'))

function stageSpec(title, keep, withWeaponSets) {
  const k = new Set(keep)
  let s = spec.replace(/\snodes="[^"]*"/, ` nodes="${keep.join(',')}"`).replace('<Spec ', `<Spec title="${title}" `)
  s = s.replace(/<URL>[\s\S]*?<\/URL>\s*/, '')
  if (!withWeaponSets) s = s.replace(/<WeaponSet\d nodes="[^"]*"\/>\s*/g, '')
  s = s.replace(/(strNodes|dexNodes|intNodes)="([^"]*)"/g, (_, n, v) => `${n}="${v.split(',').filter((x) => k.has(Number(x))).join(',')}"`)
  return s
}
const specs = [
  stageSpec('Act 1', mainOrder.slice(0, 14), false),
  stageSpec('Act 3', [...mainOrder.slice(0, 45), ...ascOrder.slice(0, 4)], false),
  stageSpec('Endgame', nodes, true)
]
xml = xml.replace(/<Tree activeSpec="\d+">[\s\S]*?<\/Tree>/, `<Tree activeSpec="3">\n\t\t${specs.join('\n\t\t')}\n\t</Tree>`)

// камни: «Act 1» — две первые группы с камнем умения (по две поддержки), «Endgame» — набор автора
const skillSet = /<SkillSet id="1"[^>]*>([\s\S]*?)<\/SkillSet>/.exec(xml)
const groups = skillSet[1].match(/<Skill [^>]*>[\s\S]*?<\/Skill>/g)
const early = groups
  .filter((g) => !/source=/.test(g) && !/PlayerDefault/.test(g))
  .slice(0, 2)
  .map((g) => {
    let n = 0
    return g.replace(/<Gem [^>]*\/>\s*/g, (gem) => (/SupportGem/.test(gem) ? (n++ < 2 ? gem : '') : gem))
  })
xml = xml.replace(
  skillSet[0],
  `<SkillSet id="1" title="Act 1">\n\t\t\t${early.join('\n\t\t\t')}\n\t\t</SkillSet>\n\t\t<SkillSet id="2" title="Endgame">${skillSet[1]}</SkillSet>`
)
xml = xml.replace(/<Skills ([^>]*)activeSkillSet="1"/, '<Skills $1activeSkillSet="2"')

// предметы: «Act 1» — оружие и нагрудник автора, «Endgame» — набор автора
const itemSet = /<ItemSet id="1"[^>]*>([\s\S]*?)<\/ItemSet>/.exec(xml)
const keepSlots = (itemSet[1].match(/<Slot [^>]*\/>/g) ?? []).filter((s) => /name="(?:Weapon 1|Body Armour)"/.test(s))
xml = xml.replace(
  itemSet[0],
  `<ItemSet id="1" useSecondWeaponSet="false" title="Act 1">\n\t\t\t${keepSlots.join('\n\t\t\t')}\n\t\t</ItemSet>\n\t\t<ItemSet id="2" useSecondWeaponSet="false" title="Endgame">${itemSet[1]}</ItemSet>`
)
xml = xml.replace(/<Items ([^>]*)activeItemSet="1"/, '<Items $1activeItemSet="2"')

const out = zlib.deflateSync(Buffer.from(xml, 'utf8'), { level: 9 }).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
writeFileSync(path.join(HERE, 'leveling-amazon.txt'), out)
console.log(`leveling-amazon.txt: ${out.length} символов, ноды Act 1 ${14}, Act 3 ${45 + Math.min(4, ascOrder.length)}, Endgame ${nodes.length}`)
