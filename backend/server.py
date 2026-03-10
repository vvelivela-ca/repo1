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
import json as json_module
from emergentintegrations.llm.chat import LlmChat, UserMessage

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
    currency: str = "USD"

class HoldingUpdate(BaseModel):
    symbol: Optional[str] = None
    shares: Optional[float] = None
    avg_price: Optional[float] = None
    currency: Optional[str] = None

class HoldingResponse(BaseModel):
    id: str
    symbol: str
    shares: float
    avg_price: float
    portfolio_id: str
    currency: str
    created_at: str
    updated_at: str

# ── Seed Data ───────────────────────────────────────────

SEED_HOLDINGS = [
    {"symbol": "AAPL", "shares": 65, "avg_price": 105.88, "currency": "USD"},
    {"symbol": "QQQ", "shares": 75, "avg_price": 371.92, "currency": "USD"},
    {"symbol": "TSLA", "shares": 100, "avg_price": 161.64, "currency": "USD"},
    {"symbol": "MSFT", "shares": 25, "avg_price": 329.72, "currency": "USD"},
    {"symbol": "GOOGL", "shares": 60, "avg_price": 130.33, "currency": "USD"},
    {"symbol": "CRWD", "shares": 15, "avg_price": 106.51, "currency": "USD"},
    {"symbol": "SOXQ", "shares": 180, "avg_price": 27.53, "currency": "USD"},
]

@app.on_event("startup")
async def seed_data():
    # Migrate: add currency field to any holdings that don't have it
    await db.holdings.update_many(
        {"currency": {"$exists": False}},
        {"$set": {"currency": "USD"}}
    )
    
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
                "currency": h.get("currency", "USD"),
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
        "currency": data.currency.upper().strip(),
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
    if data.currency is not None:
        update_fields["currency"] = data.currency.upper().strip()
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
            "currency": (row.get("currency") or "USD").strip().upper(),
            "portfolio_id": portfolio_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.holdings.insert_one(doc)
        doc.pop("_id", None)
        imported.append(doc)

    return {"imported_count": len(imported), "holdings": imported}

# ── PDF Import (AI-Powered) ─────────────────────────────

async def _ai_parse_holdings(text: str) -> list:
    """Use GPT to intelligently extract holdings from any PDF text format."""
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return []

    chat = LlmChat(
        api_key=api_key,
        session_id=f"pdf-parse-{uuid.uuid4()}",
        system_message="""You are a financial document parser. Extract stock/ETF holdings from brokerage statements.

Return ONLY a valid JSON array. Each item must have:
- "symbol": stock ticker (e.g. "AAPL", "QQQ") - uppercase, 1-5 letters
- "shares": number of shares (float)
- "avg_price": average cost per share or book cost per share (float, 0 if not found)
- "currency": the currency of the holding prices - "USD", "CAD", or "INR" (detect from context like CAD $, ₹, Rs, $, etc. Default to "USD" if unclear)

Rules:
- Only include actual stock/ETF ticker symbols (not cash, currency codes like USD/CAD, or section headers)
- If you see "quantity" or "units", that's the shares count
- If you see "book cost per share", "avg cost", "average price", or "cost basis per share", that's the avg_price
- If only total cost is shown (not per-share), divide by shares to get avg_price
- Ignore subtotals, totals, and summary rows
- If no holdings found, return empty array []
- Return ONLY the JSON array, nothing else"""
    ).with_model("openai", "gpt-5.2")

    try:
        # Truncate to avoid token limits
        truncated_text = text[:8000] if len(text) > 8000 else text
        user_msg = UserMessage(
            text=f"Extract all stock/ETF holdings from this brokerage statement:\n\n{truncated_text}"
        )
        response = await chat.send_message(user_msg)

        # Parse JSON from response
        response_text = response.strip()
        # Handle markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        parsed = json_module.loads(response_text)
        if not isinstance(parsed, list):
            return []

        # Validate each entry
        results = []
        for item in parsed:
            sym = str(item.get("symbol", "")).strip().upper()
            shares = float(item.get("shares", 0))
            avg_price = float(item.get("avg_price", 0))
            currency = str(item.get("currency", "USD")).strip().upper()
            if currency not in ("USD", "CAD", "INR"):
                currency = "USD"
            if sym and shares > 0 and len(sym) <= 5 and sym.isalpha():
                results.append({"symbol": sym, "shares": shares, "avg_price": avg_price, "currency": currency})
        return results
    except Exception as e:
        logger.error(f"AI parsing error: {e}")
        return []

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

    all_text = ""
    for page in pdf.pages:
        page_text = page.extract_text()
        if page_text:
            all_text += page_text + "\n"
    pdf.close()

    if not all_text.strip():
        return {
            "imported_count": 0,
            "holdings": [],
            "message": "Could not extract text from PDF. The file may be image-based or encrypted."
        }

    # Use AI to parse holdings from any format
    parsed = await _ai_parse_holdings(all_text)

    if not parsed:
        return {
            "imported_count": 0,
            "holdings": [],
            "raw_text_preview": all_text[:500],
            "message": "AI could not detect holdings in this document. Try CSV format or add manually."
        }

    imported = []
    now = datetime.now(timezone.utc).isoformat()
    for h in parsed:
        doc = {
            "id": str(uuid.uuid4()),
            "symbol": h["symbol"],
            "shares": h["shares"],
            "avg_price": h["avg_price"],
            "currency": h.get("currency", "USD"),
            "portfolio_id": portfolio_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.holdings.insert_one(doc)
        doc.pop("_id", None)
        imported.append(doc)

    return {"imported_count": len(imported), "holdings": imported}

# ── Stock Quotes ────────────────────────────────────────

@api_router.get("/fx-rates")
async def get_fx_rates():
    """Fetch live FX rates for USD/CAD, USD/INR using yfinance."""
    rates = {"USD": 1.0}
    pairs = {"CAD": "USDCAD=X", "INR": "USDINR=X"}
    for currency, symbol in pairs.items():
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.fast_info
            rate = float(info.last_price) if hasattr(info, 'last_price') and info.last_price else 0
            rates[currency] = round(rate, 4)
        except Exception as e:
            logger.warning(f"Error fetching FX rate {symbol}: {e}")
            # Fallback rates
            rates[currency] = 1.44 if currency == "CAD" else 84.5
    return rates

@api_router.get("/stocks/quotes")
async def get_stock_quotes(symbols: str, currencies: str = ""):
    """Fetch live quotes. Optionally pass currencies (comma-separated, same order as symbols) to help resolve exchange."""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    currency_list = [c.strip().upper() for c in currencies.split(",")] if currencies else []
    if not symbol_list:
        return {}

    # Build symbol-to-currency map
    sym_currencies = {}
    for i, sym in enumerate(symbol_list):
        sym_currencies[sym] = currency_list[i] if i < len(currency_list) else "USD"

    quotes = {}
    # Determine actual yahoo symbols - add exchange suffix based on holding currency
    yahoo_to_original = {}
    yahoo_symbols = []
    for sym in symbol_list:
        cur = sym_currencies.get(sym, "USD")
        # If already has exchange suffix, use as-is
        if "." in sym:
            yahoo_symbols.append(sym)
            yahoo_to_original[sym] = sym
        elif cur == "CAD":
            yahoo_sym = f"{sym}.TO"
            yahoo_symbols.append(yahoo_sym)
            yahoo_to_original[yahoo_sym] = sym
        elif cur == "INR":
            yahoo_sym = f"{sym}.NS"
            yahoo_symbols.append(yahoo_sym)
            yahoo_to_original[yahoo_sym] = sym
        else:
            yahoo_symbols.append(sym)
            yahoo_to_original[sym] = sym

    try:
        tickers = yf.Tickers(" ".join(yahoo_symbols))
        for yahoo_sym in yahoo_symbols:
            original_sym = yahoo_to_original.get(yahoo_sym, yahoo_sym)
            try:
                ticker = tickers.tickers.get(yahoo_sym)
                if ticker:
                    info = ticker.fast_info
                    price = round(float(info.last_price), 2) if hasattr(info, 'last_price') and info.last_price else 0

                    # If price is 0, try without exchange suffix (fallback)
                    if price == 0 and "." in yahoo_sym:
                        bare_sym = yahoo_sym.split(".")[0]
                        try:
                            fallback = yf.Ticker(bare_sym)
                            fb_info = fallback.fast_info
                            price = round(float(fb_info.last_price), 2) if hasattr(fb_info, 'last_price') and fb_info.last_price else 0
                            if price > 0:
                                info = fb_info
                                ticker = fallback
                        except Exception:
                            pass

                    # Detect price currency
                    price_currency = sym_currencies.get(original_sym, "USD")
                    try:
                        ticker_info = ticker.info
                        price_currency = ticker_info.get("currency", price_currency).upper()
                    except Exception:
                        pass

                    quotes[original_sym] = {
                        "price": price,
                        "previous_close": round(float(info.previous_close), 2) if hasattr(info, 'previous_close') and info.previous_close else 0,
                        "day_high": round(float(info.day_high), 2) if hasattr(info, 'day_high') and info.day_high else 0,
                        "day_low": round(float(info.day_low), 2) if hasattr(info, 'day_low') and info.day_low else 0,
                        "market_cap": float(info.market_cap) if hasattr(info, 'market_cap') and info.market_cap else 0,
                        "quote_currency": price_currency,
                    }
            except Exception as e:
                logger.warning(f"Error fetching quote for {yahoo_sym}: {e}")
                quotes[original_sym] = {"price": 0, "previous_close": 0, "day_high": 0, "day_low": 0, "market_cap": 0, "quote_currency": "USD"}
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
