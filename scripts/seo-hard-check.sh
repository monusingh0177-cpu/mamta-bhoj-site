#!/usr/bin/env bash
# =============================================================================
# scripts/seo-hard-check.sh   (npm run seo:hard-check)
#
# One command for the strict SEO verification:
#   * syntax-checks every JavaScript file and both shell scripts;
#   * starts an isolated copy of the working tree on a free local port (sanitised
#     environment: no PERSIST_DIR, no SMTP; the copy has its own data/ files, so the
#     real data/ and uploads are never touched);
#   * runs scripts/seo-health-check.sh --hard against it: every route discovered from
#     the sitemap AND by crawling links, status, canonical, robots, title, description,
#     H1, schema audit, duplicate/cannibalisation heuristics, orphans, redirects, 404s,
#     hostname/HTTPS consistency, claims, headers, compression, validators, images,
#     performance smoke, IndexNow key file;
#   * stops the copy and removes it.
#
#   scripts/seo-hard-check.sh                    # check the working tree (local)
#   scripts/seo-hard-check.sh --matrix           # also print the indexability matrix
#   scripts/seo-hard-check.sh --base-url https://devmamflourishfoods.com   # check the live site (GET/HEAD only)
# Exit code 0 only when there are no failures. Warnings are printed, never hidden.
# =============================================================================
set -u -o pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BASE_URL=""; PASS_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --base-url) [ $# -ge 2 ] || { echo "ERROR: --base-url needs a value" >&2; exit 2; }; BASE_URL="$2"; shift 2 ;;
    -h|--help)  sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          PASS_ARGS+=("$1"); shift ;;
  esac
done

FAILED=0
echo "== Syntax"
while IFS= read -r f; do node --check "$f" 2>/dev/null || { echo "  FAIL JS syntax error: $f"; FAILED=1; }; done < <(git ls-files '*.js'; ls lib/*.js views/*.js routes/*.js scripts/*.js public/js/main.js 2>/dev/null | sort -u)
for f in scripts/*.sh; do bash -n "$f" || { echo "  FAIL shell syntax error: $f"; FAILED=1; }; done
[ "$FAILED" -eq 0 ] && echo "  PASS all JavaScript and shell files parse"

SERVER_PID=""; TMP=""
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null; case "$TMP" in "${TMPDIR:-/tmp}"/mamta-hard-*) rm -rf "$TMP" ;; esac; }
trap cleanup EXIT

if [ -z "$BASE_URL" ]; then
  [ -d node_modules ] || { echo "ERROR: node_modules not found; run 'npm ci' first" >&2; exit 2; }
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/mamta-hard-XXXXXX")"
  tar --exclude=node_modules --exclude=.git -cf - . | tar -xf - -C "$TMP"
  ln -s "$REPO_ROOT/node_modules" "$TMP/node_modules"
  PORT="$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
  ( cd "$TMP" && exec env -u PERSIST_DIR -u FORCE_HTTPS -u SMTP_HOST -u SMTP_PORT -u SMTP_SECURE -u SMTP_USER -u SMTP_PASSWORD -u ENQUIRY_TO_EMAIL PORT="$PORT" node server.js >"$TMP/server.log" 2>&1 ) &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/robots.txt" && break; kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.25; done
  curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/robots.txt" || { echo "ERROR: the local copy did not start:"; tail -5 "$TMP/server.log"; exit 2; }
  BASE_URL="http://127.0.0.1:$PORT"
  echo "== Local copy of the working tree running on $BASE_URL (isolated data/, sanitised environment)"
else
  echo "== Checking $BASE_URL (read-only GET/HEAD requests)"
fi

HC_REPO_ROOT="$REPO_ROOT" bash scripts/seo-health-check.sh --base-url "$BASE_URL" --hard ${PASS_ARGS[@]+"${PASS_ARGS[@]}"}
RC=$?
[ "$FAILED" -eq 0 ] && [ "$RC" -eq 0 ] && { echo; echo "SEO HARD CHECK: PASS"; exit 0; }
echo; echo "SEO HARD CHECK: FAIL"; exit 1
