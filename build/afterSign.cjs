// Хук electron-builder `afterSign` (S10c): название продукта в ресурсах POETH.exe = «POE Trade Helper».
// Подключение в electron-builder.yml: afterSign: build/afterSign.cjs
//
// Зачем: Electron 40 при первом уведомлении Windows сам создаёт ярлык в «Пуске» с именем ProductName из
// ресурсов exe (shell/browser/notifications/win/windows_toast_activator.cc → EnsureShortcut). С ProductName
// «POETH» рядом с ярлыком установщика «POE Trade Helper» появлялся второй пункт «POETH», а шапка тоста бралась
// из него. С «POE Trade Helper» Electron обновляет ярлык установщика — в «Пуске» один пункт, шапка тоста
// «POE Trade Helper», деинсталлятор его удаляет.
//
// Поменять ProductName в electron-builder.yml нельзя: productName задаёт и имя exe, и папку установки, и
// userData (%APPDATA%\POETH). Поэтому — правка ресурса тем же rcedit, что и у electron-builder, ПОСЛЕ его шага
// signAndEditResources (afterPack раньше — его rcedit вернул бы «POETH»). FileDescription — то же имя: его
// показывают диспетчер задач и запросы брандмауэра. Fuses и ресурс целостности asar rcedit не трогает
// (проверка: npx @electron/fuses read --app dist-release/win-unpacked/POETH.exe).
// Если появится подпись кода — эта правка должна идти до подписи (иначе подпись станет недействительной).

const path = require('path')
const { executeAppBuilder } = require('builder-util')

const PRODUCT_NAME = 'POE Trade Helper'

/** @param {import('app-builder-lib').AfterPackContext} context */
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const args = [exe, '--set-version-string', 'ProductName', PRODUCT_NAME, '--set-version-string', 'FileDescription', PRODUCT_NAME]
  await executeAppBuilder(['rcedit', '--args', JSON.stringify(args)], undefined, {}, 3)
}
