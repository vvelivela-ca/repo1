"""Test portfolio CRUD endpoints with multi-portfolio support"""
import pytest
import requests
import os

# Try both env var names (EXPO_PUBLIC_BACKEND_URL for frontend, check both)
BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL') or 
            os.environ.get('EXPO_BACKEND_URL') or '').rstrip('/')

class TestPortfoliosCRUD:
    """Portfolio CRUD operations"""
    
    def test_get_portfolios_returns_default(self, api_client):
        """Test GET /api/portfolios returns at least 'My Portfolio'"""
        response = api_client.get(f"{BASE_URL}/api/portfolios")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 1, f"Expected at least 1 portfolio, got {len(data)}"
        
        # Verify default portfolio exists
        names = [p['name'] for p in data]
        assert 'My Portfolio' in names, "Default 'My Portfolio' should exist"
        
        # Verify structure of first portfolio
        first = data[0]
        assert 'id' in first, "Missing 'id' field"
        assert 'name' in first, "Missing 'name' field"
        assert 'created_at' in first, "Missing 'created_at' field"
        
        # Verify data types
        assert isinstance(first['id'], str), "id should be a string"
        assert isinstance(first['name'], str), "name should be a string"
        assert len(first['id']) > 0, "id should not be empty"
        
        print(f"✓ GET /api/portfolios returned {len(data)} portfolios")
    
    def test_create_portfolio_and_verify(self, api_client):
        """Test POST /api/portfolios creates a new portfolio"""
        payload = {"name": "TEST_Wealthsimple"}
        
        # Create portfolio
        response = api_client.post(f"{BASE_URL}/api/portfolios", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        created = response.json()
        assert created['name'] == "TEST_Wealthsimple", "Name should match"
        assert 'id' in created, "Response should include id"
        assert 'created_at' in created, "Response should include created_at"
        
        portfolio_id = created['id']
        
        # GET to verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/portfolios")
        assert get_response.status_code == 200
        
        all_portfolios = get_response.json()
        created_portfolio = next((p for p in all_portfolios if p['id'] == portfolio_id), None)
        assert created_portfolio is not None, "Created portfolio not found in GET response"
        assert created_portfolio['name'] == "TEST_Wealthsimple"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/portfolios/{portfolio_id}")
        print(f"✓ POST /api/portfolios created portfolio with id {portfolio_id} and verified persistence")
    
    def test_create_portfolio_whitespace_trimmed(self, api_client):
        """Test POST /api/portfolios trims whitespace from name"""
        payload = {"name": "  TEST_Fidelity  "}
        
        response = api_client.post(f"{BASE_URL}/api/portfolios", json=payload)
        assert response.status_code == 200
        
        created = response.json()
        assert created['name'] == "TEST_Fidelity", "Name should be trimmed"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/portfolios/{created['id']}")
        print("✓ POST /api/portfolios trims whitespace from name")
    
    def test_rename_portfolio_and_verify(self, api_client):
        """Test PUT /api/portfolios/{id} renames a portfolio"""
        # Create test portfolio
        create_payload = {"name": "TEST_OldName"}
        create_response = api_client.post(f"{BASE_URL}/api/portfolios", json=create_payload)
        assert create_response.status_code == 200
        created = create_response.json()
        portfolio_id = created['id']
        
        # Rename portfolio
        update_payload = {"name": "TEST_NewName"}
        update_response = api_client.put(f"{BASE_URL}/api/portfolios/{portfolio_id}", json=update_payload)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        updated = update_response.json()
        assert updated['name'] == "TEST_NewName", "Name should be updated"
        assert updated['id'] == portfolio_id, "ID should remain unchanged"
        
        # GET to verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/portfolios")
        all_portfolios = get_response.json()
        verified = next((p for p in all_portfolios if p['id'] == portfolio_id), None)
        assert verified is not None
        assert verified['name'] == "TEST_NewName"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/portfolios/{portfolio_id}")
        print(f"✓ PUT /api/portfolios/{portfolio_id} renamed and verified persistence")
    
    def test_rename_nonexistent_portfolio(self, api_client):
        """Test PUT with invalid portfolio ID returns 404"""
        update_payload = {"name": "NonExistent"}
        response = api_client.put(f"{BASE_URL}/api/portfolios/invalid-id-12345", json=update_payload)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert 'detail' in data, "Response should include detail field"
        print("✓ PUT /api/portfolios/{invalid-id} returns 404")
    
    def test_delete_portfolio_and_holdings(self, api_client):
        """Test DELETE /api/portfolios/{id} deletes portfolio and its holdings"""
        # Create test portfolio
        create_response = api_client.post(f"{BASE_URL}/api/portfolios", json={"name": "TEST_ToDelete"})
        assert create_response.status_code == 200
        portfolio = create_response.json()
        portfolio_id = portfolio['id']
        
        # Add a holding to this portfolio
        holding_payload = {
            "symbol": "TEST_NFLX",
            "shares": 10,
            "avg_price": 450.00,
            "portfolio_id": portfolio_id
        }
        holding_response = api_client.post(f"{BASE_URL}/api/holdings", json=holding_payload)
        assert holding_response.status_code == 200
        holding = holding_response.json()
        holding_id = holding['id']
        
        # Delete portfolio
        delete_response = api_client.delete(f"{BASE_URL}/api/portfolios/{portfolio_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        data = delete_response.json()
        assert 'message' in data, "Response should include message"
        
        # Verify portfolio deleted
        get_portfolios = api_client.get(f"{BASE_URL}/api/portfolios")
        all_portfolios = get_portfolios.json()
        deleted_portfolio = next((p for p in all_portfolios if p['id'] == portfolio_id), None)
        assert deleted_portfolio is None, "Deleted portfolio should not exist"
        
        # Verify holding deleted
        get_holdings = api_client.get(f"{BASE_URL}/api/holdings")
        all_holdings = get_holdings.json()
        deleted_holding = next((h for h in all_holdings if h['id'] == holding_id), None)
        assert deleted_holding is None, "Holdings should be deleted with portfolio"
        
        print(f"✓ DELETE /api/portfolios/{portfolio_id} removed portfolio and its holdings")
    
    def test_delete_last_portfolio_returns_400(self, api_client):
        """Test DELETE last portfolio returns 400 error"""
        # Get current portfolios
        get_response = api_client.get(f"{BASE_URL}/api/portfolios")
        all_portfolios = get_response.json()
        
        # Delete all except one to ensure we only have 1 portfolio
        portfolios_to_keep = all_portfolios[:1]  # Keep first one
        portfolios_to_delete = all_portfolios[1:]  # Delete the rest
        
        for portfolio in portfolios_to_delete:
            api_client.delete(f"{BASE_URL}/api/portfolios/{portfolio['id']}")
        
        # Verify we only have 1 portfolio now
        get_response2 = api_client.get(f"{BASE_URL}/api/portfolios")
        remaining_portfolios = get_response2.json()
        assert len(remaining_portfolios) == 1, f"Should have exactly 1 portfolio, got {len(remaining_portfolios)}"
        
        # Try to delete the last one
        last_portfolio_id = remaining_portfolios[0]['id']
        delete_response = api_client.delete(f"{BASE_URL}/api/portfolios/{last_portfolio_id}")
        
        assert delete_response.status_code == 400, f"Expected 400, got {delete_response.status_code}"
        
        data = delete_response.json()
        assert 'detail' in data, "Response should include detail field"
        assert 'last portfolio' in data['detail'].lower(), "Error message should mention last portfolio"
        
        # Cleanup: re-create deleted portfolios
        for portfolio in portfolios_to_delete:
            api_client.post(f"{BASE_URL}/api/portfolios", json={"name": portfolio['name']})
        
        print("✓ DELETE last portfolio returns 400 with appropriate error message")
    
    def test_delete_nonexistent_portfolio(self, api_client):
        """Test DELETE with invalid portfolio ID returns 404 (when not last portfolio)"""
        # Ensure we have at least 2 portfolios so the 'last portfolio' check doesn't trigger
        get_response = api_client.get(f"{BASE_URL}/api/portfolios")
        portfolios = get_response.json()
        
        # Create a temporary portfolio if we only have 1
        temp_portfolio = None
        if len(portfolios) < 2:
            create_response = api_client.post(f"{BASE_URL}/api/portfolios", json={"name": "TEST_TempForDelete"})
            temp_portfolio = create_response.json()
        
        # Now try to delete non-existent portfolio
        response = api_client.delete(f"{BASE_URL}/api/portfolios/invalid-id-99999")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert 'detail' in data, "Response should include detail field"
        
        # Cleanup
        if temp_portfolio:
            api_client.delete(f"{BASE_URL}/api/portfolios/{temp_portfolio['id']}")
        
        print("✓ DELETE /api/portfolios/{invalid-id} returns 404")


class TestHoldingsWithPortfolios:
    """Test holdings endpoints with portfolio_id support"""
    
    def test_get_holdings_includes_portfolio_id(self, api_client):
        """Test GET /api/holdings returns holdings with portfolio_id field"""
        response = api_client.get(f"{BASE_URL}/api/holdings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert len(data) >= 7, f"Expected at least 7 holdings, got {len(data)}"
        
        # Verify every holding has portfolio_id
        for holding in data:
            assert 'portfolio_id' in holding, "Each holding should have portfolio_id field"
            assert isinstance(holding['portfolio_id'], str), "portfolio_id should be a string"
            assert len(holding['portfolio_id']) > 0, "portfolio_id should not be empty"
        
        print(f"✓ GET /api/holdings returned {len(data)} holdings with portfolio_id field")
    
    def test_get_holdings_filter_by_portfolio(self, api_client):
        """Test GET /api/holdings?portfolio_id=xxx filters by portfolio"""
        # Get a portfolio ID
        portfolios_response = api_client.get(f"{BASE_URL}/api/portfolios")
        portfolios = portfolios_response.json()
        test_portfolio_id = portfolios[0]['id']
        
        # Get all holdings
        all_response = api_client.get(f"{BASE_URL}/api/holdings")
        all_holdings = all_response.json()
        
        # Get filtered holdings
        filtered_response = api_client.get(f"{BASE_URL}/api/holdings?portfolio_id={test_portfolio_id}")
        assert filtered_response.status_code == 200
        filtered_holdings = filtered_response.json()
        
        # Verify all filtered holdings belong to the portfolio
        for holding in filtered_holdings:
            assert holding['portfolio_id'] == test_portfolio_id, f"Holding should belong to portfolio {test_portfolio_id}"
        
        # Verify we got fewer holdings than total (if there are multiple portfolios)
        print(f"✓ GET /api/holdings?portfolio_id={test_portfolio_id} returned {len(filtered_holdings)} holdings (total: {len(all_holdings)})")
    
    def test_create_holding_requires_valid_portfolio(self, api_client):
        """Test POST /api/holdings with invalid portfolio_id returns 404"""
        payload = {
            "symbol": "TEST_INVALID",
            "shares": 10,
            "avg_price": 100.00,
            "portfolio_id": "invalid-portfolio-id-12345"
        }
        
        response = api_client.post(f"{BASE_URL}/api/holdings", json=payload)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert 'detail' in data, "Response should include detail field"
        assert 'Portfolio not found' in data['detail'], "Error should mention portfolio not found"
        
        print("✓ POST /api/holdings with invalid portfolio_id returns 404")
    
    def test_create_holding_with_portfolio_id(self, api_client):
        """Test POST /api/holdings creates holding with portfolio_id"""
        # Get a portfolio ID
        portfolios_response = api_client.get(f"{BASE_URL}/api/portfolios")
        portfolios = portfolios_response.json()
        test_portfolio_id = portfolios[0]['id']
        
        payload = {
            "symbol": "TEST_META",
            "shares": 25,
            "avg_price": 350.00,
            "portfolio_id": test_portfolio_id
        }
        
        # Create holding
        response = api_client.post(f"{BASE_URL}/api/holdings", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        created = response.json()
        assert created['symbol'] == "TEST_META"
        assert created['portfolio_id'] == test_portfolio_id, "portfolio_id should match"
        
        holding_id = created['id']
        
        # Verify with filtered GET
        filtered_response = api_client.get(f"{BASE_URL}/api/holdings?portfolio_id={test_portfolio_id}")
        filtered_holdings = filtered_response.json()
        found = next((h for h in filtered_holdings if h['id'] == holding_id), None)
        assert found is not None, "Created holding should appear in filtered results"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/holdings/{holding_id}")
        print(f"✓ POST /api/holdings with portfolio_id created and verified holding")
