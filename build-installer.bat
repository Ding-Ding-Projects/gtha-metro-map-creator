@echo off
setlocal
rem Builds the site, then packages it as a portable offline ZIP in dist\.
rem This is a static web app; there is no Windows installer package yet.
cd /d "%~dp0"
call build.bat /s
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'dist\site\*' -DestinationPath 'dist\gtha-metro-map-creator-site.zip' -Force"
if errorlevel 1 ( echo Packaging failed. & exit /b 1 )
echo Packaged dist\gtha-metro-map-creator-site.zip
if not "%~1"=="/s" pause
exit /b 0
