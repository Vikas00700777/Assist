@echo off
setlocal

cd /d "%~dp0backend"

if not exist "venv\Scripts\activate.bat" (
  echo Creating backend virtual environment...
  python -m venv venv
)

call "venv\Scripts\activate.bat"

echo Installing backend requirements...
python -m pip install -r requirements.txt

echo Starting X Assistant backend...
python app.py

echo.
echo Backend stopped. Press any key to close this window.
pause >nul
