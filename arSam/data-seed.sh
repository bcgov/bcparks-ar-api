export AWS_ACCESS_KEY_ID=dummy
export AWS_SECRET_ACCESS_KEY=dummy
export AWS_SESSION_TOKEN=dummy 
export AWS_REGION=ca-central-1 
export AWS_DEFAULT_REGION=ca-central-1
export AWS_PAGER=""
 
DDB_ENDPOINT="${DDB_ENDPOINT:-http://localhost:8000}"
TABLE_NAME="${TABLE_NAME:-ParksAr}"
 
TODAY="${TODAY:-2026-06-25}"
 
echo "Seeding local DynamoDB with sample data..."
echo "Table: $TABLE_NAME"
echo "Endpoint: $DDB_ENDPOINT"
echo

# Step 2: Create tables
echo "2️⃣  Creating DynamoDB tables..."
aws dynamodb create-table \
  --table-name ParksAr \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S AttributeName=orcs,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes '[{"IndexName":"orcs-index","KeySchema":[{"AttributeName":"orcs","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url "$DDB_ENDPOINT" \
  --region local >/dev/null 2>&1 || true

aws dynamodb create-table \
  --table-name NameCacheAr \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url "$DDB_ENDPOINT" \
  --region local >/dev/null 2>&1 || true

aws dynamodb create-table \
  --table-name ConfigAr \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url "$DDB_ENDPOINT" \
  --region local >/dev/null 2>&1 || true

echo "✅ Tables ready"
 
# Helper function to put an item
put_item() {
  local pk=$1
  local sk=$2
  local data=$3
 
  aws dynamodb put-item \
    --table-name "$TABLE_NAME" \
    --item "$data" \
    --endpoint-url "$DDB_ENDPOINT" \
    --region local >/dev/null 2>&1 && echo "✓ Added: $pk / $sk" || echo "✗ Failed: $pk / $sk"
}
 
echo "1️⃣  Creating sample parks..."
 
# Park 1: Garibaldi Park (ORCS: 0004)
put_item \
  "park" \
  "0004" \
  '{
    "pk": {"S": "park"},
    "sk": {"S": "0004"},
    "orcs": {"S": "0004"},
    "parkName": {"S": "Garibaldi Provincial Park"},
    "managementArea": {"S": "Sea to Sky"},
    "section": {"S": "South Coast"},
    "region": {"S": "South Coast"},
    "subAreas": {"L": [
      {"M": {"name": {"S": "Parking Lot"}, "id": {"S": "0004-01"}}},
      {"M": {"name": {"S": "Campground"}, "id": {"S": "0004-02"}}}
    ]},
    "bundle": {"S": "South Coast"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0004:0004-01"},
      {"S": "0004:0004-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"}
  }'
 
# Park 2: Alice Lake (ORCS: 0002)
put_item \
  "park" \
  "0002" \
  '{
    "pk": {"S": "park"},
    "sk": {"S": "0002"},
    "orcs": {"S": "0002"},
    "parkName": {"S": "Alice Lake Provincial Park"},
    "managementArea": {"S": "Sea to Sky"},
    "section": {"S": "South Coast"},
    "region": {"S": "South Coast"},
    "subAreas": {"L": [
      {"M": {"name": {"S": "Day Use Area"}, "id": {"S": "0002-01"}}},
      {"M": {"name": {"S": "Campground Loop A"}, "id": {"S": "0002-02"}}}
    ]},
    "bundle": {"S": "South Coast"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0002:0002-01"},
      {"S": "0002:0002-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"}
  }'
 
# Park 3: Babine River Corridor Park (ORCS: 9584)
put_item \
  "park" \
  "9584" \
  '{
    "pk": {"S": "park"},
    "sk": {"S": "9584"},
    "orcs": {"S": "9584"},
    "parkName": {"S": "Babine River Corridor Park"},
    "managementArea": {"S": "Babine"},
    "section": {"S": "Skeena East"},
    "region": {"S": "North Coast Skeena"},
    "subAreas": {"L": [
      {"M": {"name": {"S": "Babine River Corridor"}, "id": {"S": "0018"}}}
    ]},
    "bundle": {"S": "N/A"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "9584:0018"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"}
  }'
 
echo
echo "2️⃣  Creating sample subareas..."
 
# Subarea for Garibaldi: Parking Lot
put_item \
  "park::0004" \
  "0004-01" \
  '{
    "pk": {"S": "park::0004"},
    "sk": {"S": "0004-01"},
    "orcs": {"S": "0004"},
    "parkName": {"S": "Garibaldi Provincial Park"},
    "subAreaId": {"S": "0004-01"},
    "subAreaName": {"S": "Parking Lot"},
    "managementArea": {"S": "Sea to Sky"},
    "section": {"S": "South Coast"},
    "region": {"S": "South Coast"},
    "bundle": {"S": "South Coast"},
    "activities": {"L": [
      {"S": "Day Use"},
      {"S": "Overnight Use"}
    ]},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0004:0004-01"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"}
  }'
 
# Subarea for Garibaldi: Campground
put_item \
  "park::0004" \
  "0004-02" \
  '{
    "pk": {"S": "park::0004"},
    "sk": {"S": "0004-02"},
    "orcs": {"S": "0004"},
    "parkName": {"S": "Garibaldi Provincial Park"},
    "subAreaId": {"S": "0004-02"},
    "subAreaName": {"S": "Campground"},
    "managementArea": {"S": "Sea to Sky"},
    "section": {"S": "South Coast"},
    "region": {"S": "South Coast"},
    "bundle": {"S": "South Coast"},
    "activities": {"L": [
      {"S": "Frontcountry Camping"},
      {"S": "Day Use"}
    ]},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0004:0004-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"}
  }'
 
# Subarea for Alice Lake: Day Use Area
put_item \
  "park::0002" \
  "0002-01" \
  '{
    "pk": {"S": "park::0002"},
    "sk": {"S": "0002-01"},
    "orcs": {"S": "0002"},
    "parkName": {"S": "Alice Lake Provincial Park"},
    "subAreaId": {"S": "0002-01"},
    "subAreaName": {"S": "Day Use Area"},
    "managementArea": {"S": "Sea to Sky"},
    "section": {"S": "South Coast"},
    "region": {"S": "South Coast"},
    "bundle": {"S": "South Coast"},
    "activities": {"L": [
      {"S": "Day Use"}
    ]},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0002:0002-01"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"}
  }'
 
# Subarea for Alice Lake: Campground Loop A
put_item \
  "park::0002" \
  "0002-02" \
  '{
    "pk": {"S": "park::0002"},
    "sk": {"S": "0002-02"},
    "orcs": {"S": "0002"},
    "parkName": {"S": "Alice Lake Provincial Park"},
    "subAreaId": {"S": "0002-02"},
    "subAreaName": {"S": "Campground Loop A"},
    "managementArea": {"S": "Sea to Sky"},
    "section": {"S": "South Coast"},
    "region": {"S": "South Coast"},
    "bundle": {"S": "South Coast"},
    "activities": {"L": [
      {"S": "Frontcountry Camping"},
      {"S": "Backcountry Camping"}
    ]},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0002:0002-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"}
  }'
 
# Subarea for Babine River Corridor
put_item \
  "park::9584" \
  "0018" \
  '{
    "pk": {"S": "park::9584"},
    "sk": {"S": "0018"},
    "orcs": {"S": "9584"},
    "parkName": {"S": "Babine River Corridor Park"},
    "subAreaId": {"S": "0018"},
    "subAreaName": {"S": "Babine River Corridor"},
    "managementArea": {"S": "Babine"},
    "section": {"S": "Skeena East"},
    "region": {"S": "North Coast Skeena"},
    "bundle": {"S": "N/A"},
    "activities": {"L": [
      {"S": "Day Use"}
    ]},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "9584:0018"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"}
  }'
 
echo
echo "3️⃣  Creating sample activity records..."
 
# Activity record for June 2024 - Day Use at Garibaldi Parking
put_item \
  "0004-01::Day Use" \
  "202406" \
  '{
    "pk": {"S": "0004-01::Day Use"},
    "sk": {"S": "202406"},
    "subAreaId": {"S": "0004-01"},
    "activity": {"S": "Day Use"},
    "date": {"S": "202406"},
    "orcs": {"S": "0004"},
    "parkName": {"S": "Garibaldi Provincial Park"},
    "subAreaName": {"S": "Parking Lot"},
    "dayUseVisits": {"N": "1250"},
    "dayUseRevenue": {"N": "3750.50"},
    "picnicAreaRevenue": {"N": "0"},
    "othersRevenue": {"N": "0"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0004:0004-01"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'
 
# Activity record for July 2024 - Day Use at Garibaldi Parking
put_item \
  "0004-01::Day Use" \
  "202407" \
  '{
    "pk": {"S": "0004-01::Day Use"},
    "sk": {"S": "202407"},
    "subAreaId": {"S": "0004-01"},
    "activity": {"S": "Day Use"},
    "date": {"S": "202407"},
    "orcs": {"S": "0004"},
    "parkName": {"S": "Garibaldi Provincial Park"},
    "subAreaName": {"S": "Parking Lot"},
    "dayUseVisits": {"N": "1435"},
    "dayUseRevenue": {"N": "4305.00"},
    "picnicAreaRevenue": {"N": "0"},
    "othersRevenue": {"N": "0"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0004:0004-01"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'
 
# Activity record for June 2024 - Frontcountry Camping at Garibaldi Campground
put_item \
  "0004-02::Frontcountry Camping" \
  "202406" \
  '{
    "pk": {"S": "0004-02::Frontcountry Camping"},
    "sk": {"S": "202406"},
    "subAreaId": {"S": "0004-02"},
    "activity": {"S": "Frontcountry Camping"},
    "date": {"S": "202406"},
    "orcs": {"S": "0004"},
    "parkName": {"S": "Garibaldi Provincial Park"},
    "subAreaName": {"S": "Campground"},
    "campingPartyNightsAttendanceStandard": {"N": "420"},
    "campingPartyNightsRevenueGross": {"N": "10500.00"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0004:0004-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'
 
# Activity record for June 2024 - Day Use at Alice Lake
put_item \
  "0002-01::Day Use" \
  "202406" \
  '{
    "pk": {"S": "0002-01::Day Use"},
    "sk": {"S": "202406"},
    "subAreaId": {"S": "0002-01"},
    "activity": {"S": "Day Use"},
    "date": {"S": "202406"},
    "orcs": {"S": "0002"},
    "parkName": {"S": "Alice Lake Provincial Park"},
    "subAreaName": {"S": "Day Use Area"},
    "dayUseVisits": {"N": "850"},
    "dayUseRevenue": {"N": "2550.00"},
    "picnicAreaRevenue": {"N": "0"},
    "othersRevenue": {"N": "0"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0002:0002-01"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'
 
# Activity record for June 2024 - Frontcountry Camping at Alice Lake
put_item \
  "0002-02::Frontcountry Camping" \
  "202406" \
  '{
    "pk": {"S": "0002-02::Frontcountry Camping"},
    "sk": {"S": "202406"},
    "subAreaId": {"S": "0002-02"},
    "activity": {"S": "Frontcountry Camping"},
    "date": {"S": "202406"},
    "orcs": {"S": "0002"},
    "parkName": {"S": "Alice Lake Provincial Park"},
    "subAreaName": {"S": "Campground Loop A"},
    "campingPartyNightsAttendanceStandard": {"N": "315"},
    "campingPartyNightsRevenueGross": {"N": "7875.00"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0002:0002-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'

# Activity record for June 2024 - Backcountry Camping at Alice Lake
put_item \
  "0002-02::Backcountry Camping" \
  "202406" \
  '{
    "pk": {"S": "0002-02::Backcountry Camping"},
    "sk": {"S": "202406"},
    "subAreaId": {"S": "0002-02"},
    "activity": {"S": "Backcountry Camping"},
    "date": {"S": "202406"},
    "orcs": {"S": "0002"},
    "parkName": {"S": "Alice Lake Provincial Park"},
    "subAreaName": {"S": "Campground Loop A"},
    "campingPartyNightsAttendanceStandard": {"N": "145"},
    "campingPartyNightsRevenueGross": {"N": "2900.00"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0002:0002-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'
 
# Activity record for June 2024 - Day Use at Babine River Corridor
put_item \
  "0018::Day Use" \
  "202406" \
  '{
    "pk": {"S": "0018::Day Use"},
    "sk": {"S": "202406"},
    "subAreaId": {"S": "0018"},
    "activity": {"S": "Day Use"},
    "date": {"S": "202406"},
    "orcs": {"S": "9584"},
    "parkName": {"S": "Babine River Corridor Park"},
    "subAreaName": {"S": "Babine River Corridor"},
    "dayUseVisits": {"N": "290"},
    "dayUseRevenue": {"N": "870.00"},
    "picnicAreaRevenue": {"N": "0"},
    "othersRevenue": {"N": "0"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "9584:0018"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'

# Configuration for Subarea 0018: Day Use Activity
put_item \
  "config::0018" \
  "Day Use" \
  '{
    "pk": {"S": "config::0018"},
    "sk": {"S": "Day Use"},
    "orcs": {"S": "9584"},
    "subAreaId": {"S": "0018"},
    "activity": {"S": "Day Use"},
    "parkName": {"S": "Babine River Corridor Park"},
    "subAreaName": {"S": "Babine River Corridor"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "9584:0018"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'

# Configuration for Subarea 0002-02: Frontcountry Camping Activity
put_item \
  "config::0002-02" \
  "Frontcountry Camping" \
  '{
    "pk": {"S": "config::0002-02"},
    "sk": {"S": "Frontcountry Camping"},
    "orcs": {"S": "0002"},
    "subAreaId": {"S": "0002-02"},
    "activity": {"S": "Frontcountry Camping"},
    "parkName": {"S": "Alice Lake Provincial Park"},
    "subAreaName": {"S": "Campground Loop A"},
    "attendanceModifier": {"N": "3.2"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0002:0002-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'

# Configuration for Subarea 0002-02: Backcountry Camping Activity
put_item \
  "config::0002-02" \
  "Backcountry Camping" \
  '{
    "pk": {"S": "config::0002-02"},
    "sk": {"S": "Backcountry Camping"},
    "orcs": {"S": "0002"},
    "subAreaId": {"S": "0002-02"},
    "activity": {"S": "Backcountry Camping"},
    "parkName": {"S": "Alice Lake Provincial Park"},
    "subAreaName": {"S": "Campground Loop A"},
    "attendanceModifier": {"N": "2.4"},
    "roles": {"L": [
      {"S": "sysadmin"},
      {"S": "0002:0002-02"}
    ]},
    "lastUpdated": {"S": "'"$TODAY"'"},
    "created": {"S": "'"$TODAY"'"}
  }'
 
echo
echo "✅ Sample data seeded successfully!"
echo
echo "📊 Verify with:"
echo "  TABLE_NAME=$TABLE_NAME ./inspect-db.sh $TABLE_NAME count"
echo "  TABLE_NAME=$TABLE_NAME ./inspect-db.sh $TABLE_NAME query 'park::0004'"
echo

# aws dynamodb query     --endpoint-url http://localhost:8000     --region local     --table-name ParksAr     --key-condition-expression "pk = :pk AND sk = :sk"     --expression-attribute-values '{":pk":{"S":"0002-02::Frontcountry Camping"},":sk":{"S":"202607"}}'
# aws dynamodb update-item \
#     --endpoint-url http://localhost:8000
#     --region local
#     --table-name ParksAr 
#     --key '{
#         "pk": {"S": "config::0002-02"},
#         "sk": {"S": "Frontcountry Camping"}
#     }' \
#     --update-expression "SET attendanceModifier = :val, lastUpdated = :today" \
#     --expression-attribute-values '{
#         ":val": {"N": "3.2"},
#         ":today": {"S": "'"$TODAY"'"}
#     }'