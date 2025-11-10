# Keycloak Integration - Quick Start Guide

## Overview

The ML Platform Admin system now supports Keycloak for authentication and authorization. This guide will help you get started quickly.

## Quick Setup

### Step 1: Verify Keycloak Setup

Ensure your Keycloak is configured:

1. **Keycloak Service**: `keycloak.ml-platform-system.svc:8080`
2. **Realms**: 
   - Dev: `ml-platform-dev`
   - Prod: `ml-platform`
3. **Client**: `ml-platform-admin`
4. **Roles**: Create `admin` or `dashboard-admin` role
5. **Users**: Assign admin role to your users

### Step 2: Configure Backend

#### For Development:

```bash
# Option 1: Environment Variables
export USE_KEYCLOAK=true
export ENV_NAME=dev
export KEYCLOAK_URL=http://keycloak.ml-platform-system.svc:8080
export KEYCLOAK_CLIENT_ID=ml-platform-admin

# Option 2: Command-line flags
./ml-platform-admin-api \
  --use-keycloak=true \
  --keycloak-realm=ml-platform-dev \
  --keycloak-url=http://keycloak.ml-platform-system.svc:8080
```

#### For Production:

```bash
export USE_KEYCLOAK=true
export ENV_NAME=prod
export KEYCLOAK_URL=http://keycloak.ml-platform-system.svc:8080
export KEYCLOAK_REALM=ml-platform
export FRONTEND_URL=http://your-domain:32000
```

### Step 3: Update Keycloak Client Settings

In Keycloak Admin Console:

1. Go to **Clients** → **ml-platform-admin**
2. Set **Access Type**: `public`
3. **Settings** tab:
   - **Standard Flow Enabled**: `ON` (for production with HTTPS)
   - **Implicit Flow Enabled**: `ON` (for development with HTTP)
   - **Direct Access Grants Enabled**: `OFF` (optional)
4. Add **Valid Redirect URIs**:
   ```
   # For Dev
   http://192.168.40.248:5173/*
   http://192.168.40.248:5173/callback
   
   # For Prod (update with your actual domain)
   http://your-domain:32000/*
   http://your-domain:32000/callback
   ```
5. Set **Web Origins**: `*` (or specific origins like `http://192.168.40.248:5173`)
6. Save

**Note**: For non-secure contexts (HTTP without localhost), PKCE is automatically disabled. For production with HTTPS, PKCE will be enabled automatically.

### Step 4: Assign Roles to Users

1. Go to **Users** in Keycloak Admin Console
2. Select a user
3. Go to **Role Mappings** tab
4. Assign `admin` or `dashboard-admin` role

### Step 5: Start the Application

```bash
# Backend
./ml-platform-admin-api --use-keycloak=true

# Frontend (in another terminal)
cd ui/apps/dashboard
npm run dev
```

## Testing

1. Navigate to the login page: `http://192.168.40.248:5173/login`
2. Click "Login with Keycloak"
3. Enter your Keycloak credentials
4. You should be redirected to the dashboard

## Switching Between Auth Methods

The login page provides options to switch between:
- **Keycloak SSO**: Click "Login with Keycloak"
- **Traditional Login**: Click "Use Username/Password"

## Environment-Specific URLs

### Development
- **Frontend**: `http://192.168.40.248:5173`
- **Callback**: `http://192.168.40.248:5173/callback`
- **Logout**: `http://192.168.40.248:5173/sign-out`

### Production (NodePort 32000)
- **Frontend**: `http://your-domain:32000`
- **Callback**: `http://your-domain:32000/callback`
- **Logout**: `http://your-domain:32000/sign-out`

## Key Features

✅ **Dual Authentication**: Supports both Keycloak and legacy authentication
✅ **Automatic Role Detection**: Admin roles from Keycloak are automatically recognized
✅ **Token Refresh**: Automatic token refresh every minute
✅ **Seamless Migration**: Can run both systems simultaneously
✅ **Environment-Aware**: Automatically selects dev/prod configuration

## Common Commands

### Check if Keycloak is enabled:

```bash
curl http://localhost:8000/api/v1/keycloak/config
```

Expected response when enabled:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "enabled": true,
    "url": "http://keycloak.ml-platform-system.svc:8080",
    "realm": "ml-platform",
    "clientId": "ml-platform-admin"
  }
}
```

### Test Keycloak connectivity:

```bash
curl http://keycloak.ml-platform-system.svc:8080/realms/ml-platform/.well-known/openid-configuration
```

### Disable Keycloak (rollback):

```bash
# Set environment variable
export USE_KEYCLOAK=false

# Or remove the flag
./ml-platform-admin-api  # Keycloak disabled by default
```

## Troubleshooting

### Issue: "Keycloak client not initialized"

**Solution**: 
- Ensure `USE_KEYCLOAK=true` is set
- Check Keycloak service is accessible
- Verify network connectivity

### Issue: "Invalid redirect URI"

**Solution**:
- Update Keycloak client's Valid Redirect URIs
- Ensure the URL matches exactly (including protocol and port)

### Issue: "User is not admin"

**Solution**:
- Assign `admin` or `dashboard-admin` role in Keycloak
- Verify role mappings in Keycloak Admin Console

### Issue: Frontend shows traditional login instead of Keycloak

**Solution**:
- Check that backend is started with `--use-keycloak=true`
- Verify `/api/v1/keycloak/config` returns `enabled: true`
- Check browser console for errors

### Issue: "Web Crypto API is not available"

**Solution**:
- This occurs when using HTTP (not HTTPS) with non-localhost addresses
- The app automatically disables PKCE for non-secure contexts
- For development with IP addresses (like `192.168.40.248`), PKCE will be disabled automatically
- For production, use HTTPS to enable PKCE for better security
- Alternative: Access the app via `http://localhost:5173` instead of IP address

## Migration Checklist

- [ ] Keycloak server is running and accessible
- [ ] Realms created (ml-platform, ml-platform-dev)
- [ ] Client created (ml-platform-admin)
- [ ] Valid Redirect URIs configured
- [ ] Roles created (admin/dashboard-admin)
- [ ] Users created and roles assigned
- [ ] Backend configured with Keycloak flags
- [ ] Frontend can access backend /keycloak/config endpoint
- [ ] Test login with Keycloak
- [ ] Verify admin access works

## Next Steps

For detailed documentation, see:
- **[Full Keycloak Integration Guide](./docs/KEYCLOAK_INTEGRATION.md)**

For Keycloak configuration details:
- **[Keycloak Documentation](https://www.keycloak.org/documentation)**

## Support

If you encounter issues:
1. Check the logs: `kubectl logs -n ml-platform-system deployment/ml-platform-admin-api`
2. Enable verbose logging: `--v=4`
3. Verify Keycloak configuration in Admin Console
4. Test Keycloak endpoints manually using curl

---

**Note**: Both authentication systems can run simultaneously, making migration and rollback safe and easy.

