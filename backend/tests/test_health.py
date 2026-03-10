"""Test API health and root endpoint"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

class TestHealth:
    """Health check tests"""
    
    def test_root_endpoint(self, api_client):
        """Test GET /api/ returns welcome message"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'message' in data, "Response should have message field"
        assert 'Portfolio Tracker API' in data['message'], "Message should identify API"
        
        print(f"✓ GET /api/ returned: {data['message']}")
