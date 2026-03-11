#!/usr/bin/env python3
"""
Backend API Test Suite for Holdings Hub Finance App
Tests portfolio and holdings APIs with data fetch and import functionality
"""

import requests
import json
import sys
import os
from typing import Dict, List, Optional, Any

# Load backend URL from frontend environment
def load_backend_url():
    """Load backend URL from frontend .env file"""
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL'):
                    url = line.split('=', 1)[1].strip().strip('"')
                    return f"{url}/api"
    return "https://holdings-core.preview.emergentagent.com/api"

API_BASE_URL = load_backend_url()
print(f"Testing API at: {API_BASE_URL}")

class HoldingsHubAPITester:
    def __init__(self):
        self.base_url = API_BASE_URL
        self.session = requests.Session()
        self.test_results = []
        self.portfolio_id = None
        self.created_holding_id = None
        
    def log_test(self, test_name: str, success: bool, message: str = "", data: Any = None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "data": data
        })
        
    def make_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.request(method, url, timeout=30, **kwargs)
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request error for {method} {url}: {e}")
            raise
    
    def test_1_portfolio_list_api(self):
        """Test 1: Portfolio List API - GET /api/portfolios"""
        try:
            response = self.make_request("GET", "/portfolios")
            
            if response.status_code != 200:
                self.log_test("Portfolio List API", False, f"Status {response.status_code}: {response.text}")
                return
            
            portfolios = response.json()
            
            if not isinstance(portfolios, list):
                self.log_test("Portfolio List API", False, f"Expected list, got {type(portfolios)}")
                return
                
            if len(portfolios) == 0:
                self.log_test("Portfolio List API", False, "No portfolios found")
                return
            
            # Store first portfolio ID for later tests
            self.portfolio_id = portfolios[0]["id"]
            portfolio = portfolios[0]
            
            # Verify portfolio structure
            required_fields = ["id", "name", "portfolio_type", "created_at"]
            missing_fields = [field for field in required_fields if field not in portfolio]
            
            if missing_fields:
                self.log_test("Portfolio List API", False, f"Missing fields: {missing_fields}")
                return
            
            self.log_test("Portfolio List API", True, f"Found {len(portfolios)} portfolios", portfolios[0])
            
        except Exception as e:
            self.log_test("Portfolio List API", False, f"Exception: {e}")
    
    def test_2_holdings_list_api(self):
        """Test 2: Holdings List API - GET /api/holdings"""
        try:
            response = self.make_request("GET", "/holdings")
            
            if response.status_code != 200:
                self.log_test("Holdings List API", False, f"Status {response.status_code}: {response.text}")
                return
            
            holdings = response.json()
            
            if not isinstance(holdings, list):
                self.log_test("Holdings List API", False, f"Expected list, got {type(holdings)}")
                return
                
            if len(holdings) == 0:
                self.log_test("Holdings List API", False, "No holdings found")
                return
            
            # Verify holding structure
            holding = holdings[0]
            required_fields = ["id", "symbol", "shares", "avg_price", "currency", "asset_type", "exchange"]
            missing_fields = [field for field in required_fields if field not in holding]
            
            if missing_fields:
                self.log_test("Holdings List API", False, f"Missing fields: {missing_fields}")
                return
            
            # Verify field types and values
            if not isinstance(holding["shares"], (int, float)) or holding["shares"] <= 0:
                self.log_test("Holdings List API", False, f"Invalid shares value: {holding['shares']}")
                return
                
            if not isinstance(holding["avg_price"], (int, float)) or holding["avg_price"] < 0:
                self.log_test("Holdings List API", False, f"Invalid avg_price value: {holding['avg_price']}")
                return
            
            if not holding["currency"] or len(holding["currency"]) != 3:
                self.log_test("Holdings List API", False, f"Invalid currency: {holding['currency']}")
                return
                
            if not holding["asset_type"]:
                self.log_test("Holdings List API", False, f"Missing asset_type: {holding['asset_type']}")
                return
            
            self.log_test("Holdings List API", True, f"Found {len(holdings)} holdings with all required fields", holding)
            
        except Exception as e:
            self.log_test("Holdings List API", False, f"Exception: {e}")
    
    def test_3_holdings_with_portfolio_filter(self):
        """Test 3: Holdings with Portfolio Filter - GET /api/holdings?portfolio_id={id}"""
        if not self.portfolio_id:
            self.log_test("Holdings Portfolio Filter", False, "No portfolio ID from previous test")
            return
            
        try:
            response = self.make_request("GET", f"/holdings?portfolio_id={self.portfolio_id}")
            
            if response.status_code != 200:
                self.log_test("Holdings Portfolio Filter", False, f"Status {response.status_code}: {response.text}")
                return
            
            filtered_holdings = response.json()
            
            if not isinstance(filtered_holdings, list):
                self.log_test("Holdings Portfolio Filter", False, f"Expected list, got {type(filtered_holdings)}")
                return
            
            # Verify all holdings belong to the specified portfolio
            for holding in filtered_holdings:
                if holding["portfolio_id"] != self.portfolio_id:
                    self.log_test("Holdings Portfolio Filter", False, f"Found holding with wrong portfolio_id: {holding['portfolio_id']}")
                    return
            
            self.log_test("Holdings Portfolio Filter", True, f"Filter working - found {len(filtered_holdings)} holdings for portfolio {self.portfolio_id}")
            
        except Exception as e:
            self.log_test("Holdings Portfolio Filter", False, f"Exception: {e}")
    
    def test_4_stock_quotes_api(self):
        """Test 4: Stock Quotes API - GET /api/stocks/quotes?symbols=AAPL,MSFT"""
        try:
            symbols = "AAPL,MSFT"
            response = self.make_request("GET", f"/stocks/quotes?symbols={symbols}")
            
            if response.status_code != 200:
                self.log_test("Stock Quotes API", False, f"Status {response.status_code}: {response.text}")
                return
            
            quotes = response.json()
            
            if not isinstance(quotes, dict):
                self.log_test("Stock Quotes API", False, f"Expected dict, got {type(quotes)}")
                return
            
            expected_symbols = ["AAPL", "MSFT"]
            for symbol in expected_symbols:
                if symbol not in quotes:
                    self.log_test("Stock Quotes API", False, f"Missing quote for {symbol}")
                    return
                
                quote = quotes[symbol]
                required_fields = ["price", "quote_currency"]
                missing_fields = [field for field in required_fields if field not in quote]
                
                if missing_fields:
                    self.log_test("Stock Quotes API", False, f"Missing fields in {symbol} quote: {missing_fields}")
                    return
                
                if not isinstance(quote["price"], (int, float)) or quote["price"] <= 0:
                    self.log_test("Stock Quotes API", False, f"Invalid price for {symbol}: {quote['price']}")
                    return
                
                if not quote["quote_currency"]:
                    self.log_test("Stock Quotes API", False, f"Missing quote_currency for {symbol}")
                    return
            
            self.log_test("Stock Quotes API", True, f"Successfully retrieved quotes with quote_currency", quotes)
            
        except Exception as e:
            self.log_test("Stock Quotes API", False, f"Exception: {e}")
    
    def test_5_fx_rates_api(self):
        """Test 5: FX Rates API - GET /api/fx-rates"""
        try:
            response = self.make_request("GET", "/fx-rates")
            
            if response.status_code != 200:
                self.log_test("FX Rates API", False, f"Status {response.status_code}: {response.text}")
                return
            
            rates = response.json()
            
            if not isinstance(rates, dict):
                self.log_test("FX Rates API", False, f"Expected dict, got {type(rates)}")
                return
            
            expected_currencies = ["USD", "CAD", "INR"]
            for currency in expected_currencies:
                if currency not in rates:
                    self.log_test("FX Rates API", False, f"Missing rate for {currency}")
                    return
                
                rate = rates[currency]
                if not isinstance(rate, (int, float)) or rate <= 0:
                    self.log_test("FX Rates API", False, f"Invalid rate for {currency}: {rate}")
                    return
            
            self.log_test("FX Rates API", True, f"Successfully retrieved rates for {list(rates.keys())}", rates)
            
        except Exception as e:
            self.log_test("FX Rates API", False, f"Exception: {e}")
    
    def test_6_create_holding_with_auto_detection(self):
        """Test 6: Create Holding with Auto-Detection - POST /api/holdings"""
        if not self.portfolio_id:
            self.log_test("Create Holding Auto-Detection", False, "No portfolio ID from previous test")
            return
            
        try:
            # Create holding with minimal data - should auto-detect currency and asset_type
            holding_data = {
                "symbol": "NVDA",
                "shares": 10,
                "avg_price": 500,
                "portfolio_id": self.portfolio_id
            }
            
            response = self.make_request("POST", "/holdings", json=holding_data)
            
            if response.status_code != 200:
                self.log_test("Create Holding Auto-Detection", False, f"Status {response.status_code}: {response.text}")
                return
            
            created_holding = response.json()
            
            # Store holding ID for cleanup
            self.created_holding_id = created_holding["id"]
            
            # Verify auto-detection worked
            if not created_holding.get("currency"):
                self.log_test("Create Holding Auto-Detection", False, "Currency was not auto-detected")
                return
                
            if not created_holding.get("asset_type"):
                self.log_test("Create Holding Auto-Detection", False, "Asset type was not auto-detected")
                return
            
            # Verify the data matches what we sent
            if created_holding["symbol"] != "NVDA":
                self.log_test("Create Holding Auto-Detection", False, f"Symbol mismatch: expected NVDA, got {created_holding['symbol']}")
                return
                
            if created_holding["shares"] != 10:
                self.log_test("Create Holding Auto-Detection", False, f"Shares mismatch: expected 10, got {created_holding['shares']}")
                return
                
            if created_holding["avg_price"] != 500:
                self.log_test("Create Holding Auto-Detection", False, f"Price mismatch: expected 500, got {created_holding['avg_price']}")
                return
            
            self.log_test("Create Holding Auto-Detection", True, 
                         f"Auto-detected currency: {created_holding['currency']}, asset_type: {created_holding['asset_type']}", 
                         created_holding)
            
        except Exception as e:
            self.log_test("Create Holding Auto-Detection", False, f"Exception: {e}")
    
    def test_7_ticker_lookup_api(self):
        """Test 7: Ticker Lookup API"""
        
        # Test 7a: Canadian stock - SHOP.TO
        try:
            response = self.make_request("GET", "/ticker/lookup/SHOP.TO")
            
            if response.status_code != 200:
                self.log_test("Ticker Lookup Canadian", False, f"Status {response.status_code}: {response.text}")
            else:
                ticker_info = response.json()
                
                expected_exchange = "TSX"
                expected_currency = "CAD"
                
                if ticker_info.get("exchange") != expected_exchange:
                    self.log_test("Ticker Lookup Canadian", False, f"Expected exchange TSX, got {ticker_info.get('exchange')}")
                elif ticker_info.get("currency") != expected_currency:
                    self.log_test("Ticker Lookup Canadian", False, f"Expected currency CAD, got {ticker_info.get('currency')}")
                else:
                    self.log_test("Ticker Lookup Canadian", True, f"SHOP.TO correctly identified: exchange={ticker_info['exchange']}, currency={ticker_info['currency']}")
                    
        except Exception as e:
            self.log_test("Ticker Lookup Canadian", False, f"Exception: {e}")
        
        # Test 7b: Mutual fund - VFIAX
        try:
            response = self.make_request("GET", "/ticker/lookup/VFIAX")
            
            if response.status_code != 200:
                self.log_test("Ticker Lookup Mutual Fund", False, f"Status {response.status_code}: {response.text}")
            else:
                ticker_info = response.json()
                
                expected_asset_type = "Mutual Fund"
                
                if ticker_info.get("asset_type") != expected_asset_type:
                    self.log_test("Ticker Lookup Mutual Fund", False, f"Expected asset_type 'Mutual Fund', got {ticker_info.get('asset_type')}")
                else:
                    self.log_test("Ticker Lookup Mutual Fund", True, f"VFIAX correctly identified as: {ticker_info['asset_type']}")
                    
        except Exception as e:
            self.log_test("Ticker Lookup Mutual Fund", False, f"Exception: {e}")
    
    def cleanup_created_holding(self):
        """Clean up the holding created in test 6"""
        if self.created_holding_id:
            try:
                response = self.make_request("DELETE", f"/holdings/{self.created_holding_id}")
                if response.status_code == 200:
                    print(f"✅ Cleaned up test holding {self.created_holding_id}")
                else:
                    print(f"⚠️ Could not clean up holding {self.created_holding_id}: Status {response.status_code}")
            except Exception as e:
                print(f"⚠️ Error cleaning up holding: {e}")
    
    def run_all_tests(self):
        """Run all test cases"""
        print("=" * 60)
        print("HOLDINGS HUB BACKEND API TEST SUITE")
        print("=" * 60)
        
        # Run tests in order
        self.test_1_portfolio_list_api()
        self.test_2_holdings_list_api()
        self.test_3_holdings_with_portfolio_filter()
        self.test_4_stock_quotes_api()
        self.test_5_fx_rates_api()
        self.test_6_create_holding_with_auto_detection()
        self.test_7_ticker_lookup_api()
        
        # Cleanup
        self.cleanup_created_holding()
        
        # Summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED!")
            return True
        else:
            print("❌ SOME TESTS FAILED")
            
            # Show failed tests
            failed_tests = [result for result in self.test_results if not result["success"]]
            for failed in failed_tests:
                print(f"  ❌ {failed['test']}: {failed['message']}")
            
            return False

def main():
    tester = HoldingsHubAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())