@echo off
echo Starting Green Reserve — Green Reserve Golf Platform
cd /d "%~dp0"
echo Installing dependencies for Windows...
npm install
echo Starting dev server...
npm run dev
pause
