// @ts-check
// Движок Path of Building (PoE 1) для «Точного расчёта (PoB)» в блоке «Против надетого» (S44): урезанный PoB
// (только Lua и данные, без картинок) + LuaJIT, собранный из исходника. Всё — по закреплённым коммитам
// (tools/pob/pins.json) с проверкой SHA-256 набора файлов. Результат — vendor/pob-engine/ (в git не идёт),
// electron-builder кладёт его в resources/pob-engine (electron-builder.yml → extraResources).
//
//   node tools/pob/prepare.mjs              # скачать по пинам, проверить SHA-256, собрать LuaJIT (MSVC), собрать vendor/
//   node tools/pob/prepare.mjs --no-build   # только скачать и проверить исходники (без компилятора)
//   node tools/pob/prepare.mjs --verify     # проверить готовый vendor/pob-engine по пинам и engine.json
//   node tools/pob/prepare.mjs --pin        # новый тег PoB/коммит LuaJIT (правка pins.json руками): напечатать
//                                           # хэши наборов вместо проверки — их и вписать в pins.json
//
// Источники — только официальные репозитории (git по https, загрузка по SHA коммита, а не по имени тега):
//   PathOfBuildingCommunity/PathOfBuilding (MIT) — sparse checkout: src/{Modules,Classes,Data}, три файла запуска,
//     текущее дерево (tree.lua + sprites.lua), runtime/lua без socket.lua; без картинок, без timeless-архивов
//     (≈ 45 МБ вместо 770), без exe/dll PoB (lcurl, socket, SimpleGraphic — не нужны и не берём);
//   LuaJIT/LuaJIT (MIT) — исходник ветки v2.1, сборка src/msvcbuild.bat static → один luajit.exe без DLL.
// Готовых бинарей из интернета не берём: luajit.exe собирается здесь (локально или в CI release.yml).
// Скачанное — недоверенные данные: git-хуков нет (новый репозиторий), исходник LuaJIT только компилируется.

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const PINS_FILE = path.join(__dirname, 'pins.json')
const CACHE = path.join(ROOT, '.cache', 'pob')
export const OUT = path.join(ROOT, 'vendor', 'pob-engine')

/** @typedef {{ repo: string, commit: string, files: number, sha256: string }} Pin */
/** @typedef {{ pob: Pin & { tag: string, tree: string }, luajit: Pin & { branch: string } }} Pins */

/** @returns {Pins} */
export function readPins() {
  return JSON.parse(fs.readFileSync(PINS_FILE, 'utf8'))
}

// ---------------------------------------------------------------- набор файлов PoB

/** sparse checkout (правила .gitignore: позднее правило перекрывает раннее). */
export function pobSparse(tree) {
  return [
    '/LICENSE.md',
    '/src/HeadlessWrapper.lua',
    '/src/Launch.lua',
    '/src/GameVersions.lua',
    '/src/Modules/',
    '/src/Classes/',
    '/src/Data/',
    '!/src/Data/TimelessJewelData/*',
    '/src/Data/TimelessJewelData/*.lua',
    `/src/TreeData/${tree}/tree.lua`,
    `/src/TreeData/${tree}/sprites.lua`,
    '/src/TreeData/legion/tree-legion.lua',
    '/runtime/lua/*.lua',
    '/runtime/lua/sha1/*.lua',
    '!/runtime/lua/socket.lua',
    '!/runtime/lua/lua-profiler.lua'
  ]
}

/** Тот же набор проверкой пути (вторая линия: что бы ни скачал git, в vendor попадёт только это). */
export function pobKeep(rel, tree) {
  if (rel === 'LICENSE.md') return true
  if (/^src\/(HeadlessWrapper|Launch|GameVersions)\.lua$/.test(rel)) return true
  if (/^src\/(Modules|Classes)\/[\w./ -]+$/.test(rel)) return /\.lua$/.test(rel)
  if (rel.startsWith('src/Data/TimelessJewelData/')) return /^src\/Data\/TimelessJewelData\/\w+\.lua$/.test(rel)
  if (/^src\/Data\/[\w./ -]+$/.test(rel)) return /\.(lua|jsonc?)$/.test(rel)
  if (rel === `src/TreeData/${tree}/tree.lua` || rel === `src/TreeData/${tree}/sprites.lua`) return true
  if (rel === 'src/TreeData/legion/tree-legion.lua') return true
  if (/^runtime\/lua\/(sha1\/)?[\w.-]+\.lua$/.test(rel)) return !/^runtime\/lua\/(socket|lua-profiler)\.lua$/.test(rel)
  return false
}

// ---------------------------------------------------------------- хэши

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/** Все файлы каталога (без .git), относительные пути через «/», по алфавиту. */
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, base, out)
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join('/'))
  }
  return out.sort()
}

/**
 * Манифест набора: строки «sha256  путь» по алфавиту путей; хэш набора — sha256 текста манифеста.
 * Переводы строк в файлах не трогаем (git checkout с core.autocrlf=false).
 * @param {string} dir @param {string[]} files
 */
export function manifest(dir, files) {
  const lines = files.map((f) => `${sha256(fs.readFileSync(path.join(dir, f)))}  ${f}`)
  const text = lines.join('\n') + '\n'
  return { text, files: files.length, sha256: sha256(text) }
}

// ---------------------------------------------------------------- git

function git(cwd, args) {
  return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'advice.detachedHead=false', ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8'
  }).trim()
}

/** Один коммит репозитория в кэш (по SHA, глубина 1; sparse — только нужные файлы). */
function fetchCommit(dir, repo, commit, sparse) {
  if (fs.existsSync(path.join(dir, '.git'))) {
    try {
      if (git(dir, ['rev-parse', 'HEAD']) === commit) return
    } catch {
      /* битый кэш — заново */
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ['init', '-q'])
  git(dir, ['remote', 'add', 'origin', repo])
  if (sparse) {
    git(dir, ['config', 'core.sparseCheckout', 'true'])
    fs.writeFileSync(path.join(dir, '.git', 'info', 'sparse-checkout'), sparse.join('\n') + '\n')
  }
  git(dir, ['fetch', '-q', '--depth', '1', ...(sparse ? ['--filter=blob:none'] : []), 'origin', commit])
  git(dir, ['checkout', '-q', 'FETCH_HEAD'])
  const head = git(dir, ['rev-parse', 'HEAD'])
  if (head !== commit) throw new Error(`${repo}: HEAD ${head}, а пин ${commit}`)
}

function check(label, pin, m, pinMode) {
  if (pinMode) {
    console.log(`${label}: files=${m.files} sha256=${m.sha256}`)
    return
  }
  if (!pin.sha256) throw new Error(`${label}: в pins.json нет sha256 — запустите с --pin и впишите`)
  if (m.files !== pin.files || m.sha256 !== pin.sha256) {
    throw new Error(`${label}: набор не совпал с пином (files ${m.files}/${pin.files}, sha256 ${m.sha256} ≠ ${pin.sha256})`)
  }
  console.log(`${label}: ${m.files} файлов, SHA-256 набора совпал`)
}

// ---------------------------------------------------------------- сборка LuaJIT

function vcvars() {
  const pf = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const vswhere = path.join(pf, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  if (!fs.existsSync(vswhere)) throw new Error('нет vswhere.exe — нужен Visual Studio Build Tools (C++)')
  const inst = execFileSync(
    vswhere,
    ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
    { encoding: 'utf8' }
  ).trim()
  const bat = path.join(inst, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat')
  if (!inst || !fs.existsSync(bat)) throw new Error('нет vcvars64.bat — нужен компонент «MSVC x64/x86 build tools»')
  return bat
}

function buildLuaJit(srcDir) {
  if (process.platform !== 'win32') throw new Error('сборка LuaJIT — только Windows (msvcbuild.bat)')
  const bat = vcvars()
  // static: luajit.exe со статическим рантаймом C (/MT), без lua51.dll и vcruntime
  execFileSync('cmd.exe', ['/d', '/s', '/c', `call "${bat}" >nul && cd /d "${path.join(srcDir, 'src')}" && msvcbuild.bat static`], {
    stdio: 'inherit',
    windowsVerbatimArguments: true
  })
  const exe = path.join(srcDir, 'src', 'luajit.exe')
  if (!fs.existsSync(exe)) throw new Error('msvcbuild.bat не собрал luajit.exe')
  return exe
}

// ---------------------------------------------------------------- vendor/pob-engine

function copyFiles(fromDir, files, toDir) {
  for (const f of files) {
    const to = path.join(toDir, f)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(path.join(fromDir, f), to)
  }
}

function verifyVendor(pins) {
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'engine.json'), 'utf8'))
  const pobDir = path.join(OUT, 'pob')
  const m = manifest(pobDir, walk(pobDir))
  check(`PoB ${pins.pob.tag} (vendor)`, pins.pob, m, false)
  const exe = sha256(fs.readFileSync(path.join(OUT, 'bin', 'luajit.exe')))
  if (meta.luajit?.commit !== pins.luajit.commit) throw new Error('engine.json: LuaJIT другого коммита')
  if (exe !== meta.luajit.exeSha256) throw new Error('luajit.exe не совпал с engine.json')
  console.log(`luajit.exe: SHA-256 ${exe} (как в engine.json, собран из ${pins.luajit.commit.slice(0, 12)})`)
}

function main() {
  const argv = process.argv.slice(2)
  const pinMode = argv.includes('--pin')
  const noBuild = argv.includes('--no-build')
  const pins = readPins()
  if (argv.includes('--verify')) return verifyVendor(pins)

  const pobSrc = path.join(CACHE, `pob-${pins.pob.commit.slice(0, 12)}`)
  const ljSrc = path.join(CACHE, `luajit-${pins.luajit.commit.slice(0, 12)}`)

  console.log(`PoB ${pins.pob.tag} @ ${pins.pob.commit} (дерево ${pins.pob.tree})…`)
  fetchCommit(pobSrc, pins.pob.repo, pins.pob.commit, pobSparse(pins.pob.tree))
  const pobFiles = walk(pobSrc).filter((f) => pobKeep(f, pins.pob.tree))
  const pobM = manifest(pobSrc, pobFiles)
  check(`PoB ${pins.pob.tag}`, pins.pob, pobM, pinMode)

  console.log(`LuaJIT ${pins.luajit.branch} @ ${pins.luajit.commit}…`)
  fetchCommit(ljSrc, pins.luajit.repo, pins.luajit.commit, null)
  // хэш исходника — по файлам коммита (git ls-files), до сборки: msvcbuild пишет рядом сгенерированные файлы
  const ljFiles = git(ljSrc, ['ls-files']).split('\n').filter(Boolean).sort()
  const ljM = manifest(ljSrc, ljFiles)
  check(`LuaJIT ${pins.luajit.commit.slice(0, 12)}`, pins.luajit, ljM, pinMode)

  if (pinMode || noBuild) return

  const exe = buildLuaJit(ljSrc)
  fs.rmSync(OUT, { recursive: true, force: true })
  copyFiles(pobSrc, pobFiles, path.join(OUT, 'pob'))
  fs.mkdirSync(path.join(OUT, 'bin'), { recursive: true })
  fs.copyFileSync(exe, path.join(OUT, 'bin', 'luajit.exe'))
  fs.copyFileSync(path.join(ljSrc, 'COPYRIGHT'), path.join(OUT, 'bin', 'COPYRIGHT-LuaJIT.txt'))
  const exeSha = sha256(fs.readFileSync(path.join(OUT, 'bin', 'luajit.exe')))
  const meta = {
    pob: { repo: pins.pob.repo, tag: pins.pob.tag, commit: pins.pob.commit, tree: pins.pob.tree, files: pobM.files, sha256: pobM.sha256 },
    luajit: { repo: pins.luajit.repo, commit: pins.luajit.commit, sourceSha256: ljM.sha256, exeSha256: exeSha }
  }
  fs.writeFileSync(path.join(OUT, 'engine.json'), JSON.stringify(meta, null, 2) + '\n')
  fs.writeFileSync(path.join(OUT, 'MANIFEST-pob.sha256'), pobM.text)
  console.log(`готово: ${path.relative(ROOT, OUT)} (luajit.exe ${exeSha})`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (e) {
    console.error(`prepare: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
}
