#!/bin/zsh
# Seed test data for non-resident revenue (otherRevenueGrossNonResident) testing.
# Creates:
#   - Park 0041 (Cultus Lake Park)
#   - Subarea 0087 (Maple Bay) with all 6 in-scope activities
#   - Config entries for each activity (required for POST /activity to work)
#   - 2024 + 2025 historical records WITH otherRevenueGrossNonResident (to trigger variance in 2026)
#
# Usage:
#   ./seed-nonresident-test-data.sh
#
# Prereqs:
#   - DynamoDB Local running on port 8000  (docker start dynamodb-local)
#   - Tables already created               (run setup-local.sh first, or create-tables manually)

set -euo pipefail

export AWS_ACCESS_KEY_ID=dummy
export AWS_SECRET_ACCESS_KEY=dummy
export AWS_SESSION_TOKEN=dummy
export AWS_REGION=ca-central-1
export AWS_PAGER=""

DDB_ENDPOINT="${DDB_ENDPOINT:-http://127.0.0.1:8000}"
TABLE_NAME="${TABLE_NAME:-ParksAr}"

ORCS="0041"
SAID="0087"
PARK_NAME="Cultus Lake Park"
SUBAREA_NAME="Maple Bay"
BUNDLE="South Coast"
REGION="South Coast"
SECTION="South Coast"

echo "🌱  Seeding non-resident revenue test data"
echo "    Table:    $TABLE_NAME"
echo "    Endpoint: $DDB_ENDPOINT"
echo "    Park:     $ORCS / $PARK_NAME"
echo "    Subarea:  $SAID / $SUBAREA_NAME"
echo

# ─────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────
put() {
  local label="$1"
  local item="$2"
  aws dynamodb put-item \
    --table-name "$TABLE_NAME" \
    --item "$item" \
    --endpoint-url "$DDB_ENDPOINT" \
    --region ca-central-1 \
    --no-cli-pager >/dev/null 2>&1 \
    && echo "  ✓ $label" \
    || echo "  ✗ $label (failed)"
}

# ─────────────────────────────────────────────────────────────
# 1. Park record
# ─────────────────────────────────────────────────────────────
echo "1️⃣  Park record..."
put "park / $ORCS" '{
  "pk":       {"S": "park"},
  "sk":       {"S": "0041"},
  "orcs":     {"S": "0041"},
  "parkName": {"S": "Cultus Lake Park"},
  "isLegacy": {"BOOL": false},
  "bundle":   {"S": "South Coast"},
  "region":   {"S": "South Coast"},
  "section":  {"S": "South Coast"},
  "roles":    {"L": [{"S":"sysadmin"},{"S":"0041:0087"}]},
  "subAreas": {"L": [{"M": {"name":{"S":"Maple Bay"},"id":{"S":"0087"}}}]}
}'

# ─────────────────────────────────────────────────────────────
# 2. Subarea record
# ─────────────────────────────────────────────────────────────
echo "2️⃣  Subarea record..."
put "park::0041 / 0087" '{
  "pk":          {"S": "park::0041"},
  "sk":          {"S": "0087"},
  "orcs":        {"S": "0041"},
  "parkName":    {"S": "Cultus Lake Park"},
  "subAreaId":   {"S": "0087"},
  "subAreaName": {"S": "Maple Bay"},
  "isLegacy":    {"BOOL": false},
  "bundle":      {"S": "South Coast"},
  "region":      {"S": "South Coast"},
  "section":     {"S": "South Coast"},
  "roles":       {"L": [{"S":"sysadmin"},{"S":"0041:0087"}]},
  "activities":  {"SS": [
    "Frontcountry Camping",
    "Frontcountry Cabins",
    "Group Camping",
    "Backcountry Camping",
    "Backcountry Cabins",
    "Boating"
  ]}
}'

# ─────────────────────────────────────────────────────────────
# 3. Config entries  (required for POST /activity)
#    pk = config::<subAreaId>   sk = <activity>
# ─────────────────────────────────────────────────────────────
echo "3️⃣  Config entries..."

put "config::0087 / Frontcountry Camping" '{
  "pk":                {"S": "config::0087"},
  "sk":                {"S": "Frontcountry Camping"},
  "orcs":              {"S": "0041"},
  "parkName":          {"S": "Cultus Lake Park"},
  "subAreaId":         {"S": "0087"},
  "subAreaName":       {"S": "Maple Bay"},
  "attendanceModifier":{"N": "3.2"}
}'

put "config::0087 / Frontcountry Cabins" '{
  "pk":                {"S": "config::0087"},
  "sk":                {"S": "Frontcountry Cabins"},
  "orcs":              {"S": "0041"},
  "parkName":          {"S": "Cultus Lake Park"},
  "subAreaId":         {"S": "0087"},
  "subAreaName":       {"S": "Maple Bay"},
  "attendanceModifier":{"N": "3.2"}
}'

put "config::0087 / Group Camping" '{
  "pk":          {"S": "config::0087"},
  "sk":          {"S": "Group Camping"},
  "orcs":        {"S": "0041"},
  "parkName":    {"S": "Cultus Lake Park"},
  "subAreaId":   {"S": "0087"},
  "subAreaName": {"S": "Maple Bay"}
}'

put "config::0087 / Backcountry Camping" '{
  "pk":          {"S": "config::0087"},
  "sk":          {"S": "Backcountry Camping"},
  "orcs":        {"S": "0041"},
  "parkName":    {"S": "Cultus Lake Park"},
  "subAreaId":   {"S": "0087"},
  "subAreaName": {"S": "Maple Bay"}
}'

put "config::0087 / Backcountry Cabins" '{
  "pk":                {"S": "config::0087"},
  "sk":                {"S": "Backcountry Cabins"},
  "orcs":              {"S": "0041"},
  "parkName":          {"S": "Cultus Lake Park"},
  "subAreaId":         {"S": "0087"},
  "subAreaName":       {"S": "Maple Bay"},
  "attendanceModifier":{"N": "3.2"}
}'

put "config::0087 / Boating" '{
  "pk":                {"S": "config::0087"},
  "sk":                {"S": "Boating"},
  "orcs":              {"S": "0041"},
  "parkName":          {"S": "Cultus Lake Park"},
  "subAreaId":         {"S": "0087"},
  "subAreaName":       {"S": "Maple Bay"},
  "attendanceModifier":{"N": "3.2"}
}'

# ─────────────────────────────────────────────────────────────
# 4. Historical records — 2024 and 2025
#    These give the variance engine 2 years of history so it
#    can compare against 2026 values and trigger a variance
#    when otherRevenueGrossNonResident changes significantly.
# ─────────────────────────────────────────────────────────────
echo "4️⃣  Historical activity records (2024 + 2025)..."

for YEAR in 202401 202501; do
  LABEL_YEAR="${YEAR:0:4}"

  # --- Frontcountry Camping ---
  put "0087::Frontcountry Camping / $YEAR" "{
    \"pk\":                                        {\"S\": \"0087::Frontcountry Camping\"},
    \"sk\":                                        {\"S\": \"$YEAR\"},
    \"date\":                                      {\"S\": \"$YEAR\"},
    \"orcs\":                                      {\"S\": \"0041\"},
    \"parkName\":                                  {\"S\": \"Cultus Lake Park\"},
    \"subAreaName\":                               {\"S\": \"Maple Bay\"},
    \"subAreaId\":                                 {\"S\": \"0087\"},
    \"activity\":                                  {\"S\": \"Frontcountry Camping\"},
    \"isLocked\":                                  {\"BOOL\": false},
    \"campingPartyNightsAttendanceStandard\":       {\"N\": \"100\"},
    \"campingPartyNightsAttendanceSenior\":         {\"N\": \"20\"},
    \"campingPartyNightsAttendanceSocial\":         {\"N\": \"5\"},
    \"campingPartyNightsAttendanceLongStay\":       {\"N\": \"3\"},
    \"winterCampingPartyNightsAttendanceStandard\": {\"N\": \"0\"},
    \"winterCampingPartyNightsAttendanceSocial\":   {\"N\": \"0\"},
    \"campingPartyNightsRevenueGross\":             {\"N\": \"5000\"},
    \"secondCarsAttendanceStandard\":               {\"N\": \"10\"},
    \"secondCarsAttendanceSenior\":                 {\"N\": \"2\"},
    \"secondCarsAttendanceSocial\":                 {\"N\": \"1\"},
    \"secondCarsRevenueGross\":                     {\"N\": \"200\"},
    \"otherRevenueGrossSani\":                      {\"N\": \"150\"},
    \"otherRevenueElectrical\":                     {\"N\": \"300\"},
    \"otherRevenueShower\":                         {\"N\": \"100\"},
    \"otherRevenueGrossNonResident\":               {\"N\": \"750\"},
    \"config\": {\"M\": {
      \"pk\":                {\"S\": \"config::0087\"},
      \"sk\":                {\"S\": \"Frontcountry Camping\"},
      \"orcs\":              {\"S\": \"0041\"},
      \"parkName\":          {\"S\": \"Cultus Lake Park\"},
      \"subAreaId\":         {\"S\": \"0087\"},
      \"subAreaName\":       {\"S\": \"Maple Bay\"},
      \"attendanceModifier\":{\"N\": \"3.2\"}
    }}
  }"

  # --- Frontcountry Cabins ---
  put "0087::Frontcountry Cabins / $YEAR" "{
    \"pk\":                           {\"S\": \"0087::Frontcountry Cabins\"},
    \"sk\":                           {\"S\": \"$YEAR\"},
    \"date\":                         {\"S\": \"$YEAR\"},
    \"orcs\":                         {\"S\": \"0041\"},
    \"parkName\":                     {\"S\": \"Cultus Lake Park\"},
    \"subAreaName\":                  {\"S\": \"Maple Bay\"},
    \"subAreaId\":                    {\"S\": \"0087\"},
    \"activity\":                     {\"S\": \"Frontcountry Cabins\"},
    \"isLocked\":                     {\"BOOL\": false},
    \"totalAttendanceParties\":        {\"N\": \"40\"},
    \"revenueGrossCamping\":           {\"N\": \"3200\"},
    \"otherRevenueGrossNonResident\":  {\"N\": \"400\"},
    \"config\": {\"M\": {
      \"pk\":                {\"S\": \"config::0087\"},
      \"sk\":                {\"S\": \"Frontcountry Cabins\"},
      \"orcs\":              {\"S\": \"0041\"},
      \"parkName\":          {\"S\": \"Cultus Lake Park\"},
      \"subAreaId\":         {\"S\": \"0087\"},
      \"subAreaName\":       {\"S\": \"Maple Bay\"},
      \"attendanceModifier\":{\"N\": \"3.2\"}
    }}
  }"

  # --- Group Camping ---
  put "0087::Group Camping / $YEAR" "{
    \"pk\":                           {\"S\": \"0087::Group Camping\"},
    \"sk\":                           {\"S\": \"$YEAR\"},
    \"date\":                         {\"S\": \"$YEAR\"},
    \"orcs\":                         {\"S\": \"0041\"},
    \"parkName\":                     {\"S\": \"Cultus Lake Park\"},
    \"subAreaName\":                  {\"S\": \"Maple Bay\"},
    \"subAreaId\":                    {\"S\": \"0087\"},
    \"activity\":                     {\"S\": \"Group Camping\"},
    \"isLocked\":                     {\"BOOL\": false},
    \"standardRateGroupsTotalPeopleStandard\": {\"N\": \"5\"},
    \"standardRateGroupsTotalPeopleAdults\":   {\"N\": \"30\"},
    \"standardRateGroupsTotalPeopleYouth\":    {\"N\": \"20\"},
    \"standardRateGroupsTotalPeopleKids\":     {\"N\": \"10\"},
    \"standardRateGroupsRevenueGross\":        {\"N\": \"1500\"},
    \"youthRateGroupsAttendanceGroupNights\":  {\"N\": \"3\"},
    \"youthRateGroupsAttendancePeople\":       {\"N\": \"25\"},
    \"youthRateGroupsRevenueGross\":           {\"N\": \"500\"},
    \"otherRevenueGrossNonResident\":          {\"N\": \"250\"},
    \"config\": {\"M\": {
      \"pk\":          {\"S\": \"config::0087\"},
      \"sk\":          {\"S\": \"Group Camping\"},
      \"orcs\":        {\"S\": \"0041\"},
      \"parkName\":    {\"S\": \"Cultus Lake Park\"},
      \"subAreaId\":   {\"S\": \"0087\"},
      \"subAreaName\": {\"S\": \"Maple Bay\"}
    }}
  }"

  # --- Backcountry Camping ---
  put "0087::Backcountry Camping / $YEAR" "{
    \"pk\":                          {\"S\": \"0087::Backcountry Camping\"},
    \"sk\":                          {\"S\": \"$YEAR\"},
    \"date\":                        {\"S\": \"$YEAR\"},
    \"orcs\":                        {\"S\": \"0041\"},
    \"parkName\":                    {\"S\": \"Cultus Lake Park\"},
    \"subAreaName\":                 {\"S\": \"Maple Bay\"},
    \"subAreaId\":                   {\"S\": \"0087\"},
    \"activity\":                    {\"S\": \"Backcountry Camping\"},
    \"isLocked\":                    {\"BOOL\": false},
    \"peopleAdult\":                 {\"N\": \"80\"},
    \"peopleYouth\":                 {\"N\": \"20\"},
    \"grossCampingRevenue\":          {\"N\": \"1200\"},
    \"otherRevenueGrossNonResident\": {\"N\": \"350\"},
    \"config\": {\"M\": {
      \"pk\":          {\"S\": \"config::0087\"},
      \"sk\":          {\"S\": \"Backcountry Camping\"},
      \"orcs\":        {\"S\": \"0041\"},
      \"parkName\":    {\"S\": \"Cultus Lake Park\"},
      \"subAreaId\":   {\"S\": \"0087\"},
      \"subAreaName\": {\"S\": \"Maple Bay\"}
    }}
  }"

  # --- Backcountry Cabins ---
  put "0087::Backcountry Cabins / $YEAR" "{
    \"pk\":                          {\"S\": \"0087::Backcountry Cabins\"},
    \"sk\":                          {\"S\": \"$YEAR\"},
    \"date\":                        {\"S\": \"$YEAR\"},
    \"orcs\":                        {\"S\": \"0041\"},
    \"parkName\":                    {\"S\": \"Cultus Lake Park\"},
    \"subAreaName\":                 {\"S\": \"Maple Bay\"},
    \"subAreaId\":                   {\"S\": \"0087\"},
    \"activity\":                    {\"S\": \"Backcountry Cabins\"},
    \"isLocked\":                    {\"BOOL\": false},
    \"peopleAdult\":                  {\"N\": \"10\"},
    \"peopleChild\":                  {\"N\": \"4\"},
    \"peopleFamily\":                 {\"N\": \"3\"},
    \"revenueFamily\":                {\"N\": \"900\"},
    \"otherRevenueGrossNonResident\": {\"N\": \"200\"},
    \"config\": {\"M\": {
      \"pk\":                {\"S\": \"config::0087\"},
      \"sk\":                {\"S\": \"Backcountry Cabins\"},
      \"orcs\":              {\"S\": \"0041\"},
      \"parkName\":          {\"S\": \"Cultus Lake Park\"},
      \"subAreaId\":         {\"S\": \"0087\"},
      \"subAreaName\":       {\"S\": \"Maple Bay\"},
      \"attendanceModifier\":{\"N\": \"3.2\"}
    }}
  }"

  # --- Boating ---
  put "0087::Boating / $YEAR" "{
    \"pk\":                          {\"S\": \"0087::Boating\"},
    \"sk\":                          {\"S\": \"$YEAR\"},
    \"date\":                        {\"S\": \"$YEAR\"},
    \"orcs\":                        {\"S\": \"0041\"},
    \"parkName\":                    {\"S\": \"Cultus Lake Park\"},
    \"subAreaName\":                 {\"S\": \"Maple Bay\"},
    \"subAreaId\":                   {\"S\": \"0087\"},
    \"activity\":                    {\"S\": \"Boating\"},
    \"isLocked\":                    {\"BOOL\": false},
    \"boatAttendanceNightsOnDock\":   {\"N\": \"15\"},
    \"boatAttendanceNightsOnBouys\":  {\"N\": \"8\"},
    \"boatAttendanceMiscellaneous\":  {\"N\": \"3\"},
    \"boatRevenueGross\":             {\"N\": \"1100\"},
    \"otherRevenueGrossNonResident\": {\"N\": \"300\"},
    \"config\": {\"M\": {
      \"pk\":                {\"S\": \"config::0087\"},
      \"sk\":                {\"S\": \"Boating\"},
      \"orcs\":              {\"S\": \"0041\"},
      \"parkName\":          {\"S\": \"Cultus Lake Park\"},
      \"subAreaId\":         {\"S\": \"0087\"},
      \"subAreaName\":       {\"S\": \"Maple Bay\"},
      \"attendanceModifier\":{\"N\": \"3.2\"}
    }}
  }"

done

# ─────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────
echo
echo "✅  Seed complete!"
echo
echo "📋  What was seeded:"
echo "    • Park 0041 - Cultus Lake Park"
echo "    • Subarea 0087 - Maple Bay (6 activities)"
echo "    • Config entries for all 6 activities"
echo "    • Historical records Jan-2024 and Jan-2025 WITH otherRevenueGrossNonResident"
echo
echo "🧪  Test variance trigger:"
echo "    POST /activity with date=202601 and otherRevenueGrossNonResident=5000"
echo "    (history avg is ~750 → >20% change → variance fires)"
echo
echo "🔍  Quick verify:"
echo "    AWS_ACCESS_KEY_ID=dummy AWS_SECRET_ACCESS_KEY=dummy \\"
echo "    aws dynamodb scan --table-name $TABLE_NAME \\"
echo "      --endpoint-url $DDB_ENDPOINT --region ca-central-1 \\"
echo "      --no-cli-pager | grep -c 'Frontcountry Camping'"

