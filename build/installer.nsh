; Установщик POETH (S10b), подключается electron-builder автоматически (build/installer.nsh).
;
; Только для текущего пользователя: страницы «для меня / для всех» нет, папка по умолчанию —
; %LOCALAPPDATA%\Programs\POETH, права администратора не нужны (как у APT). Хук electron-builder:
; customInstallMode вызывается до страницы выбора режима; $isForceCurrentInstall = 1 — сразу
; режим «для меня», страница пропускается (и в деинсталляторе тоже).
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Удаление (S10c): следы уведомлений Windows, которые Electron 40 оставляет сам
; (shell/browser/notifications/win/windows_toast_activator.cc):
;  - ключ HKCU\Software\Classes\CLSID\{…} «Electron Notification Activator», LocalServer32 = наш exe;
;  - ярлык «POETH.lnk» в «Пуске» — его создавали версии с ProductName «POETH» в ресурсах exe (до S10c);
;    ярлык «POE Trade Helper» Electron теперь пишет поверх ярлыка установщика, его удаляет сам electron-builder.
; При обновлении (--updated) не трогаем: ярлык и ключ нужны новой версии.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$SMPROGRAMS\POETH.lnk"
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    StrCpy $R0 0
    poeth_clsid_loop:
      EnumRegKey $R1 HKCU "Software\Classes\CLSID" $R0
      StrCmp $R1 "" poeth_clsid_done
      ReadRegStr $R2 HKCU "Software\Classes\CLSID\$R1" ""
      StrCmp $R2 "Electron Notification Activator" 0 poeth_clsid_next
      ReadRegStr $R3 HKCU "Software\Classes\CLSID\$R1\LocalServer32" ""
      ; StrCmp без учёта регистра — путь Windows
      StrCmp $R3 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 poeth_clsid_next
      DeleteRegKey HKCU "Software\Classes\CLSID\$R1"
      ; ключи сдвинулись — тот же индекс ещё раз
      Goto poeth_clsid_loop
    poeth_clsid_next:
      IntOp $R0 $R0 + 1
      Goto poeth_clsid_loop
    poeth_clsid_done:
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
  ${endIf}
!macroend
