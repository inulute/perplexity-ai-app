; Custom NSIS installer script for SimplexityAI
; Handles uninstalling older versions of the app before installing

!macro customInit
  ; Check if the old "Perplexity AI" app is installed and offer to uninstall it
  ; Old app GUID (computed from appId "com.inulute.perplexityai"): 06417919-3ce7-5c5e-857c-c0b28a3df031
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\06417919-3ce7-5c5e-857c-c0b28a3df031" "QuietUninstallString"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "An older version of this app (Perplexity AI) was found.$\r$\nWould you like to uninstall it before installing SimplexityAI?$\r$\n$\r$\nYour settings will be automatically migrated." IDYES uninstallOldPplx IDNO skipUninstallPplx

    uninstallOldPplx:
      ExecWait '$0'

    skipUninstallPplx:
  ${EndIf}

  ; Check if the previous "Simplexity" app is installed and offer to uninstall it
  ; Old app GUID (computed from appId "com.inulute.simplexity"): 327446b1-a595-53c1-b30c-e7435919b9c9
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\327446b1-a595-53c1-b30c-e7435919b9c9" "QuietUninstallString"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "A previous version of this app (Simplexity) was found.$\r$\nWould you like to uninstall it before installing SimplexityAI?$\r$\n$\r$\nYour settings will be automatically migrated." IDYES uninstallOldSmplx IDNO skipUninstallSmplx

    uninstallOldSmplx:
      ExecWait '$0'

    skipUninstallSmplx:
  ${EndIf}
!macroend
