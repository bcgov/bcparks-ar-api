#!/bin/zsh
# Quick test script for bcparks-ar-api endpoints

API_URL="http://127.0.0.1:3000"

echo "🧪 Testing bcparks-ar-api endpoints"
echo

# Test without auth (should return 401)
echo "Test 1: GET /activity (no auth)"
curl -s -i "$API_URL/activity" | head -n 12
echo
echo

# Test a public endpoint if available
echo "Test 2: GET / (root)"
curl -s -i "$API_URL/" | head -n 12
echo
echo

# Show expected endpoints from template
echo "📚 Expected available endpoints:"
echo "  GET    /activity"
echo "  POST   /activity"
echo "  GET    /park"
echo "  POST   /park"
echo "  GET    /region"
echo "  GET    /subarea"
echo "  POST   /subarea"
echo "  GET    /variance"
echo "  POST   /variance"
echo "  (Most require authentication token)"
echo
echo "💡 Tip: Use --header 'Authorization: Bearer <token>' to test authenticated endpoints"

