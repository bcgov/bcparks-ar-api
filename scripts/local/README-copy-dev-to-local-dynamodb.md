# Copy Dev DynamoDB Table to Local

This script copies one DynamoDB table from AWS into local DynamoDB.

File: `scripts/local/copy-dev-to-local-dynamodb.sh`

## What it does

- reads a source table from AWS using `scan` with pagination
- writes to local DynamoDB using `batch-write-item` (chunks of 25)
- retries unprocessed items
- can auto-create the local table (pk/sk + `orcs-index`)
- verifies source/local counts at the end

## Defaults

- source profile: `059942063916_BCGOV_LZA_Admin`
- source region: `ca-central-1`
- source table: `ParksAr-lza-dev`
- local endpoint: `http://127.0.0.1:8000`
- local table: `ParksAr-lza-dev`

## Prerequisites

- `aws` CLI
- `jq`
- local DynamoDB running on port 8000 (or pass another endpoint)
- valid AWS access for source profile

## Usage

```bash
cd /bcparks-ar-api/scripts/local
chmod +x ./copy-dev-to-local-dynamodb.sh
./copy-dev-to-local-dynamodb.sh
```

## Useful options

```bash
# preview only (read first page, no local writes)
./copy-dev-to-local-dynamodb.sh --dry-run --max-pages 1

# write into local table ParksAr instead of ParksAr-lza-dev
./copy-dev-to-local-dynamodb.sh --local-table ParksAr

# use a different source table/profile
./copy-dev-to-local-dynamodb.sh --source-profile my-profile --source-table ParksAr-dev
```

