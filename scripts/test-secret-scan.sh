#!/usr/bin/env bash
# Focused tests for secret_scan() in scripts/deploy-production.sh.
# Extracts the real function, runs it against throwaway git repos, and checks
# that env-var references are ignored while hardcoded secrets are still caught.
# Fake secrets are assembled at runtime so this file never trips the scanner itself.
# Usage: bash scripts/test-secret-scan.sh
set -u
SCRIPT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-production.sh}"  # optional: path to another copy of the script
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0; FAIL=0

awk '/^secret_scan\(\) \{/{p=1} p{print} p&&/^\}/{exit}' "$SCRIPT" > "$WORK/fn.sh"
[ -s "$WORK/fn.sh" ] || { echo "could not extract secret_scan from $SCRIPT"; exit 2; }

K1="API_"; K2="KEY"; KEY="$K1$K2"          # API_KEY
PW1="SMTP_"; PW2="PASSWORD"; PW="$PW1$PW2" # SMTP_PASSWORD
VAL="abcdefghij0123456789xyz"              # looks like a real secret value
PK="-----BEGIN RSA PRIVATE ""KEY-----"
TOK="ghp_""$(printf 'a%.0s' $(seq 1 36))"

# scan "<file content>" -> prints "clean" or "flagged"
scan() {
  local d="$WORK/repo"; rm -rf "$d"; mkdir -p "$d"
  ( cd "$d" && git init -q && git config user.email t@t && git config user.name t && git config core.autocrlf false \
    && printf '%s\n' "$1" > app.js && git add app.js && git commit -q -m t
    ok() { :; }; fail() { echo "$*"; }
    # shellcheck disable=SC1091
    . "$WORK/fn.sh"
    out="$(secret_scan 2>&1)"
    case "$out" in *"possible secrets"*) echo flagged ;; *) echo clean ;; esac )
}

expect() { # name expected content
  local got; got="$(scan "$3")"
  if [ "$got" = "$2" ]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1 (expected $2, got $got)"; fi
}

echo "== env-var references are not secrets"
expect "ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || ''" clean "x({ ANTHROPIC_$KEY: process.env.ANTHROPIC_$KEY || '' });"
expect "assignment from process.env"                              clean "const $KEY = process.env.MY_SERVICE_$KEY;"
expect "quoted process.env reference"                             clean "$KEY: \"process.env.MY_SERVICE_$KEY\""
expect "$PW read from process.env"                                clean "$PW = process.env.$PW"

echo "== hardcoded secrets are still caught"
expect "hardcoded $KEY (colon, quoted)"        flagged "x({ $KEY: '$VAL' });"
expect "hardcoded $KEY (equals, unquoted)"     flagged "$KEY=$VAL"
expect "hardcoded $PW"                         flagged "$PW = \"$VAL\""
expect "private key header"                    flagged "$PK"
expect "GitHub token"                          flagged "const t = '$TOK';"
expect "value merely starting with 'process'"  flagged "$KEY: 'processor$VAL'"

echo "== a reference does not hide a real secret on the same line"
expect "env reference followed by hardcoded value" flagged "x({ A_$KEY: process.env.A_$KEY, B_$KEY: '$VAL' });"

echo
echo "SECRET SCAN TESTS: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
