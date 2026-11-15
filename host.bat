@echo off
rem Host GTHA Metro Map Creator on this computer with Docker Compose.
rem   host.bat             choose a mode from a menu
rem   host.bat --detached  start in the background, print the network address, exit
rem   host.bat --logs      start, then open the interactive status and log view
rem   host.bat --stop      stop the server
rem Settings: GMMC_PORT (default 8080), GMMC_TAG (default latest).
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "COMPOSE=docker compose -f "%~dp0compose.yaml""
if not defined GMMC_PORT set "GMMC_PORT=8080"
if not defined GMMC_TAG set "GMMC_TAG=latest"
set "MODE=%~1"

where docker >nul 2>nul || (echo [error] Docker was not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again. & exit /b 2)
docker info >nul 2>nul || (echo [error] Docker is installed but not running. Start Docker Desktop and run this again. & exit /b 3)
docker compose version >nul 2>nul || (echo [error] Docker Compose v2 was not found. Update Docker Desktop. & exit /b 4)

if /i "%MODE%"=="--stop" goto stop
if /i "%MODE%"=="--detached" goto start
if /i "%MODE%"=="--logs" goto start
if not "%MODE%"=="" (echo Unknown option %MODE%. Use --detached, --logs or --stop. & exit /b 1)

echo GTHA Metro Map Creator server
echo.
echo   [D] Detached: start in the background and exit
echo   [L] Logs: start and watch status and logs
echo   [S] Stop the server
echo   [Q] Quit
choice /c DLSQ /n /m "Choose D, L, S or Q: "
if errorlevel 4 exit /b 0
if errorlevel 3 goto stop
if errorlevel 2 (set "MODE=--logs") else (set "MODE=--detached")

:start
echo Downloading image ghcr.io/ding-ding-projects/gtha-metro-map-creator:%GMMC_TAG% ...
%COMPOSE% pull || (echo [error] Could not download the image. Check your internet connection. & exit /b 5)
%COMPOSE% up -d || (echo [error] Could not start the container. Is port %GMMC_PORT% already in use? & exit /b 6)
echo Waiting for the health check ...
set /a TRIES=0
:wait
set /a TRIES+=1
curl.exe -s -o nul -f --max-time 3 "http://127.0.0.1:%GMMC_PORT%/healthz" && goto healthy
if !TRIES! geq 30 (echo [error] The server did not become healthy within 60 seconds. Recent logs: & %COMPOSE% logs --tail 30 & exit /b 7)
timeout /t 2 /nobreak >nul
goto wait

:healthy
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "LANIP=%%i"
echo.
echo The server is running.
echo   This computer:  http://127.0.0.1:%GMMC_PORT%/
if defined LANIP (echo   Your network:   http://%LANIP%:%GMMC_PORT%/) else (echo   Your network:   no network address found)
echo   Editor:         /app/   Documentation: /docs/
echo.
if /i "%MODE%"=="--detached" exit /b 0

:logs
echo.
echo Status and logs. Keys: [F] follow logs (Ctrl+C returns here)  [T] last 50 lines  [S] status  [R] restart  [X] stop server  [Q] leave (server keeps running)
choice /c FTSRXQ /n /m "Key: "
if errorlevel 6 (echo Leaving. The server keeps running. & exit /b 0)
if errorlevel 5 goto stop
if errorlevel 4 (%COMPOSE% restart & goto logs)
if errorlevel 3 (%COMPOSE% ps & goto logs)
if errorlevel 2 (%COMPOSE% logs --tail 50 & goto logs)
%COMPOSE% logs -f --tail 20
goto logs

:stop
%COMPOSE% down && echo The server is stopped.
exit /b %errorlevel%
