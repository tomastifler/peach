; Peach Windows 安装包。由 scripts/build_windows.ps1 -Installer 调用 ISCC 编译：
;   ISCC /DAppVersion=<版本> /DSourceDir=<独立目录包 Peach\> /DOutputDir=<输出目录> peach.iss
; 装的内容与免安装包逐字节相同，安装器提供目录选择、开始菜单项和「应用和功能」里的登记。
; 自更新、开机自启、桌面图标和应用内卸载仍由 Peach 管，约定见 src/peach/desktop_installer.py。

#ifndef AppVersion
  #error 缺少 /DAppVersion
#endif
#ifndef SourceDir
  #error 缺少 /DSourceDir
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

[Setup]
; 与 desktop_installer.APP_ID 相同；改了它，已装的机器会并排出现第二份。
AppId={{02D9748A-78F6-4866-AC75-918177194DAB}
AppName=Peach
AppVersion={#AppVersion}
AppVerName=Peach {#AppVersion}
AppPublisher=Peach
AppPublisherURL=https://github.com/peach-mitao/peach
AppSupportURL=https://github.com/peach-mitao/peach/issues
; 只装到当前用户：自更新在程序目录旁边建事务目录再整目录切换，Program Files 不可写。
PrivilegesRequired=lowest
DefaultDirName={userpf}\Peach
DisableDirPage=no
UsePreviousAppDir=yes
UsePreviousTasks=no
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
#ifdef LiteInstaller
OutputBaseFilename=Peach-{#AppVersion}-windows-x64-lite-setup
#else
OutputBaseFilename=Peach-{#AppVersion}-windows-x64-setup
#endif
SetupIconFile=..\..\resources\peach.ico
UninstallDisplayIcon={app}\Peach.exe
UninstallDisplayName=Peach
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.StillRunning=Peach is still running and could not exit automatically. Quit Peach from the tray menu and try again.
english.TaskCheckFailed=Could not confirm the background task status, so the installation was cancelled. Wait for the tasks to finish and try again.
english.MigrationFailed=The local database could not be updated to the new version, so Peach may error after it starts. The pre-upgrade backup is in the database folder of the data directory, with a file name starting with ledger.pre-migrate-.
english.DataKept=Peach has been uninstalled. Settings, the local database and watch history are kept in %1 and can be deleted manually if needed; media files are not affected.
english.DirectoryOverlapsData=The program directory cannot overlap the Peach data directory. Choose a separate program folder.
english.DirectoryNotDedicated=Choose an empty folder or an existing Peach installation directory. Uninstalling Peach removes the entire program folder.
english.DirectoryNotWritable=The current user cannot write to the program directory or its parent directory. Choose a location with write access so Peach can be installed and updated.
english.DirectoryLink=The program and data directories cannot go through directory links. Choose a regular folder.
english.DirectoryMove=Uninstall the existing Peach (keeping data) first, then choose a new installation directory.
english.ReportingFailed=The version statistics and error diagnostics choice could not be saved. You can choose again in first-time setup or on the settings page; consent that was not saved will not enable uploads.
english.LibrarySharingFailed=The library and taste upload choice could not be saved. You can choose again on the settings page.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "reporting"; Description: "Send version statistics and error diagnostics (recommended): version, system info, error type, code location and occurrence count"; GroupDescription: "Data upload (can be turned off on the settings page):"
Name: "librarysharing"; Description: "Upload library and preference details (anonymised)"; GroupDescription: "Data upload (can be turned off on the settings page):"; Flags: unchecked

[InstallDelete]
; PyInstaller 的依赖都在 _internal 里；覆盖安装留下上一版多出来的库会被新版误加载。
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\*"; DestDir: "{tmp}\Peach-preflight"; Flags: dontcopy recursesubdirs createallsubdirs
#ifdef LiteInstaller
Source: "{tmp}\Peach-preflight\tools\*"; DestDir: "{app}\tools"; ExternalSize: 0; Flags: external ignoreversion recursesubdirs createallsubdirs
Source: "{tmp}\Peach-preflight\cloudflared.exe"; DestDir: "{app}"; ExternalSize: 0; Flags: external ignoreversion
Source: "{tmp}\Peach-preflight\cloudflared-manifest.json"; DestDir: "{app}"; ExternalSize: 0; Flags: external ignoreversion
#endif

[Icons]
Name: "{userprograms}\Peach"; Filename: "{app}\Peach.exe"; Parameters: "--show"
Name: "{userdesktop}\Peach"; Filename: "{app}\Peach.exe"; Parameters: "--show"; Tasks: desktopicon

[Run]
Filename: "{app}\Peach.exe"; Parameters: "--show"; Description: "{cm:LaunchProgram,Peach}"; Flags: nowait postinstall skipifsilent
Filename: "https://github.com/peach-mitao/peach"; Description: "Open the Peach repository and star the project"; Flags: shellexec postinstall skipifsilent unchecked

[UninstallDelete]
; 自更新整目录换过之后，卸载记录里的文件清单不再完整，按目录整个移除。
Type: filesandordirs; Name: "{app}"

[Code]
var
  GuardPrepared: Boolean;
  LibrarySharingPage: TOutputMsgMemoWizardPage;
#ifdef LiteInstaller
  ToolsPrepared: Boolean;
  ToolsPage: TOutputMarqueeProgressWizardPage;
#endif

function GetCurrentProcessId(): LongWord;
  external 'GetCurrentProcessId@kernel32.dll stdcall';

procedure InitializeWizard();
begin
  LibrarySharingPage := CreateOutputMsgMemoPage(wpSelectTasks,
    'Library and taste details upload', 'Used for research on library structure and preferences across Peach users.',
    'Continuing means you agree to upload the details below weekly; to opt out, go back and untick it.', '');
  LibrarySharingPage.RichEditViewer.Text :=
    'Works: de-duplicated work codes, ratings, likes, dislikes, watched, watch-later, play counts, watch ratios and manually added tags.' + #13#10#13#10 +
    'Preference summary: favourites, likes, dislikes, watch counts and rating distributions grouped by performer, creator, studio, series, manual tag, era and duration (coded works and uncoded entries kept separate), plus the names of entities you actively favourited.' + #13#10#13#10 +
    'Library coverage: file count, coded work count and uncoded entry count. The uncoded library is only included in the local summary.' + #13#10#13#10 +
    'Version and period: Peach version, field version and UTC calendar week.' + #13#10#13#10 +
    'Not uploaded: accounts, device or installation identifiers, internal row numbers, file names, paths, titles, media, URLs, search terms, and per-item browsing or watch history.' + #13#10#13#10 +
    'The full details can reflect adult content preferences; the receiving service is a separate Sentry project and can see the connecting IP.' + #13#10#13#10 +
    'You can view the full local preview or turn this off on the settings page. Turning it off stops further uploads; data already sent cannot be withdrawn with the local switch.';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = LibrarySharingPage.ID) and not WizardIsTaskSelected('librarysharing');
end;

procedure FinishTaskGuard();
var
  ResultCode: Integer;
begin
  if GuardPrepared then
  begin
    if Exec(ExpandConstant('{tmp}\Peach-preflight\Peach.exe'),
      '--installer-finish "' + ExpandConstant('{app}') + '" ' + IntToStr(GetCurrentProcessId()),
      ExpandConstant('{tmp}\Peach-preflight'), SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) then
      GuardPrepared := False;
  end;
end;

procedure DeinitializeSetup();
begin
  FinishTaskGuard();
end;

function DataRoot(): String;
begin
  Result := GetEnv('PEACH_DATA_ROOT');
  if Result = '' then
    Result := ExpandConstant('{localappdata}\Peach\peach-data');
end;

#include "directory-validation.iss"

function InstallationDirectoryError(): String;
var
  PreviousDirectory: String;
begin
  PreviousDirectory := '';
  RegQueryStringValue(HKCU,
    'Software\Microsoft\Windows\CurrentVersion\Uninstall\{02D9748A-78F6-4866-AC75-918177194DAB}_is1',
    'Inno Setup: App Path', PreviousDirectory);
  Result := DirectoryError(WizardDirValue(), DataRoot(), PreviousDirectory);
  if Result = '' then
    Result := DirectoryError(WizardDirValue(), ExpandConstant('{localappdata}\Peach\peach-data'), PreviousDirectory);
  if Result <> '' then
    Result := CustomMessage(Result);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Error: String;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    Error := InstallationDirectoryError();
    Result := Error = '';
    if not Result then
      SuppressibleMsgBox(Error, mbError, MB_OK, IDOK);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  ErrorText: AnsiString;
begin
  Result := InstallationDirectoryError();
  if Result <> '' then
    Exit;
  if GuardPrepared then
    Exit;
  ExtractTemporaryFiles('{tmp}\Peach-preflight\*');
#ifdef LiteInstaller
  if not ToolsPrepared then
  begin
    if ToolsPage = nil then
      ToolsPage := CreateOutputMarqueeProgressPage('Preparing media tools', 'Existing tools are verified and reused; missing ones are downloaded automatically.');
    ToolsPage.SetText('Checking, downloading and verifying media tools. Please wait.', 'If the download fails you can retry; the existing installation is kept.');
    ToolsPage.Show;
    ToolsPage.Animate;
    try
      ToolsPrepared := Exec(ExpandConstant('{tmp}\Peach-preflight\Peach.exe'),
        '--installer-tools "' + ExpandConstant('{app}') + '" "' + ExpandConstant('{src}\.') +
        '" "' + ExpandConstant('{tmp}\Peach-preflight\tools-error.txt') + '"',
        ExpandConstant('{tmp}\Peach-preflight'), SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
    finally
      ToolsPage.Hide;
    end;
    if not ToolsPrepared then
    begin
      Result := 'Media tools could not be prepared. Check your network and try again.';
      if LoadStringFromFile(ExpandConstant('{tmp}\Peach-preflight\tools-error.txt'), ErrorText) then
        Result := UTF8Decode(ErrorText);
      Exit;
    end;
  end;
#endif
  if not Exec(ExpandConstant('{tmp}\Peach-preflight\Peach.exe'),
      '--installer-prepare "' + ExpandConstant('{app}') + '" ' + IntToStr(GetCurrentProcessId()) +
      ' "' + ExpandConstant('{tmp}\Peach-preflight\prepare-error.txt') + '"',
      ExpandConstant('{tmp}\Peach-preflight'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or
      (ResultCode <> 0) then
  begin
    Result := CustomMessage('TaskCheckFailed');
    if LoadStringFromFile(ExpandConstant('{tmp}\Peach-preflight\prepare-error.txt'), ErrorText) then
      Result := UTF8Decode(ErrorText);
  end
  else
    GuardPrepared := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  ReportingConsent: String;
  LibraryConsent: String;
begin
  if (CurStep = ssPostInstall) and not WizardSilent() then
  begin
    ReportingConsent := '0';
    if WizardIsTaskSelected('reporting') then ReportingConsent := '1';
    if not Exec(ExpandConstant('{app}\Peach.exe'),
      '--installer-reporting ' + ReportingConsent + ' ' + ReportingConsent,
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      SuppressibleMsgBox(CustomMessage('ReportingFailed'), mbError, MB_OK, IDOK);
    LibraryConsent := '0';
    if WizardIsTaskSelected('librarysharing') then LibraryConsent := '1';
    if not Exec(ExpandConstant('{app}\Peach.exe'),
      '--installer-library-sharing ' + LibraryConsent,
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      SuppressibleMsgBox(CustomMessage('LibrarySharingFailed'), mbError, MB_OK, IDOK);
  end;
  { 服务启动时不迁移账本；覆盖安装换了程序，要在这里补上。没有账本的新机器不跑，
    否则会凭空建出账本，首次设置页就再也不出现。migrate 自己会先备份。 }
  if CurStep = ssPostInstall then
    if not Exec(ExpandConstant('{tmp}\Peach-preflight\Peach.exe'),
                '--installer-migrate "' + ExpandConstant('{app}') + '"', ExpandConstant('{tmp}\Peach-preflight'),
                SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      SuppressibleMsgBox(CustomMessage('MigrationFailed'), mbError, MB_OK, IDOK);
  if CurStep = ssPostInstall then
    FinishTaskGuard();
end;

function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  if Exec(ExpandConstant('{app}\Peach.exe'), '--installer-uninstall', ExpandConstant('{app}'),
          SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 1) then
  begin
    SuppressibleMsgBox(CustomMessage('StillRunning'), mbError, MB_OK, IDOK);
    Result := False;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and DirExists(DataRoot()) then
    SuppressibleMsgBox(FmtMessage(CustomMessage('DataKept'), [DataRoot()]), mbInformation, MB_OK, IDOK);
end;
