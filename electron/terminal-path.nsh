!macro customInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\client\cli\launchers\path.ps1" -Directory "$INSTDIR" -Action install'
  Pop $0
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i 0x001a, p 0, w "Environment", i 2, i 5000, *p .r0)'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\client\cli\launchers\path.ps1" -Directory "$INSTDIR" -Action uninstall'
  Pop $0
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i 0x001a, p 0, w "Environment", i 2, i 5000, *p .r0)'
!macroend
