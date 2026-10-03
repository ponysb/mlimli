@echo off
setlocal
set "MLI_CLI_ROOT=%~dp0resources"
if exist "%MLI_CLI_ROOT%\node\node.exe" (
  "%MLI_CLI_ROOT%\node\node.exe" "%MLI_CLI_ROOT%\client\cli\main.cjs" %*
) else (
  set "ELECTRON_RUN_AS_NODE=1"
  "%~dp0MoliCreationLegacy.exe" "%MLI_CLI_ROOT%\client\cli\main.cjs" %*
)
exit /b %errorlevel%
