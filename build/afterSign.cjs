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
// userData (%APPDATA%\POETH). Поэтому — правка ресурса ПОСЛЕ шага electron-builder signAndEditResources
// (afterPack раньше — тот шаг вернул бы «POETH»). FileDescription — то же имя: его показывают диспетчер задач
// и запросы брандмауэра.
//
// Правка — библиотекой resedit, той же, что у electron-builder 26 (app-builder-lib/out/util/resEdit.js;
// до 26 был rcedit через builder-util executeAppBuilder — в 26 его нет, S48). Меняются только две строки
// VersionInfo; остальные ресурсы (иконка, манифест, ресурс целостности asar) переписываются как есть, fuses
// лежат вне ресурсов (проверка: npx @electron/fuses read --app dist-release/win-unpacked/POETH.exe).
// Если появится подпись кода — эта правка должна идти до подписи (иначе подпись станет недействительной).

const fs = require('fs/promises')
const path = require('path')
const { NtExecutable, NtExecutableResource, Resource } = require('resedit')

const PRODUCT_NAME = 'POE Trade Helper'

/** @param {import('app-builder-lib').AfterPackContext} context */
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const executable = NtExecutable.from(await fs.readFile(exe))
  const res = NtExecutableResource.from(executable)
  const [vi] = Resource.VersionInfo.fromEntries(res.entries)
  if (!vi) throw new Error(`afterSign: в ${exe} нет VersionInfo`)
  for (const lang of vi.getAllLanguagesForStringValues()) {
    vi.setStringValues(lang, { ProductName: PRODUCT_NAME, FileDescription: PRODUCT_NAME })
  }
  vi.outputToResourceEntries(res.entries)
  res.outputResource(executable)
  await fs.writeFile(exe, Buffer.from(executable.generate()))
  console.log(`  • product name set  file=${path.relative(process.cwd(), exe)} name="${PRODUCT_NAME}"`)
}
