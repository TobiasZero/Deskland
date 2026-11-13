param(
    [string]$NsisCompiler,
    [string]$WebView2Bootstrapper,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version' }
$dist = Join-Path $root 'dist'
$cache = Join-Path $dist 'installer-tools'
$payload = Join-Path $dist ('payload-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $cache, $payload | Out-Null
if (-not $SkipBuild) { & (Join-Path $root 'host\build.ps1') }

if (-not $NsisCompiler) {
    $nsisArchive = Join-Path $cache 'nsis-3.13.zip'
    $NsisCompiler = Join-Path $cache 'nsis-3.13\makensis.exe'
    if (-not (Test-Path -LiteralPath $NsisCompiler)) {
        # SourceForge liefert hinter der Weiche manchmal eine HTML-Seite；GitHub 镜像上是同一个官方压缩包。
        $nsisUrls = @(
            'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.13/nsis-3.13.zip',
            'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.13/nsis-3.13.zip'
        )
        $nsisHash = 'BA63DFFC4410EE89193E1CB5A41989991BD77C61068DA17E3156D136B7B0B3D8'
        $got = $false
        foreach ($url in $nsisUrls) {
            try {
                Invoke-WebRequest $url -OutFile $nsisArchive -UseBasicParsing
                if ((Get-FileHash -LiteralPath $nsisArchive -Algorithm SHA256).Hash -ne $nsisHash) { continue }
                $got = $true
                break
            } catch { }
        }
        if (-not $got) { throw 'NSIS 3.13 下载失败（SourceForge 和镜像都没有拿到正确文件）；可以用 -NsisCompiler 指定已有的 makensis.exe' }
        Expand-Archive -LiteralPath $nsisArchive -DestinationPath $cache -Force
    }
}
if (-not $WebView2Bootstrapper) {
    $WebView2Bootstrapper = Join-Path $cache 'MicrosoftEdgeWebview2Setup.exe'
    if (-not (Test-Path -LiteralPath $WebView2Bootstrapper)) {
        Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $WebView2Bootstrapper -UseBasicParsing
    }
}
$signature = Get-AuthenticodeSignature -LiteralPath $WebView2Bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') { throw 'WebView2 bootstrapper must have a valid Microsoft signature' }
if (-not (Test-Path -LiteralPath $NsisCompiler)) { throw 'NSIS compiler missing' }
$NsisCompiler = [IO.Path]::GetFullPath($NsisCompiler)
$WebView2Bootstrapper = [IO.Path]::GetFullPath($WebView2Bootstrapper)

# A fixed source list prevents other editions or private working files entering this package.
$sources = @('.gitattributes', '.gitignore', 'AGENTS.md', 'LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md',
    'host\DesktopHost.cs', 'host\DesklandPreview.ico', 'host\README.md', 'host\app.manifest', 'host\build.ps1', 'host\inspect.ps1',
    'tools\build-installer.ps1', 'tools\installer.nsi', 'tools\version.json')
$themeFiles = @('flat.html', 'meadow.html', 'settings.html', 'themes.json', 'share.js', 'serve.mjs', 'scene.js', 'scene.css', 'thumbs-data.js',
    'beach-palms.js', 'meadow-boy.js', 'meadow-cat.js',
    'i18n\en.json', 'i18n\zh-CN.json',
    'assets\beach-coconut-palm-v2.png', 'assets\beach-coconut-palm-curved.png', 'assets\beach-coconut-palm-airy.png', 'assets\beach-coconut-palm-windswept.png', 'assets\beach-coconut-palm-arch.png',
    'assets\meadow-black-kitten.png', 'assets\meadow-kite-boy-level-face.png', 'assets\meadow-kite-boy-diagonal-run.png')
$themes = (Get-Content -LiteralPath (Join-Path $root 'prototype\themes.json') -Raw -Encoding UTF8 | ConvertFrom-Json).themes
$ready = @($themes | Where-Object { $_.status -eq 'ready' -and $_.page })
$locked = @($themes | Where-Object { $_.locked -eq $true })
# 本分支：所有主题都已解锁，每个主题都有自己的页面和参数。
if ($themes.Count -ne 15 -or $ready.Count -ne 15 -or $locked.Count -ne 0) {
    throw 'Expected fifteen ready, unlocked themes with a page'
}
foreach ($theme in $themes) {
    if (-not $theme.page) { throw 'Theme without a page: ' + $theme.id }
    if (-not $theme.groups) { throw 'Theme without settings: ' + $theme.id }
    $pageFile = 'prototype\' + [string]$theme.page
    if (-not (Test-Path -LiteralPath (Join-Path $root $pageFile))) { throw 'Missing theme page: ' + $theme.page }
    if ($themeFiles -notcontains [string]$theme.page) { $themeFiles += [string]$theme.page }
}
foreach ($scene in Get-ChildItem -LiteralPath (Join-Path $root 'prototype\scenes') -Filter '*.js' -File) {
    $themeFiles += 'scenes\' + $scene.Name
}
foreach ($theme in $themes) {
    $match = [regex]::Match([string]$theme.thumb, 'url\(thumbs/([^\)?]+)')
    if (-not $match.Success) { throw 'Missing thumbnail URL: ' + $theme.id }
    $thumbName = [uri]::UnescapeDataString($match.Groups[1].Value)
    if ($thumbName -notmatch '^[^\\/]+\.webp$') { throw 'Unexpected thumbnail path: ' + $thumbName }
    $thumbFile = 'thumbs\' + $thumbName
    if ($themeFiles -notcontains $thumbFile) { $themeFiles += $thumbFile }
}
$sources += $themeFiles | ForEach-Object { 'prototype\' + $_ }
$sourceStage = Join-Path $payload 'source-stage'
foreach ($file in $sources) {
    $target = Join-Path $sourceStage $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $target
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
# 对应源码 ZIP 和安装包并排放在 dist/ 里（不塞进安装包：NSIS 3.13 在约 40MB 以上的数据上会 mmap 失败）
$sourceZip = Join-Path $dist ("Deskland-Preview-$version-source.zip")
if (Test-Path -LiteralPath $sourceZip) { Remove-Item -LiteralPath $sourceZip -Force }
[IO.Compression.ZipFile]::CreateFromDirectory($sourceStage, $sourceZip)
Remove-Item -LiteralPath $sourceStage -Recurse -Force
# Only program data is installed.
$runtimeFiles = @('host\bin\Deskland.exe', 'host\bin\DesklandPreview.ico', 'host\bin\Microsoft.Web.WebView2.Core.dll', 'host\bin\Microsoft.Web.WebView2.WinForms.dll',
    'host\bin\runtimes\win-x64\native\WebView2Loader.dll', 'host\bin\runtimes\win-arm64\native\WebView2Loader.dll')
$installFiles = @('LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md') + @($themeFiles | Where-Object { $_ -ne 'serve.mjs' } | ForEach-Object { 'prototype\' + $_ }) + $runtimeFiles
foreach ($file in $installFiles) {
    $target = Join-Path $payload $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $target
}
$utf8 = New-Object Text.UTF8Encoding($true)
$fileLines = @()
$deleteLines = @()
$directories = @{}
foreach ($file in $installFiles) {
    if ($file -match '["$\r\n]') { throw 'Unsafe package path' }
    $dir = Split-Path $file
    $fileLines += 'SetOutPath "$INSTDIR' + $(if ($dir) { '\' + $dir } else { '' }) + '"'
    $fileLines += 'File "' + (Join-Path $payload $file) + '"'
    $deleteLines += 'Delete "$INSTDIR\' + $file + '"'
    while ($dir) { $directories[$dir] = $true; $dir = Split-Path $dir }
}
$deleteLines += $directories.Keys | Sort-Object Length -Descending | ForEach-Object { 'RMDir "$INSTDIR\' + $_ + '"' }
$fileList = Join-Path $payload 'files.nsh'
$deleteList = Join-Path $payload 'delete.nsh'
[IO.File]::WriteAllLines($fileList, [string[]]$fileLines, $utf8)
[IO.File]::WriteAllLines($deleteList, [string[]]$deleteLines, $utf8)
$output = Join-Path $dist "Deskland-Preview-$version-win-x64-arm64-Setup.exe"
& $NsisCompiler /V2 "/DVERSION=$version" "/DPAYLOAD=$payload" "/DOUTPUT=$output" "/DBOOTSTRAPPER=$WebView2Bootstrapper" "/DFILE_LIST=$fileList" "/DDELETE_LIST=$deleteList" (Join-Path $PSScriptRoot 'installer.nsi')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
[IO.File]::WriteAllText(($output + '.sha256'), "$hash  $([IO.Path]::GetFileName($output))`r`n", (New-Object Text.UTF8Encoding($false)))
$srcHash = (Get-FileHash -LiteralPath $sourceZip -Algorithm SHA256).Hash
[IO.File]::WriteAllText(($sourceZip + '.sha256'), "$srcHash  $([IO.Path]::GetFileName($sourceZip))`r`n", (New-Object Text.UTF8Encoding($false)))
$manifest = @($installFiles | ForEach-Object { @{ path = $_.Replace('\', '/'); sha256 = (Get-FileHash -LiteralPath (Join-Path $payload $_) -Algorithm SHA256).Hash } })
[IO.File]::WriteAllText(($output + '.manifest.json'), ($manifest | ConvertTo-Json -Depth 4), $utf8)
Write-Host "Installer: $output"
Write-Host "SHA256: $hash"
