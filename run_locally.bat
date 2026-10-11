@echo off
title Defence Sentinel Launcher
echo ====================================================
echo Starting Defence Sentinel - Local Runtimes
echo ====================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting Main C2 Command Server (Port 8080)...
start "Defence Sentinel C2 Server (:8080)" cmd /k "cd /d %~dp0 && node defense_radar_system\server.js"

timeout /t 2 /nobreak >nul

echo [2/2] Starting React Radar Scanner Subsystem (Port 5173)...
start "Defence Sentinel Radar Scanner (:5173)" cmd /k "cd /d %~dp0radar-scanner && npm run dev"

echo.
echo All services launched!
echo - Tactical Command Dashboard: http://localhost:8080
echo - React Radar Scanner:        http://localhost:5173
echo.
pause
