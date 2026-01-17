#!/usr/bin/env bash
# Phase 1 Test Runner
# Usage: ./run-tests.sh [--watch] [--fail-fast] [test-file-pattern]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default flags
WATCH_FLAG=""
FAIL_FAST_FLAG=""
TEST_PATTERN="__tests__/phase1/"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --watch)
      WATCH_FLAG="--watch"
      shift
      ;;
    --fail-fast)
      FAIL_FAST_FLAG="--fail-fast"
      shift
      ;;
    *)
      TEST_PATTERN="$1"
      shift
      ;;
  esac
done

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   Phase 1 Tests: Blockers              ║${NC}"
echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo ""

# Check environment variables
if [ -z "$SUPABASE_URL" ]; then
  echo -e "${RED}Error: SUPABASE_URL not set${NC}"
  echo "Set it with: export SUPABASE_URL='your_url'"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo -e "${RED}Error: SUPABASE_SERVICE_ROLE_KEY not set${NC}"
  echo "Set it with: export SUPABASE_SERVICE_ROLE_KEY='your_key'"
  exit 1
fi

echo -e "${GREEN}✓ Environment configured${NC}"
echo ""

# Run tests
echo -e "${YELLOW}Running tests: ${TEST_PATTERN}${NC}"
echo ""

deno test \
  $WATCH_FLAG \
  $FAIL_FAST_FLAG \
  --allow-net \
  --allow-env \
  "$TEST_PATTERN"

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   ✓ All Phase 1 Tests Passed          ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
else
  echo -e "${RED}╔════════════════════════════════════════╗${NC}"
  echo -e "${RED}║   ✗ Phase 1 Tests Failed               ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════╝${NC}"
fi

exit $EXIT_CODE
