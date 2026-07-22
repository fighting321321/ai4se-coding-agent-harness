param(
  [ValidateSet("versions", "install", "test", "lint", "typecheck", "build", "demo", "audit", "pack", "all")]
  [string]$Task = "all"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$requiredNodeVersion = "24.14.0"
$requiredPnpmVersion = "11.14.0"
$repositoryRoot = Split-Path -Parent $PSScriptRoot

function Get-ExistingCandidates {
  param([object[]]$Candidates)

  return $Candidates |
    Where-Object { $_ -is [string] -and $_.Length -gt 0 } |
    Select-Object -Unique
}

function Resolve-ProjectNode {
  $pathNode = Get-Command node.exe -ErrorAction SilentlyContinue
  $candidates = Get-ExistingCandidates @(
    $env:AI4SE_NODE,
    $(if ($env:USERPROFILE) {
      Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    }),
    $(if ($pathNode) { $pathNode.Source })
  )

  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      continue
    }
    $version = (& $candidate --version 2>$null).Trim().TrimStart("v")
    if ($LASTEXITCODE -eq 0 -and $version -eq $requiredNodeVersion) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "Node $requiredNodeVersion was not found. Set AI4SE_NODE to the exact executable path."
}

function Resolve-ProjectPnpm {
  param([string]$NodePath)

  $relativeCli = ".tools\pnpm\$requiredPnpmVersion\node_modules\pnpm\bin\pnpm.cjs"
  $candidates = Get-ExistingCandidates @(
    $env:AI4SE_PNPM_CLI,
    $(if ($env:LOCALAPPDATA) { Join-Path (Join-Path $env:LOCALAPPDATA "pnpm") $relativeCli }),
    $(if ($env:PNPM_HOME) { Join-Path $env:PNPM_HOME $relativeCli })
  )

  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      continue
    }
    $version = (& $NodePath $candidate --version 2>$null).Trim()
    if ($LASTEXITCODE -eq 0 -and $version -eq $requiredPnpmVersion) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "pnpm $requiredPnpmVersion was not found. Set AI4SE_PNPM_CLI to the exact pnpm.cjs path."
}

$nodePath = Resolve-ProjectNode
$pnpmCli = Resolve-ProjectPnpm -NodePath $nodePath
$nodeDirectory = Split-Path -Parent $nodePath
$env:Path = "$nodeDirectory$([IO.Path]::PathSeparator)$env:Path"
$env:npm_execpath = $pnpmCli
$env:npm_node_execpath = $nodePath
Set-Location -LiteralPath $repositoryRoot

function Invoke-ProjectPnpm {
  param([string[]]$PnpmArguments)

  & $nodePath $pnpmCli @PnpmArguments
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if ($Task -eq "versions") {
  Write-Output "Node $requiredNodeVersion | $nodePath"
  Write-Output "pnpm $requiredPnpmVersion | $pnpmCli"
  exit 0
}

if ($Task -eq "install") {
  Invoke-ProjectPnpm @("install", "--frozen-lockfile")
  exit 0
}

if ($Task -eq "audit") {
  Invoke-ProjectPnpm @("final:audit")
  exit 0
}

if ($Task -eq "pack") {
  Invoke-ProjectPnpm @("--filter", "@ai4se/harness", "run", "build")
  Invoke-ProjectPnpm @(
    "--filter",
    "@ai4se/harness",
    "pack",
    "--pack-destination",
    ".ai4se/submission-output"
  )
  exit 0
}

if ($Task -eq "all") {
  foreach ($scriptName in @("test", "lint", "typecheck", "build", "demo", "final:audit")) {
    Invoke-ProjectPnpm @($scriptName)
  }
  exit 0
}

Invoke-ProjectPnpm @($Task)
