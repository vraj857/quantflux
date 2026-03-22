@echo off
echo Starting QuantFlux Servers...

:: Launch Backend
echo Launching Backend (Uvicorn 8000)...
start cmd /k "cd backend && python -m uvicorn app.main:app --reload"

:: Launch Frontend
echo Launching Frontend (NPM 3000)...
start cmd /k "cd frontend && npm run dev"

echo Done! Both servers are starting in separate CMD windows.
