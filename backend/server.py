from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import yfinance as yf
import csv
import io
import re
import pdfplumber

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Models ──────────────────────────────────────────────

class PortfolioCreate(BaseModel):
    name: str

class PortfolioUpdate(BaseModel):
    name: str

class PortfolioResponse(BaseModel):
    id: str
    name: str
    created_at: str

class HoldingCreate(BaseModel):
    symbol: str
    shares: float
    avg_price: float
    portfolio_id: str

class HoldingUpdate(BaseModel):
    symbol: Optional[str] = None
    shares: Optional[float] = None
    avg_price: Optional[float] = None

class HoldingResponse(BaseModel):
    id: str
    symbol: str
    shares: float
    avg_price: float
    portfolio_id: str
    created_at: str
    updated_at: str

# ── Seed Data ───────────────────────────────────────────

SEED_HOLDINGS = [
    {"symbol": "AAPL", "shares": 65, "avg_price": 105.88},
    {"symbol": "QQQ", "shares": 75, "avg_price": 371.92},
    {"symbol": "TSLA", "shares": 100, "avg_price": 161.64},
    {"symbol": "MSFT", "shares": 25, "avg_price": 329.72},
    {"symbol": "GOOGL", "shares": 60, "avg_price": 130.33},
    {"symbol": "CRWD", "shares": 15, "avg_price": 106.51},
    {"symbol": "SOXQ", "shares": 180, "avg_price": 27.53},
]

@app.on_event("startup")
async def seed_data():
    portfolio_count = await db.portfolios.count_documents({})
    if portfolio_count == 0:
        logger.info("Seeding initial data...")
        now = datetime.now(timezone.utc).isoformat()
        default_id = str(uuid.uuid4())
        await db.portfolios.insert_one({
            "id": default_id,
            "name": "My Portfolio",
            "created_at": now,
        })
        for h in SEED_HOLDINGS:
            doc = {
                "id": str(uuid.uuid4()),
                "symbol": h["symbol"],
                "shares": h["shares"],
                "avg_price": h["avg_price"],
                "portfolio_id": default_id,
                "created_at": now,
                "updated_at": now,
            }
            await db.holdings.insert_one(doc)
        logger.info(f"Seeded 1 portfolio + {len(SEED_HOLDINGS)} holdings")

# ── Portfolio CRUD ──────────────────────────────────────

@api_router.get("/portfolios", response_model=List[PortfolioResponse])
async def get_portfolios():
    docs = await db.portfolios.find({}, {"_id": 0}).to_list(50)
    return docs

@api_router.post("/portfolios", response_model=PortfolioResponse)
async def create_portfolio(data: PortfolioCreate):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "created_at": now,
    }
    await db.portfolios.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/portfolios/{portfolio_id}", response_model=PortfolioResponse)
async def update_portfolio(portfolio_id: str, data: PortfolioUpdate):
    existing = await db.portfolios.find_one({"id": portfolio_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    await db.portfolios.update_one({"id": portfolio_id}, {"$set": {"name": data.name.strip()}})
    updated = await db.portfolios.find_one({"id": portfolio_id}, {"_id": 0})
    return updated

@api_router.delete("/portfolios/{portfolio_id}")
async def delete_portfolio(portfolio_id: str):
    count = await db.portfolios.count_documents({})
    if count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last portfolio")
    result = await db.portfolios.delete_one({"id": portfolio_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    await db.holdings.delete_many({"portfolio_id": portfolio_id})
    return {"message": "Portfolio and its holdings deleted"}

# ── Holdings CRUD ───────────────────────────────────────

@api_router.get("/holdings", response_model=List[HoldingResponse])
async def get_holdings(portfolio_id: Optional[str] = None):
    query = {}
    if portfolio_id:
        query["portfolio_id"] = portfolio_id
    docs = await db.holdings.find(query, {"_id": 0}).to_list(500)
    return docs

@api_router.post("/holdings", response_model=HoldingResponse)
async def create_holding(data: HoldingCreate):
    portfolio = await db.portfolios.find_one({"id": data.portfolio_id}, {"_id": 0})
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "symbol": data.symbol.upper().strip(),
        "shares": data.shares,
        "avg_price": data.avg_price,
        "portfolio_id": data.portfolio_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.holdings.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/holdings/{holding_id}", response_model=HoldingResponse)
async def update_holding(holding_id: str, data: HoldingUpdate):
    existing = await db.holdings.find_one({"id": holding_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Holding not found")
    update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.symbol is not None:
        update_fields["symbol"] = data.symbol.upper().strip()
    if data.shares is not None:
        update_fields["shares"] = data.shares
    if data.avg_price is not None:
        update_fields["avg_price"] = data.avg_price
    await db.holdings.update_one({"id": holding_id}, {"$set": update_fields})
    updated = await db.holdings.find_one({"id": holding_id}, {"_id": 0})
    return updated

@api_router.delete("/holdings/{holding_id}")
async def delete_holding(holding_id: str):
    result = await db.holdings.delete_one({"id": holding_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Holding not found")
    return {"message": "Holding deleted"}

# ── CSV Import ──────────────────────────────────────────

@api_router.post("/holdings/import-csv")
async def import_csv(portfolio_id: str = Form(...), file: UploadFile = File(...)):
    portfolio = await db.portfolios.find_one({"id": portfolio_id}, {"_id": 0})
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    imported = []
    now = datetime.now(timezone.utc).isoformat()

    # Normalize headers: strip whitespace and lowercase
    fieldnames = [f.strip().lower() for f in (reader.fieldnames or [])]
    reader.fieldnames = fieldnames

    for row in reader:
        # Try common CSV column names
        symbol = (row.get("symbol") or row.get("ticker") or row.get("stock") or "").strip().upper()
        shares_str = (row.get("shares") or row.get("quantity") or row.get("qty") or "").strip()
        avg_price_str = (row.get("avg_price") or row.get("avg price") or row.get("average price")
                        or row.get("cost") or row.get("price") or row.get("book cost per share") or "").strip()

        if not symbol or not shares_str:
            continue

        # Clean numeric values
        shares_str = shares_str.replace(",", "").replace("$", "")
        avg_price_str = avg_price_str.replace(",", "").replace("$", "")

        try:
            shares = float(shares_str)
            avg_price = float(avg_price_str) if avg_price_str else 0.0
        except ValueError:
            continue

        if shares <= 0:
            continue

        doc = {
            "id": str(uuid.uuid4()),
            "symbol": symbol,
            "shares": shares,
            "avg_price": avg_price,
            "portfolio_id": portfolio_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.holdings.insert_one(doc)
        doc.pop("_id", None)
        imported.append(doc)

    return {"imported_count": len(imported), "holdings": imported}

# ── PDF Import ──────────────────────────────────────────

def _clean_number(s: str) -> str:
    """Strip currency symbols, commas, whitespace from a numeric string."""
    return re.sub(r'[^0-9.\-]', '', s.strip()) if s else ''

def _is_likely_ticker(s: str) -> bool:
    """Check if string looks like a stock ticker (1-5 uppercase letters)."""
    cleaned = s.strip().upper()
    return bool(re.match(r'^[A-Z]{1,5}$', cleaned))

def _extract_holdings_from_tables(tables: list) -> list:
    """Extract holdings from PDF tables by finding symbol/shares/price columns."""
    results = []
    for table in tables:
        if not table or len(table) < 2:
            continue
        # Find header row - look for column names
        header_row = None
        header_idx = -1
        for i, row in enumerate(table):
            row_lower = [str(c).strip().lower() if c else '' for c in row]
            row_text = ' '.join(row_lower)
            if any(kw in row_text for kw in ['symbol', 'ticker', 'stock', 'security', 'holding', 'name']):
                header_row = row_lower
                header_idx = i
                break

        if header_row:
            # Map columns
            sym_col = price_col = shares_col = None
            for j, h in enumerate(header_row):
                h = h.strip()
                if h in ('symbol', 'ticker', 'stock', 'security'):
                    sym_col = j
                elif any(k in h for k in ('share', 'quantity', 'qty', 'units')):
                    shares_col = j
                elif any(k in h for k in ('avg', 'cost', 'price', 'book', 'average')):
                    price_col = j

            if sym_col is not None and shares_col is not None:
                for row in table[header_idx + 1:]:
                    if len(row) <= max(filter(None, [sym_col, shares_col, price_col or 0])):
                        continue
                    sym = str(row[sym_col] or '').strip().upper()
                    if not _is_likely_ticker(sym):
                        continue
                    shares_str = _clean_number(str(row[shares_col] or ''))
                    price_str = _clean_number(str(row[price_col] or '')) if price_col is not None else ''
                    try:
                        shares = float(shares_str) if shares_str else 0
                        avg_price = float(price_str) if price_str else 0
                    except ValueError:
                        continue
                    if shares > 0:
                        results.append({"symbol": sym, "shares": shares, "avg_price": avg_price})
        else:
            # No header found — try heuristic: look for rows with a ticker-like cell
            for row in table:
                if not row or len(row) < 2:
                    continue
                ticker = None
                numbers = []
                for cell in row:
                    cell_str = str(cell or '').strip()
                    if not ticker and _is_likely_ticker(cell_str):
                        ticker = cell_str.upper()
                    else:
                        num = _clean_number(cell_str)
                        if num:
                            try:
                                numbers.append(float(num))
                            except ValueError:
                                pass
                if ticker and len(numbers) >= 1:
                    shares = numbers[0]
                    avg_price = numbers[1] if len(numbers) >= 2 else 0
                    if shares > 0:
                        results.append({"symbol": ticker, "shares": shares, "avg_price": avg_price})
    return results

def _extract_holdings_from_text(text: str) -> list:
    """Fallback: extract holdings from raw PDF text using regex patterns."""
    results = []
    # Common patterns: TICKER  123  $45.67
    pattern = r'\b([A-Z]{1,5})\b\s+(\d[\d,]*\.?\d*)\s+\$?([\d,]+\.?\d*)'
    for match in re.finditer(pattern, text):
        sym = match.group(1)
        shares_str = match.group(2).replace(',', '')
        price_str = match.group(3).replace(',', '')
        try:
            shares = float(shares_str)
            avg_price = float(price_str)
            if shares > 0 and sym not in ('USD', 'CAD', 'GBP', 'EUR', 'ETF', 'NYSE', 'TSX', 'CASH'):
                results.append({"symbol": sym, "shares": shares, "avg_price": avg_price})
        except ValueError:
            continue
    return results

@api_router.post("/holdings/import-pdf")
async def import_pdf(portfolio_id: str = Form(...), file: UploadFile = File(...)):
    portfolio = await db.portfolios.find_one({"id": portfolio_id}, {"_id": 0})
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    content = await file.read()

    try:
        pdf = pdfplumber.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {str(e)}")

    all_tables = []
    all_text = ""
    for page in pdf.pages:
        tables = page.extract_tables()
        if tables:
            all_tables.extend(tables)
        page_text = page.extract_text()
        if page_text:
            all_text += page_text + "\n"
    pdf.close()

    # Try table extraction first, fall back to text regex
    parsed = _extract_holdings_from_tables(all_tables)
    if not parsed:
        parsed = _extract_holdings_from_text(all_text)

    if not parsed:
        return {
            "imported_count": 0,
            "holdings": [],
            "raw_text_preview": all_text[:500] if all_text else "No text extracted",
            "message": "Could not auto-detect holdings. Try CSV format or add manually."
        }

    imported = []
    now = datetime.now(timezone.utc).isoformat()
    for h in parsed:
        doc = {
            "id": str(uuid.uuid4()),
            "symbol": h["symbol"],
            "shares": h["shares"],
            "avg_price": h["avg_price"],
            "portfolio_id": portfolio_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.holdings.insert_one(doc)
        doc.pop("_id", None)
        imported.append(doc)

    return {"imported_count": len(imported), "holdings": imported}

# ── Stock Quotes ────────────────────────────────────────

@api_router.get("/stocks/quotes")
async def get_stock_quotes(symbols: str):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        return {}
    quotes = {}
    try:
        tickers = yf.Tickers(" ".join(symbol_list))
        for sym in symbol_list:
            try:
                ticker = tickers.tickers.get(sym)
                if ticker:
                    info = ticker.fast_info
                    quotes[sym] = {
                        "price": round(float(info.last_price), 2) if hasattr(info, 'last_price') and info.last_price else 0,
                        "previous_close": round(float(info.previous_close), 2) if hasattr(info, 'previous_close') and info.previous_close else 0,
                        "day_high": round(float(info.day_high), 2) if hasattr(info, 'day_high') and info.day_high else 0,
                        "day_low": round(float(info.day_low), 2) if hasattr(info, 'day_low') and info.day_low else 0,
                        "market_cap": float(info.market_cap) if hasattr(info, 'market_cap') and info.market_cap else 0,
                    }
            except Exception as e:
                logger.warning(f"Error fetching quote for {sym}: {e}")
                quotes[sym] = {"price": 0, "previous_close": 0, "day_high": 0, "day_low": 0, "market_cap": 0}
    except Exception as e:
        logger.error(f"Error fetching quotes: {e}")
    return quotes

# ── Stock History ───────────────────────────────────────

@api_router.get("/stocks/history/{symbol}")
async def get_stock_history(symbol: str, period: str = "1mo"):
    valid_periods = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"]
    if period not in valid_periods:
        raise HTTPException(status_code=400, detail=f"Invalid period. Use one of: {valid_periods}")
    try:
        ticker = yf.Ticker(symbol.upper())
        hist = ticker.history(period=period)
        if hist.empty:
            return {"symbol": symbol.upper(), "data": []}
        data_points = []
        for date, row in hist.iterrows():
            data_points.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": round(float(row["Close"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "open": round(float(row["Open"]), 2),
                "volume": int(row["Volume"]),
            })
        return {"symbol": symbol.upper(), "period": period, "data": data_points}
    except Exception as e:
        logger.error(f"Error fetching history for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Health ──────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "Portfolio Tracker API"}

# ── Include Router & Middleware ─────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
