@echo off
rem Host GTHA Metro Map Creator on this computer with Docker Compose.
rem   host.bat             choose a mode from a menu
rem   host.bat --detached  start in the background, print the network address, exit
rem   host.bat --logs      start, then open the interactive status and log view
rem   host.bat --stop      stop the server
rem   host.bat --password  ask for a password (hidden input), store only its hash in .env, then start
rem   host.bat --no-password  remove the password so nobody has to sign in
rem Settings: GMMC_PORT (default 8080), GMMC_TAG (default latest). Sign-in is off unless .env holds GMMC_PASSWORD_HASH.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "COMPOSE=docker compose -f "%~dp0compose.yaml""
if not defined GMMC_PORT set "GMMC_PORT=8080"
if not defined GMMC_TAG set "GMMC_TAG=latest"
set "MODE="
set "PWMODE="
for %%a in (%*) do call :arg "%%~a"
if defined BADARG (echo Unknown option %BADARG%. Use --detached, --logs, --stop, --password or --no-password. & exit /b 1)

where docker >nul 2>nul || (echo [error] Docker was not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again. & exit /b 2)
docker info >nul 2>nul || (echo [error] Docker is installed but not running. Start Docker Desktop and run this again. & exit /b 3)
docker compose version >nul 2>nul || (echo [error] Docker Compose v2 was not found. Update Docker Desktop. & exit /b 4)

if /i "%MODE%"=="--stop" goto stop
if defined PWMODE call :password || exit /b 8
if /i "%MODE%"=="--detached" goto start
if /i "%MODE%"=="--logs" goto start
if defined PWMODE (set "MODE=--detached" & goto start)

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
findstr /b /c:"GMMC_PASSWORD_HASH=" ".env" >nul 2>nul && (echo   Sign-in:        a password is required) || echo   Sign-in:        off ^(run host.bat --password to turn it on^)
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

:arg
if /i "%~1"=="--password" (set "PWMODE=set" & exit /b 0)
if /i "%~1"=="--no-password" (set "PWMODE=clear" & exit /b 0)
if not defined MODE (set "MODE=%~1") else set "BADARG=%~1"
exit /b 0

:password
rem Hidden prompt; only a PBKDF2-SHA256 hash is written, to .env next to compose.yaml (git-ignored). The password
rem never appears on a command line, in a file or in the process list. The PowerShell below sits in the ::PS lines.
set "GMMC_ENV=%~dp0.env"
set "GMMC_PWMODE=%PWMODE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-Content -LiteralPath '%~f0' | Where-Object { $_ -like '::PS *' } | ForEach-Object { $_.Substring(5) }; Invoke-Expression ($s -join [Environment]::NewLine)"
set "RC=%errorlevel%"
set "GMMC_ENV="
set "GMMC_PWMODE="
exit /b %RC%
::PS $ErrorActionPreference = 'Stop'
::PS $envFile = $env:GMMC_ENV
::PS $lines = @(); if (Test-Path -LiteralPath $envFile) { $lines = @(Get-Content -LiteralPath $envFile | Where-Object { $_ -notmatch '^GMMC_PASSWORD_HASH=' }) }
::PS $utf8 = New-Object System.Text.UTF8Encoding $false
::PS if ($env:GMMC_PWMODE -eq 'clear') { [IO.File]::WriteAllLines($envFile, [string[]]$lines, $utf8); Write-Host 'Sign-in is off. Restart the server to apply it (host.bat --detached).'; exit 0 }
::PS function PlainText($s) { $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) } }
::PS $a = PlainText (Read-Host 'New password, 8 to 200 characters (hidden)' -AsSecureString)
::PS $b = PlainText (Read-Host 'Repeat the password (hidden)' -AsSecureString)
::PS if ($a -ne $b) { Write-Host '[error] The two passwords do not match.'; exit 1 }
::PS if ($a.Length -lt 8 -or $a.Length -gt 200) { Write-Host '[error] The password must be 8 to 200 characters.'; exit 1 }
::PS $salt = New-Object byte[] 16; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($salt)
::PS $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($a, $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256)
::PS function B64($x) { [Convert]::ToBase64String($x).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
::PS $hash = 'pbkdf2-sha256:600000:' + (B64 $salt) + ':' + (B64 $kdf.GetBytes(32))
::PS [IO.File]::WriteAllLines($envFile, [string[]]($lines + ('GMMC_PASSWORD_HASH=' + $hash)), $utf8)
::PS Write-Host 'Password saved as a hash in .env. Everyone must sign in to open the map server.'
