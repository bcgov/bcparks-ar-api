#!/usr/bin/env bash
set -euo pipefail

# Copy one DynamoDB table from AWS (profile/region) into local DynamoDB.
# Handles scan pagination and imports in 25-item batch-write requests.

SOURCE_PROFILE="${SOURCE_PROFILE:-059942063916_BCGOV_LZA_Admin}"
SOURCE_REGION="${SOURCE_REGION:-ca-central-1}"
SOURCE_TABLE="${SOURCE_TABLE:-ParksAr-lza-dev}"

LOCAL_ENDPOINT="${LOCAL_ENDPOINT:-http://127.0.0.1:8000}"
LOCAL_REGION="${LOCAL_REGION:-ca-central-1}"
LOCAL_TABLE="${LOCAL_TABLE:-ParksAr-lza-dev}"

CREATE_TABLE_IF_MISSING="true"
MAX_PAGES=0
DRY_RUN="false"

BATCH_SIZE=25

TMP_DIR="$(mktemp -d -t ar-copy-local-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

usage() {
  cat <<'EOF'
Usage:
  copy-dev-to-local-dynamodb.sh [options]

Options:
  --source-profile <name>       AWS profile for source account
  --source-region <region>      Source AWS region (default: ca-central-1)
  --source-table <name>         Source DynamoDB table (default: ParksAr-lza-dev)
  --local-endpoint <url>        Local DynamoDB endpoint (default: http://127.0.0.1:8000)
  --local-region <region>       Local region label (default: ca-central-1)
  --local-table <name>          Local DynamoDB table (default: ParksAr-lza-dev)
  --skip-create-table           Do not auto-create local table if missing
  --max-pages <n>               Stop after N scan pages (0 = all pages)
  --dry-run                     Read source pages only; do not write locally
  -h, --help                    Show this help

Examples:
  ./copy-dev-to-local-dynamodb.sh
  ./copy-dev-to-local-dynamodb.sh --source-table ParksAr-lza-dev --local-table ParksAr
  ./copy-dev-to-local-dynamodb.sh --dry-run --max-pages 1
EOF
}

require_cmds() {
  command -v aws >/dev/null 2>&1 || { echo "Error: aws CLI is required"; exit 1; }
  command -v jq >/dev/null 2>&1 || { echo "Error: jq is required"; exit 1; }
}

aws_source() {
  AWS_PAGER="" aws --profile "$SOURCE_PROFILE" --region "$SOURCE_REGION" "$@"
}

aws_local() {
  AWS_PAGER="" AWS_ACCESS_KEY_ID=dummy AWS_SECRET_ACCESS_KEY=dummy AWS_SESSION_TOKEN=dummy \
    aws --region "$LOCAL_REGION" --endpoint-url "$LOCAL_ENDPOINT" "$@"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --source-profile) SOURCE_PROFILE="$2"; shift 2 ;;
      --source-region) SOURCE_REGION="$2"; shift 2 ;;
      --source-table) SOURCE_TABLE="$2"; shift 2 ;;
      --local-endpoint) LOCAL_ENDPOINT="$2"; shift 2 ;;
      --local-region) LOCAL_REGION="$2"; shift 2 ;;
      --local-table) LOCAL_TABLE="$2"; shift 2 ;;
      --skip-create-table) CREATE_TABLE_IF_MISSING="false"; shift ;;
      --max-pages) MAX_PAGES="$2"; shift 2 ;;
      --dry-run) DRY_RUN="true"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) echo "Unknown option: $1"; usage; exit 1 ;;
    esac
  done
}

verify_source_access() {
  echo "Checking source AWS profile access..."
  aws_source sts get-caller-identity >/dev/null
  echo "OK: source profile is accessible"
}

ensure_local_table() {
  if [[ "$CREATE_TABLE_IF_MISSING" != "true" ]]; then
    return
  fi

  if aws_local dynamodb describe-table --table-name "$LOCAL_TABLE" >/dev/null 2>&1; then
    echo "OK: local table '$LOCAL_TABLE' already exists"
    return
  fi

  echo "Creating local table '$LOCAL_TABLE'..."
  aws_local dynamodb create-table \
    --table-name "$LOCAL_TABLE" \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S AttributeName=orcs,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --global-secondary-indexes '[{"IndexName":"orcs-index","KeySchema":[{"AttributeName":"orcs","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
    --billing-mode PAY_PER_REQUEST >/dev/null

  echo "OK: local table created"
}

batch_write_with_retries() {
  local batch_file="$1"
  local attempt=0

  while true; do
    attempt=$((attempt + 1))
    local result_file="$TMP_DIR/batch-result-${attempt}.json"

    aws_local dynamodb batch-write-item --request-items "file://$batch_file" > "$result_file"

    local unprocessed
    unprocessed=$(jq -c '.UnprocessedItems' "$result_file")

    if [[ "$unprocessed" == "{}" ]]; then
      rm -f "$result_file"
      return
    fi

    local retry_file="$TMP_DIR/retry-${attempt}.json"
    jq '.UnprocessedItems' "$result_file" > "$retry_file"
    mv "$retry_file" "$batch_file"
    rm -f "$result_file"

    if [[ $attempt -ge 10 ]]; then
      echo "Error: unprocessed items still remain after 10 retries"
      exit 1
    fi

    sleep 1
  done
}

copy_table() {
  local page=0
  local total_read=0
  local total_written=0
  local last_evaluated_key=""

  echo "Copying table '$SOURCE_TABLE' -> '$LOCAL_TABLE'"

  while true; do
    page=$((page + 1))

    local page_file="$TMP_DIR/page-${page}.json"

    if [[ -z "$last_evaluated_key" ]]; then
      aws_source dynamodb scan --table-name "$SOURCE_TABLE" --no-paginate --output json > "$page_file"
    else
      aws_source dynamodb scan --table-name "$SOURCE_TABLE" --exclusive-start-key "$last_evaluated_key" --no-paginate --output json > "$page_file"
    fi

    local page_count
    page_count=$(jq '.Items | length' "$page_file")
    total_read=$((total_read + page_count))

    echo "Page $page: read $page_count items (running total: $total_read)"

    if [[ "$DRY_RUN" != "true" && "$page_count" -gt 0 ]]; then
      local offset=0
      while [[ $offset -lt $page_count ]]; do
        local batch_file="$TMP_DIR/batch-${page}-${offset}.json"
        jq --arg table "$LOCAL_TABLE" --argjson offset "$offset" --argjson size "$BATCH_SIZE" '{
          ($table): (.Items[$offset:($offset + $size)] | map({PutRequest: {Item: .}}))
        }' "$page_file" > "$batch_file"

        local batch_len
        batch_len=$(jq --arg table "$LOCAL_TABLE" '.[$table] | length' "$batch_file")

        if [[ "$batch_len" -gt 0 ]]; then
          batch_write_with_retries "$batch_file"
          total_written=$((total_written + batch_len))
        fi

        rm -f "$batch_file"
        offset=$((offset + BATCH_SIZE))
      done
    fi

    last_evaluated_key=$(jq -c '.LastEvaluatedKey // empty' "$page_file")
    rm -f "$page_file"

    if [[ "$MAX_PAGES" -gt 0 && "$page" -ge "$MAX_PAGES" ]]; then
      echo "Stopping early due to --max-pages=$MAX_PAGES"
      break
    fi

    if [[ -z "$last_evaluated_key" ]]; then
      break
    fi
  done

  echo "Done. Read $total_read items."
  if [[ "$DRY_RUN" != "true" ]]; then
    echo "Done. Wrote $total_written items to local table '$LOCAL_TABLE'."
  fi
}

verify_counts() {
  local source_count
  source_count=$(aws_source dynamodb scan --table-name "$SOURCE_TABLE" --select COUNT --output json | jq '.Count')

  local local_count
  local_count=$(aws_local dynamodb scan --table-name "$LOCAL_TABLE" --select COUNT --output json | jq '.Count')

  echo "Source count: $source_count"
  echo "Local count:  $local_count"
}

main() {
  parse_args "$@"
  require_cmds

  echo "========================================="
  echo "Copy DynamoDB table from AWS -> local"
  echo "========================================="
  echo "Source profile: $SOURCE_PROFILE"
  echo "Source region:  $SOURCE_REGION"
  echo "Source table:   $SOURCE_TABLE"
  echo "Local endpoint: $LOCAL_ENDPOINT"
  echo "Local region:   $LOCAL_REGION"
  echo "Local table:    $LOCAL_TABLE"
  echo "Dry run:        $DRY_RUN"
  echo

  verify_source_access
  ensure_local_table
  copy_table

  if [[ "$DRY_RUN" != "true" ]]; then
    verify_counts
  fi
}

main "$@"

