#!/bin/bash

##############################################################################
# deploy-lza-dev-complete.sh
#
# Master automation script for deploying bcparks-ar-api to lza-dev
# This script orchestrates the entire deployment process via GitHub Actions
#
# Prerequisites:
# - GitHub CLI installed and authenticated (gh auth login)
# - setup-lza-api-dev-environment.sh has been run successfully
# - SSO_CLIENT_ID and DATA_REGISTER secrets manually set in GitHub
# - AWS SSO configured for lza account (059942063916)
#
# Usage:
#   ./deploy-lza-dev-complete.sh
##############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# GitHub repository
REPO="bcgov/bcparks-ar-api"
WORKFLOW_FILE="lza-deploy-api-dev.yaml"
ENVIRONMENT="lza-dev"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}BC Parks A&R API - LZA Dev Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}ERROR: GitHub CLI (gh) is not installed${NC}"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated with GitHub
if ! gh auth status &> /dev/null; then
    echo -e "${RED}ERROR: Not authenticated with GitHub${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Check if AWS SSO is configured
if ! aws sts get-caller-identity --profile 059942063916_BCGOV_LZA_Admin &> /dev/null; then
    echo -e "${RED}ERROR: AWS SSO not configured for lza account${NC}"
    echo "Run: aws sso login --profile 059942063916_BCGOV_LZA_Admin"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Verify GitHub environment exists
echo -e "${YELLOW}Verifying GitHub environment '${ENVIRONMENT}'...${NC}"
if ! gh api repos/${REPO}/environments/${ENVIRONMENT} &> /dev/null; then
    echo -e "${RED}ERROR: GitHub environment '${ENVIRONMENT}' does not exist${NC}"
    echo "Run: ./setup-lza-api-dev-environment.sh"
    exit 1
fi
echo -e "${GREEN}✓ Environment '${ENVIRONMENT}' exists${NC}"
echo ""

# Verify required secrets are set
echo -e "${YELLOW}Verifying required secrets...${NC}"
MISSING_SECRETS=()

# Check for SSO_CLIENT_ID
if ! gh api repos/${REPO}/environments/${ENVIRONMENT}/secrets/SSO_CLIENT_ID &> /dev/null; then
    MISSING_SECRETS+=("SSO_CLIENT_ID")
fi

# Check for DATA_REGISTER
if ! gh secret list -R ${REPO} | grep -q "DATA_REGISTER"; then
    MISSING_SECRETS+=("DATA_REGISTER")
fi

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo -e "${RED}ERROR: Missing required secrets:${NC}"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo -e "${RED}  - ${secret}${NC}"
    done
    echo ""
    echo "Set secrets manually:"
    echo "  gh secret set SSO_CLIENT_ID -R ${REPO} --env ${ENVIRONMENT}"
    echo "  gh secret set DATA_REGISTER -R ${REPO}"
    exit 1
fi

echo -e "${GREEN}✓ Required secrets are configured${NC}"
echo ""

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${BLUE}Current branch: ${CURRENT_BRANCH}${NC}"
echo ""

# Check if there are uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}WARNING: You have uncommitted changes${NC}"
    echo -e "${YELLOW}It's recommended to commit and push changes before deploying${NC}"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled"
        exit 1
    fi
fi

# Confirm deployment
echo -e "${YELLOW}This will trigger deployment to LZA Dev environment${NC}"
echo -e "${YELLOW}Account: 059942063916 (BCGOV_LZA_Admin)${NC}"
echo -e "${YELLOW}Tables: ParksAr-lza-dev, NameCacheAr-lza-dev, ConfigAr-lza-dev${NC}"
echo ""
read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Trigger GitHub Actions workflow
echo -e "${BLUE}Triggering GitHub Actions workflow...${NC}"
gh workflow run ${WORKFLOW_FILE} \
    --repo ${REPO} \
    --ref ${CURRENT_BRANCH}

echo -e "${GREEN}✓ Workflow triggered successfully${NC}"
echo ""

# Wait a moment for the run to appear
echo -e "${YELLOW}Waiting for workflow run to start...${NC}"
sleep 5

# Get the latest workflow run
RUN_ID=$(gh run list \
    --repo ${REPO} \
    --workflow ${WORKFLOW_FILE} \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId')

if [ -z "$RUN_ID" ]; then
    echo -e "${RED}WARNING: Could not get workflow run ID${NC}"
    echo "Monitor manually at: https://github.com/${REPO}/actions"
    exit 0
fi

echo -e "${BLUE}Workflow run ID: ${RUN_ID}${NC}"
echo -e "${BLUE}Monitoring deployment...${NC}"
echo ""

# Watch the workflow run
gh run watch ${RUN_ID} --repo ${REPO} --exit-status

# Check if deployment succeeded
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Run database migration:"
    echo "   ./copy-ar-data-to-lza-dev.sh"
    echo ""
    echo "2. Get API Gateway ID for admin deployment:"
    echo "   aws apigateway get-rest-apis --profile 059942063916_BCGOV_LZA_Admin --query 'items[?name==\`bc-parks-ar-api-lza-dev\`].id' --output text"
    echo ""
    echo "3. Deploy admin application with AR_API_ID"
    echo ""
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}✗ Deployment failed${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Check logs at:${NC}"
    echo "https://github.com/${REPO}/actions/runs/${RUN_ID}"
    exit 1
fi
