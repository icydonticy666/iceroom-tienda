@echo off
rem Copia de las bases de iceroom fuera de Cloudflare (OneDrive). Doble clic, una vez al mes.
setlocal
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set FECHA=%%i
set DESTINO=%USERPROFILE%\OneDrive\Documents\iiceroom\respaldos-db\%FECHA%
mkdir "%DESTINO%" 2>nul
echo Exportando iceroom-pagos...
call npx --yes wrangler@4 d1 export iceroom-pagos --remote --output "%DESTINO%\iceroom-pagos.sql"
echo Exportando swap-licencias...
call npx --yes wrangler@4 d1 export swap-licencias --remote --output "%DESTINO%\swap-licencias.sql"
echo.
echo Listo: %DESTINO%
pause
