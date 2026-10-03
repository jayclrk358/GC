; Lets the browser hand sign-ins back to the app through gamecentral:// links (see src/main.ts).
; Registered for this user on install, and removed again on uninstall.

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\gamecentral" "" "URL:Game Central"
  WriteRegStr SHCTX "Software\Classes\gamecentral" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\gamecentral\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\gamecentral\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\gamecentral"
!macroend
