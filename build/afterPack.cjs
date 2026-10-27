// Хук electron-builder `afterPack` (S3): Electron fuses — hardening упакованного приложения
// («чтобы не могли утащить аккаунт»). Подключение в electron-builder.yml:
//   afterPack: build/afterPack.cjs
// Fuses переключаются в бинаре после упаковки (asar и его integrity-ресурс electron-builder
// к этому моменту уже записал) и до подписи. Проверка: `npx @electron/fuses read --app
// dist-release/win-unpacked/POETH.exe`.
//
//  EnableCookieEncryption              on  — cookies (POESESSID, cf_clearance) на диске шифруются (DPAPI)
//  RunAsNode                           off — ELECTRON_RUN_AS_NODE не превращает POETH.exe в node.exe
//  EnableNodeOptionsEnvironmentVariable off — NODE_OPTIONS не подмешивает чужой код
//  EnableNodeCliInspectArguments       off — --inspect/--inspect-brk не открывают отладчик main
//  OnlyLoadAppFromAsar                 on  — код приложения только из app.asar
//  EnableEmbeddedAsarIntegrityValidation on — подменённый app.asar не запустится
//
// @electron/fuses 2.x — ESM-only, поэтому динамический import из CJS-хука.

const path = require('path')

/** @param {import('app-builder-lib').AfterPackContext} context */
exports.default = async function afterPack(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses')
  const platform = context.electronPlatformName
  const name = context.packager.appInfo.productFilename
  const app =
    platform === 'darwin'
      ? path.join(context.appOutDir, `${name}.app`)
      : platform === 'win32'
        ? path.join(context.appOutDir, `${name}.exe`)
        : path.join(context.appOutDir, context.packager.executableName)

  await flipFuses(app, {
    version: FuseVersion.V1,
    // на macOS arm64 после правки бинаря нужна ad-hoc подпись заново
    resetAdHocDarwinSignature: platform === 'darwin' && context.arch === 3 /* Arch.arm64 */,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  })
  console.log(`  • fuses applied  file=${path.relative(process.cwd(), app)}`)
}
