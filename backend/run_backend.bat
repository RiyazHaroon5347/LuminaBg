@echo off
echo Starting Lumina BG Python FastAPI Backend Server...
cd /d "%~dp0"
set TMP=D:\Project\bg-remover\backend\tmp
set TEMP=D:\Project\bg-remover\backend\tmp
set U2NET_HOME=D:\Project\bg-remover\backend\models
.\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
