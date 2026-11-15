@echo off
setlocal
rem Validates the static site and writes dist\site.
rem Usage: build.bat [/s]   (/s = silent, no pause)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Installing with winget...
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 ( echo Node.js installation failed. & exit /b 1 )
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
node scripts\build.mjs
set rc=%errorlevel%
if not "%~1"=="/s" pause
exit /b %rc%
