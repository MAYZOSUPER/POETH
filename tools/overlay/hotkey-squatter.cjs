// «Другая программа», которая держит хоткей (как Awakened PoE Trade или Sidekick с Ctrl+D), — для
// автопроверки предупреждения POETH о занятом сочетании (tools/overlay/check-overlay.mjs).
//   electron tools/overlay/hotkey-squatter.cjs Alt+3   → печатает «ready» (занял) или «fail»
// Окон нет; профиль — во временной папке (в %APPDATA% ничего не пишет). Завершается по kill.

const { app, globalShortcut } = require('electron')
const os = require('os')
const path = require('path')

const accel = process.argv[process.argv.length - 1]
app.setPath('userData', path.join(os.tmpdir(), 'poeth-hotkey-squatter'))

app.whenReady().then(() => {
  const ok = globalShortcut.register(accel, () => {})
  console.log(ok ? 'ready' : 'fail')
})
