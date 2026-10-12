# 在桌面放一个「无序酒馆」快捷方式，带酒杯图标。
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$root = Split-Path $PSScriptRoot -Parent
$desktop = [Environment]::GetFolderPath('Desktop')
$link = Join-Path $desktop '无序酒馆.lnk'
try {
  $shell = New-Object -ComObject WScript.Shell
  $s = $shell.CreateShortcut($link)
  $s.TargetPath = Join-Path $root '启动酒馆.bat'
  $s.WorkingDirectory = $root
  $s.IconLocation = (Join-Path $root 'scripts\tavern.ico') + ',0'
  $s.Description = '无序酒馆 · 本地音乐播放器'
  $s.Save()
  Write-Host ''
  Write-Host "  桌面上已经放好「无序酒馆」图标了：$link" -ForegroundColor Green
  Write-Host '  以后双击它就能开门。' -ForegroundColor Green
} catch {
  Write-Host "  创建快捷方式失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
