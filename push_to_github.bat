@echo off
echo ========================================
echo   FAMILY VAULT - GITHUB DEPLOYER 🚀
echo ========================================
echo.

:: Проверка инициализации git
if not exist .git (
    echo [!] Инициализация Git...
    git init
)

:: Добавление удаленного репозитория (если еще нет)
git remote add origin https://github.com/tonatos224-stack/family-valut-2.git 2>nul

echo [+] Добавление файлов...
git add .

echo [+] Создание коммита...
git commit -m "feat: phase 2 premium security bundle"

echo [+] Отправка на GitHub (может потребоваться вход)...
git branch -M main
git push -u origin main

echo.
echo ========================================
echo   ГОТОВО! Проверь свой GitHub! 🌀
echo ========================================
pause
