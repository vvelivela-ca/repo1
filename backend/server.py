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
from openpyxl import load_workbook
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

# ── Asset Types ─────────────────────────────────────────
ASSET_TYPES = ["Stock", "ETF", "Mutual Fund", "Crypto", "Bond", "Real Estate", "Mortgage", "Cash", "Other"]

# ── Models ──────────────────────────────────────────────

class PortfolioCreate(BaseModel):
    name: str
    portfolio_type: str = "Investment"  # Investment, Mortgage, Real Estate, Mixed

class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    portfolio_type: Optional[str] = None

class PortfolioResponse(BaseModel):
    id: str
    name: str
    portfolio_type: str
    created_at: str

class HoldingCreate(BaseModel):
    symbol: str
    shares: float
    avg_price: float
    portfolio_id: str
    currency: str = "USD"
    asset_type: str = "Stock"
    exchange: Optional[str] = None  # NYSE, NASDAQ, TSX, NSE, BSE, etc.
    notes: Optional[str] = None

class HoldingUpdate(BaseModel):
    symbol: Optional[str] = None
    shares: Optional[float] = None
    avg_price: Optional[float] = None
    currency: Optional[str] = None
    asset_type: Optional[str] = None
    exchange: Optional[str] = None
    notes: Optional[str] = None

class HoldingResponse(BaseModel):
    id: str
    symbol: str
    shares: float
    avg_price: float
    portfolio_id: str
    currency: str
    asset_type: str
    exchange: Optional[str]
    notes: Optional[str]
    created_at: str
    updated_at: str

# Mortgage Model
class MortgageCreate(BaseModel):
    name: str
    portfolio_id: str
    principal: float
    interest_rate: float
    term_years: int
    start_date: str
    currency: str = "USD"
    property_value: Optional[float] = None
    notes: Optional[str] = None

class MortgageUpdate(BaseModel):
    name: Optional[str] = None
    principal: Optional[float] = None
    interest_rate: Optional[float] = None
    term_years: Optional[int] = None
    start_date: Optional[str] = None
    currency: Optional[str] = None
    property_value: Optional[float] = None
    extra_payments: Optional[float] = None
    notes: Optional[str] = None

class MortgageResponse(BaseModel):
    id: str
    name: str
    portfolio_id: str
    principal: float
    interest_rate: float
    term_years: int
    start_date: str
    currency: str
    property_value: Optional[float]
    extra_payments: float
    notes: Optional[str]
    created_at: str
    updated_at: str

# ── Seed Data ───────────────────────────────────────────

SEED_HOLDINGS = [
    {"symbol": "AAPL", "shares": 65, "avg_price": 105.88, "currency": "USD", "asset_type": "Stock", "exchange": "NASDAQ"},
    {"symbol": "QQQ", "shares": 75, "avg_price": 371.92, "currency": "USD", "asset_type": "ETF", "exchange": "NASDAQ"},
    {"symbol": "TSLA", "shares": 100, "avg_price": 161.64, "currency": "USD", "asset_type": "Stock", "exchange": "NASDAQ"},
    {"symbol": "MSFT", "shares": 25, "avg_price": 329.72, "currency": "USD", "asset_type": "Stock", "exchange": "NASDAQ"},
    {"symbol": "GOOGL", "shares": 60, "avg_price": 130.33, "currency": "USD", "asset_type": "Stock", "exchange": "NASDAQ"},
    {"symbol": "BTC-USD", "shares": 0.5, "avg_price": 42000, "currency": "USD", "asset_type": "Crypto", "exchange": "Crypto"},
    {"symbol": "ETH-USD", "shares": 5, "avg_price": 2200, "currency": "USD", "asset_type": "Crypto", "exchange": "Crypto"},
]

@app.on_event("startup")
async def seed_data():
    # Migrate: add new fields to existing holdings
    await db.holdings.update_many(
        {"currency": {"$exists": False}},
        {"$set": {"currency": "USD"}}
    )
    await db.holdings.update_many(
        {"asset_type": {"$exists": False}},
        {"$set": {"asset_type": "Stock"}}
    )
    await db.holdings.update_many(
        {"exchange": {"$exists": False}},
        {"$set": {"exchange": None}}
    )
    await db.holdings.update_many(
        {"notes": {"$exists": False}},
        {"$set": {"notes": None}}
    )
    await db.portfolios.update_many(
        {"portfolio_type": {"$exists": False}},
        {"$set": {"portfolio_type": "Investment"}}
    )

    portfolio_count = await db.portfolios.count_documents({})
    if portfolio_count == 0:
        logger.info("Seeding initial data...")
        now = datetime.now(timezone.utc).isoformat()
        default_id = str(uuid.uuid4())
        await db.portfolios.insert_one({
            "id": default_id,
            "name": "My Portfolio",
            "portfolio_type": "Investment",
            "created_at": now,
        })
        for h in SEED_HOLDINGS:
            doc = {
                "id": str(uuid.uuid4()),
                "symbol": h["symbol"],
                "shares": h["shares"],
                "avg_price": h["avg_price"],
                "currency": h.get("currency", "USD"),
                "asset_type": h.get("asset_type", "Stock"),
                "exchange": h.get("exchange"),
                "notes": None,
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
        "portfolio_type": data.portfolio_type,
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
    update_fields = {}
    if data.name is not None:
        update_fields["name"] = data.name.strip()
    if data.portfolio_type is not None:
        update_fields["portfolio_type"] = data.portfolio_type
    if update_fields:
        await db.portfolios.update_one({"id": portfolio_id}, {"$set": update_fields})
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
    await db.mortgages.delete_many({"portfolio_id": portfolio_id})
    return {"message": "Portfolio and its holdings deleted"}

# ── Holdings CRUD ───────────────────────────────────────

@api_router.get("/holdings", response_model=List[HoldingResponse])
async def get_holdings(portfolio_id: Optional[str] = None, asset_type: Optional[str] = None):
    query = {}
    if portfolio_id:
        query["portfolio_id"] = portfolio_id
    if asset_type:
        query["asset_type"] = asset_type
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
        "asset_type": data.asset_type,
        "exchange": data.exchange,
        "notes": data.notes,
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
    if data.asset_type is not None:
        update_fields["asset_type"] = data.asset_type
    if data.exchange is not None:
        update_fields["exchange"] = data.exchange
    if data.notes is not None:
        update_fields["notes"] = data.notes
    await db.holdings.update_one({"id": holding_id}, {"$set": update_fields})
    updated = await db.holdings.find_one({"id": holding_id}, {"_id": 0})
    return updated

@api_router.delete("/holdings/{holding_id}")
async def delete_holding(holding_id: str):
    result = await db.holdings.delete_one({"id": holding_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Holding not found")
    return {"message": "Holding deleted"}

# ── Mortgage CRUD ───────────────────────────────────────

@api_router.get("/mortgages")
async def get_mortgages(portfolio_id: Optional[str] = None):
    query = {}
    if portfolio_id:
        query["portfolio_id"] = portfolio_id
    docs = await db.mortgages.find(query, {"_id": 0}).to_list(100)
    return docs

@api_router.post("/mortgages", response_model=MortgageResponse)
async def create_mortgage(data: MortgageCreate):
    portfolio = await db.portfolios.find_one({"id": data.portfolio_id}, {"_id": 0})
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "portfolio_id": data.portfolio_id,
        "principal": data.principal,
        "interest_rate": data.interest_rate,
        "term_years": data.term_years,
        "start_date": data.start_date,
        "currency": data.currency.upper().strip(),
        "property_value": data.property_value,
        "extra_payments": 0,
        "notes": data.notes,
        "created_at": now,
        "updated_at": now,
    }
    await db.mortgages.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/mortgages/{mortgage_id}", response_model=MortgageResponse)
async def update_mortgage(mortgage_id: str, data: MortgageUpdate):
    existing = await db.mortgages.find_one({"id": mortgage_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Mortgage not found")
    update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ["name", "principal", "interest_rate", "term_years", "start_date", "currency", "property_value", "extra_payments", "notes"]:
        val = getattr(data, field, None)
        if val is not None:
            update_fields[field] = val.strip() if isinstance(val, str) else val
    await db.mortgages.update_one({"id": mortgage_id}, {"$set": update_fields})
    updated = await db.mortgages.find_one({"id": mortgage_id}, {"_id": 0})
    return updated

@api_router.delete("/mortgages/{mortgage_id}")
async def delete_mortgage(mortgage_id: str):
    result = await db.mortgages.delete_one({"id": mortgage_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mortgage not found")
    return {"message": "Mortgage deleted"}

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

    fieldnames = [f.strip().lower() for f in (reader.fieldnames or [])]
    reader.fieldnames = fieldnames

    for row in reader:
        symbol = (row.get("symbol") or row.get("ticker") or row.get("stock") or "").strip().upper()
        shares_str = (row.get("shares") or row.get("quantity") or row.get("qty") or row.get("units") or "").strip()
        avg_price_str = (row.get("avg_price") or row.get("avg price") or row.get("average price")
                        or row.get("cost") or row.get("price") or row.get("book cost per share") or "").strip()
        asset_type = (row.get("asset_type") or row.get("type") or row.get("asset type") or "Stock").strip()
        exchange = (row.get("exchange") or "").strip()

        if not symbol or not shares_str:
            continue

        shares_str = shares_str.replace(",", "").replace("$", "")
        avg_price_str = avg_price_str.replace(",", "").replace("$", "")

        try:
            shares = float(shares_str)
            avg_price = float(avg_price_str) if avg_price_str else 0.0
        except ValueError:
            continue

        if shares <= 0:
            continue

        existing = await db.holdings.find_one(
            {"symbol": symbol, "portfolio_id": portfolio_id}, {"_id": 0}
        )
        currency_val = (row.get("currency") or "USD").strip().upper()

        # Normalize asset type
        asset_type_normalized = "Stock"
        for at in ASSET_TYPES:
            if at.lower() in asset_type.lower():
                asset_type_normalized = at
                break

        if existing:
            await db.holdings.update_one(
                {"id": existing["id"]},
                {"$set": {"shares": shares, "avg_price": avg_price, "currency": currency_val, "asset_type": asset_type_normalized, "exchange": exchange or existing.get("exchange"), "updated_at": now}}
            )
            updated = await db.holdings.find_one({"id": existing["id"]}, {"_id": 0})
            updated["_action"] = "updated"
            imported.append(updated)
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "symbol": symbol,
                "shares": shares,
                "avg_price": avg_price,
                "currency": currency_val,
                "asset_type": asset_type_normalized,
                "exchange": exchange or None,
                "notes": None,
                "portfolio_id": portfolio_id,
                "created_at": now,
                "updated_at": now,
            }
            await db.holdings.insert_one(doc)
            doc.pop("_id", None)
            doc["_action"] = "created"
            imported.append(doc)

    return {"imported_count": len(imported), "holdings": imported}

# ── Excel Import ────────────────────────────────────────

@api_router.post("/holdings/import-excel")
async def import_excel(portfolio_id: str = Form(...), file: UploadFile = File(...)):
    portfolio = await db.portfolios.find_one({"id": portfolio_id}, {"_id": 0})
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    content = await file.read()
    
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        sheet = wb.active
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read Excel file: {str(e)}")

    imported = []
    now = datetime.now(timezone.utc).isoformat()

    # Get headers from first row
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return {"imported_count": 0, "holdings": [], "message": "Empty Excel file"}

    headers = [str(h).strip().lower() if h else "" for h in rows[0]]
    
    # Find column indices
    def find_col(names):
        for name in names:
            if name in headers:
                return headers.index(name)
        return -1

    symbol_idx = find_col(["symbol", "ticker", "stock"])
    shares_idx = find_col(["shares", "quantity", "qty", "units"])
    price_idx = find_col(["avg_price", "avg price", "average price", "cost", "price", "book cost per share"])
    currency_idx = find_col(["currency"])
    type_idx = find_col(["asset_type", "type", "asset type"])
    exchange_idx = find_col(["exchange"])

    if symbol_idx == -1 or shares_idx == -1:
        return {"imported_count": 0, "holdings": [], "message": "Could not find Symbol/Shares columns"}

    for row in rows[1:]:
        if not row or len(row) <= max(symbol_idx, shares_idx):
            continue

        symbol = str(row[symbol_idx] or "").strip().upper()
        shares_val = row[shares_idx]
        
        if not symbol or shares_val is None:
            continue

        try:
            shares = float(str(shares_val).replace(",", "").replace("$", ""))
        except:
            continue

        if shares <= 0:
            continue

        avg_price = 0.0
        if price_idx >= 0 and len(row) > price_idx and row[price_idx]:
            try:
                avg_price = float(str(row[price_idx]).replace(",", "").replace("$", ""))
            except:
                pass

        currency_val = "USD"
        if currency_idx >= 0 and len(row) > currency_idx and row[currency_idx]:
            currency_val = str(row[currency_idx]).strip().upper()

        asset_type = "Stock"
        if type_idx >= 0 and len(row) > type_idx and row[type_idx]:
            type_str = str(row[type_idx]).strip()
            for at in ASSET_TYPES:
                if at.lower() in type_str.lower():
                    asset_type = at
                    break

        exchange = None
        if exchange_idx >= 0 and len(row) > exchange_idx and row[exchange_idx]:
            exchange = str(row[exchange_idx]).strip()

        existing = await db.holdings.find_one(
            {"symbol": symbol, "portfolio_id": portfolio_id}, {"_id": 0}
        )

        if existing:
            await db.holdings.update_one(
                {"id": existing["id"]},
                {"$set": {"shares": shares, "avg_price": avg_price, "currency": currency_val, "asset_type": asset_type, "exchange": exchange or existing.get("exchange"), "updated_at": now}}
            )
            updated = await db.holdings.find_one({"id": existing["id"]}, {"_id": 0})
            updated["_action"] = "updated"
            imported.append(updated)
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "symbol": symbol,
                "shares": shares,
                "avg_price": avg_price,
                "currency": currency_val,
                "asset_type": asset_type,
                "exchange": exchange,
                "notes": None,
                "portfolio_id": portfolio_id,
                "created_at": now,
                "updated_at": now,
            }
            await db.holdings.insert_one(doc)
            doc.pop("_id", None)
            doc["_action"] = "created"
            imported.append(doc)

    wb.close()
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
        system_message="""You are a financial document parser. Extract stock/ETF/crypto/mutual fund holdings from brokerage statements.

Return ONLY a valid JSON array. Each item must have:
- "symbol": ticker (e.g. "AAPL", "QQQ", "BTC-USD") - uppercase
- "shares": number of shares/units (float)
- "avg_price": average cost per share (float, 0 if not found)
- "currency": "USD", "CAD", or "INR" (detect from context)
- "asset_type": "Stock", "ETF", "Mutual Fund", "Crypto", "Bond", or "Other"

Rules:
- Only include actual holdings (not cash balances or headers)
- For crypto, use format like BTC-USD, ETH-USD
- If you see "quantity" or "units", that's the shares count
- If only total cost shown, divide by shares for avg_price
- Return ONLY the JSON array, nothing else"""
    ).with_model("openai", "gpt-4o")

    try:
        truncated_text = text[:8000] if len(text) > 8000 else text
        user_msg = UserMessage(
            text=f"Extract all holdings from this brokerage statement:\n\n{truncated_text}"
        )
        response = await chat.send_message(user_msg)

        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        parsed = json_module.loads(response_text)
        if not isinstance(parsed, list):
            return []

        results = []
        for item in parsed:
            sym = str(item.get("symbol", "")).strip().upper()
            shares = float(item.get("shares", 0))
            avg_price = float(item.get("avg_price", 0))
            currency = str(item.get("currency", "USD")).strip().upper()
            asset_type = str(item.get("asset_type", "Stock")).strip()
            
            if currency not in ("USD", "CAD", "INR"):
                currency = "USD"
            
            # Normalize asset type
            asset_type_normalized = "Stock"
            for at in ASSET_TYPES:
                if at.lower() in asset_type.lower():
                    asset_type_normalized = at
                    break
            
            if sym and shares > 0:
                results.append({
                    "symbol": sym, 
                    "shares": shares, 
                    "avg_price": avg_price, 
                    "currency": currency,
                    "asset_type": asset_type_normalized
                })
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

    parsed = await _ai_parse_holdings(all_text)

    if not parsed:
        return {
            "imported_count": 0,
            "holdings": [],
            "raw_text_preview": all_text[:500],
            "message": "AI could not detect holdings in this document. Try CSV/Excel format or add manually."
        }

    imported = []
    now = datetime.now(timezone.utc).isoformat()
    for h in parsed:
        symbol = h["symbol"]
        existing = await db.holdings.find_one(
            {"symbol": symbol, "portfolio_id": portfolio_id}, {"_id": 0}
        )

        if existing:
            await db.holdings.update_one(
                {"id": existing["id"]},
                {"$set": {"shares": h["shares"], "avg_price": h["avg_price"], "currency": h["currency"], "asset_type": h["asset_type"], "updated_at": now}}
            )
            updated = await db.holdings.find_one({"id": existing["id"]}, {"_id": 0})
            updated["_action"] = "updated"
            imported.append(updated)
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "symbol": symbol,
                "shares": h["shares"],
                "avg_price": h["avg_price"],
                "currency": h["currency"],
                "asset_type": h["asset_type"],
                "exchange": None,
                "notes": None,
                "portfolio_id": portfolio_id,
                "created_at": now,
                "updated_at": now,
            }
            await db.holdings.insert_one(doc)
            doc.pop("_id", None)
            doc["_action"] = "created"
            imported.append(doc)

    return {"imported_count": len(imported), "holdings": imported}

# ── Stock Quotes (FREE via yfinance) ────────────────────

@api_router.get("/fx-rates")
async def get_fx_rates():
    """Fetch live FX rates for USD/CAD, USD/INR using yfinance (FREE)."""
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
            rates[currency] = 1.44 if currency == "CAD" else 84.5
    return rates

@api_router.get("/stocks/quotes")
async def get_stock_quotes(symbols: str, currencies: str = ""):
    """Fetch live quotes using yfinance (FREE). Supports stocks, ETFs, mutual funds, crypto."""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    currency_list = [c.strip().upper() for c in currencies.split(",")] if currencies else []
    if not symbol_list:
        return {}

    sym_currencies = {}
    for i, sym in enumerate(symbol_list):
        sym_currencies[sym] = currency_list[i] if i < len(currency_list) else "USD"

    quotes = {}
    yahoo_to_original = {}
    yahoo_symbols = []
    
    for sym in symbol_list:
        cur = sym_currencies.get(sym, "USD")
        # Handle different exchanges and asset types
        if "." in sym or "-" in sym:
            # Already has suffix (crypto like BTC-USD, or exchange like SHOP.TO)
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

                    if price == 0 and "." in yahoo_sym:
                        bare_sym = yahoo_sym.split(".")[0]
                        try:
                            fallback = yf.Ticker(bare_sym)
                            fb_info = fallback.fast_info
                            price = round(float(fb_info.last_price), 2) if hasattr(fb_info, 'last_price') and fb_info.last_price else 0
                            if price > 0:
                                info = fb_info
                                ticker = fallback
                        except:
                            pass

                    price_currency = sym_currencies.get(original_sym, "USD")
                    try:
                        ticker_info = ticker.info
                        price_currency = ticker_info.get("currency", price_currency).upper()
                    except:
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

@api_router.get("/stocks/history/{symbol}")
async def get_stock_history(symbol: str, period: str = "1mo"):
    """Fetch historical data using yfinance (FREE)."""
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

# ── Asset Types ─────────────────────────────────────────

@api_router.get("/asset-types")
async def get_asset_types():
    """Get list of supported asset types."""
    return {"asset_types": ASSET_TYPES}

# ── Portfolio Summary ───────────────────────────────────

@api_router.get("/portfolio/summary")
async def get_portfolio_summary(portfolio_id: Optional[str] = None):
    """Get summary of holdings by asset type."""
    query = {}
    if portfolio_id:
        query["portfolio_id"] = portfolio_id
    
    holdings = await db.holdings.find(query, {"_id": 0}).to_list(500)
    mortgages = await db.mortgages.find(query, {"_id": 0}).to_list(100)
    
    summary = {
        "total_holdings": len(holdings),
        "total_mortgages": len(mortgages),
        "by_asset_type": {},
        "by_currency": {},
    }
    
    for h in holdings:
        asset_type = h.get("asset_type", "Stock")
        currency = h.get("currency", "USD")
        
        if asset_type not in summary["by_asset_type"]:
            summary["by_asset_type"][asset_type] = {"count": 0, "total_value": 0}
        summary["by_asset_type"][asset_type]["count"] += 1
        summary["by_asset_type"][asset_type]["total_value"] += h["shares"] * h["avg_price"]
        
        if currency not in summary["by_currency"]:
            summary["by_currency"][currency] = {"count": 0}
        summary["by_currency"][currency]["count"] += 1
    
    return summary

# ── Health ──────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "Holdings Hub API - 100% FREE"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "free": True}

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
