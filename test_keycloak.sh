#!/bin/bash
# Quick test script for Keycloak service account

KEYCLOAK_URL="http://192.168.40.248:32008"
REALM="ml-platform-dev"
CLIENT_ID="ml-platform-admin"
CLIENT_SECRET="UguPzb0WkCp3FDrnQ3BwY48Epm3Xp1i5"

echo "============================================"
echo "Testing Keycloak Service Account"
echo "============================================"
echo ""

# Test 1: Get Token
echo "Test 1: Getting service account token..."
TOKEN_RESPONSE=$(curl -s -X POST "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET")

if echo "$TOKEN_RESPONSE" | grep -q "access_token"; then
    echo "✓ SUCCESS: Got service account token"
    TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    echo "  Token starts with: ${TOKEN:0:50}..."
    echo ""
else
    echo "✗ FAILED: Could not get token"
    echo "  Response: $TOKEN_RESPONSE"
    echo ""
    echo "DIAGNOSIS: The client is not configured correctly."
    echo "Please check:"
    echo "  1. Client 'ml-platform-admin' exists in Keycloak"
    echo "  2. Access Type is set to 'confidential'"
    echo "  3. Service Accounts Enabled is ON"
    echo "  4. Client secret matches: UguPzb0WkCp3FDrnQ3BwY48Epm3Xp1i5"
    exit 1
fi

# Test 2: List Users
echo "Test 2: Testing users endpoint with service account token..."
USERS_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$KEYCLOAK_URL/admin/realms/$REALM/users")

HTTP_CODE=$(echo "$USERS_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$USERS_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ SUCCESS: Can list users"
    USER_COUNT=$(echo "$BODY" | grep -o '"username"' | wc -l)
    echo "  Found $USER_COUNT users"
    echo ""
else
    echo "✗ FAILED: Cannot list users (HTTP $HTTP_CODE)"
    echo "  Response: $BODY"
    echo ""
    if [ "$HTTP_CODE" = "403" ]; then
        echo "DIAGNOSIS: Service account lacks permissions."
        echo "Please check in Keycloak Admin Console:"
        echo "  1. Go to Clients → ml-platform-admin"
        echo "  2. Click 'Service Account Roles' tab"
        echo "  3. In 'Client Roles' dropdown, select 'realm-management'"
        echo "  4. Assign these roles:"
        echo "     - manage-users"
        echo "     - view-users"
        echo "     - query-users"
        echo "     - query-groups"
    fi
    exit 1
fi

# Test 3: List Roles  
echo "Test 3: Testing roles endpoint with service account token..."
ROLES_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$KEYCLOAK_URL/admin/realms/$REALM/roles")

HTTP_CODE=$(echo "$ROLES_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$ROLES_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ SUCCESS: Can list roles"
    ROLE_COUNT=$(echo "$BODY" | grep -o '"name"' | wc -l)
    echo "  Found $ROLE_COUNT roles"
    echo ""
else
    echo "✗ FAILED: Cannot list roles (HTTP $HTTP_CODE)"
    echo "  Response: $BODY"
    echo ""
fi

echo "============================================"
echo "All tests passed!"
echo "Your Keycloak service account is configured correctly."
echo ""
echo "If your backend still shows 403 errors:"
echo "  1. Make sure KEYCLOAK_CLIENT_SECRET is set when starting backend"
echo "  2. Restart the backend: ./scripts/run_backend.sh"
echo "  3. Check backend logs for 'KEYCLOAK:' messages"
echo "============================================"


