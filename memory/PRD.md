# Portfolio Tracker App - PRD

## Overview
A dark-themed iOS portfolio tracking app that displays stock holdings with live price updates, gain/loss metrics, interactive charts, and full CRUD management.

## Tech Stack
- **Frontend**: Expo React Native (SDK 54) with expo-router
- **Backend**: FastAPI (Python) with MongoDB
- **Live Data**: yfinance (Yahoo Finance, free, no API key)
- **Charts**: react-native-gifted-charts

## Core Features
1. **Dashboard** - Portfolio summary with total value ($149k+), all-time gain/loss, daily change
2. **Stock Cards** - 7 holdings showing live price, day change %, value, avg cost, total G/L, return %
3. **Stock Detail** - Individual stock page with line chart (1W/1M/3M/6M/1Y), position details, market data
4. **CRUD** - Add, edit, and delete holdings via forms
5. **Live Refresh** - Pull-to-refresh + auto-refresh every 60 seconds

## Seeded Holdings
| Symbol | Shares | Avg Price |
|--------|--------|-----------|
| AAPL   | 65     | $105.88   |
| QQQ    | 75     | $371.92   |
| TSLA   | 100    | $161.64   |
| MSFT   | 25     | $329.72   |
| GOOGL  | 60     | $130.33   |
| CRWD   | 15     | $106.51   |
| SOXQ   | 180    | $27.53    |

## API Endpoints
- `GET /api/holdings` - List all holdings
- `POST /api/holdings` - Create holding
- `PUT /api/holdings/{id}` - Update holding
- `DELETE /api/holdings/{id}` - Delete holding
- `GET /api/stocks/quotes?symbols=AAPL,TSLA` - Live stock quotes
- `GET /api/stocks/history/{symbol}?period=1mo` - Historical price data

## Design
- Dark theme (#09090B background, #18181B cards)
- Green (#4ADE80) for gains, Red (#F87171) for losses
- Monospaced numbers for alignment
- 44px+ touch targets
