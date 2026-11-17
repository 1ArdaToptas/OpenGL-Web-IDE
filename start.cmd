@echo off
rem OpenGL Web IDE'yi başlatır ve arayüzü tarayıcıda açar. Ek bayraklar backend'e iletilir (ör. --port 8770).
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Kurulum yapilmamis. Once calistirin:  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
  exit /b 1
)
if not exist "frontend\dist\index.html" (
  echo Arayuz derlenmemis. Once calistirin:  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
  exit /b 1
)
set PYTHONIOENCODING=utf-8
".venv\Scripts\python.exe" -m backend --open %*
