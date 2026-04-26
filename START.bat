@echo off
title FamilyWealthPlanner — Setup
color 0A
cls

echo.
echo  ============================================
echo    FamilyWealthPlanner — Windows Installer
echo  ============================================
echo.

:: ── Check if Node.js is installed ──────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [!] Node.js was not found on your computer.
    echo.
    echo  Please install Node.js first:
    echo    1. Open your browser
    echo    2. Go to: https://nodejs.org
    echo    3. Download the LTS version and run the installer
    echo    4. Come back and double-click this file again
    echo.
    echo  Press any key to open nodejs.org in your browser...
    pause >nul
    start https://nodejs.org
    exit /b 1
)

:: ── Show Node version ───────────────────────────────────────────────────────
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo  [✓] Node.js %NODE_VER% found
echo  [✓] npm %NPM_VER% found
echo.

:: ── Install dependencies (only if node_modules missing or outdated) ─────────
if not exist "node_modules\" (
    echo  [~] Installing dependencies — this takes about 1-2 minutes the first time...
    echo      (You only need to do this once)
    echo.
    call npm install --silent
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo  [!] npm install failed. Please check your internet connection and try again.
        pause
        exit /b 1
    )
    echo  [✓] Dependencies installed successfully!
) else (
    echo  [✓] Dependencies already installed — skipping
)

echo.
echo  ============================================
echo    Starting FamilyWealthPlanner...
echo  ============================================
echo.
echo  The app will open in your browser in a moment.
echo  Keep this window open while using the app.
echo  Close this window to stop the app.
echo.

:: ── Open browser after short delay ─────────────────────────────────────────
timeout /t 2 /nobreak >nul
start http://localhost:5173

:: ── Start Vite dev server ───────────────────────────────────────────────────
call npm run dev

:: ── If we get here, server stopped ─────────────────────────────────────────
echo.
echo  App has stopped. Press any key to exit.
pause >nul
