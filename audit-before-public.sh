#!/bin/bash
# LangBistro — pre-open-source audit script
# Run from the repo root: bash audit-before-public.sh

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS++)); }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; ((WARN++)); }
fail() { echo -e "${RED}✗${NC} $1"; ((FAIL++)); }

echo -e "\n${BOLD}=== LangBistro Pre-Public Audit ===${NC}\n"

# ── 1. .gitignore checks ──────────────────────────────────────────────────────
echo -e "${BOLD}[ .gitignore ]${NC}"

if [ ! -f .gitignore ]; then
  fail ".gitignore not found"
else
  for pattern in ".env" ".env.local" ".env.*.local" "*.pem" "*.key"; do
    if grep -q "$pattern" .gitignore 2>/dev/null; then
      pass ".gitignore covers $pattern"
    else
      warn ".gitignore missing: $pattern"
    fi
  done
fi

# ── 2. .env files committed right now ────────────────────────────────────────
echo -e "\n${BOLD}[ Committed .env files in working tree ]${NC}"
ENV_FILES=$(git ls-files | grep -E '\.env$|\.env\.')
if [ -z "$ENV_FILES" ]; then
  pass "No .env files tracked by git"
else
  fail "These .env files ARE tracked by git — remove them!"
  echo "$ENV_FILES" | sed 's/^/    /'
fi

# ── 3. .env files ever committed in history ───────────────────────────────────
echo -e "\n${BOLD}[ .env files in git history ]${NC}"
HIST_ENV=$(git log --all --full-history --name-only --format="" -- "*.env" ".env.*" 2>/dev/null | sort -u | grep -v '^$')
if [ -z "$HIST_ENV" ]; then
  pass "No .env files found in git history"
else
  fail ".env files exist in git history — scrub with git-filter-repo before going public:"
  echo "$HIST_ENV" | sed 's/^/    /'
fi

# ── 4. Secret patterns in history (all commits) ───────────────────────────────
echo -e "\n${BOLD}[ Secret patterns in git history ]${NC}"

check_pattern_in_history() {
  local label="$1"
  local pattern="$2"
  local result
  result=$(git log --all -p 2>/dev/null | grep -E "$pattern" | grep -v "^---" | head -3)
  if [ -n "$result" ]; then
    fail "Possible $label found in history:"
    echo "$result" | sed 's/^/    /'
  else
    pass "No $label pattern in history"
  fi
}

check_pattern_in_history "OpenAI key"         "sk-[a-zA-Z0-9]{20,}"
check_pattern_in_history "Supabase JWT"       "eyJhbGciOiJIUzI1NiJ9\.[a-zA-Z0-9_-]+"
check_pattern_in_history "Telegram bot token" "[0-9]{8,10}:[a-zA-Z0-9_-]{35}"
check_pattern_in_history "Paddle key"         "(pdl_|sk_live_|vendor_auth_code)[a-zA-Z0-9]+"
check_pattern_in_history "Railway token"      "railway[_-][a-zA-Z0-9]{20,}"
check_pattern_in_history "Generic secret"     "(password|secret|token|api_key)\s*[:=]\s*['\"][^'\"]{8,}"

# ── 5. Secret patterns in current files ───────────────────────────────────────
echo -e "\n${BOLD}[ Secret patterns in current files ]${NC}"

check_pattern_in_files() {
  local label="$1"
  local pattern="$2"
  local result
  result=$(grep -rE "$pattern" --include="*.ts" --include="*.js" --include="*.json" \
    --exclude-dir=node_modules --exclude-dir=.git -l 2>/dev/null)
  if [ -n "$result" ]; then
    fail "Possible hardcoded $label in:"
    echo "$result" | sed 's/^/    /'
  else
    pass "No hardcoded $label found in source files"
  fi
}

check_pattern_in_files "OpenAI key"         "sk-[a-zA-Z0-9]{20,}"
check_pattern_in_files "Supabase JWT"       "eyJhbGciOiJIUzI1NiJ9\.[a-zA-Z0-9_-]+"
check_pattern_in_files "Telegram bot token" "[0-9]{8,10}:[a-zA-Z0-9_-]{35}"
check_pattern_in_files "Paddle key"         "(pdl_|sk_live_|vendor_auth_code)"

# ── 6. Personal identifiers ───────────────────────────────────────────────────
echo -e "\n${BOLD}[ Personal identifiers in source files ]${NC}"

# Email addresses (excluding common placeholder/example ones)
EMAILS=$(grep -rE "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" \
  --include="*.ts" --include="*.js" --include="*.json" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.git \
  2>/dev/null | grep -v "example\.com\|test@\|your@\|user@\|email@")
if [ -n "$EMAILS" ]; then
  warn "Real email addresses found — verify these are intentional:"
  echo "$EMAILS" | sed 's/^/    /' | head -10
else
  pass "No personal email addresses found in source"
fi

# Phone numbers
PHONES=$(grep -rE "(\+?[0-9]{1,3}[-. ]?)?\(?[0-9]{3}\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}" \
  --include="*.ts" --include="*.js" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.git \
  2>/dev/null)
if [ -n "$PHONES" ]; then
  warn "Possible phone numbers found — review:"
  echo "$PHONES" | sed 's/^/    /' | head -5
else
  pass "No phone numbers found"
fi

# ── 7. .env.example present ───────────────────────────────────────────────────
echo -e "\n${BOLD}[ .env.example ]${NC}"
if [ -f ".env.example" ]; then
  pass ".env.example exists (good for contributors)"
else
  warn ".env.example missing — create one with dummy values so contributors know what vars are needed"
fi

# ── 8. Summary ────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}=== Summary ===${NC}"
echo -e "${GREEN}Passed:${NC}   $PASS"
echo -e "${YELLOW}Warnings:${NC} $WARN"
echo -e "${RED}Failures:${NC} $FAIL"

if [ $FAIL -gt 0 ]; then
  echo -e "\n${RED}${BOLD}NOT safe to go public yet.${NC} Fix all failures above first."
  echo -e "If secrets exist in git history, run: ${BOLD}pip install git-filter-repo${NC}"
  echo -e "Then: ${BOLD}git filter-repo --path .env --invert-paths${NC}"
  exit 1
elif [ $WARN -gt 0 ]; then
  echo -e "\n${YELLOW}${BOLD}Review warnings before going public.${NC} No hard blockers found."
  exit 0
else
  echo -e "\n${GREEN}${BOLD}Looks clean — safe to make the repo public.${NC}"
  exit 0
fi
