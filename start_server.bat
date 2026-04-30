@echo off
chcp 65001 >nul
title 智能菜谱助手 - 一键启动

echo ========================================
echo   智能菜谱助手 - 服务启动脚本
echo ========================================
echo.

:: ==========================================
:: 1. MySQL 服务启动（管理员权限）
:: ==========================================
echo [1/4] 正在以管理员身份启动 MySQL 服务...
powershell -Command "Start-Process cmd -ArgumentList '/c net start MySQL80' -Verb RunAs -Wait" >nul 2>&1
timeout /t 2 /nobreak >nul

sc query MySQL80 | find "RUNNING" >nul
if %errorlevel% equ 0 (
    echo [OK] MySQL 服务已启动
) else (
    echo [X] MySQL 服务启动失败，请手动检查
)
echo.

:: ==========================================
:: 2. Flask 后端（端口 5000）
:: ==========================================
echo [2/4] 正在启动 Flask 后端...
start "Flask Backend" cmd /k "cd /d D:\project\IndependentProjects\recipe-DB && .venv\Scripts\activate && python backend\app.py"
timeout /t 1 /nobreak >nul

netstat -ano | findstr ":5000 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [OK] Flask 后端已启动 ^(端口 5000^)
) else (
    echo [X] Flask 后端未监听端口 5000，请检查窗口输出
)
echo.

:: ==========================================
:: 3. Vite 前端（端口 5173）
:: ==========================================
echo [3/4] 正在启动 Vite 前端...
start "Vite Frontend" cmd /k "cd /d D:\project\IndependentProjects\recipe-DB\frontend && npx vite --host"
timeout /t 1 /nobreak >nul

netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [OK] Vite 前端已启动 ^(端口 5173^)
) else (
    echo [X] Vite 前端未监听端口 5173，请检查窗口输出
)
echo.

:: ==========================================
:: 4. ngrok 隧道
:: ==========================================
echo [4/4] 正在启动 ngrok 隧道...

:: 检查 ngrok 命令是否可用
where ngrok >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] 未找到 ngrok 命令，请修改脚本中的完整路径
    echo     例如：将最后一行替换为 ngrok.exe 的绝对路径
    goto :end
)

start "Ngrok Tunnel" cmd /k "ngrok http 5173"
timeout /t 1 /nobreak >nul

tasklist /fi "imagename eq ngrok.exe" | find "ngrok.exe" >nul
if %errorlevel% equ 0 (
    echo [OK] ngrok 隧道已启动
) else (
    echo [X] ngrok 未成功启动，请检查窗口输出
)

:end
echo.
echo ========================================
echo   服务启动流程完成，按任意键退出。
echo ========================================
pause >nul