@echo off
chcp 65001 >nul
title GameStream Hub - Auto Launcher
echo.
echo ========================================
echo    GameStream Hub - Auto Launcher
echo ========================================
echo.

:: Проверка Node.js
echo [1/4] Проверка установки Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js не установлен!
    echo Скачайте с https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ Node.js установлен

:: Проверка зависимостей сервера
echo [2/4] Проверка зависимостей сервера...
if not exist "server\node_modules" (
    echo Установка зависимостей сервера...
    cd server
    npm install
    cd ..
) else (
    echo ✓ Зависимости сервера установлены
)

:: Запуск сервера
echo [3/4] Запуск сервера...
start "GameStream Server" cmd /k "cd server && npm start"

:: Ожидание запуска сервера
echo Ожидание запуска сервера (5 сек)...
timeout /t 5 /nobreak >nul

:: Получение IP адреса
echo [4/4] Получение сетевой информации...
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr "IPv4"') do (
    set IP=%%i
    goto :ip_found
)
:ip_found
set IP=%IP:~1%
echo.

echo ========================================
echo          ССЫЛКИ ДЛЯ ПОДКЛЮЧЕНИЯ
echo ========================================
echo.
echo 📍 На этом компьютере:
echo    http://localhost:3000
echo.
echo 🌐 На других устройствах в сети:
echo    http://%IP%:3000
echo.
echo 📱 Отправьте эту ссылку другу:
echo    http://%IP%:3000
echo.
echo ========================================
echo.

:: Открытие браузера
start "" "http://localhost:3000"

echo Браузер открывается автоматически...
echo Нажмите любую клавишу для выхода...
pause >nul