@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);"
if errorlevel 1 goto missing_node
if not exist "node_modules\.bin\vite.cmd" (
  call npm ci
  if errorlevel 1 goto failed
)
call npm run dist:win
if errorlevel 1 goto failed
echo.
echo Both Windows installers are ready in "%CD%\release".
pause
exit /b 0
:missing_node
echo Install Node.js 22.12 or newer, then run this file again.
pause
exit /b 1
:failed
echo Build failed. Existing release files have been kept. Review the output above.
pause
exit /b 1
