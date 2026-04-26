@echo off
title FamilyWealthPlanner — Deploy to Cloud (Vercel)
color 0B
cls

echo.
echo  =====================================================
echo    FamilyWealthPlanner — Cloud Deployment Wizard
echo    Deploys your app FREE to Vercel (runs anywhere!)
echo  =====================================================
echo.
echo  This wizard will:
echo    1. Check your tools are installed
echo    2. Build the app for production
echo    3. Set up Git version control
echo    4. Upload your code to GitHub
echo    5. Deploy live to Vercel
echo.
echo  You will need accounts on:
echo    - github.com  (free)
echo    - vercel.com  (free, sign in with GitHub)
echo.
pause

cls
echo.
echo  ══════════════════════════════════════════
echo   STEP 1 of 5 — Checking required tools
echo  ══════════════════════════════════════════
echo.

:: ── Check Node.js ────────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [!] Node.js not found.
    echo.
    echo  Please install Node.js first:
    echo    1. Go to: https://nodejs.org
    echo    2. Download the LTS version
    echo    3. Run the installer (use all defaults)
    echo    4. Close and re-open this window
    echo.
    echo  Press any key to open nodejs.org...
    pause >nul
    start https://nodejs.org
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [✓] Node.js %NODE_VER%

:: ── Check Git ─────────────────────────────────────────────────────────────────
where git >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [!] Git not found.
    echo.
    echo  Please install Git:
    echo    1. Go to: https://git-scm.com/download/win
    echo    2. Download and run the installer
    echo    3. Use ALL default options (just click Next)
    echo    4. Close and re-open this window
    echo.
    echo  Press any key to open git-scm.com...
    pause >nul
    start https://git-scm.com/download/win
    exit /b 1
)
for /f "tokens=*" %%i in ('git --version') do set GIT_VER=%%i
echo  [✓] %GIT_VER%

:: ── Check Vercel CLI ──────────────────────────────────────────────────────────
where vercel >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [~] Vercel CLI not found — installing it now...
    echo      (This is a free tool, takes about 30 seconds)
    echo.
    call npm install -g vercel
    if %errorlevel% neq 0 (
        color 0C
        echo  [!] Could not install Vercel CLI.
        echo      Make sure you have internet access and try again.
        pause
        exit /b 1
    )
    echo  [✓] Vercel CLI installed!
) else (
    for /f "tokens=*" %%i in ('vercel --version') do set VERCEL_VER=%%i
    echo  [✓] Vercel CLI %VERCEL_VER%
)

echo.
echo  All tools ready!
echo.
pause

cls
echo.
echo  ══════════════════════════════════════════
echo   STEP 2 of 5 — Building the app
echo  ══════════════════════════════════════════
echo.
echo  Installing dependencies and creating an
echo  optimised production build...
echo.

if not exist "node_modules\" (
    echo  [~] Installing npm packages...
    call npm install --silent
    if %errorlevel% neq 0 (
        color 0C
        echo  [!] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo  [✓] Packages installed
)

echo  [~] Building production bundle...
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [!] Build failed.
    echo      This usually means there is a code error.
    echo      Please make sure the app runs locally with START.bat first.
    pause
    exit /b 1
)
echo  [✓] Build successful! (files are in the /dist folder)
echo.
pause

cls
echo.
echo  ══════════════════════════════════════════
echo   STEP 3 of 5 — Setting up Git
echo  ══════════════════════════════════════════
echo.

:: ── Configure git user if not already set ────────────────────────────────────
for /f "tokens=*" %%i in ('git config --global user.email 2^>nul') do set GIT_EMAIL=%%i
if "%GIT_EMAIL%"=="" (
    echo  Git needs your name and email (used for version history only).
    echo  These do NOT have to match your GitHub account exactly.
    echo.
    set /p GIT_NAME=  Enter your name (e.g. John Smith): 
    set /p GIT_EMAIL=  Enter your email (e.g. john@email.com): 
    git config --global user.name "%GIT_NAME%"
    git config --global user.email "%GIT_EMAIL%"
    echo.
    echo  [✓] Git configured
) else (
    echo  [✓] Git already configured as: %GIT_EMAIL%
)

:: ── Initialise repo if needed ─────────────────────────────────────────────────
if not exist ".git\" (
    git init
    echo  [✓] Git repository created
) else (
    echo  [✓] Git repository already exists
)

:: ── Create .gitignore if missing ──────────────────────────────────────────────
if not exist ".gitignore" (
    echo node_modules/ > .gitignore
    echo dist/ >> .gitignore
    echo .env >> .gitignore
    echo .vercel >> .gitignore
    echo  [✓] .gitignore created
)

:: ── Stage and commit all files ────────────────────────────────────────────────
git add .
git commit -m "FamilyWealthPlanner — ready to deploy" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [✓] No new changes to commit (already up to date)
) else (
    echo  [✓] Files committed to Git
)

echo.
pause

cls
echo.
echo  ══════════════════════════════════════════
echo   STEP 4 of 5 — Connecting to GitHub
echo  ══════════════════════════════════════════
echo.
echo  You need a FREE GitHub account to store your code.
echo.
echo  If you do NOT have one:
echo    1. Press any key — your browser will open github.com
echo    2. Click "Sign up" and create a free account
echo    3. Come back here and press any key to continue
echo.
echo  If you already have a GitHub account, just press any key.
echo.
pause
start https://github.com

echo.
echo  ──────────────────────────────────────────────────
echo   Now create a new repository on GitHub:
echo  ──────────────────────────────────────────────────
echo.
echo    1. Go to github.com (should be open in your browser)
echo    2. Click the [+] button at the top right
echo    3. Click "New repository"
echo    4. Name it:  FamilyWealthPlanner
echo    5. Leave it PUBLIC (required for free Vercel deploys)
echo    6. Do NOT tick "Add README" or "Add .gitignore"
echo    7. Click "Create repository"
echo.
echo    After creating it, GitHub will show a page with
echo    commands. You will need the URL from that page.
echo    It looks like:
echo.
echo      https://github.com/YOURNAME/FamilyWealthPlanner.git
echo.
echo  ──────────────────────────────────────────────────
echo.
set /p GITHUB_URL=  Paste your GitHub repository URL here and press Enter: 

if "%GITHUB_URL%"=="" (
    color 0C
    echo  [!] No URL entered. Please run this script again.
    pause
    exit /b 1
)

:: ── Remove old remote if exists, add new one ─────────────────────────────────
git remote remove origin >nul 2>&1
git remote add origin %GITHUB_URL%

echo.
echo  [~] Uploading your code to GitHub...
echo      (A browser window may open asking you to log in to GitHub)
echo.

git branch -M main
git push -u origin main
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [!] Upload to GitHub failed.
    echo.
    echo  Common fixes:
    echo    - Make sure you are logged in to GitHub in your browser
    echo    - Make sure the repository URL is correct
    echo    - Try running this script again
    echo.
    pause
    exit /b 1
)

echo.
echo  [✓] Code uploaded to GitHub successfully!
echo.
pause

cls
echo.
echo  ══════════════════════════════════════════
echo   STEP 5 of 5 — Deploying to Vercel
echo  ══════════════════════════════════════════
echo.
echo  Almost there! Vercel will now deploy your app live.
echo.
echo  IMPORTANT — When Vercel asks you questions, answer:
echo.
echo    ? Set up and deploy "FamilyWealthPlanner"?
echo      → Press Y then Enter
echo.
echo    ? Which scope do you want to deploy to?
echo      → Select your personal account, press Enter
echo.
echo    ? Link to existing project?
echo      → Press N then Enter  (it's a new project)
echo.
echo    ? What's your project name?
echo      → Type:  familywealthplanner  then Enter
echo.
echo    ? In which directory is your code located?
echo      → Just press Enter  (leave as ./)
echo.
echo    ? Want to modify settings?
echo      → Press N then Enter
echo.
echo  Vercel will then deploy — takes about 30-60 seconds.
echo  At the end it will show you a URL like:
echo    https://familywealthplanner-abc123.vercel.app
echo.
echo  Press any key when ready...
pause >nul

echo.
call vercel --prod

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [!] Vercel deployment failed.
    echo.
    echo  Try manually:
    echo    1. Go to vercel.com
    echo    2. Sign in with your GitHub account
    echo    3. Click "Add New Project"
    echo    4. Import your FamilyWealthPlanner repository
    echo    5. Click Deploy
    echo.
    pause
    exit /b 1
)

cls
color 0A
echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║                                               ║
echo  ║   SUCCESS! Your app is live on the internet!  ║
echo  ║                                               ║
echo  ╚═══════════════════════════════════════════════╝
echo.
echo  Your app URL was shown above (ends in .vercel.app)
echo  Bookmark it — it works from any computer, phone,
echo  or tablet with a web browser!
echo.
echo  ─────────────────────────────────────────────────
echo   IMPORTANT — About your saved data:
echo  ─────────────────────────────────────────────────
echo.
echo  Your financial plan is saved in your browser only.
echo  To use it on another computer:
echo.
echo    1. Open the app on THIS computer
echo    2. Go to the Scenarios tab
echo    3. Click "Export JSON"  — saves your plan to a file
echo    4. Open the app on the OTHER computer
echo    5. Go to Scenarios tab
echo    6. Click "Import JSON" — loads your plan
echo.
echo  ─────────────────────────────────────────────────
echo   To update the app in future:
echo  ─────────────────────────────────────────────────
echo.
echo  After you get a new version (new .zip file):
echo    1. Unzip it, replacing the old folder
echo    2. Double-click DEPLOY.bat again
echo    3. It will automatically push the update live
echo.
echo  ─────────────────────────────────────────────────
echo.
echo  Press any key to finish.
pause >nul
