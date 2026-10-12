# 无序酒馆 · 一键启动（由「启动酒馆.bat」调用）
# 1. 酒馆已经开着 → 直接打开浏览器
# 2. 检查 Node.js
# 3. 第一次运行或 package.json 有更新 → 自动 npm install
# 4. 代码有更新 → 重新构建页面（dist/）
# 5. 用 server/tavern-server.mjs 固定在 127.0.0.1:5173 开门（地址不变，浏览器里存的歌才对得上），
#    自动打开浏览器。这个服务器也负责「同席」：开房后经 Cloudflare 临时隧道让朋友入座。

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$Host.UI.RawUI.WindowTitle = '无序酒馆 · Lappland'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$port = 5173
$url = "http://127.0.0.1:$port/"

function Say([string]$text, [string]$color = 'Yellow') { Write-Host $text -ForegroundColor $color }
function Fail([string]$text) {
  Say ''
  Say $text 'Red'
  Say '把这个窗口截图发给 Claude 就行。' 'Red'
  Read-Host '按回车关闭'
  exit 1
}

Say ''
Say '  无序酒馆 · LAPPLAND AFTER HOURS'
Say '  ----------------------------------' 'DarkYellow'

# 1. 已经在营业？
$listening = $null
try { $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop } catch {}
if ($listening) {
  Say "  酒馆已经开着了，直接帮你打开：$url" 'Green'
  Start-Process $url
  Start-Sleep -Seconds 2
  exit 0
}

# 2. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Start-Process 'https://nodejs.org/zh-cn/download'
  Fail '  没有找到 Node.js。已经帮你打开下载页：装 LTS 版本，装完再双击「启动酒馆」。'
}
$major = 0
try { $major = [int]((& node -v).TrimStart('v').Split('.')[0]) } catch {}
if ($major -gt 0 -and $major -lt 20) {
  Say "  提示：你的 Node.js 版本是 $(& node -v)，有点旧，建议升级到 22 以上。" 'DarkYellow'
}

# 3. 依赖
$needed = @('node_modules\vite', 'node_modules\three', 'node_modules\@fontsource\noto-serif-sc')
$missing = @($needed | Where-Object { -not (Test-Path $_) })
$stale = $false
if (Test-Path 'node_modules\.package-lock.json') {
  $stale = (Get-Item 'package.json').LastWriteTime -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTime
}
if ($missing.Count -gt 0 -or $stale) {
  Say '  正在备酒（安装依赖），第一次大约一两分钟，之后就快了……'
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { Fail '  安装依赖失败了（npm install）。' }
}

# 4. 构建（只在代码比上次构建新的时候）
$distIndex = Join-Path $root 'dist\index.html'
$needBuild = -not (Test-Path $distIndex)
if (-not $needBuild) {
  $builtAt = (Get-Item $distIndex).LastWriteTimeUtc
  $newer = Get-ChildItem -Path 'src', 'public' -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1
  foreach ($f in @('index.html', 'package.json', 'vite.config.ts', 'vite.config.js')) {
    if ((Test-Path $f) -and (Get-Item $f).LastWriteTimeUtc -gt $builtAt) { $newer = $f }
  }
  $needBuild = [bool]$newer
}
if ($needBuild) {
  Say '  正在调酒（构建页面），大约半分钟，只有更新后的第一次需要……'
  & node 'node_modules\vite\bin\vite.js' build --logLevel warn
  if ($LASTEXITCODE -ne 0) { Fail '  页面构建失败了（vite build）。' }
}

# 5. 开门
Say ''
Say "  酒馆开门：$url" 'Green'
Say '  浏览器会自动打开。听歌的时候别关这个窗口——关掉窗口 = 打烊（同席房间也会一起关闭）。' 'Green'
Say '  想和朋友一起听：页面右上角「…」→「同席 · 一起听」。' 'Green'
Say ''
& node 'server\tavern-server.mjs' --port $port --open
if ($LASTEXITCODE -ne 0) { Fail '  酒馆没能开门（服务器启动出错）。' }
