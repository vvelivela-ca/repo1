"""Test CSV import endpoint"""
import pytest
import requests
import os
import io

# Try both env var names
BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL') or 
            os.environ.get('EXPO_BACKEND_URL') or '').rstrip('/')

class TestCSVImport:
    """CSV import functionality"""
    
    def test_csv_import_with_standard_columns(self, api_client):
        """Test POST /api/holdings/import-csv with standard Symbol,Shares,Avg Price columns"""
        # Get a portfolio to import into
        portfolios_response = api_client.get(f"{BASE_URL}/api/portfolios")
        portfolios = portfolios_response.json()
        test_portfolio_id = portfolios[0]['id']
        
        # Create CSV content
        csv_content = """Symbol,Shares,Avg Price
TEST_AMZN,15,180.50
TEST_NFLX,30,650.75
TEST_DIS,50,90.25"""
        
        # Prepare multipart form data
        files = {'file': ('test_import.csv', io.StringIO(csv_content), 'text/csv')}
        data = {'portfolio_id': test_portfolio_id}
        
        # Import CSV
        response = requests.post(f"{BASE_URL}/api/holdings/import-csv", files=files, data=data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert 'imported_count' in result, "Response should include imported_count"
        assert 'holdings' in result, "Response should include holdings"
        assert result['imported_count'] == 3, f"Expected 3 holdings, got {result['imported_count']}"
        
        # Verify holdings structure
        imported = result['holdings']
        assert len(imported) == 3, f"Expected 3 holdings in array, got {len(imported)}"
        
        symbols = [h['symbol'] for h in imported]
        assert 'TEST_AMZN' in symbols
        assert 'TEST_NFLX' in symbols
        assert 'TEST_DIS' in symbols
        
        # Verify first holding details
        amzn = next(h for h in imported if h['symbol'] == 'TEST_AMZN')
        assert amzn['shares'] == 15
        assert amzn['avg_price'] == 180.50
        assert amzn['portfolio_id'] == test_portfolio_id
        
        # Cleanup
        for holding in imported:
            api_client.delete(f"{BASE_URL}/api/holdings/{holding['id']}")
        
        print(f"✓ POST /api/holdings/import-csv imported {result['imported_count']} holdings")
    
    def test_csv_import_with_alternative_columns(self, api_client):
        """Test CSV import with alternative column names (Ticker, Quantity, Cost)"""
        portfolios_response = api_client.get(f"{BASE_URL}/api/portfolios")
        portfolios = portfolios_response.json()
        test_portfolio_id = portfolios[0]['id']
        
        # CSV with alternative column names
        csv_content = """Ticker,Quantity,Cost
TEST_BA,25,175.00
TEST_GE,100,15.50"""
        
        files = {'file': ('test_import2.csv', io.StringIO(csv_content), 'text/csv')}
        data = {'portfolio_id': test_portfolio_id}
        
        response = requests.post(f"{BASE_URL}/api/holdings/import-csv", files=files, data=data)
        assert response.status_code == 200
        
        result = response.json()
        assert result['imported_count'] == 2
        
        # Cleanup
        for holding in result['holdings']:
            api_client.delete(f"{BASE_URL}/api/holdings/{holding['id']}")
        
        print("✓ CSV import works with alternative column names")
    
    def test_csv_import_with_whitespace_and_commas(self, api_client):
        """Test CSV import handles whitespace and dollar signs in numbers"""
        portfolios_response = api_client.get(f"{BASE_URL}/api/portfolios")
        portfolios = portfolios_response.json()
        test_portfolio_id = portfolios[0]['id']
        
        # CSV with whitespace and dollar signs (commas in CSV need quotes, so test dollar sign instead)
        csv_content = """Symbol, Shares , Avg Price
TEST_IBM, 1500 , $120.50
  TEST_ORCL  ,  2500  ,  85.25  """
        
        files = {'file': ('test_import3.csv', io.StringIO(csv_content), 'text/csv')}
        data = {'portfolio_id': test_portfolio_id}
        
        response = requests.post(f"{BASE_URL}/api/holdings/import-csv", files=files, data=data)
        assert response.status_code == 200
        
        result = response.json()
        assert result['imported_count'] == 2
        
        # Verify number parsing
        imported = result['holdings']
        ibm = next(h for h in imported if h['symbol'] == 'TEST_IBM')
        assert ibm['shares'] == 1500, "Should parse 1500 as 1500"
        assert ibm['avg_price'] == 120.50, "Should parse $120.50 as 120.50"
        
        # Cleanup
        for holding in imported:
            api_client.delete(f"{BASE_URL}/api/holdings/{holding['id']}")
        
        print("✓ CSV import handles whitespace and dollar formatting")
    
    def test_csv_import_invalid_portfolio(self, api_client):
        """Test CSV import with invalid portfolio_id returns 404"""
        csv_content = """Symbol,Shares,Avg Price
TEST_INVALID,10,100.00"""
        
        files = {'file': ('test_invalid.csv', io.StringIO(csv_content), 'text/csv')}
        data = {'portfolio_id': 'invalid-portfolio-id-12345'}
        
        response = requests.post(f"{BASE_URL}/api/holdings/import-csv", files=files, data=data)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        result = response.json()
        assert 'detail' in result
        assert 'Portfolio not found' in result['detail']
        
        print("✓ CSV import with invalid portfolio returns 404")
    
    def test_csv_import_skips_invalid_rows(self, api_client):
        """Test CSV import skips rows with missing or invalid data"""
        portfolios_response = api_client.get(f"{BASE_URL}/api/portfolios")
        portfolios = portfolios_response.json()
        test_portfolio_id = portfolios[0]['id']
        
        # CSV with some invalid rows
        csv_content = """Symbol,Shares,Avg Price
TEST_VALID1,10,100.00
,20,50.00
TEST_MISSING_SHARES,,75.00
TEST_VALID2,30,150.00
INVALID_SHARES,abc,100.00"""
        
        files = {'file': ('test_skip.csv', io.StringIO(csv_content), 'text/csv')}
        data = {'portfolio_id': test_portfolio_id}
        
        response = requests.post(f"{BASE_URL}/api/holdings/import-csv", files=files, data=data)
        assert response.status_code == 200
        
        result = response.json()
        assert result['imported_count'] == 2, "Should import only 2 valid rows"
        
        symbols = [h['symbol'] for h in result['holdings']]
        assert 'TEST_VALID1' in symbols
        assert 'TEST_VALID2' in symbols
        
        # Cleanup
        for holding in result['holdings']:
            api_client.delete(f"{BASE_URL}/api/holdings/{holding['id']}")
        
        print("✓ CSV import skips invalid rows and imports valid ones")
