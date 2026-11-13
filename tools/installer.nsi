Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
!include "StrFunc.nsh"
${UnStrStr}
Name "Deskland Preview"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Deskland Preview"
InstallDirRegKey HKCU "Software\DesklandPreview\Installer" "InstallDir"
RequestExecutionLevel user
SetCompressor zlib
BrandingText "Deskland Preview"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Deskland Preview"
VIAddVersionKey /LANG=1033 "FileDescription" "Deskland Preview Installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright 2026 Deskland authors"
!define MUI_ABORTWARNING
!define MUI_ICON "${PAYLOAD}\host\bin\DesklandPreview.ico"
!define MUI_UNICON "${PAYLOAD}\host\bin\DesklandPreview.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\host\bin\Deskland.exe"
!define MUI_FINISHPAGE_RUN_TEXT "$(LaunchDeskland)"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${PAYLOAD}\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
LangString LaunchDeskland ${LANG_SIMPCHINESE} "启动 Deskland Preview"
LangString LaunchDeskland ${LANG_ENGLISH} "Launch Deskland Preview"
LangString AppFiles ${LANG_SIMPCHINESE} "Deskland Preview（全部 15 个主题）"
LangString AppFiles ${LANG_ENGLISH} "Deskland Preview (all 15 themes)"
LangString DesktopShortcut ${LANG_SIMPCHINESE} "桌面快捷方式"
LangString DesktopShortcut ${LANG_ENGLISH} "Desktop shortcut"
LangString NeedX64 ${LANG_SIMPCHINESE} "需要 Windows 10 或更高版本（x64 或 ARM64）。"
LangString NeedX64 ${LANG_ENGLISH} "Windows 10 or later is required (x64 or ARM64)."
LangString CloseFailed ${LANG_SIMPCHINESE} "请退出正在运行的 Deskland Preview 后重试。"
LangString CloseFailed ${LANG_ENGLISH} "Please exit Deskland Preview and retry."
LangString RuntimeFailed ${LANG_SIMPCHINESE} "WebView2 安装未完成。请连接网络，安装 Microsoft Edge WebView2 Runtime 后重试。"
LangString RuntimeFailed ${LANG_ENGLISH} "WebView2 setup did not complete. Connect to the internet, install Microsoft Edge WebView2 Runtime, and retry."
LangString InstallingRuntime ${LANG_SIMPCHINESE} "正在安装 Microsoft Edge WebView2 Runtime（需要联网）..."
LangString InstallingRuntime ${LANG_ENGLISH} "Installing Microsoft Edge WebView2 Runtime (internet required)..."
LangString NoWrite ${LANG_SIMPCHINESE} "无法写入安装目录。请直接在资源管理器里双击安装包（不要从聊天/沙箱预览里运行），然后重试。"
LangString NoWrite ${LANG_ENGLISH} "Cannot write to the install folder. Please start this setup directly from Explorer (not from a chat or sandboxed preview) and try again."

Function .onInit
  ; 程序是 AnyCPU：x64 和 ARM64 的 Windows 10/11 都能装，不再要求 RunningX64
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "$(NeedX64)"
    SetErrorLevel 1
    Abort
  ${EndIf}
  SetShellVarContext current
  SetRegView 64
  !insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd

Function CheckRuntime
  StrCpy $0 ""
  SetRegView 32
  ReadRegStr $0 HKLM "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  SetRegView 64
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
FunctionEnd

Section "$(AppFiles)" SecApp
  SectionIn RO
  Call CheckRuntime
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File /oname=MicrosoftEdgeWebview2Setup.exe "${BOOTSTRAPPER}"
    DetailPrint "$(InstallingRuntime)"
    ExecWait '"$PLUGINSDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install' $1
    Call CheckRuntime
    ${If} $0 == ""
    ${OrIf} $0 == "0.0.0.0"
      MessageBox MB_ICONSTOP "$(RuntimeFailed)"
      SetErrorLevel 2
      Abort
    ${EndIf}
  ${EndIf}
  IfFileExists "$INSTDIR\host\bin\Deskland.exe" 0 closed
  ; 不阻塞等待：旧版本（0.1.3 及更早）不认识这个参数，ExecWait 会一直等下去
  Exec '"$INSTDIR\host\bin\Deskland.exe" --exit-installed'
  Sleep 1500
  closed:
  ; 写权限自检：从聊天/沙箱预览里运行时，这里会写不进去，给一句明确的提示
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\.deskland-write-test" w
  IfErrors 0 writable
  MessageBox MB_ICONSTOP "$(NoWrite)"
  SetErrorLevel 4
  Abort
  writable:
  FileClose $0
  Delete "$INSTDIR\.deskland-write-test"
  ; 升级：先清掉旧的程序文件，避免旧文件只读/被占用导致覆盖失败（用户设置不在安装目录里）
  ExecWait 'attrib -R "$INSTDIR\*.*" /S /D'
  RMDir /r "$INSTDIR\host"
  RMDir /r "$INSTDIR\prototype"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\NOTICE"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.md"
  Delete "$INSTDIR\TRADEMARKS.md"
  !include "${FILE_LIST}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Deskland Preview"
  CreateShortcut "$SMPROGRAMS\Deskland Preview\Deskland Preview.lnk" "$INSTDIR\host\bin\Deskland.exe"
  CreateShortcut "$SMPROGRAMS\Deskland Preview\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\DesklandPreview\Installer" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "DisplayName" "Deskland Preview"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "Publisher" "Deskland"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "DisplayIcon" "$INSTDIR\host\bin\Deskland.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview" "EstimatedSize" $0
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
FunctionEnd
Section "Uninstall"
  IfFileExists "$INSTDIR\host\bin\Deskland.exe" 0 unclosed
  Exec '"$INSTDIR\host\bin\Deskland.exe" --exit-installed'
  Sleep 1500
  unclosed:
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DesklandPreview"
  ${UnStrStr} $1 $0 '$\"$INSTDIR\host\bin\Deskland.exe$\"'
  ${If} $1 != ""
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DesklandPreview"
  ${EndIf}
  !include "${DELETE_LIST}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Deskland Preview\Deskland Preview.lnk"
  Delete "$SMPROGRAMS\Deskland Preview\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Deskland Preview"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DesklandPreview"
  DeleteRegKey HKCU "Software\DesklandPreview\Installer"
SectionEnd
