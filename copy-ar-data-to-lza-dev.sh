#!/bin/bash

# Script to copy DynamoDB data from old dev to LZA-dev environment
# Migrates: ParksAr, NameCacheAr, ConfigAr
# Maps old table names to new lza-dev table names

set -e

################################################################################
# CONFIGURATION
################################################################################

# Source (old dev environment)
SOURCE_PROFILE="xyg14p"
SOURCE_ACCOUNT="856925536711"
SOURCE_REGION="ca-central-1"

# Target (LZA-dev environment)
TARGET_PROFILE="059942063916_BCGOV_LZA_Admin"
TARGET_ACCOUNT="059942063916"
TARGET_REGION="ca-central-1"

# Table name mappings (old -> new)
declare -A TABLE_MAPPINGS=(
  ["ParksAr"]="ParksAr-lza-dev"
  ["NameCacheAr"]="NameCacheAr-lza-dev"
  ["ConfigAr"]="ConfigAr-lza-dev"
)

# Temporary directory for exports
TEMP_DIR="/tmp/ar-migration-$(date +%s)"
MAX_BATCH_SIZE=25

################################################################################
# FUNCTIONS
################################################################################

create_temp_dir() {
  mkdir -p "$TEMP_DIR"
  echo "Created temporary directory: $TEMP_DIR"
}

cleanup() {
  echo ""
  echo "Cleaning up temporary files..."
  rm -rf "$TEMP_DIR"
  echo "✓ Cleanup complete"
}

export_table() {
  local source_table=$1
  local export_file="${TEMP_DIR}/${source_table}-export.json"
  
  echo ""
  echo "============================================"
  echo "Exporting table: $source_table"
  echo "============================================"
  
  aws dynamodb scan \
    --table-name "$source_table" \
    --region "$SOURCE_REGION" \
    --profile "$SOURCE_PROFILE" \
    --output json > "$export_file" 2>&1
  
  if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to export $source_table"
    cat "$export_file" | head -30
    return 1
  fi
  
  local item_count=$(cat "$export_file" | jq '.Count' 2>/dev/null)
  echo "✓ Exported $item_count items from $source_table"
  
  echo "$export_file"
}

import_table() {
  local export_file=$1
  local target_table=$2
  
  echo ""
  echo "============================================"
  echo "Importing to table: $target_table"
  echo "============================================"
  
  local total_items=$(cat "$export_file" | jq '.Count')
  echo "Total items to import: $total_items"
  
  if [ "$total_items" == "0" ] || [ "$total_items" == "null" ]; then
    echo "⚠️  Warning: No items to import"
    return 0
  fi
  
  # Process in batches
  local offset=0
  local batch_num=0
  
  while [ $offset -lt $total_items ]; do
    batch_num=$((batch_num + 1))
    echo "  Processing batch $batch_num (items $offset to $((offset + MAX_BATCH_SIZE - 1)))..."
    
    # Create batch file
    local batch_file="${TEMP_DIR}/batch-${batch_num}.json"
    cat "$export_file" | jq --arg offset "$offset" --arg limit "$MAX_BATCH_SIZE" --arg table "$target_table" '{
      ($table): [
        .Items[($offset | tonumber):($offset | tonumber)+($limit | tonumber)] | .[] | {
          PutRequest: {
            Item: .
          }
        }
      ]
    }' > "$batch_file"
    
    # Import batch
    aws dynamodb batch-write-item \
      --request-items file://"$batch_file" \
      --region "$TARGET_REGION" \
      --profile "$TARGET_PROFILE" \
      --output json > "${TEMP_DIR}/import-result-${batch_num}.json" 2>&1
    
    if [ $? -ne 0 ]; then
      echo "❌ Error: Failed to import batch $batch_num"
      cat "${TEMP_DIR}/import-result-${batch_num}.json" | head -30
      return 1
    fi
    
    echo "  ✓ Imported batch $batch_num"
    rm -f "$batch_file" "${TEMP_DIR}/import-result-${batch_num}.json"
    
    offset=$((offset + MAX_BATCH_SIZE))
    
    # Small delay to avoid throttling
    sleep 0.5
  done
  
  echo "✓ Import complete for $target_table"
}

verify_import() {
  local target_table=$1
  local expected_count=$2
  
  echo ""
  echo "Verifying import for $target_table..."
  
  local actual_count=$(aws dynamodb scan \
    --table-name "$target_table" \
    --region "$TARGET_REGION" \
    --profile "$TARGET_PROFILE" \
    --select "COUNT" \
    --output json 2>&1 | jq '.Count')
  
  echo "  Expected items: $expected_count"
  echo "  Actual items: $actual_count"
  
  if [ "$actual_count" == "$expected_count" ]; then
    echo "  ✓ Verification successful"
  else
    echo "  ⚠️  Warning: Item count mismatch"
  fi
}

################################################################################
# MAIN SCRIPT
################################################################################

echo "=========================================="
echo "A&R DynamoDB Migration to LZA-Dev"
echo "=========================================="
echo ""
echo "Source:"
echo "  Profile: $SOURCE_PROFILE"
echo "  Account: $SOURCE_ACCOUNT"
echo "  Region: $SOURCE_REGION"
echo ""
echo "Target:"
echo "  Profile: $TARGET_PROFILE"
echo "  Account: $TARGET_ACCOUNT"
echo "  Region: $TARGET_REGION"
echo ""
echo "Table Mappings:"
for source_table in "${!TABLE_MAPPINGS[@]}"; do
  target_table="${TABLE_MAPPINGS[$source_table]}"
  echo "  $source_table -> $target_table"
done
echo ""

# Check prerequisites
if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI is not installed"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is not installed"
    exit 1
fi

# Verify AWS profiles are configured
echo "Verifying AWS profiles..."
aws sts get-caller-identity --profile "$SOURCE_PROFILE" &> /dev/null || {
  echo "❌ Error: Source profile '$SOURCE_PROFILE' not configured"
  exit 1
}

aws sts get-caller-identity --profile "$TARGET_PROFILE" &> /dev/null || {
  echo "❌ Error: Target profile '$TARGET_PROFILE' not configured"
  exit 1
}

echo "✓ AWS profiles verified"

# Create temporary directory
create_temp_dir

# Set trap to cleanup on exit
trap cleanup EXIT

# Process each table
declare -A export_files

for source_table in "${!TABLE_MAPPINGS[@]}"; do
  target_table="${TABLE_MAPPINGS[$source_table]}"
  
  # Export
  export_file=$(export_table "$source_table")
  if [ $? -ne 0 ]; then
    echo "❌ Migration failed during export of $source_table"
    exit 1
  fi
  export_files[$source_table]=$export_file
  
  # Import
  import_table "$export_file" "$target_table"
  if [ $? -ne 0 ]; then
    echo "❌ Migration failed during import to $target_table"
    exit 1
  fi
  
  # Verify
  expected_count=$(cat "$export_file" | jq '.Count')
  verify_import "$target_table" "$expected_count"
done

echo ""
echo "=========================================="
echo "✅ Migration Complete!"
echo "=========================================="
echo ""
echo "Summary:"
for source_table in "${!TABLE_MAPPINGS[@]}"; do
  target_table="${TABLE_MAPPINGS[$source_table]}"
  export_file="${export_files[$source_table]}"
  item_count=$(cat "$export_file" | jq '.Count')
  echo "  ✓ $source_table -> $target_table ($item_count items)"
done
echo ""
echo "Next Steps:"
echo "  1. Verify data in AWS Console or CLI"
echo "  2. Test API functionality with new tables"
echo "  3. Proceed with admin deployment"
echo ""
