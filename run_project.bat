@echo off
echo 🚀 Launching Stock Forecasting Infrastructure...
python -m venv .venv
call .venv\Scripts\activate
pip install flask tensorflow pandas numpy scikit-learn yfinance exchange-calendars
start index.html
python app.py
pause
