@echo off
title Nexudus Audit Dashboard
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node "%~dp0scripts\ui.js"
if errorlevel 1 pause
