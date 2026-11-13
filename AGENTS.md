# Deskland 开源体验版开发指南

- 用中文与项目负责人沟通。
- 本仓库包含基础宿主、共用界面与框架、沙滩和草地两个免费主题；其他主题只保留带锁的名称、简介和缩略图，不包含页面、参数、脚本或其他实现代码。
- 界面只保留简体中文和英文，不跟随主程序增加其他语言。
- 不提供账号登录、购买恢复或自动检查更新功能，不接入授权服务、官网更新清单或商店更新接口。
- 保持 `themes.json`、主题参数默认值和中英文文案一致；锁定主题没有 `page` 和 `groups`，点击只打开购买说明，不能切换当前壁纸。
- 修改主题后检查图标移动、预览、暂停和分享；所有画布按实际像素与小数显示尺寸绘制。
- 壁纸常驻后台，以核显 30fps 为目标。静态绘图进入缓存，小物体使用局部图层，不在全屏着色器中逐个计算大量物体。
- `prototype/thumbs/` 是人工设计的缩略图，未经要求不要重新生成或覆盖。
- 主程序：`powershell -ExecutionPolicy Bypass -File host\build.ps1`；产物 `host/bin/Deskland.exe`。
- 浏览器预览：`node prototype\serve.mjs`，访问 `http://localhost:5178/settings.html`。
- Windows 宿主：`host/DesktopHost.cs`；改主题 HTML/JS 不需要重新编译宿主，托盘“重新载入”即可。
- 产品显示名为 `Deskland Preview`；程序读写 `%LOCALAPPDATA%\DesklandPreview`，安装到 `Programs\Deskland Preview`，启动项和运行实例标识也与开发版分开，不要改回共用身份。
- 不提交 `host/bin/`、`host/lib/`、个人数据、凭证或本机路径。
- 发布或修改商标相关内容前须获得项目负责人的明确指示。
- 许可见 `LICENSE`，名称和图标的说明见 `TRADEMARKS.md`。
- 2026-11-06：已发布 GitHub Release `v0.1.2`，包含 Windows x64 安装包、对应源码 ZIP、SHA256 和文件清单；README 提供最新 Release 下载入口。仓库已公开，安装包未签名。
- 2026-11-13：ARM64 与安装包：`host/build.ps1` 先用系统 csc 编 x64 的 `Deskland.exe`，装了 .NET SDK 时再用 Roslyn 编原生 `Deskland-arm64.exe`（`/platform:arm64`，实测能跑，但宿主在原生 ARM64 下会出现桌面层级反复修正的循环，暂不随安装包发布）。安装包统一装 x64 版（ARM64 上走 Windows 模拟），宿主用 `IsWow64Process2` 检测**原生**架构，在 ARM64 设备上给主题页加 `&low=1`（`scene.js` 把画布像素上限降到 240 万、DPR 上限 1.25）；用哪份 WebView2Loader 仍按进程架构（`PROCESSOR_ARCHITECTURE`）决定。安装包用 `tools\build-installer.ps1` 构建（NSIS 3.13，SourceForge 失败时回退 GitHub 镜像）；对应源码 ZIP 与安装包并排放在 `dist/`，不塞进安装包（NSIS 3.13 在约 40MB 以上的数据上会 `error creating mmap`）。升级时 `--exit-installed` 改成非阻塞 `Exec`，旧版本不认识该参数时不会挂住安装程序。
- 2026-11-13：本分支改为「全部解锁」：11 个原先只有锁定缩略图的主题已在 `prototype/scenes/` 里从零实现（共用 `prototype/scene.js` 场景引擎），并新增「火山」「火山之夜」两个主题；`themes.json` 全部 `status: ready` / `product: free`，`host/Themes.cs` 只要求主题有页面即可切换，设置页去掉了锁定遮罩与购买弹窗。新增主题时：在 `themes.json` 定义参数（默认值要与场景里的 `defaults` 一致）、加页面和缩略图（`thumbs/*.webp`，294×168），并同步 `i18n/en.json`；`tools/gen-themes.mjs` 与 `tools/gen-i18n-themes.mjs` 负责生成清单和英文文字。上面「锁定主题没有 page/groups」的旧规则不再适用。
