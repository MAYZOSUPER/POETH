-- POETH: сервер движка Path of Building (PoE 1) для «Точного расчёта (PoB)» в блоке «Против надетого» (S44).
-- Свой код POETH (MIT), написан с нуля поверх HeadlessWrapper.lua из PoB (MIT, © 2016 David Gowor); код PoE Upgrade
-- Checker (GPL) не используется.
--
-- Запуск (только из main POETH, src/main/pob/engine.ts):
--   luajit.exe server.lua <папка PoB>        cwd = <папка PoB>/src, окружение пустое (без LUA_INIT/LUA_PATH)
-- Протокол: запрос — одна строка JSON в stdin; ответ — одна строка «@poeth {json}» в stdout. Печать PoB (ConPrintf,
-- print, io.write) уходит в stderr. Первая строка после старта — {"ready":true,...} или {"ready":false,...}.
--   {"id":1,"cmd":"ping"}                                         → {"id":1,"ok":true,"mem":<КБ кучи Lua>}
--   {"id":2,"cmd":"compare","xml":"<PathOfBuilding>…","item":"Rarity: Rare…","options":[["Ring 1"],["Ring 2"]]}
--       → {"id":2,"ok":true,"base":{стат:число},"results":[{"ok":true,"new":{…}}|{"ok":false,"error":"slot"}],"item":{…}}
--   {"id":3,"cmd":"selftest"}                                     → что заблокировано (сеть, процессы, запись, чужие файлы)
--   {"id":4,"cmd":"quit"}
--
-- Песочница (до загрузки PoB):
--   - сеть: модули socket*, ssl, lcurl*, ffi (FFI мог бы звать любые функции ОС) — заглушки с ошибкой; C-модули
--     не грузятся вовсе (package.cpath = "", без загрузчиков C, без package.loadlib);
--   - процессы: os.execute, io.popen — нет; os.exit — только наш;
--   - файлы: только чтение и только внутри папки PoB (без «..»); запись, удаление, переименование — нет;
--   - вход: строка ≤ 4 МБ, XML ≤ 3 МБ, текст предмета ≤ 16 КБ, ≤ 4 вариантов слота по ≤ 2 слота из списка.

local POB = arg and arg[1]
local stdin, stdout, stderr = io.stdin, io.stdout, io.stderr
local os_exit, os_clock = os.exit, os.clock
local real_open, real_loadfile, real_dofile = io.open, loadfile, dofile
local t_insert, t_concat = table.insert, table.concat

local MAX_LINE = 4 * 1024 * 1024
local MAX_XML = 3 * 1024 * 1024
local MAX_ITEM = 16 * 1024
local MAX_OPTIONS = 4
local MAX_UNSUPPORTED = 20

local function protocol(tbl)
  -- кодировщик подключается после настройки путей; до этого — только строка готовности с ошибкой
  stdout:write('@poeth ', tbl, '\n')
  stdout:flush()
end

if type(POB) ~= 'string' or POB == '' or #POB > 1024 or POB:find('[%z\r\n]') then
  protocol('{"ready":false,"error":"args"}')
  os_exit(2)
end

local ROOT = POB:gsub('\\', '/'):gsub('/+$', '')
local SRC = ROOT .. '/src'
local RUNTIME = ROOT .. '/runtime/lua'

-- ---------------------------------------------------------------------------- модули

package.path = SRC .. '/?.lua;' .. RUNTIME .. '/?.lua;' .. RUNTIME .. '/?/init.lua'
package.cpath = ''
package.loadlib = nil
do
  local loaders = package.loaders
  -- только preload и Lua-файлы по package.path (без загрузчиков C-модулей)
  package.loaders = { loaders[1], loaders[2] }
end

local BLOCKED = {
  'ffi', 'socket', 'socket.core', 'socket.http', 'socket.url', 'socket.ftp', 'socket.smtp', 'mime', 'mime.core',
  'ssl', 'ssl.core', 'lcurl', 'lcurl.safe', 'luacurl', 'lzip', 'lfs', 'jit.profile'
}
for _, name in ipairs(BLOCKED) do
  package.loaded[name] = nil
  package.preload[name] = function()
    error('POETH: module "' .. name .. '" is disabled (no network, no native code)', 2)
  end
end

-- lua-utf8 (нативный модуль PoB): PoB зовёт его только для разделителей тысяч в числах (Common.lua) и в полях
-- ввода интерфейса. Вместо DLL — строковые функции Lua; reverse — по символам UTF-8.
package.preload['lua-utf8'] = function()
  local u = {}
  for _, k in ipairs({ 'gsub', 'find', 'match', 'gmatch', 'sub', 'len', 'byte', 'format', 'rep', 'lower', 'upper' }) do
    u[k] = string[k]
  end
  u.reverse = function(s)
    local out = {}
    for ch in s:gmatch('[%z\1-\127\194-\244][\128-\191]*') do
      t_insert(out, 1, ch)
    end
    return t_concat(out)
  end
  u.next = function(s, i)
    i = (i or 0) + 1
    if i > #s then
      return nil
    end
    return i
  end
  return u
end

-- ---------------------------------------------------------------------------- файлы и процессы

local ROOT_LOWER = (ROOT .. '/'):lower()

--- Можно ли читать этот путь: внутри папки PoB (абсолютный с её префиксом или относительный от cwd = src), без «..».
local function readable(p)
  if type(p) ~= 'string' or p == '' or #p > 1024 or p:find('[%z\r\n]') then
    return false
  end
  p = p:gsub('\\', '/')
  if p:find('%.%.') then
    return false
  end
  if p:match('^%a:') or p:match('^/') then
    return p:lower():sub(1, #ROOT_LOWER) == ROOT_LOWER
  end
  return true
end

io.open = function(p, mode)
  mode = mode or 'r'
  if mode ~= 'r' and mode ~= 'rb' then
    return nil, 'POETH: writing is disabled'
  end
  if not readable(p) then
    return nil, 'POETH: path outside of PoB folder'
  end
  return real_open(p, mode)
end
io.lines = function(p, ...)
  if not readable(p) then
    error('POETH: path outside of PoB folder', 2)
  end
  local f = assert(real_open(p, 'r'))
  return f:lines(...)
end
io.popen, io.tmpfile, io.input, io.output = nil, nil, nil, nil
io.read = function()
  return nil
end
io.write = function(...)
  stderr:write(...)
  return io
end
os.execute, os.remove, os.rename, os.tmpname = nil, nil, nil, nil
os.exit = function()
  error('POETH: os.exit is disabled', 2)
end
os.getenv = function()
  return nil
end
loadfile = function(p, ...)
  if not readable(p) then
    return nil, 'POETH: path outside of PoB folder'
  end
  return real_loadfile(p, ...)
end
dofile = function(p)
  local f = assert(loadfile(p))
  return f()
end
print = function(...)
  local n = select('#', ...)
  local parts = {}
  for i = 1, n do
    parts[i] = tostring((select(i, ...)))
  end
  local s = t_concat(parts, '\t')
  if #s > 400 then
    s = s:sub(1, 400) .. '…'
  end
  stderr:write(s, '\n')
end

-- ---------------------------------------------------------------------------- JSON

local json = require('dkjson')

local function send(tbl)
  protocol(json.encode(tbl))
end

-- ---------------------------------------------------------------------------- запуск PoB

local started = os_clock()

-- HeadlessWrapper.lua (PoB) определяет заглушки SimpleGraphic, грузит Launch.lua и делает OnInit/OnFrame.
-- Перед Launch.lua подменяем то, что в заглушках опасно или неверно для нас: пути PoB (иначе «/» — корень диска),
-- подпроцессы и ссылки (ничего), проверку обновлений (сеть; без файла UpdateCheck.lua она бы упала).
local wrapperDofile = dofile
dofile = function(p)
  if p == 'Launch.lua' then
    GetScriptPath = function() return SRC end
    GetRuntimePath = function() return SRC end
    GetUserPath = function() return SRC end
    GetWorkDir = function() return SRC end
    LaunchSubScript = function() return nil end
    SpawnProcess = function() end
    OpenURL = function() end
    local r = wrapperDofile(SRC .. '/Launch.lua')
    if launch then
      launch.CheckForUpdate = function() end
    end
    return r
  end
  return wrapperDofile(p)
end
local okWrapper, wrapperErr = pcall(wrapperDofile, SRC .. '/HeadlessWrapper.lua')
dofile = wrapperDofile

if not okWrapper or not launch or launch.promptMsg or not launch.main or type(loadBuildFromXML) ~= 'function' then
  local detail = (not okWrapper and tostring(wrapperErr)) or (launch and launch.promptMsg) or 'no main'
  send({ ready = false, error = 'init', detail = tostring(detail):sub(1, 400) })
  os_exit(3)
end

-- ---------------------------------------------------------------------------- расчёт

local SLOTS = {
  ['Weapon 1'] = true, ['Weapon 2'] = true, ['Helmet'] = true, ['Body Armour'] = true, ['Gloves'] = true,
  ['Boots'] = true, ['Amulet'] = true, ['Ring 1'] = true, ['Ring 2'] = true, ['Belt'] = true
}

-- Статы выхода PoB (env.player.output), которые нужны окну: урон, EHP, пулы, сопротивления, атрибуты.
local STATS = {
  'FullDPS', 'CombinedDPS', 'TotalDPS', 'TotalDot', 'TotalEHP', 'Life', 'LifeUnreserved', 'EnergyShield', 'Mana', 'Ward',
  'Armour', 'Evasion', 'Str', 'Dex', 'Int', 'ReqStr', 'ReqDex', 'ReqInt',
  'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
  'FireResistOverCap', 'ColdResistOverCap', 'LightningResistOverCap', 'ChaosResistOverCap',
  'FireResistMax', 'ColdResistMax', 'LightningResistMax', 'ChaosResistMax',
  'EffectiveMovementSpeedMod', 'EffectiveBlockChance', 'EffectiveSpellSuppressionChance', 'PhysicalMaximumHitTaken'
}

local function num(v)
  if type(v) ~= 'number' or v ~= v or v == math.huge or v == -math.huge then
    return nil
  end
  return v
end

local function pick(o)
  local r = {}
  if type(o) ~= 'table' then
    return r
  end
  for _, k in ipairs(STATS) do
    r[k] = num(o[k])
  end
  if type(o.Minion) == 'table' then
    r.MinionCombinedDPS = num(o.Minion.CombinedDPS)
    r.MinionTotalDPS = num(o.Minion.TotalDPS)
  end
  return r
end

local loadedXml = nil

local function loadBuild(xml)
  if xml == loadedXml then
    return true
  end
  loadedXml = nil
  launch.promptMsg = nil
  loadBuildFromXML(xml, 'POETH')
  if launch.promptMsg then
    local msg = launch.promptMsg
    launch.promptMsg = nil
    return false, msg
  end
  build = launch.main.modes['BUILD']
  if not build or not build.calcsTab or not build.calcsTab.miscCalculator then
    return false, 'no calculator'
  end
  loadedXml = xml
  return true
end

--- Строки предмета, которые PoB не понял (мод не разобран) — окно честно скажет, что их не учли.
local function unsupported(item)
  local out = {}
  for _, list in ipairs({ item.enchantModLines, item.scourgeModLines, item.implicitModLines, item.explicitModLines, item.crucibleModLines }) do
    for _, ml in ipairs(list or {}) do
      if ml.extra and #out < MAX_UNSUPPORTED then
        t_insert(out, tostring(ml.line or ''):sub(1, 200))
      end
    end
  end
  return out
end

local function compare(req)
  if type(req.xml) ~= 'string' or #req.xml > MAX_XML or not req.xml:find('^%s*<') then
    return { ok = false, error = 'bad-input', detail = 'xml' }
  end
  if type(req.item) ~= 'string' or req.item == '' or #req.item > MAX_ITEM then
    return { ok = false, error = 'bad-input', detail = 'item' }
  end
  if type(req.options) ~= 'table' or #req.options < 1 or #req.options > MAX_OPTIONS then
    return { ok = false, error = 'bad-input', detail = 'options' }
  end
  for _, opt in ipairs(req.options) do
    if type(opt) ~= 'table' or #opt < 1 or #opt > 2 then
      return { ok = false, error = 'bad-input', detail = 'options' }
    end
    for _, s in ipairs(opt) do
      if not SLOTS[s] then
        return { ok = false, error = 'bad-input', detail = 'slot' }
      end
    end
  end

  local okBuild, buildErr = loadBuild(req.xml)
  if not okBuild then
    return { ok = false, error = 'build', detail = tostring(buildErr):sub(1, 300) }
  end

  local item = new('Item', req.item)
  if not item or not item.base then
    return { ok = false, error = 'item' }
  end
  if item.base.flask or item.base.tincture or item.type == 'Jewel' then
    return { ok = false, error = 'kind' }
  end

  local calcFunc, calcBase = build.calcsTab:GetMiscCalculator()
  local results = {}
  for i, opt in ipairs(req.options) do
    if build.itemsTab:IsItemValidForSlot(item, opt[1]) then
      -- двуручное в «Weapon 1» PoB сам снимает со второй руки (CalcSetup, repSlotName)
      results[i] = { ok = true, new = pick(calcFunc({ repSlotName = opt[1], repItem = item })) }
    else
      results[i] = { ok = false, error = 'slot' }
    end
  end
  local r = item.requirements or {}
  return {
    ok = true,
    base = pick(calcBase),
    results = results,
    item = {
      base = tostring(item.baseName or ''):sub(1, 100),
      rarity = tostring(item.rarity or ''),
      reqLevel = num(r.level) or 0,
      level = num(build.characterLevel) or 0,
      unsupported = unsupported(item)
    }
  }
end

local function selftest()
  local function blocked(name)
    return not pcall(require, name)
  end
  local function noRead(p)
    local f = io.open(p, 'r')
    if f then
      f:close()
      return false
    end
    return true
  end
  local w = io.open(SRC .. '/poeth-write-test.txt', 'w')
  if w then
    w:close()
  end
  return {
    ok = true,
    socket = blocked('socket') and blocked('socket.core'),
    lcurl = blocked('lcurl') and blocked('lcurl.safe'),
    ssl = blocked('ssl'),
    ffi = blocked('ffi'),
    cmodule = package.cpath == '' and package.loadlib == nil and #package.loaders == 2,
    popen = io.popen == nil,
    execute = os.execute == nil,
    write = w == nil,
    remove = os.remove == nil and os.rename == nil,
    outside = noRead('C:/Windows/win.ini') and noRead(ROOT .. '/../engine.json') and noRead('../../engine.json'),
    inside = not noRead(SRC .. '/Launch.lua')
  }
end

local HANDLERS = {
  ping = function()
    return { ok = true, mem = math.floor(collectgarbage('count')) }
  end,
  compare = compare,
  selftest = selftest
}

-- ---------------------------------------------------------------------------- цикл

send({
  ready = true,
  tree = tostring(latestTreeVersion or ''),
  ms = math.floor((os_clock() - started) * 1000),
  mem = math.floor(collectgarbage('count'))
})

while true do
  local line = stdin:read('*l')
  if not line then
    break
  end
  local resp
  if #line > MAX_LINE then
    resp = { ok = false, error = 'bad-input', detail = 'too-large' }
  else
    local req = json.decode(line, 1, nil)
    if type(req) ~= 'table' or type(req.cmd) ~= 'string' then
      resp = { ok = false, error = 'bad-input', detail = 'json' }
    elseif req.cmd == 'quit' then
      send({ id = req.id, ok = true })
      break
    else
      local h = HANDLERS[req.cmd]
      if not h then
        resp = { ok = false, error = 'bad-input', detail = 'cmd' }
      else
        local okCall, res = xpcall(function()
          return h(req)
        end, debug.traceback)
        if okCall then
          resp = res
        else
          -- ошибка внутри PoB: состояние билда могло испортиться — при следующем сравнении загрузим заново
          loadedXml = nil
          resp = { ok = false, error = 'internal', detail = tostring(res):match('^[^\n]*'):sub(1, 300) }
        end
      end
    end
    if type(req) == 'table' and type(req.id) == 'number' then
      resp.id = req.id
    end
  end
  send(resp)
end
os_exit(0)
