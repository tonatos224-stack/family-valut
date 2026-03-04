@echo off
echo ========================================
echo Start Family Vault Cloud Access...
echo ========================================
echo.
echo 1. The black window will show a "Your url is:" link.
echo 2. Open that link on your phone.
echo 3. If you see a warning page, just click "Click to Continue".
echo.
echo ========================================
start /b npx http-server -p 8080
npx localtunnel --port 8080
pause
