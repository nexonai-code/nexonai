# Builds the Windows delivery tree (portable folder) for the unpruuf installer.
#   powershell -ExecutionPolicy Bypass -File build-stage.ps1 [-Out <folder>]
# Needs Node.js 22 LTS on this machine (the runtime that ships in the installer is a copy of it).
# Result: <Out>\stage  = runtime\node.exe + every app with its production node_modules + launchers.
param([string]$Out = (Join-Path $PSScriptRoot 'build'))
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stage = Join-Path $Out 'stage'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

function Step($t) { Write-Host "`n[stage] $t" -ForegroundColor Cyan }
function Run($dir, $cmd) {
  Push-Location $dir
  try { cmd /c $cmd; if ($LASTEXITCODE -ne 0) { throw "failed ($LASTEXITCODE): $cmd in $dir" } } finally { Pop-Location }
}
# Copies an app folder without sources, tests, runtime data, secrets and node_modules.
function CopyApp($name, $sub = '') {
  $src = Join-Path $root $name; if ($sub) { $src = Join-Path $src $sub }
  $dst = Join-Path $stage $name; if ($sub) { $dst = Join-Path $dst $sub }
  New-Item -ItemType Directory -Force $dst | Out-Null
  $xd = @('node_modules','src','data','data-press','build','tor-bin','tools','instances','tor-data','tor-hidden-service','.git','test')
  $xf = @('*.sqlite','*.sqlite-*','*.log','*.env.bat','*-identity.json','private-key.json','customers.json','*.csv','release-fingerprints.txt','*.jks','keystore.properties','release.properties','.DS_Store','Thumbs.db','tsconfig.json','*.ts')
  robocopy $src $dst /E /NFL /NDL /NJH /NJS /NP /XD $xd /XF $xf | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $name" }
  $global:LASTEXITCODE = 0
}

Step 'runtime (a copy of this machine''s Node.js)'
New-Item -ItemType Directory -Force (Join-Path $stage 'runtime') | Out-Null
Copy-Item (Get-Command node).Source (Join-Path $stage 'runtime\node.exe')
& (Join-Path $stage 'runtime\node.exe') --version

# name, build command(s) in the source tree
$apps = @(
  @{ n = 'node-mesh-server'; b = 'npm ci --no-audit --no-fund && npm run build' },
  @{ n = 'officer-app';      b = 'npm ci --no-audit --no-fund && npm run build' },
  @{ n = 'control';          b = 'npm ci --no-audit --no-fund && npm run build' },
  @{ n = 'server';           b = 'npm ci --no-audit --no-fund && npm run build' },
  @{ n = 'web-reporter';     b = 'npm ci --no-audit --no-fund && npm run build' }
)
foreach ($a in $apps) { Step "build $($a.n)"; Run (Join-Path $root $a.n) $a.b }

Step 'control: bundle the node server exactly as Control installs it'
Run (Join-Path $root 'control') 'npm run bundle'

foreach ($a in $apps) {
  Step "stage $($a.n)"
  CopyApp $a.n
  Run (Join-Path $stage $a.n) 'npm ci --omit=dev --no-audit --no-fund'
}
Step 'stage license-tool'
CopyApp 'license-tool'
CopyApp 'license-tool' 'gui'
Run (Join-Path $stage 'license-tool\gui') 'npm ci --omit=dev --no-audit --no-fund'

Step 'launchers and info'
Copy-Item (Join-Path $PSScriptRoot 'launchers\*') $stage
Copy-Item (Join-Path $PSScriptRoot 'INSTALL_INFO.txt') $stage

Step 'checks on the staged tree'
$node = Join-Path $stage 'runtime\node.exe'
foreach ($n in 'node-mesh-server','officer-app','server') {
  Push-Location (Join-Path $stage $n)
  try {
    & $node -e "const D=require('better-sqlite3'); const d=new D(':memory:'); if (d.prepare('select 1 as x').get().x!==1) process.exit(2); console.log('sqlite ok')"
    if ($LASTEXITCODE -ne 0) { throw "better-sqlite3 does not load in $n" }
  } finally { Pop-Location }
}
Write-Host "`n[stage] done: $stage" -ForegroundColor Green
