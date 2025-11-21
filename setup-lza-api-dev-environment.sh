#!/bin/bash

# Script to set up GitHub environment secrets and variables for lza-dev
# Repository: bcgov/bcparks-ar-api
# Environment: lza-dev

set -e

REPO="bcgov/bcparks-ar-api"
ENV="lza-dev"

################################################################################
# CONFIGURATION SECTION - LZA-DEV VALUES
################################################################################

# LZA Account Information
LZA_ACCOUNT_ID="059942063916"
LZA_AWS_REGION="ca-central-1"

# AWS IAM Role for GitHub OIDC
AWS_ROLE_TO_ASSUME="arn:aws:iam::${LZA_ACCOUNT_ID}:role/GitHub-OIDC-Role"

# DynamoDB Table Names (NEW tables with lza-dev suffix)
TABLE_NAME_AR="ParksAr-lza-dev"
TABLE_NAME_CACHE_AR="NameCacheAr-lza-dev"
TABLE_NAME_CONFIG_AR="ConfigAr-lza-dev"

# S3 Bucket for export data
S3_BUCKET_DATA="parks-ar-export-data-lza-dev"

# API Configuration
AR_API_STAGE="lza-dev"

# SSO Configuration (using dev SSO)
SSO_ISSUER="https://dev.loginproxy.gov.bc.ca/auth/realms/bcparks-service-transformation"
SSO_JWKSURI="https://dev.loginproxy.gov.bc.ca/auth/realms/bcparks-service-transformation/protocol/openid-connect/certs"
SSO_ORIGIN="https://dev.loginproxy.gov.bc.ca"

# AWS Account List - Simplified for LZA environments
# Maps environment labels instead of account IDs for CloudWatch alarms
AWS_ACCOUNT_LIST='{"059942063916": "BC Parks A&R LZA (lza-dev/lza-test)"}'

################################################################################
# END CONFIGURATION SECTION
################################################################################

echo "=========================================="
echo "Setting up GitHub environment: $ENV"
echo "Repository: $REPO"
echo "=========================================="
echo ""

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

echo "Step 1: Creating GitHub environment (if not exists)..."
echo "------------------------------------------------------"

# Create environment (will skip if already exists)
gh api repos/$REPO/environments/$ENV -X PUT 2>/dev/null || echo "Environment may already exist or you may need admin permissions"

echo ""
echo "Step 2: Setting environment secrets..."
echo "---------------------------------------"

echo "Setting AWS_ROLE_TO_ASSUME..."
gh secret set AWS_ROLE_TO_ASSUME \
  --repo $REPO \
  --env $ENV \
  --body "$AWS_ROLE_TO_ASSUME"

# SSO_CLIENT_ID - needs to be manually set or copied from existing dev environment
echo ""
echo "⚠️  NOTE: SSO_CLIENT_ID must be set manually:"
echo "    Get the value from the existing dev environment:"
echo "    gh secret list --repo $REPO --env dev"
echo "    Then set it with:"
echo "    gh secret set SSO_CLIENT_ID --repo $REPO --env $ENV --body \"YOUR_CLIENT_ID\""
echo ""

# DATA_REGISTER_NAME_ENDPOINT and API_KEY - copy from existing dev
echo "⚠️  NOTE: DATA_REGISTER secrets must be set manually:"
echo "    Copy from existing dev environment or use these values from dev."
echo "    gh secret set DATA_REGISTER_NAME_ENDPOINT --repo $REPO --env $ENV --body \"ENDPOINT\""
echo "    gh secret set DATA_REGISTER_NAME_API_KEY --repo $REPO --env $ENV --body \"API_KEY\""
echo ""

echo ""
echo "Step 3: Setting environment variables..."
echo "-----------------------------------------"

echo "Setting ACCOUNT_ID..."
gh variable set ACCOUNT_ID \
  --repo $REPO \
  --env $ENV \
  --body "$LZA_ACCOUNT_ID"

echo "Setting AWS_REGION..."
gh variable set AWS_REGION \
  --repo $REPO \
  --env $ENV \
  --body "$LZA_AWS_REGION"

echo "Setting AR_API_STAGE..."
gh variable set AR_API_STAGE \
  --repo $REPO \
  --env $ENV \
  --body "$AR_API_STAGE"

echo "Setting TABLE_NAME_AR..."
gh variable set TABLE_NAME_AR \
  --repo $REPO \
  --env $ENV \
  --body "$TABLE_NAME_AR"

echo "Setting TABLE_NAME_CACHE_AR..."
gh variable set TABLE_NAME_CACHE_AR \
  --repo $REPO \
  --env $ENV \
  --body "$TABLE_NAME_CACHE_AR"

echo "Setting TABLE_NAME_CONFIG_AR..."
gh variable set TABLE_NAME_CONFIG_AR \
  --repo $REPO \
  --env $ENV \
  --body "$TABLE_NAME_CONFIG_AR"

echo "Setting S3_BUCKET_DATA..."
gh variable set S3_BUCKET_DATA \
  --repo $REPO \
  --env $ENV \
  --body "$S3_BUCKET_DATA"

echo "Setting SSO_ISSUER..."
gh variable set SSO_ISSUER \
  --repo $REPO \
  --env $ENV \
  --body "$SSO_ISSUER"

echo "Setting SSO_JWKSURI..."
gh variable set SSO_JWKSURI \
  --repo $REPO \
  --env $ENV \
  --body "$SSO_JWKSURI"

echo "Setting SSO_ORIGIN..."
gh variable set SSO_ORIGIN \
  --repo $REPO \
  --env $ENV \
  --body "$SSO_ORIGIN"

echo "Setting AWS_ACCOUNT_LIST..."
gh variable set AWS_ACCOUNT_LIST \
  --repo $REPO \
  --env $ENV \
  --body "$AWS_ACCOUNT_LIST"

echo ""
echo "=========================================="
echo "✅ Environment setup complete!"
echo "=========================================="
echo ""
echo "Configuration Summary:"
echo "  Account ID: $LZA_ACCOUNT_ID"
echo "  Region: $LZA_AWS_REGION"
echo "  Stage: $AR_API_STAGE"
echo "  DynamoDB Tables:"
echo "    - $TABLE_NAME_AR"
echo "    - $TABLE_NAME_CACHE_AR"
echo "    - $TABLE_NAME_CONFIG_AR"
echo "  S3 Bucket: $S3_BUCKET_DATA"
echo ""
echo "⚠️  MANUAL STEPS REQUIRED:"
echo "1. Set SSO_CLIENT_ID secret (copy from existing dev environment)"
echo "2. Set DATA_REGISTER_NAME_ENDPOINT secret"
echo "3. Set DATA_REGISTER_NAME_API_KEY secret"
echo ""
echo "To view current configuration:"
echo "  gh secret list --repo $REPO --env $ENV"
echo "  gh variable list --repo $REPO --env $ENV"
echo ""
