[CmdletBinding()]
param([switch]$Clear, [switch]$Tunnel)

# Daily Cubyfit development server: ONE Metro on port 8081 in dev-client mode,
# for the "Cubyfit Dev" app (com.bettereveryday.fitness.dev). Never Expo Go.

$ErrorActionPreference = 'Stop'
$port = 8081
$devPackage = 'com.bettereveryday.fitness.dev'
$devClientScheme = 'exp+better-every-day'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $projectRoot.Equals('C:\Fit', [StringComparison]::OrdinalIgnoreCase)) {
  throw "Cubyfit development is pinned to C:\Fit. Found: $projectRoot"
}

# Expo disables file watching and Fast Refresh when CI is set. Clear it for
# this local process only.
if (-not [string]::IsNullOrWhiteSpace($env:CI)) {
  Write-Host 'Clearing CI for this Metro process (Expo disables Fast Refresh in CI mode).'
  Remove-Item Env:CI
}

# 1. Stop every stale Cubyfit Expo/Metro server (any port), nothing else.
$cli = [regex]::Escape((Join-Path $projectRoot 'node_modules'))
$stale = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match $cli -and $_.CommandLine -match 'expo[\\/]bin[\\/]cli.*\sstart'
})
foreach ($process in $stale) {
  Write-Host "Stopping stale Cubyfit Metro (PID $($process.ProcessId)): $($process.CommandLine)"
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($stale.Count) { Start-Sleep -Milliseconds 800 }
$occupied = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
if ($occupied.Count) {
  $owner = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $occupied[0].OwningProcess)
  throw "Port $port is used by PID $($owner.ProcessId) ($($owner.Name)), which is not Cubyfit Metro. Close it first."
}

# 2. Advertise the Wi-Fi address, not a VMware/virtual adapter.
$lanIp = $null
if (-not $Tunnel) {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
  if ($route) {
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
  }
  if ($lanIp) { $env:REACT_NATIVE_PACKAGER_HOSTNAME = $lanIp }
  else { Write-Warning 'Could not determine the Wi-Fi IPv4 address; Expo will choose one.' }
}

# 3. If a phone is connected over ADB (USB or wireless debugging), point it at
#    this server and open Cubyfit Dev automatically. Optional.
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$adbDevice = $null
if (Test-Path -LiteralPath $adb) {
  $serials = @(& $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' } | ForEach-Object { ($_ -split '\s+')[0] })
  # Wireless debugging lists one phone twice (IP:port and an mDNS name).
  # Group by hardware serial and prefer the IP:port entry.
  $phones = @($serials | Group-Object { (& $adb -s $_ shell getprop ro.serialno 2>$null | Out-String).Trim() })
  if ($phones.Count -eq 1) { $adbDevice = @($phones[0].Group | Sort-Object { $_ -notmatch '^\d+\.\d+\.\d+\.\d+:\d+$' })[0] }
  elseif ($phones.Count -gt 1) { Write-Host 'Several Android devices are connected over ADB; open Cubyfit Dev manually.' }
}

$serverUrl = if ($lanIp) { "http://${lanIp}:$port" } else { $null }
Write-Host ''
Write-Host '== Cubyfit Dev ==' -ForegroundColor Cyan
if ($serverUrl) { Write-Host "Metro: $serverUrl  (in Cubyfit Dev: 'Enter URL manually' -> this address, or scan the QR below with the phone camera)" }
Write-Host 'Connected when the Metro log shows "Android Bundled" followed by your app and the phone shows Cubyfit.'
Write-Host "Keys: r = reload phone, m = dev menu, Ctrl+C = stop. 'No apps connected' means Cubyfit Dev is not open on this server."
Write-Host ''

if ($adbDevice -and $serverUrl) {
  $installed = & $adb -s $adbDevice shell pm path $devPackage 2>$null
  if ($installed) {
    Start-Job -ScriptBlock {
      param($adb, $device, $port, $scheme, $url, $package)
      for ($i = 0; $i -lt 60; $i++) {
        try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$port/status" | Out-Null; break } catch { Start-Sleep 1 }
      }
      & $adb -s $device reverse "tcp:$port" "tcp:$port" | Out-Null
      $link = "${scheme}://expo-development-client/?url=$([uri]::EscapeDataString($url))"
      & $adb -s $device shell am start -a android.intent.action.VIEW -d "`"$link`"" $package | Out-Null
    } -ArgumentList $adb, $adbDevice, $port, $devClientScheme, $serverUrl, $devPackage | Out-Null
    Write-Host "ADB device $adbDevice found: Cubyfit Dev will open on this server once Metro is ready."
  } else {
    Write-Host "ADB device $adbDevice does not have Cubyfit Dev ($devPackage) installed yet."
  }
}

Push-Location $projectRoot
try {
  $arguments = @('expo', 'start', '--dev-client', '--port', "$port")
  $arguments += if ($Tunnel) { '--tunnel' } else { @('--host', 'lan') }
  if ($Clear) { $arguments += '--clear' }
  & npx.cmd @arguments
  if ($LASTEXITCODE -ne 0) { throw "Expo exited with code $LASTEXITCODE." }
} finally {
  Pop-Location
}
