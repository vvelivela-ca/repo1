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
from datetime import datetime
from bson import ObjectId


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class HoldingBase(BaseModel):
    name: str
    symbol: str
    quantity: float
    purchase_price: float
    current_price: float
    category: str = "Stock"  # Stock, Crypto, ETF, Mutual Fund, Bond, Real Estate, Other
    purchase_date: Optional[str] = None
    notes: Optional[str] = None

class HoldingCreate(HoldingBase):
    pass

class HoldingUpdate(BaseModel):
    name: Optional[str] = None
    symbol: Optional[str] = None
    quantity: Optional[float] = None
    purchase_price: Optional[float] = None
    current_price: Optional[float] = None
    category: Optional[str] = None
    purchase_date: Optional[str] = None
    notes: Optional[str] = None

class Holding(HoldingBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PortfolioSummary(BaseModel):
    total_value: float
    total_cost: float
    total_gain_loss: float
    gain_loss_percentage: float
    holdings_count: int
    category_breakdown: dict

# Helper function to convert MongoDB document to Holding
def holding_helper(holding) -> dict:
    return {
        "id": str(holding["_id"]),
        "name": holding["name"],
        "symbol": holding["symbol"],
        "quantity": holding["quantity"],
        "purchase_price": holding["purchase_price"],
        "current_price": holding["current_price"],
        "category": holding.get("category", "Stock"),
        "purchase_date": holding.get("purchase_date"),
        "notes": holding.get("notes"),
        "created_at": holding.get("created_at", datetime.utcnow()),
        "updated_at": holding.get("updated_at", datetime.utcnow()),
    }

# Routes
@api_router.get("/")
async def root():
    return {"message": "Holdings Hub API"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Holdings CRUD
@api_router.post("/holdings", response_model=Holding)
async def create_holding(holding: HoldingCreate):
    holding_dict = holding.dict()
    holding_dict["created_at"] = datetime.utcnow()
    holding_dict["updated_at"] = datetime.utcnow()
    
    result = await db.holdings.insert_one(holding_dict)
    created_holding = await db.holdings.find_one({"_id": result.inserted_id})
    return holding_helper(created_holding)

@api_router.get("/holdings", response_model=List[Holding])
async def get_holdings():
    holdings = []
    async for holding in db.holdings.find():
        holdings.append(holding_helper(holding))
    return holdings

@api_router.get("/holdings/{holding_id}", response_model=Holding)
async def get_holding(holding_id: str):
    try:
        holding = await db.holdings.find_one({"_id": ObjectId(holding_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid holding ID")
    
    if holding is None:
        raise HTTPException(status_code=404, detail="Holding not found")
    return holding_helper(holding)

@api_router.put("/holdings/{holding_id}", response_model=Holding)
async def update_holding(holding_id: str, holding_update: HoldingUpdate):
    try:
        existing = await db.holdings.find_one({"_id": ObjectId(holding_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid holding ID")
    
    if existing is None:
        raise HTTPException(status_code=404, detail="Holding not found")
    
    update_data = {k: v for k, v in holding_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.holdings.update_one(
        {"_id": ObjectId(holding_id)},
        {"$set": update_data}
    )
    
    updated_holding = await db.holdings.find_one({"_id": ObjectId(holding_id)})
    return holding_helper(updated_holding)

@api_router.delete("/holdings/{holding_id}")
async def delete_holding(holding_id: str):
    try:
        result = await db.holdings.delete_one({"_id": ObjectId(holding_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid holding ID")
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Holding not found")
    
    return {"message": "Holding deleted successfully"}

# Portfolio Summary
@api_router.get("/portfolio/summary", response_model=PortfolioSummary)
async def get_portfolio_summary():
    holdings = []
    async for holding in db.holdings.find():
        holdings.append(holding_helper(holding))
    
    total_value = 0
    total_cost = 0
    category_breakdown = {}
    
    for h in holdings:
        value = h["quantity"] * h["current_price"]
        cost = h["quantity"] * h["purchase_price"]
        total_value += value
        total_cost += cost
        
        category = h.get("category", "Other")
        if category not in category_breakdown:
            category_breakdown[category] = {"value": 0, "count": 0}
        category_breakdown[category]["value"] += value
        category_breakdown[category]["count"] += 1
    
    total_gain_loss = total_value - total_cost
    gain_loss_percentage = (total_gain_loss / total_cost * 100) if total_cost > 0 else 0
    
    return PortfolioSummary(
        total_value=round(total_value, 2),
        total_cost=round(total_cost, 2),
        total_gain_loss=round(total_gain_loss, 2),
        gain_loss_percentage=round(gain_loss_percentage, 2),
        holdings_count=len(holdings),
        category_breakdown=category_breakdown
    )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
