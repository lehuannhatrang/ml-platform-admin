# Keycloak Integration Guide

This document describes how to configure and use Keycloak for authentication and authorization in the ML Platform Admin system.

## Overview

The system has been updated to support Keycloak as an authentication and authorization provider, replacing the previous self-generated JWT tokens and OpenFGA authorization system. The implementation supports both Keycloak (recommended) and the legacy authentication system for backward compatibility.

## Architecture

### Backend (Go)

- **Authentication**: Keycloak OIDC token validation
- **Authorization**: Keycloak roles (realm and client roles)
- **Token Validation**: Using `gocloak` and `go-oidc` libraries
- **Middleware**: Automatic detection and support for both Keycloak and legacy JWT tokens

### Frontend (React/TypeScript)

- **Authentication Flow**: OAuth2/OIDC with PKCE
- **Token Management**: Automatic token refresh
- **Login Options**: Keycloak SSO or traditional username/password
- **Libraries**: `keycloak-js` and `@react-keycloak/web`

## Keycloak Configuration

### Prerequisites

1. Keycloak server deployed in the same cluster
   - Namespace: `ml-platform-system`
   - Service: `keycloak`
   - Port: `8080`

2. Realms created:
   - **Development**: `ml-platform-dev`
   - **Production**: `ml-platform`

3. Client created:
   - Client ID: `ml-platform-admin`
   - Client Protocol: `openid-connect`
   - Access Type: `public` (for frontend authentication)
   - Valid Redirect URIs:
     - Dev: `http://192.168.40.248:5173/callback`
     - Prod: `http://<your-domain>:32000/callback`
   - Web Origins: `*` (or specific origins for security)
   - Standard Flow Enabled: `Yes`
   - Direct Access Grants Enabled: `No` (optional)

4. Roles configured:
   - **Realm Roles**: `admin` or `dashboard-admin` (for admin access)
   - **User Role Assignments**: Assign roles to users in Keycloak

### Keycloak Client Settings

In Keycloak Admin Console:

1. Navigate to **Clients** → **ml-platform-admin**
2. Configure the following settings:

```yaml
Client ID: ml-platform-admin
Client Protocol: openid-connect
Access Type: public
Standard Flow Enabled: ON
Implicit Flow Enabled: OFF
Direct Access Grants Enabled: OFF
Service Accounts Enabled: OFF
Authorization Enabled: OFF

Valid Redirect URIs:
  - http://192.168.40.248:5173/*          # Dev environment
  - http://192.168.40.248:5173/callback   # Dev callback
  - http://<your-domain>:32000/*          # Prod environment
  - http://<your-domain>:32000/callback   # Prod callback

Web Origins: *  # Or specific origins

PKCE Code Challenge Method: S256
```

3. Create roles under **Roles** tab:
   - Add role: `admin` or `dashboard-admin`

4. Assign roles to users:
   - Navigate to **Users**
   - Select a user
   - Go to **Role Mappings**
   - Assign `admin` or `dashboard-admin` role

## Backend Configuration

### Environment Variables

Set the following environment variables or command-line flags:

```bash
# Enable Keycloak authentication
USE_KEYCLOAK=true

# Keycloak server URL
KEYCLOAK_URL=http://keycloak.ml-platform-system.svc:8080

# Keycloak realm (auto-selected based on ENV_NAME if not set)
KEYCLOAK_REALM=ml-platform  # or ml-platform-dev for dev

# Keycloak client ID
KEYCLOAK_CLIENT_ID=ml-platform-admin

# Optional: Client secret (for confidential clients)
KEYCLOAK_CLIENT_SECRET=your-secret-here

# Environment name (determines realm if KEYCLOAK_REALM not set)
ENV_NAME=prod  # or "dev"

# Optional: Frontend URL for prod environment
FRONTEND_URL=http://your-domain:32000
```

### Command-Line Flags

Alternatively, use command-line flags when starting the API server:

```bash
./ml-platform-admin-api \
  --use-keycloak=true \
  --keycloak-url=http://keycloak.ml-platform-system.svc:8080 \
  --keycloak-realm=ml-platform \
  --keycloak-client-id=ml-platform-admin
```

### Configuration in Kubernetes

Add to your deployment YAML:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-platform-admin-api
spec:
  template:
    spec:
      containers:
      - name: api
        image: ml-platform-admin-api:latest
        env:
        - name: USE_KEYCLOAK
          value: "true"
        - name: KEYCLOAK_URL
          value: "http://keycloak.ml-platform-system.svc:8080"
        - name: KEYCLOAK_REALM
          value: "ml-platform"
        - name: KEYCLOAK_CLIENT_ID
          value: "ml-platform-admin"
        - name: ENV_NAME
          value: "prod"
        - name: FRONTEND_URL
          value: "http://your-domain:32000"
        args:
        - --use-keycloak=true
        - --keycloak-url=http://keycloak.ml-platform-system.svc:8080
        - --keycloak-realm=ml-platform
        - --keycloak-client-id=ml-platform-admin
```

## Frontend Configuration

The frontend automatically detects Keycloak configuration from the backend API. No additional configuration is required in the frontend code.

### Login Flow

1. When Keycloak is enabled, the login page displays a "Login with Keycloak" button
2. Clicking the button redirects to Keycloak's login page
3. After successful authentication, the user is redirected back to the callback URL
4. The callback page processes the authentication and redirects to the overview page

### Token Management

- Tokens are automatically refreshed every minute
- The frontend checks token validity before making API calls
- Expired tokens trigger automatic reauthentication

## Authorization

### Backend

The system checks for the following roles for admin access:
- `admin` (realm role)
- `dashboard-admin` (realm or client role)

Users with these roles have full access to management cluster operations and all API endpoints.

### Middleware

The `EnsureMgmtAdminMiddleware` automatically detects which authorization system is active:
- If Keycloak is configured: Checks Keycloak roles
- If Keycloak is not configured: Falls back to OpenFGA

## API Endpoints

### New Keycloak Endpoints

1. **GET /api/v1/keycloak/config**
   - Returns Keycloak configuration for the frontend
   - Response includes: enabled status, URL, realm, client ID, redirect URIs

2. **GET /api/v1/keycloak/callback**
   - OAuth2 callback endpoint (optional, frontend handles most of the flow)

3. **POST /api/v1/keycloak/validate**
   - Validates a Keycloak token and returns user information
   - Request body: `{"token": "access_token"}`
   - Response: user info including username, email, roles, and admin status

## Migration from Legacy System

### Gradual Migration

The system supports both authentication methods simultaneously:

1. **Keep legacy auth**: Set `USE_KEYCLOAK=false` (default)
2. **Enable Keycloak**: Set `USE_KEYCLOAK=true`
3. **Hybrid mode**: Both systems work; Keycloak takes priority if configured

### User Migration

1. Create users in Keycloak with the same usernames as the legacy system
2. Assign appropriate roles in Keycloak
3. Enable Keycloak authentication
4. Users can log in using either method during the transition period

## Development Environment

### Dev Configuration

For development environment:

```bash
ENV_NAME=dev
KEYCLOAK_REALM=ml-platform-dev
KEYCLOAK_URL=http://keycloak.ml-platform-system.svc:8080

# Frontend will use:
# - Root URL: http://192.168.40.248:5173
# - Redirect URI: http://192.168.40.248:5173/callback
# - Logout URI: http://192.168.40.248:5173/sign-out
```

### Production Configuration

For production environment:

```bash
ENV_NAME=prod
KEYCLOAK_REALM=ml-platform
KEYCLOAK_URL=http://keycloak.ml-platform-system.svc:8080
FRONTEND_URL=http://your-domain:32000

# Frontend will use:
# - Root URL: http://your-domain:32000
# - Redirect URI: http://your-domain:32000/callback
# - Logout URI: http://your-domain:32000/sign-out
```

## Troubleshooting

### Common Issues

1. **"Keycloak client not initialized"**
   - Ensure `USE_KEYCLOAK=true` is set
   - Check Keycloak service is accessible from the API pod
   - Verify Keycloak URL and realm configuration

2. **"Invalid redirect URI"**
   - Check Keycloak client's Valid Redirect URIs setting
   - Ensure the callback URL matches exactly (including protocol and port)
   - Update `FRONTEND_URL` environment variable if needed

3. **"Token validation failed"**
   - Verify the token hasn't expired
   - Check network connectivity to Keycloak
   - Ensure realm and client ID are correct

4. **"User is not admin"**
   - Verify the user has `admin` or `dashboard-admin` role in Keycloak
   - Check role mappings in Keycloak Admin Console
   - Ensure realm roles are enabled for the client

### Debugging

Enable verbose logging:

```bash
# Backend
--v=4  # Kubernetes log level

# Check logs
kubectl logs -n ml-platform-system deployment/ml-platform-admin-api

# Frontend
# Open browser console and check for Keycloak-related messages
```

### Testing Keycloak Connection

Test Keycloak connectivity from the API pod:

```bash
kubectl exec -it <api-pod> -n ml-platform-system -- sh

# Test Keycloak endpoint
curl http://keycloak.ml-platform-system.svc:8080/realms/ml-platform/.well-known/openid-configuration
```

## Security Considerations

1. **Use HTTPS in production**: Always use HTTPS for Keycloak and frontend URLs
2. **Restrict redirect URIs**: Use specific redirect URIs instead of wildcards
3. **Enable PKCE**: PKCE is enabled by default for security
4. **Token storage**: Tokens are stored in browser localStorage; consider using secure cookies in production
5. **CORS configuration**: Configure Web Origins properly in Keycloak client settings

## Backup and Rollback

To rollback to the legacy authentication system:

1. Set `USE_KEYCLOAK=false` or remove the flag
2. Restart the API server
3. The system will automatically use the legacy JWT and OpenFGA system

Both systems can coexist, so rolling back is safe and doesn't require data migration.

## Additional Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [OIDC Specification](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth2 PKCE](https://oauth.net/2/pkce/)

## Support

For issues or questions, please refer to:
- Project issue tracker
- Keycloak community forums
- Internal documentation wiki

