# 从源码构建 Deskland：使用 Windows 自带的 .NET Framework C# 编译器。
# 产物是 AnyCPU：同一份 Deskland.exe 在 x64 和 ARM64 Windows 上都能原生运行，
# WebView2 的原生加载器按进程架构从 runtimes\win-<arch>\native 里选。
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$lib = Join-Path $root 'lib'
$bin = Join-Path $root 'bin'
New-Item -ItemType Directory -Force $lib, $bin | Out-Null
$version = '1.0.4191.47'
$files = @(
    @{ Entry = 'lib/net462/Microsoft.Web.WebView2.Core.dll'; Dest = 'Microsoft.Web.WebView2.Core.dll' },
    @{ Entry = 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'; Dest = 'Microsoft.Web.WebView2.WinForms.dll' },
    @{ Entry = 'runtimes/win-x64/native/WebView2Loader.dll'; Dest = 'runtimes\win-x64\native\WebView2Loader.dll' },
    @{ Entry = 'runtimes/win-arm64/native/WebView2Loader.dll'; Dest = 'runtimes\win-arm64\native\WebView2Loader.dll' }
)
$missing = @($files | Where-Object { -not (Test-Path -LiteralPath (Join-Path $lib $_.Dest)) })
if ($missing.Count -gt 0) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = Join-Path ([IO.Path]::GetTempPath()) ('deskland-webview2-' + [Guid]::NewGuid().ToString('N') + '.zip')
    $package = $null
    try {
        Write-Host "下载 WebView2 SDK $version..."
        Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $archive -UseBasicParsing
        $package = [IO.Compression.ZipFile]::OpenRead($archive)
        foreach ($f in $files) {
            $entry = $package.GetEntry($f.Entry)
            if ($null -eq $entry) { throw "依赖包缺少 $($f.Entry)" }
            $target = Join-Path $lib $f.Dest
            New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
            $sourceStream = $entry.Open()
            $targetStream = $null
            try {
                $targetStream = [IO.File]::Create($target)
                $sourceStream.CopyTo($targetStream)
            } finally {
                if ($null -ne $targetStream) { $targetStream.Dispose() }
                $sourceStream.Dispose()
            }
        }
    } finally {
        if ($null -ne $package) { $package.Dispose() }
        if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    }
}
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw '找不到 .NET Framework C# 编译器，请在 64 位 Windows 上构建。' }
$appVersion = (Get-Content -LiteralPath (Join-Path $root '..\tools\version.json') -Raw | ConvertFrom-Json).version
if ($appVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid application version' }
$versionSource = Join-Path $bin 'Deskland-version.cs'
$versionText = @"
using System.Reflection;
[assembly: AssemblyTitle("Deskland Preview")]
[assembly: AssemblyProduct("Deskland Preview")]
[assembly: AssemblyVersion("$appVersion.0")]
[assembly: AssemblyFileVersion("$appVersion.0")]
[assembly: AssemblyCopyright("Copyright 2026 Deskland authors")]
"@
[IO.File]::WriteAllText($versionSource, $versionText, (New-Object Text.UTF8Encoding($false)))
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 /win32manifest:"$root\app.manifest" `
    /win32icon:"$root\DesklandPreview.ico" `
    /out:"$bin\Deskland.exe" `
    /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll `
    /r:"$lib\Microsoft.Web.WebView2.Core.dll" /r:"$lib\Microsoft.Web.WebView2.WinForms.dll" `
    "$root\DesktopHost.cs" "$root\Themes.cs" "$versionSource"
if ($LASTEXITCODE -ne 0) { throw '编译失败' }
foreach ($f in $files) {
    $target = Join-Path $bin $f.Dest
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $lib $f.Dest) -Destination $target -Force
}
# 旧版本放在程序目录根部的 x64 加载器要清掉，否则 ARM64 上可能被优先加载
$stale = Join-Path $bin 'WebView2Loader.dll'
if (Test-Path -LiteralPath $stale) { Remove-Item -LiteralPath $stale -Force }
Copy-Item -LiteralPath (Join-Path $root 'DesklandPreview.ico') -Destination (Join-Path $bin 'DesklandPreview.ico') -Force
Write-Host "编译完成（AnyCPU：x64 + ARM64）：$bin\Deskland.exe"
