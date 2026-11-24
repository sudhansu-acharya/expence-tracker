@echo off
title CashewFlow - Local Encrypted Server
cd /d "%~dp0"
set PORT=8080

echo ========================================================
echo   CashewFlow - Offline Encrypted Expense Tracker
echo   Starting local server at http://localhost:%PORT%
echo   Keep this window open while using the app.
echo   Press Ctrl+C to stop.
echo ========================================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  python -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  py -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  npx --yes serve . -l %PORT%
  goto :eof
)

echo [ERROR] Python or Node.js is required to run the local server.
echo Install Python from https://www.python.org/downloads/ or open the hosted HTTPS link.
pause
