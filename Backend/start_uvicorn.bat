@echo off
cd /d "C:\Users\asiif\Downloads\Immersia\Backend"
set GROQ_API_KEY=test-key-for-cert-debug
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
