@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);"
if errorlevel 1 goto missing_node
echo Installing the exact dependency set from package-lock.json...
call npm ci
if errorlevel 1 goto dependency_failed
call npm run dist:win
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" goto failed
echo.
echo Both Windows installers are ready in "%CD%\release".
pause
exit /b 0
:missing_node
echo Install Node.js 22.12 or newer, then run this file again.
pause
exit /b 1
:failed
echo Build failed. Existing release files are OLD and must not be published as this build.
pause
exit /b %BUILD_EXIT%
:dependency_failed
echo Dependency installation failed. No build was started. Existing release files are OLD and must not be published.
pause
exit /b 1
