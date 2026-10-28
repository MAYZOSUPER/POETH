; Установщик POETH (S10b), подключается electron-builder автоматически (build/installer.nsh).
;
; Только для текущего пользователя: страницы «для меня / для всех» нет, папка по умолчанию —
; %LOCALAPPDATA%\Programs\POETH, права администратора не нужны (как у APT). Хук electron-builder:
; customInstallMode вызывается до страницы выбора режима; $isForceCurrentInstall = 1 — сразу
; режим «для меня», страница пропускается (и в деинсталляторе тоже).
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
