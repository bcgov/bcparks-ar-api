# bcparks-ar-api Local Development Quick Start

## One Command Setup & Start

```zsh
cd /bcparks-ar-api/arSam
./setup-local.sh
```

This will:
1. Start DynamoDB Local in Docker
2. Create the required tables (`ParksAr`, `NameCacheAr`, `ConfigAr`)
3. Install npm dependencies
4. Build the SAM application
5. Start the API server on `http://127.0.0.1:3000`

## ✅ Verify It's Running

In a separate terminal:

```zsh
./test-api.sh
```

Or test manually:

```zsh
# Without auth (returns 401 - expected)
curl -i http://127.0.0.1:3000/activity

# Try root endpoint
curl -i http://127.0.0.1:3000/
```

## API Endpoints

The API provides endpoints for:
- `/activity` - Park activity records (GET, POST, PUT, DELETE)
- `/park` - Park information (GET, POST, PUT)
- `/region` - Region data (GET)
- `/subarea` - Sub-area management (GET, POST, PUT, DELETE)
- `/variance` - Variance tracking (GET, POST, PUT)
- `/bundle` - Bundles (GET)
- `/fiscalYearEnd` - Fiscal year operations (GET, POST)
- `/export` - Data exports (GET)

**Most endpoints require authentication tokens** (returns 401 without valid token).

## Known Issue: CORS with SAM Local

**Problem**: Browser shows CORS error when accessing API from frontend (`localhost:4200`):
```
Access to XMLHttpRequest at 'http://localhost:3000/api/park?' 
has been blocked by CORS policy
```

**Actual cause**: SAM local is not correctly handling `AddDefaultAuthorizerToCorsPreflight: false`. The OPTIONS preflight request is being blocked by the authorizer.

**Workaround**: Test without authentication by bypassing the authorizer locally:

### Quick Fix: Disable Authorizer for Local Dev

Edit `/arSam/template.yaml` line 1076:
```yaml
      Auth:
        # DefaultAuthorizer: KCAuthorizer  # COMMENT OUT for local dev
        # AddDefaultAuthorizerToCorsPreflight: false
        # Authorizers:
        #   KCAuthorizer:
        #     FunctionPayloadType: REQUEST
        #     FunctionArn: !GetAtt Authorizer.Arn
        #     Identity:
        #       Headers:
        #         - Authorization
```

Then rebuild:
```zsh
npm run build
npm run start
```

Now OPTIONS requests will work without auth, and GET/POST will too (for testing).

### Proper Fix: Add Authorization Header

Once testing is working, add a valid Keycloak token in the frontend:

In `bcparks-ar-admin/src/env.js`, ensure Keycloak is configured:
```javascript
window.__env.KEYCLOAK_ENABLED = true;
window.__env.KEYCLOAK_CLIENT_ID = 'attendance-and-revenue';
window.__env.KEYCLOAK_URL = 'https://dev.loginproxy.gov.bc.ca/auth';
window.__env.KEYCLOAK_REALM = 'bcparks-service-transformation';
```

Then the frontend's Angular auth interceptor will automatically attach tokens to requests.

---

## Stop the API

Press `Ctrl+C` in the terminal running the API.

To also stop DynamoDB:
```zsh
docker stop dynamodb
```

## Manual Steps (If Needed)

```zsh
# 1. Set credentials
export AWS_ACCESS_KEY_ID=dummy
export AWS_SECRET_ACCESS_KEY=dummy
export AWS_REGION=ca-central-1

# 2. Start DynamoDB (if not using setup-local.sh)
docker run -d -p 8000:8000 --name dynamodb amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb

# 3. Build
cd /bcparks-ar-api/arSam
npm install
npm run build

# 4. Start
npm run start
```

## Notes

- The API uses local SAM for development (not Docker containers)
- DynamoDB Local stores data in memory (resets on restart)
- Varss.json` in `arSam/` configures the connection to local DynamoDB
- All responses will be `401 Unauthorized` without a valid JWT token in the `Authorization` header

