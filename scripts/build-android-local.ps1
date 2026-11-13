[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateSet('dev', 'preview')]
  [string]$Mode,
  [string]$Architectures = $(if ($env:CUBYFIT_ANDROID_ABIS) { $env:CUBYFIT_ANDROID_ABIS } else { 'arm64-v8a' }),
  [switch]$CompareInstalled
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Fail([string]$Message) { throw "LOCAL ANDROID BUILD: $Message" }
function Require-Path([string]$Path, [string]$Description) {
  if (-not (Test-Path -LiteralPath $Path)) { Fail "$Description was not found: $Path" }
}
function Set-EnvValue([string]$Name, [string]$Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}
function Load-LocalEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $name = $matches[1]
      $value = $matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
        Set-EnvValue $name $value
      }
    }
  }
}
function Require-Env([string]$Name) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, 'Process'))) {
    Fail "Set $Name in .env.local before building."
  }
}
function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}
function Invoke-Logged([string]$FilePath, [string]$Command, [string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Command @Arguments *>&1 | Tee-Object -FilePath $FilePath -Append
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) { Fail "Command failed: $Command $($Arguments -join ' '). See $FilePath" }
}
function Remove-StaleNativeCache([string]$ProjectRoot) {
  $targets = @(
    (Join-Path $ProjectRoot 'android\app\.cxx'),
    (Join-Path $ProjectRoot 'android\app\build\intermediates\cxx')
  )
  foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $resolved = (Resolve-Path -LiteralPath $target).Path
    $expected = (Resolve-Path -LiteralPath (Join-Path $ProjectRoot 'android\app')).Path
    if (-not $resolved.StartsWith($expected + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      Fail "Refusing to clear a native cache outside android/app: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
    Write-Host "Regenerated native cache: $resolved"
  }
}
function Get-BuildTools([string]$SdkRoot) {
  $candidate = Get-ChildItem -LiteralPath (Join-Path $SdkRoot 'build-tools') -Directory |
    Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'aapt.exe')) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'apksigner.bat')) } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1
  if (-not $candidate) { Fail 'Android build tools with aapt.exe and apksigner.bat are required.' }
  return $candidate.FullName
}
function Get-CertificateDigest([string]$ApkSigner, [string]$Apk) {
  $output = & $ApkSigner verify --print-certs $Apk 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "APK signature verification failed: $Apk" }
  $line = $output | Where-Object { $_ -match '(?:Signer #1|V2 Signer): certificate SHA-256 digest:' } | Select-Object -First 1
  if (-not $line) { Fail "APK signature digest was not reported: $Apk" }
  return (($line -split ':')[-1]).Trim()
}
function Get-FileSha256([string]$Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path)))).Replace('-', '')
  } finally {
    $sha.Dispose()
  }
}
function Test-ApkContainsAsset([string]$Apk, [string]$AssetPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $assetSize = (Get-Item -LiteralPath $AssetPath).Length
  $archive = [IO.Compression.ZipFile]::OpenRead($Apk)
  try {
    return $null -ne ($archive.Entries | Where-Object { $_.Length -eq $assetSize } | Select-Object -First 1)
  } finally {
    $archive.Dispose()
  }
}
function Get-NativeConfigFingerprint([string]$ProjectRoot) {
  $inputs = @(
    (Join-Path $ProjectRoot 'app.json'),
    (Join-Path $ProjectRoot 'app.config.js'),
    (Join-Path $ProjectRoot 'package.json'),
    (Join-Path $ProjectRoot 'plugins\withLocalAndroidBuildSettings.js')
  )
  $content = ($inputs | ForEach-Object { Get-FileSha256 $_ }) -join ':'
  $content += ':' + [Environment]::GetEnvironmentVariable('GOOGLE_ADMOB_APP_ID', 'Process')
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($content)))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $projectRoot.Equals('C:\Fit', [StringComparison]::OrdinalIgnoreCase)) {
  Fail "This workflow is pinned to C:\Fit. Found script root: $projectRoot"
}
Require-Path (Join-Path $projectRoot 'package.json') 'package.json'
Require-Path (Join-Path $projectRoot 'node_modules') 'node_modules'
Require-Path (Join-Path $projectRoot 'android\gradlew.bat') 'Android Gradle wrapper'
Load-LocalEnv (Join-Path $projectRoot '.env.local')

$nodeVersion = (& node --version).Trim()
if ($nodeVersion -notmatch '^v(2[0-9]|[3-9][0-9])\.') { Fail "Node 20 or later is required. Found $nodeVersion" }
$npmVersion = (& npm.cmd --version).Trim()
$freeDiskGiB = [Math]::Round((Get-PSDrive -Name C).Free / 1GB, 1)
if ($freeDiskGiB -lt 5) { Fail "At least 5 GiB free disk space is required. Found $freeDiskGiB GiB." }

# Both local modes are explicitly non-production for AdMob. This is a
# process-local override; it does not change .env.local.
Set-EnvValue 'EXPO_PUBLIC_ADMOB_PRODUCTION_ADS_ENABLED' 'false'
Set-EnvValue 'EXPO_PUBLIC_CUBYFIT_ADMOB_TESTING' 'true'
Set-EnvValue 'CUBYFIT_ADMOB_BUILD_CHANNEL' "local-$Mode"

foreach ($name in @(
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED',
  'EXPO_PUBLIC_CONVEX_URL',
  'GOOGLE_ADMOB_APP_ID',
  'GOOGLE_ADMOB_AD_UNIT_ID'
)) { Require-Env $name }
$clerkPublishableKey = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', 'Process')
if ($clerkPublishableKey -notmatch '^pk_(test|live)_[A-Za-z0-9_-]+$') {
  Fail 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a public Clerk publishable key.'
}
$appleAndroidOAuth = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED', 'Process')
if ($appleAndroidOAuth -notin @('true', 'false')) {
  Fail 'EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED must be exactly true or false.'
}
if ($appleAndroidOAuth -ne 'true') {
  Fail 'Enable the existing Clerk Apple Android browser OAuth connection in .env.local before building this authentication test APK.'
}
if ($Mode -eq 'dev') {
  Require-Env 'EXPO_PUBLIC_REVENUECAT_TEST_KEY'
} else {
  Require-Env 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY'
  $previewRevenueCatKey = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY', 'Process')
  if ($previewRevenueCatKey.StartsWith('test_')) {
    Fail 'Preview is a non-debuggable release APK. RevenueCat Test Store keys are unsupported there; set the Android public SDK key for the existing sandbox-enabled app instead.'
  }
}

$javaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Process')
if ([string]::IsNullOrWhiteSpace($javaHome)) { Fail 'JAVA_HOME must point to JDK 17 or later.' }
$java = Join-Path $javaHome 'bin\java.exe'
Require-Path $java 'JAVA_HOME Java executable'
$javaVersion = (& cmd.exe /d /c ('"{0}" -version 2>&1' -f $java) | Select-Object -First 1).ToString()
if ($javaVersion -notmatch '"(1[7-9]|2[0-9])(?:\.|_)') { Fail "JDK 17 or later is required. JAVA_HOME reports: $javaVersion" }
$env:Path = "$(Join-Path $javaHome 'bin');$env:Path"

$sdkRoot = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME, (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) |
  Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_) } |
  Select-Object -First 1
if (-not $sdkRoot) { Fail 'Android SDK was not found. Set ANDROID_SDK_ROOT.' }
$sdkRoot = (Resolve-Path -LiteralPath $sdkRoot).Path
Set-EnvValue 'ANDROID_SDK_ROOT' $sdkRoot
Set-EnvValue 'ANDROID_HOME' $sdkRoot
Require-Path (Join-Path $sdkRoot 'platform-tools\adb.exe') 'Android platform tools'
Require-Path (Join-Path $sdkRoot 'ndk\27.1.12297006') 'Android NDK 27.1.12297006'
Require-Path (Join-Path $sdkRoot 'cmake\3.22.1\bin\cmake.exe') 'Android CMake 3.22.1'
Require-Path (Join-Path $sdkRoot 'cmake\3.22.1\bin\ninja.exe') 'Android Ninja'
$buildTools = Get-BuildTools $sdkRoot
$aapt = Join-Path $buildTools 'aapt.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'

$outputRoot = Join-Path $projectRoot 'builds\local'
$logRoot = Join-Path $outputRoot 'logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$logPath = Join-Path $logRoot ("{0}-{1:yyyyMMdd-HHmmss}.log" -f $Mode, (Get-Date))

Write-Section 'Local Android preflight'
Write-Host "Mode: $Mode"
Write-Host "Architectures: $Architectures"
Write-Host "Node/npm: $nodeVersion / $npmVersion"
Write-Host "JDK: $javaVersion"
Write-Host "Android SDK: $sdkRoot"
Write-Host "Free disk: $freeDiskGiB GiB"
Write-Host "Build log: $logPath"

Push-Location $projectRoot
try {
  $androidRoot = Join-Path $projectRoot 'android'
  $markerPath = Join-Path $androidRoot '.cubyfit-local-config.sha256'
  $fingerprint = Get-NativeConfigFingerprint $projectRoot
  $gradleProperties = Join-Path $androidRoot 'gradle.properties'
  $nativeConfigReady = (Test-Path -LiteralPath $gradleProperties) -and
    ((Get-Content -LiteralPath $gradleProperties -Raw) -match '(?m)^expo\.android\.cmakeObjectPathMax=240$')
  $recordedFingerprint = if (Test-Path -LiteralPath $markerPath) { (Get-Content -LiteralPath $markerPath -Raw).Trim() } else { '' }
  if (-not $nativeConfigReady -or ($recordedFingerprint -and $recordedFingerprint -ne $fingerprint)) {
    Write-Section 'Generate native configuration'
    Invoke-Logged $logPath 'npx.cmd' @('expo', 'prebuild', '--platform', 'android', '--no-install')
    Set-Content -LiteralPath $markerPath -Value $fingerprint -NoNewline
  } elseif (-not $recordedFingerprint) {
    Set-Content -LiteralPath $markerPath -Value $fingerprint -NoNewline
    Write-Host 'Generated native configuration is current.'
  } else {
    Write-Host 'Generated native configuration is current.'
  }

  $cache = Join-Path $projectRoot 'android\app\.cxx\Debug'
  $staleObjectLimit = $false
  if (Test-Path -LiteralPath $cache) {
    $staleObjectLimit = Select-String -Path (Join-Path $cache '*\*\CMakeCache.txt') -Pattern 'CMAKE_OBJECT_PATH_MAX:UNINITIALIZED=1024' -Quiet -ErrorAction SilentlyContinue
  }
  if ($staleObjectLimit) { Remove-StaleNativeCache $projectRoot }

  Write-Section 'Compile APK'
  $task = if ($Mode -eq 'dev') { ':app:assembleDebug' } else { ':app:assembleRelease' }
  Push-Location $androidRoot
  try {
    Invoke-Logged $logPath '.\gradlew.bat' @(
      $task,
      "-PreactNativeArchitectures=$Architectures",
      '--no-daemon',
      '--max-workers=2',
      '--console=plain'
    )
  } finally {
    Pop-Location
  }

  $sourceApk = if ($Mode -eq 'dev') {
    Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
  } else {
    Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
  }
  Require-Path $sourceApk 'Generated APK'
  $targetName = if ($Mode -eq 'dev') { 'cubyfit-development.apk' } else { 'cubyfit-preview.apk' }
  $targetApk = Join-Path $outputRoot $targetName
  Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force

  Write-Section 'Verify APK'
  $badging = & $aapt dump badging $targetApk
  if ($LASTEXITCODE -ne 0 -or -not ($badging -match "package: name='com.bettereveryday.fitness'")) {
    Fail 'APK does not contain the expected com.bettereveryday.fitness package ID.'
  }
  $manifest = & $aapt dump xmltree $targetApk AndroidManifest.xml
  foreach ($required in @('betterday', 'com.google.android.gms.ads.APPLICATION_ID')) {
    if (-not ($manifest -match [regex]::Escape($required))) { Fail "APK manifest is missing $required." }
  }
  $packageList = Get-ChildItem (Join-Path $projectRoot 'android\app\build\generated') -Recurse -Filter PackageList.java | Select-Object -First 1
  if (-not $packageList) { Fail 'React Native autolinking output was not generated.' }
  $linkedPackages = Get-Content -LiteralPath $packageList.FullName -Raw
  foreach ($required in @('ReactNativeGoogleMobileAdsPackage', 'RNPurchasesPackage', 'RNSentryPackage')) {
    if (-not $linkedPackages.Contains($required)) { Fail "Native autolinking output is missing $required." }
  }
  if ($Mode -eq 'dev') {
    $debugManifest = Get-ChildItem (Join-Path $projectRoot 'android\app\build\intermediates\merged_manifests\debug') -Recurse -Filter AndroidManifest.xml | Select-Object -First 1
    if (-not $debugManifest -or -not ((Get-Content $debugManifest.FullName -Raw).Contains('expo.modules.devlauncher'))) {
      Fail 'Development APK build did not include Expo Dev Client.'
    }
  } else {
    $apkEntries = & $aapt list $targetApk
    if (-not ($apkEntries -match 'index\.android\.bundle')) { Fail 'Preview APK is missing its embedded JavaScript bundle.' }
    if (-not (Test-ApkContainsAsset $targetApk (Join-Path $projectRoot 'assets\foods-full-v4.sqlite.gz'))) {
      Fail 'Preview APK is missing the bundled full food catalog asset.'
    }
  }

  $digest = Get-CertificateDigest $apksigner $targetApk
  $sizeMiB = [Math]::Round((Get-Item -LiteralPath $targetApk).Length / 1MB, 1)
  Write-Host "APK: $targetApk"
  Write-Host "Size: $sizeMiB MiB"
  Write-Host "Signer SHA-256: $digest"

  if ($CompareInstalled) {
    $adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
    $state = & $adb get-state 2>$null
    if ($state -ne 'device') {
      Write-Host 'No authorized Android device is connected; skipped installed-signature comparison.'
    } else {
      $installedPath = (& $adb shell pm path com.bettereveryday.fitness | Select-Object -First 1).ToString().Replace('package:', '').Trim()
      if ([string]::IsNullOrWhiteSpace($installedPath)) {
        Write-Host 'Cubyfit is not installed on the connected device; skipped installed-signature comparison.'
      } else {
        $installedApk = Join-Path $outputRoot 'installed-cubyfit-base.apk'
        & $adb pull $installedPath $installedApk | Out-Null
        if ($LASTEXITCODE -ne 0) { Fail 'Could not read the installed APK for signature comparison.' }
        $installedDigest = Get-CertificateDigest $apksigner $installedApk
        if ($digest -eq $installedDigest) { Write-Host 'Installed APK signature: compatible update.' -ForegroundColor Green }
        else { Write-Warning 'Installed APK signature differs. Do not install this APK as an update; keep the existing app data and use matching signing credentials if replacement is required.' }
      }
    }
  }
} finally {
  Pop-Location
}
