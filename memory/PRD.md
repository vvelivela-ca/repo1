# Portfolio Tracker App - PRD

## Overview
A dark-themed iOS portfolio tracking app with multi-portfolio support, CSV import, live stock prices, charts, and full CRUD management.

## Tech Stack
- **Frontend**: Expo React Native (SDK 54) with expo-router
- **Backend**: FastAPI (Python) with MongoDB
- **Live Data**: yfinance (Yahoo Finance, free, no API key)
- **Charts**: react-native-gifted-charts
- **File Import**: expo-document-picker

## Core Features
1. **Multi-Portfolio Support** - Create portfolios for each brokerage (Wealthsimple, Fidelity, Schwab, etc.)
2. **CSV & PDF Import** - Upload CSV exports or PDF brokerage statements with auto-parsing
3. **Dashboard** - Portfolio summary with total value, all-time & daily gain/loss
4. **Portfolio Tabs** - Filter by "All" or individual portfolios
5. **Stock Cards** - Live price, day change %, value, avg cost, total G/L, return %
6. **Stock Detail** - Line chart (1W/1M/3M/6M/1Y), position details, market data
7. **CRUD** - Add, edit, delete holdings and portfolios
8. **Live Refresh** - Pull-to-refresh + auto-refresh every 60 seconds

## Seeded Holdings (My Portfolio)
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
### Portfolios
- `GET /api/portfolios` - List all portfolios
- `POST /api/portfolios` - Create portfolio
- `PUT /api/portfolios/{id}` - Rename portfolio
- `DELETE /api/portfolios/{id}` - Delete portfolio + holdings

### Holdings
- `GET /api/holdings?portfolio_id=xxx` - List holdings (optional filter)
- `POST /api/holdings` - Create holding (with portfolio_id)
- `PUT /api/holdings/{id}` - Update holding
- `DELETE /api/holdings/{id}` - Delete holding
- `POST /api/holdings/import-csv` - Import from CSV file
- `POST /api/holdings/import-pdf` - Import from PDF statement (AI-powered via GPT-5.2)

### Stocks
- `GET /api/stocks/quotes?symbols=AAPL,TSLA` - Live quotes
- `GET /api/stocks/history/{symbol}?period=1mo` - Price history

## Screens
- `/` - Dashboard with portfolio tabs + holdings list
- `/stock/[symbol]` - Stock detail with chart
- `/add-holding` - Add/edit holding form
- `/portfolios` - Manage portfolios (create/rename/delete)
- `/import-csv` - CSV & PDF import with file type toggle and portfolio selector

## Design
- Dark theme (#09090B background, #18181B cards)
- Green (#4ADE80) for gains, Red (#F87171) for losses
- Indigo (#6366F1) for brand/actions
- Monospaced numbers for alignment
- 44px+ touch targets
