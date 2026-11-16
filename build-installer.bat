@echo off
setlocal
rem Builds every release file into dist\:
rem   dist\gtha-metro-map-creator-site.zip                         offline copy of the site
rem   dist\desktop-app\GTHA-Metro-Map-Creator-<v>-portable.exe      desktop app (one file)
rem   dist\desktop-wizard\GTHA-Metro-Map-Creator-Server-Setup-<v>-portable.exe  server setup wizard
rem   dist\desktop-deploy\GTHA-Metro-Map-Creator-Deploy-<v>-portable.exe  deploy app
rem Pass /s to skip the pause at the end.
cd /d "%~dp0"
call build.bat /s
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'dist\site\*' -DestinationPath 'dist\gtha-metro-map-creator-site.zip' -Force"
if errorlevel 1 ( echo Packaging the site failed. & exit /b 1 )
pushd desktop
if exist package-lock.json ( call npm ci --no-audit --no-fund ) else ( call npm install --no-audit --no-fund )
if errorlevel 1 ( popd & echo Installing desktop build tools failed. & exit /b 1 )
call npm run dist
if errorlevel 1 ( popd & echo Building the desktop executables failed. & exit /b 1 )
popd
echo Packaged:
dir /b dist\gtha-metro-map-creator-site.zip dist\desktop-app\*.exe dist\desktop-wizard\*.exe dist\desktop-deploy\*.exe
if not "%~1"=="/s" pause
exit /b 0
