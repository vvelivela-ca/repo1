"""Test stock quotes and history endpoints"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

class TestStocksAPI:
    """Stock quotes and history endpoints"""
    
    def test_get_quotes_single_symbol(self, api_client):
        """Test GET /api/stocks/quotes with single symbol"""
        response = api_client.get(f"{BASE_URL}/api/stocks/quotes?symbols=AAPL")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, dict), "Response should be a dict"
        assert 'AAPL' in data, "Response should contain AAPL"
        
        aapl_quote = data['AAPL']
        assert 'price' in aapl_quote, "Quote should have price"
        assert 'previous_close' in aapl_quote, "Quote should have previous_close"
        assert 'day_high' in aapl_quote, "Quote should have day_high"
        assert 'day_low' in aapl_quote, "Quote should have day_low"
        assert 'market_cap' in aapl_quote, "Quote should have market_cap"
        
        # Verify numeric types
        assert isinstance(aapl_quote['price'], (int, float)), "price should be numeric"
        assert isinstance(aapl_quote['previous_close'], (int, float)), "previous_close should be numeric"
        
        print(f"✓ GET /api/stocks/quotes?symbols=AAPL returned quote: ${aapl_quote['price']}")
    
    def test_get_quotes_multiple_symbols(self, api_client):
        """Test GET /api/stocks/quotes with multiple symbols"""
        symbols = "AAPL,TSLA"
        response = api_client.get(f"{BASE_URL}/api/stocks/quotes?symbols={symbols}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'AAPL' in data, "Response should contain AAPL"
        assert 'TSLA' in data, "Response should contain TSLA"
        
        # Verify both quotes have valid structure
        for symbol in ['AAPL', 'TSLA']:
            quote = data[symbol]
            assert 'price' in quote
            assert 'previous_close' in quote
            assert isinstance(quote['price'], (int, float))
        
        print(f"✓ GET /api/stocks/quotes returned {len(data)} quotes")
    
    def test_get_quotes_all_portfolio_symbols(self, api_client):
        """Test GET /api/stocks/quotes with all 7 portfolio symbols"""
        symbols = "AAPL,QQQ,TSLA,MSFT,GOOGL,CRWD,SOXQ"
        response = api_client.get(f"{BASE_URL}/api/stocks/quotes?symbols={symbols}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        expected_symbols = ['AAPL', 'QQQ', 'TSLA', 'MSFT', 'GOOGL', 'CRWD', 'SOXQ']
        
        for symbol in expected_symbols:
            assert symbol in data, f"Response should contain {symbol}"
            quote = data[symbol]
            assert 'price' in quote
            assert 'previous_close' in quote
        
        print(f"✓ GET /api/stocks/quotes returned all 7 portfolio symbols")
    
    def test_get_quotes_empty_symbols(self, api_client):
        """Test GET /api/stocks/quotes with empty symbols"""
        response = api_client.get(f"{BASE_URL}/api/stocks/quotes?symbols=")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, dict), "Response should be a dict"
        assert len(data) == 0, "Response should be empty for no symbols"
        
        print("✓ GET /api/stocks/quotes with empty symbols returns empty dict")
    
    def test_get_history_default_period(self, api_client):
        """Test GET /api/stocks/history/{symbol} with default period (1mo)"""
        response = api_client.get(f"{BASE_URL}/api/stocks/history/AAPL")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'symbol' in data, "Response should have symbol"
        assert 'period' in data, "Response should have period"
        assert 'data' in data, "Response should have data"
        assert data['symbol'] == 'AAPL', "Symbol should be AAPL"
        assert data['period'] == '1mo', "Default period should be 1mo"
        
        # Verify data points
        assert isinstance(data['data'], list), "data should be a list"
        if len(data['data']) > 0:
            point = data['data'][0]
            assert 'date' in point, "Data point should have date"
            assert 'close' in point, "Data point should have close"
            assert 'high' in point, "Data point should have high"
            assert 'low' in point, "Data point should have low"
            assert 'open' in point, "Data point should have open"
            assert 'volume' in point, "Data point should have volume"
            
            # Verify numeric types
            assert isinstance(point['close'], (int, float))
            assert isinstance(point['volume'], int)
        
        print(f"✓ GET /api/stocks/history/AAPL returned {len(data['data'])} data points")
    
    def test_get_history_1w_period(self, api_client):
        """Test GET /api/stocks/history with 5d period"""
        response = api_client.get(f"{BASE_URL}/api/stocks/history/TSLA?period=5d")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data['symbol'] == 'TSLA'
        assert data['period'] == '5d'
        assert isinstance(data['data'], list)
        
        print(f"✓ GET /api/stocks/history/TSLA?period=5d returned {len(data['data'])} data points")
    
    def test_get_history_1y_period(self, api_client):
        """Test GET /api/stocks/history with 1y period"""
        response = api_client.get(f"{BASE_URL}/api/stocks/history/MSFT?period=1y")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data['symbol'] == 'MSFT'
        assert data['period'] == '1y'
        assert isinstance(data['data'], list)
        
        print(f"✓ GET /api/stocks/history/MSFT?period=1y returned {len(data['data'])} data points")
    
    def test_get_history_invalid_period(self, api_client):
        """Test GET /api/stocks/history with invalid period returns 400"""
        response = api_client.get(f"{BASE_URL}/api/stocks/history/AAPL?period=invalid")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert 'detail' in data, "Response should include detail field"
        assert 'Invalid period' in data['detail'], "Error message should mention invalid period"
        
        print("✓ GET /api/stocks/history with invalid period returns 400")
