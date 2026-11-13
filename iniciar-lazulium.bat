@echo off
title Lazulium
cd /d "%~dp0"
echo ===================================================
echo   Iniciando Lazulium em Modo Desenvolvimento
echo ===================================================
echo.
echo Pressione Ctrl+C para encerrar quando terminar.
echo.
npm run dev
pause
