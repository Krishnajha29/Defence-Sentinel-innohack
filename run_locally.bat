@echo off
title Defence-Sentinel Launcher
echo ====================================================
echo Starting Defence-Sentinel - Tactical Platform
echo ====================================================
echo.

cd /d "%~dp0"

echo Starting Defence-Sentinel C2 Server (Port 8080)...
node defense_radar_system\server.js
pause
