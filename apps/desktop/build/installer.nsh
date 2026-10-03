; Lets the browser hand sign-ins back to the app through gamecentral:// links (see src/main.ts),
; registered for this user on install and removed again on uninstall. And uninstalls without a
; second confirmation box.

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\gamecentral" "" "URL:Game Central"
  WriteRegStr SHCTX "Software\Classes\gamecentral" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\gamecentral\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\gamecentral\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Uninstalling from Windows (Settings asks first) or a tool shouldn't stop at a second "Are you
  ; sure?" box, which nothing can answer when a tool runs it: use the quiet uninstall command.
  Push $0
  ReadRegStr $0 SHCTX "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString
  StrCmp $0 "" +2
    WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallString $0
  Pop $0
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\gamecentral"
!macroend
