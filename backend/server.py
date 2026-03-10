from fastapi import FastAPI, APIRouter, HTTPException
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Models ──────────────────────────────────────────────

class HoldingCreate(BaseModel):
    symbol: str
    shares: float
    avg_price: float

class HoldingUpdate(BaseModel):
    symbol: Optional[str] = None
    shares: Optional[float] = None
    avg_price: Optional[float] = None

class HoldingResponse(BaseModel):
    id: str
    symbol: str
    shares: float
    avg_price: float
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
    count = await db.holdings.count_documents({})
    if count == 0:
        logger.info("Seeding initial holdings data...")
        now = datetime.now(timezone.utc).isoformat()
        for h in SEED_HOLDINGS:
            doc = {
                "id": str(uuid.uuid4()),
                "symbol": h["symbol"],
                "shares": h["shares"],
                "avg_price": h["avg_price"],
                "created_at": now,
                "updated_at": now,
            }
            await db.holdings.insert_one(doc)
        logger.info(f"Seeded {len(SEED_HOLDINGS)} holdings")

# ── Holdings CRUD ───────────────────────────────────────

@api_router.get("/holdings", response_model=List[HoldingResponse])
async def get_holdings():
    docs = await db.holdings.find({}, {"_id": 0}).to_list(100)
    return docs

@api_router.post("/holdings", response_model=HoldingResponse)
async def create_holding(data: HoldingCreate):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "symbol": data.symbol.upper().strip(),
        "shares": data.shares,
        "avg_price": data.avg_price,
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

# ── Stock Quotes ────────────────────────────────────────

@api_router.get("/stocks/quotes")
async def get_stock_quotes(symbols: str):
    """Fetch live quotes for comma-separated symbols."""
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
    """Fetch historical price data for a symbol."""
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
