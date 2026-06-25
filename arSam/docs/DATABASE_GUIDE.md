# DynamoDB Data Seeding & Inspection Guide

## Quick Seed Sample Data

Once your API is running with local DynamoDB, seed sample parks and activities:

```zsh
cd /bcparks-ar-api/scripts/local
./seed-sample-data.sh
```

This creates:
- **2 Parks**: Garibaldi (ORCS 0004), Alice Lake (ORCS 0002)
- **2 Subareas**: One per park
- **2 Activity Records**: Day Use entries for June 2026

## 🔍 Inspect the Database

### Check Item Count
```zsh
./inspect-db.sh ParksAr count
```
Returns total items in ParksAr table.

### Describe Table Schema
```zsh
./inspect-db.sh ParksAr describe
```
Shows table structure, key schema, indexes, item count, and size.

### Scan Table (first 100 items)
```zsh
./inspect-db.sh ParksAr scan
```
Lists items in the table (limited to 100).

### Query by Partition Key
```zsh
./inspect-db.sh ParksAr query "park::0004"
```
Gets all records with `pk="park::0004"` (shows park + subareas).

### Query Specific Item
```zsh
./inspect-db.sh ParksAr query "park::0004" "0004-01"
```
Gets exact item with `pk="park::0004"` and `sk="0004-01"`.

### Inspect Other Tables
```zsh
./inspect-db.sh NameCacheAr count
./inspect-db.sh ConfigAr describe
```

## Data Model Examples

### Park Record
```json
{
  "pk": "park::0004",
  "sk": "0004",
  "orcs": "0004",
  "parkName": "Garibaldi Provincial Park",
  "bundle": "South Coast",
  "roles": ["sysadmin", "0004:all"],
  "lastUpdated": "2026-06-25"
}
```

### Subarea Record
```json
{
  "pk": "park::0004",
  "sk": "0004-01",
  "orcs": "0004",
  "subAreaId": "0004-01",
  "subAreaName": "Parking Lot",
  "bundle": "South Coast",
  "activities": {
    "values": ["Day Use", "Overnight Use"]
  },
  "roles": ["sysadmin", "0004:0004-01"]
}
```

### Activity Record
```json
{
  "pk": "0004-01::Day Use",
  "sk": "202406",
  "subAreaId": "0004-01",
  "activity": "Day Use",
  "date": "202406",
  "orcs": "0004",
  "parkName": "Garibaldi Provincial Park",
  "dayUseVisits": 1250,
  "dayUseRevenue": 3750.50,
  "created": "2026-06-25"
}
```

## Manual Data Operations

### Add a Custom Record
```zsh
export AWS_ACCESS_KEY_ID=dummy
export AWS_SECRET_ACCESS_KEY=dummy
export AWS_REGION=ca-central-1

aws dynamodb put-item \
  --table-name ParksAr \
  --item '{
    "pk": {"S": "park::0015"},
    "sk": {"S": "0015"},
    "orcs": {"S": "0015"},
    "parkName": {"S": "My Park"},
    "bundle": {"S": "Bundle Name"},
    "lastUpdated": {"S": "2026-06-25"}
  }' \
  --endpoint-url http://127.0.0.1:8000
```

### Delete All Items from Table
⚠️ **Use with caution!**
```zsh
aws dynamodb scan --table-name ParksAr --projection-expression "pk,sk" --endpoint-url http://127.0.0.1:8000 | \
  jq -r '.Items[] | "\(.pk.S) \(.sk.S)"' | \
  while read pk sk; do
    aws dynamodb delete-item \
      --table-name ParksAr \
      --key "pk={S=\"$pk\"},sk={S=\"$sk\"}" \
      --endpoint-url http://127.0.0.1:8000
  done
```

### Reset Tables to Empty
```zsh
# Delete and recreate tables
aws dynamodb delete-table --table-name ParksAr --endpoint-url http://127.0.0.1:8000
aws dynamodb delete-table --table-name NameCacheAr --endpoint-url http://127.0.0.1:8000
aws dynamodb delete-table --table-name ConfigAr --endpoint-url http://127.0.0.1:8000

# Then run setup-local.sh again to recreate them
cd /bcparks-ar-api/arSam
./setup-local.sh
```

## Common Workflows

### Populate + Test
```zsh
# 1. Start API and DynamoDB
cd /bcparks-ar-api/scripts/local
./setup-local.sh &

# 2. In another terminal, seed data
cd /bcparks-ar-api/scripts/local
./seed-sample-data.sh

# 3. Test API (in another terminal)
curl http://127.0.0.1:3000/park
```

### Backup Before Testing
```zsh
cd /bcparks-ar-api/tools
./export-db.sh ParksAr
```

Then after tests, restore:
```zsh
cd /bcparks-ar-api/scripts/local
export IS_OFFLINE=true
export TABLE_NAME=ParksAr
cp ParksAr.dump.json dump.json
node dynamoRestore.js
```

## Key Data Attributes

All items use `pk` (partition key) + `sk` (sort key):

| Type | PK Pattern | SK Pattern | Example |
|------|-----------|-----------|---------|
| Park | `park::{ORCS}` | `{ORCS}` | `park::0004` / `0004` |
| Subarea | `park::{ORCS}` | `{ORCS}-{ID}` | `park::0004` / `0004-01` |
| Activity | `{SubareaId}::{ActivityName}` | `YYYYMM` | `0004-01::Day Use` / `202406` |
| Variance | `variance::{ORCS}::{YYYYMM}` | `{SubareaId}::{Activity}` | `variance::0004::202406` / `0004-01::Day Use` |

The `orcs` field (ORCS code) is indexed via GSI `orcs-index` for quick lookups by park code.

## Troubleshooting

### "Type mismatch for Index Key"
The `orcs` field must be type `S` (String), not `N` (Number).

### DynamoDB endpoint not reachable
Check if Docker container is running:
```zsh
docker ps | grep dynamodb
```

If not running, restart:
```zsh
docker run -d -p 8000:8000 --name dynamodb amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb
```

### Tables missing
Run setup again:
```zsh
cd /bcparks-ar-api/scripts/local
./setup-local.sh
```

This automatically creates all three tables.

