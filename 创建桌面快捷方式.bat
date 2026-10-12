@echo off
rem Puts a "Lappland tavern" shortcut with the wine-glass icon on the desktop. Run once.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcut.ps1"
pause
