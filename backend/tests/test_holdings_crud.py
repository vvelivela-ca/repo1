"""Test holdings CRUD endpoints"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

class TestHoldingsCRUD:
    """Holdings CRUD operations"""
    
    def test_get_all_holdings(self, api_client):
        """Test GET /api/holdings returns all seeded holdings"""
        response = api_client.get(f"{BASE_URL}/api/holdings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 7, f"Expected at least 7 holdings, got {len(data)}"
        
        # Verify seeded symbols exist
        symbols = [h['symbol'] for h in data]
        expected_symbols = ['AAPL', 'QQQ', 'TSLA', 'MSFT', 'GOOGL', 'CRWD', 'SOXQ']
        for sym in expected_symbols:
            assert sym in symbols, f"Expected symbol {sym} not found in holdings"
        
        # Verify structure of first holding
        first = data[0]
        assert 'id' in first, "Missing 'id' field"
        assert 'symbol' in first, "Missing 'symbol' field"
        assert 'shares' in first, "Missing 'shares' field"
        assert 'avg_price' in first, "Missing 'avg_price' field"
        assert 'created_at' in first, "Missing 'created_at' field"
        assert 'updated_at' in first, "Missing 'updated_at' field"
        
        # Verify data types
        assert isinstance(first['shares'], (int, float)), "shares should be numeric"
        assert isinstance(first['avg_price'], (int, float)), "avg_price should be numeric"
        assert first['shares'] > 0, "shares should be positive"
        assert first['avg_price'] > 0, "avg_price should be positive"
        
        print(f"✓ GET /api/holdings returned {len(data)} holdings")
    
    def test_create_holding_and_verify(self, api_client):
        """Test POST /api/holdings creates a new holding"""
        payload = {
            "symbol": "TEST_NVDA",
            "shares": 50,
            "avg_price": 500.50
        }
        
        # Create holding
        response = api_client.post(f"{BASE_URL}/api/holdings", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        created = response.json()
        assert created['symbol'] == "TEST_NVDA", "Symbol should be TEST_NVDA"
        assert created['shares'] == 50, "Shares should be 50"
        assert created['avg_price'] == 500.50, "Avg price should be 500.50"
        assert 'id' in created, "Response should include id"
        assert 'created_at' in created, "Response should include created_at"
        assert 'updated_at' in created, "Response should include updated_at"
        
        holding_id = created['id']
        
        # GET to verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/holdings")
        assert get_response.status_code == 200
        
        all_holdings = get_response.json()
        created_holding = next((h for h in all_holdings if h['id'] == holding_id), None)
        assert created_holding is not None, "Created holding not found in GET response"
        assert created_holding['symbol'] == "TEST_NVDA"
        assert created_holding['shares'] == 50
        assert created_holding['avg_price'] == 500.50
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/holdings/{holding_id}")
        print(f"✓ POST /api/holdings created holding with id {holding_id} and verified persistence")
    
    def test_create_holding_lowercase_symbol(self, api_client):
        """Test POST with lowercase symbol converts to uppercase"""
        payload = {
            "symbol": "test_amd",
            "shares": 25,
            "avg_price": 120.00
        }
        
        response = api_client.post(f"{BASE_URL}/api/holdings", json=payload)
        assert response.status_code == 200
        
        created = response.json()
        assert created['symbol'] == "TEST_AMD", "Symbol should be uppercase"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/holdings/{created['id']}")
        print("✓ POST /api/holdings converts symbol to uppercase")
    
    def test_update_holding_and_verify(self, api_client):
        """Test PUT /api/holdings/{id} updates existing holding"""
        # Create test holding
        create_payload = {
            "symbol": "TEST_INTC",
            "shares": 100,
            "avg_price": 45.00
        }
        create_response = api_client.post(f"{BASE_URL}/api/holdings", json=create_payload)
        assert create_response.status_code == 200
        created = create_response.json()
        holding_id = created['id']
        
        # Update holding
        update_payload = {
            "shares": 150,
            "avg_price": 48.50
        }
        update_response = api_client.put(f"{BASE_URL}/api/holdings/{holding_id}", json=update_payload)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        updated = update_response.json()
        assert updated['shares'] == 150, "Shares should be updated to 150"
        assert updated['avg_price'] == 48.50, "Avg price should be updated to 48.50"
        assert updated['symbol'] == "TEST_INTC", "Symbol should remain unchanged"
        assert updated['updated_at'] != created['updated_at'], "updated_at should change"
        
        # GET to verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/holdings")
        all_holdings = get_response.json()
        verified = next((h for h in all_holdings if h['id'] == holding_id), None)
        assert verified is not None
        assert verified['shares'] == 150
        assert verified['avg_price'] == 48.50
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/holdings/{holding_id}")
        print(f"✓ PUT /api/holdings/{holding_id} updated and verified persistence")
    
    def test_update_nonexistent_holding(self, api_client):
        """Test PUT with invalid holding ID returns 404"""
        update_payload = {"shares": 100}
        response = api_client.put(f"{BASE_URL}/api/holdings/invalid-id-12345", json=update_payload)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert 'detail' in data, "Response should include detail field"
        print("✓ PUT /api/holdings/{invalid-id} returns 404")
    
    def test_delete_holding_and_verify(self, api_client):
        """Test DELETE /api/holdings/{id} removes holding"""
        # Create test holding
        create_payload = {
            "symbol": "TEST_AMD",
            "shares": 75,
            "avg_price": 110.00
        }
        create_response = api_client.post(f"{BASE_URL}/api/holdings", json=create_payload)
        assert create_response.status_code == 200
        created = create_response.json()
        holding_id = created['id']
        
        # Delete holding
        delete_response = api_client.delete(f"{BASE_URL}/api/holdings/{holding_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        data = delete_response.json()
        assert 'message' in data, "Response should include message"
        
        # GET to verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/holdings")
        all_holdings = get_response.json()
        deleted_holding = next((h for h in all_holdings if h['id'] == holding_id), None)
        assert deleted_holding is None, "Deleted holding should not exist"
        
        print(f"✓ DELETE /api/holdings/{holding_id} removed holding and verified")
    
    def test_delete_nonexistent_holding(self, api_client):
        """Test DELETE with invalid holding ID returns 404"""
        response = api_client.delete(f"{BASE_URL}/api/holdings/invalid-id-99999")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert 'detail' in data, "Response should include detail field"
        print("✓ DELETE /api/holdings/{invalid-id} returns 404")
