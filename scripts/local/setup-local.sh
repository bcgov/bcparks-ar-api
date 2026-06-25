#!/bin/zsh
# Complete one-shot setup + start for bcparks-ar-api local development
set -euo pipefail

echo "🚀 Starting bcparks-ar-api local environment..."
echo

# Set AWS credentials for local DynamoDB
export AWS_ACCESS_KEY_ID=dummy
export AWS_SECRET_ACCESS_KEY=dummy
export AWS_REGION=ca-central-1
export AWS_DEFAULT_REGION=ca-central-1
export AWS_PAGER=""

DDB_ENDPOINT="http://127.0.0.1:8000"
API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Step 1: Start DynamoDB Local
echo "1️⃣  Starting DynamoDB Local..."
docker rm -f dynamodb >/dev/null 2>&1 || true
docker run -d -p 8000:8000 --name dynamodb amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb >/dev/null
sleep 2

# Step 2: Create tables
echo "2️⃣  Creating DynamoDB tables..."
aws dynamodb create-table \
  --table-name ParksAr \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S AttributeName=orcs,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes '[{"IndexName":"orcs-index","KeySchema":[{"AttributeName":"orcs","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url "$DDB_ENDPOINT" \
  --region ca-central-1 >/dev/null 2>&1 || true

aws dynamodb create-table \
  --table-name NameCacheAr \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url "$DDB_ENDPOINT" \
  --region ca-central-1 >/dev/null 2>&1 || true

aws dynamodb create-table \
  --table-name ConfigAr \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url "$DDB_ENDPOINT" \
  --region ca-central-1 >/dev/null 2>&1 || true

echo "✅ Tables ready"
echo

# Step 3: Install and build
echo "3️⃣  Installing dependencies..."
cd "$API_DIR"
npm install >/dev/null 2>&1
echo "✅ Dependencies installed"
echo

echo "4️⃣  Building SAM application..."
npm run build >/dev/null 2>&1
echo "✅ Build complete"
echo

# Step 4: Start API
echo "5️⃣  Starting API on http://127.0.0.1:3000"
echo "   (Press Ctrl+C to stop)"
echo

npm run start

