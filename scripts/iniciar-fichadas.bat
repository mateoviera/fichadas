@echo off
REM Levanta Control de Fichadas en esta PC: base de datos (Supabase en Docker) + web en la red.
REM Requiere Docker Desktop iniciado y haber corrido una vez "npm install" y "npm run build".
cd /d "%~dp0.."

echo Esperando a Docker...
:esperar
docker info >nul 2>&1
if errorlevel 1 (
  timeout /t 5 /nobreak >nul
  goto esperar
)

echo Iniciando base de datos...
call npm run db:start

echo Iniciando la web en http://%COMPUTERNAME%:5173 ...
call npx vite preview --host --port 5173
