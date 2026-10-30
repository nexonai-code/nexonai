; Inno Setup script for the unpruuf Windows installer. Built by the workflow / build-installer.bat.
; ISCC.exe /DAppVersion=2026.10.26 /DStageDir=...\stage /DOutDir=... unpruuf.iss
#ifndef AppVersion
  #define AppVersion "0.0"
#endif
#ifndef StageDir
  #define StageDir "build\stage"
#endif
#ifndef OutDir
  #define OutDir "build"
#endif

[Setup]
AppId={{6F3C1E52-8B1F-4F43-9D3B-0A5C2B7E91D4}
AppName=unpruuf
AppVersion={#AppVersion}
AppPublisher=NexonAI Consulting SRL
AppPublisherURL=https://nexonai.ro
DefaultDirName={localappdata}\unpruuf
DefaultGroupName=unpruuf
PrivilegesRequired=lowest
OutputDir={#OutDir}
OutputBaseFilename=unpruuf-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
InfoBeforeFile={#StageDir}\INSTALL_INFO.txt
DisableProgramGroupPage=yes
UninstallDisplayName=unpruuf
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

[Types]
Name: "full"; Description: "Everything"
Name: "custom"; Description: "Choose parts"; Flags: iscustom

[Components]
Name: "runtime"; Description: "Node.js runtime (needed by all parts)"; Types: full custom; Flags: fixed
Name: "nodeserver"; Description: "Node server (your own server with 250 node addresses, Temp Node)"; Types: full
Name: "officer"; Description: "Compliance dashboard and Press newsroom (officer app)"; Types: full
Name: "control"; Description: "unpruuf Control (licence stock, install servers, node lists)"; Types: full
Name: "licensetool"; Description: "Licence tool (issue app and server codes)"; Types: full
Name: "webreporter"; Description: "Web reporter (browser page for reporters)"; Types: full
Name: "relay"; Description: "Optional relay (store-and-forward, off by default in the app)"; Types: full

[Files]
Source: "{#StageDir}\runtime\*"; DestDir: "{app}\runtime"; Flags: recursesubdirs ignoreversion; Components: runtime
Source: "{#StageDir}\INSTALL_INFO.txt"; DestDir: "{app}"; Flags: ignoreversion; Components: runtime
Source: "{#StageDir}\node-mesh-server\*"; DestDir: "{app}\node-mesh-server"; Flags: recursesubdirs ignoreversion; Components: nodeserver
Source: "{#StageDir}\launch-node-server.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: nodeserver
Source: "{#StageDir}\launch-temp-node.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: nodeserver
Source: "{#StageDir}\launch-export-node-list.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: nodeserver
Source: "{#StageDir}\launch-license-paste.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: nodeserver
Source: "{#StageDir}\officer-app\*"; DestDir: "{app}\officer-app"; Flags: recursesubdirs ignoreversion; Components: officer
Source: "{#StageDir}\launch-compliance.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: officer
Source: "{#StageDir}\launch-press.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: officer
Source: "{#StageDir}\control\*"; DestDir: "{app}\control"; Flags: recursesubdirs ignoreversion; Components: control
Source: "{#StageDir}\launch-control.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: control
Source: "{#StageDir}\license-tool\*"; DestDir: "{app}\license-tool"; Flags: recursesubdirs ignoreversion; Components: licensetool
Source: "{#StageDir}\launch-license-tool.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: licensetool
Source: "{#StageDir}\launch-license-keygen.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: licensetool
Source: "{#StageDir}\launch-license-publickey.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: licensetool
Source: "{#StageDir}\web-reporter\*"; DestDir: "{app}\web-reporter"; Flags: recursesubdirs ignoreversion; Components: webreporter
Source: "{#StageDir}\launch-web-reporter.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: webreporter
Source: "{#StageDir}\server\*"; DestDir: "{app}\server"; Flags: recursesubdirs ignoreversion; Components: relay
Source: "{#StageDir}\launch-relay.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: relay

[Icons]
Name: "{group}\unpruuf Node Server"; Filename: "{app}\launch-node-server.cmd"; WorkingDir: "{app}\node-mesh-server"; Components: nodeserver
Name: "{group}\unpruuf Paste server licence"; Filename: "{app}\launch-license-paste.cmd"; WorkingDir: "{app}\node-mesh-server"; Components: nodeserver
Name: "{group}\unpruuf Temp Node"; Filename: "{app}\launch-temp-node.cmd"; WorkingDir: "{app}\node-mesh-server"; Components: nodeserver
Name: "{group}\unpruuf Export node list"; Filename: "{app}\launch-export-node-list.cmd"; WorkingDir: "{app}\node-mesh-server"; Components: nodeserver
Name: "{group}\unpruuf Compliance"; Filename: "{app}\launch-compliance.cmd"; WorkingDir: "{app}\officer-app"; Components: officer
Name: "{group}\unpruuf Press"; Filename: "{app}\launch-press.cmd"; WorkingDir: "{app}\officer-app"; Components: officer
Name: "{group}\unpruuf Control"; Filename: "{app}\launch-control.cmd"; WorkingDir: "{app}\control"; Components: control
Name: "{group}\unpruuf Licence tool"; Filename: "{app}\launch-license-tool.cmd"; WorkingDir: "{app}\license-tool\gui"; Components: licensetool
Name: "{group}\unpruuf Licence key, create new"; Filename: "{app}\launch-license-keygen.cmd"; WorkingDir: "{app}\license-tool"; Components: licensetool
Name: "{group}\unpruuf Licence key, show public key"; Filename: "{app}\launch-license-publickey.cmd"; WorkingDir: "{app}\license-tool"; Components: licensetool
Name: "{group}\unpruuf Web reporter"; Filename: "{app}\launch-web-reporter.cmd"; WorkingDir: "{app}\web-reporter"; Components: webreporter
Name: "{group}\unpruuf Relay"; Filename: "{app}\launch-relay.cmd"; WorkingDir: "{app}\server"; Components: relay
Name: "{group}\Read me first"; Filename: "{app}\INSTALL_INFO.txt"; Components: runtime
Name: "{group}\Open program folder"; Filename: "{app}"; Components: runtime

[Messages]
FinishedLabel=unpruuf is installed. Start the programs from the Start menu, group "unpruuf".%n%nPilot phase, not independently audited.
