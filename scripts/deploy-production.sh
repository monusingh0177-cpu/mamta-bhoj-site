#!/usr/bin/env bash
# =============================================================================
# scripts/deploy-production.sh  -  safe, guarded deployment for Mamta Bhoj
#
# Deploys the commit that is checked out locally (it must already be pushed to
# origin) to a server that runs the site from a git checkout, then verifies the
# live site with scripts/seo-health-check.sh.
#
# SAFETY MODEL
#   * --dry-run executes NOTHING on the server and changes nothing locally. It
#     runs the local pre-flight checks and prints the exact remote commands.
#   * Every pre-flight check must pass before the first remote command runs.
#   * On the server it only ever does: backup -> git fetch -> verify -> a
#     fast-forward `git merge --ff-only` -> (npm ci if package files changed)
#     -> restart. It NEVER runs `git reset --hard`, `git clean`, `rm -rf`,
#     rsync --delete, or anything that touches data/, public/uploads/, .env,
#     the mailer or admin/auth code.
#   * A deploy that would change protected paths (data/, public/uploads/, .env*,
#     mailer, admin/auth, session, store) is refused unless you pass
#     --allow-protected-changes.
#   * Server-side local edits to data/ (admin panel changes) are preserved:
#     the merge is refused by git if it would touch them.
#
# TRUST MODEL
#   * DEPLOY_RESTART_CMD and DEPLOY_SSH are TRUSTED OPERATOR INPUT: they are
#     deliberately executed as given (the restart command on the server, the
#     ssh command locally). Only ever take them from your own environment or
#     your own ~/.config/mamta-bhoj/deploy.env. Everything else (host, user,
#     paths, branch, SHAs, URLs) is validated and shell-quoted before use.
#   * Never run this script with `set -x` / `bash -x`: it refuses to start.
#
# Needs: bash, git, node >= 18, curl, and (real deploys) ssh. Works with the
# bash 3.2 that ships with macOS.
# See README section 7 for configuration and examples.
# =============================================================================
set -u -o pipefail
umask 077   # logs, temp files and anything created below are private (mode 600/700)
case "$-" in *x*) echo "ERROR: refusing to run with xtrace (set -x) enabled: it would print secrets." >&2; exit 2 ;; esac

SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null || true)"

# ------------------------------- defaults -------------------------------------
DRY_RUN=0
ASSUME_YES=0
BRANCH="main"
ALLOW_NON_MAIN=0
ALLOW_PROTECTED=0
SKIP_LOCAL_TESTS=0
SKIP_POST_CHECK=0
BASE_REF=""
ROLLBACK_SHA=""
CONFIG_FILE=""
HEALTH_URL_OVERRIDE=""
CONFIG_FROM_ARG=0
BYPASSED=""
RESTART_SENSITIVE=0
RESTART_Q=""
TEE_PID=""

# Paths a deployment must not change without an explicit override (regex on git paths).
PROTECTED_RE='^(data/|public/uploads/|\.env|lib/(mailer|auth|session|persist-paths|store|admin)[^/]*\.js$|middleware/|routes/admin[^/]*\.js$|views/admin[^/]*\.js$|public/(js|css)/admin\.(js|css)$)'
# Server-side local modifications are tolerated only here (admin edits / uploads).
SERVER_DATA_RE='^(data/|public/uploads/)'

CONFIG_KEYS="DEPLOY_HOST DEPLOY_USER DEPLOY_PORT DEPLOY_PATH DEPLOY_RESTART_CMD DEPLOY_RESTART_SHELL DEPLOY_DIAG_CMD DEPLOY_SSH DEPLOY_BACKUP_DIR DEPLOY_PERSIST_DIR DEPLOY_REMOTE_GIT_REMOTE DEPLOY_HEALTH_URL DEPLOY_NPM DEPLOY_WAIT_SECONDS DEPLOY_NODE_MODULES"

FAILS=0
WARNS=0
PRE_FAILS=0
SMOKE_PID=""
TEMP_DIRS=()
LOG_FILE="${TMPDIR:-/tmp}/mamta-deploy-$(date +%Y%m%d-%H%M%S)-$$.log"

COLOR=0
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then COLOR=1; fi

usage() {
  cat <<'EOF'
Usage: scripts/deploy-production.sh [options]

Safe deployment of the currently checked-out, already-pushed commit.

  --dry-run                 Run the local pre-flight checks and PRINT every
                            remote command; execute nothing on the server.
  --yes                     Do not ask for interactive confirmation.
  --branch NAME             Branch to deploy (default: main). Deploying any
                            other branch also needs --allow-non-main.
  --allow-non-main          Permit deploying a branch other than main.
  --base REF                Preview the protected-path guard locally against REF
                            (e.g. the commit currently live).
  --allow-protected-changes Permit a deploy OR rollback that changes protected
                            paths (data/, uploads, .env, mailer, admin/auth ...).
                            Loudly reported; the guard runs on the server too.
  --skip-local-tests        Skip the isolated local smoke test. BYPASSES a safety
                            validation (loudly reported; not advised).
  --skip-post-check         Skip the post-deploy live SEO check. BYPASSES a safety
                            validation (loudly reported; not advised).
  --health-url URL          Site to verify after deploying
                            (default: DEPLOY_HEALTH_URL or https://devmamflourishfoods.com).
  --rollback SHA            Roll the server back to SHA (git reset --keep), run
                            npm ci if package files differ, restart and verify.
                            Refused if it would alter protected paths.
                            Combine with --dry-run first.
  --config FILE             Config file (default: $DEPLOY_CONFIG or
                            ~/.config/mamta-bhoj/deploy.env). KEY=VALUE lines only.
  -h, --help                Show this help.

Configuration (environment variables, or KEY=VALUE lines in the config file;
environment wins). Nothing here is ever stored in the repository:
  DEPLOY_HOST               server host name or IP (letters, digits . - :)  (required)
  DEPLOY_USER               ssh user                                        (required)
  DEPLOY_PATH               app directory on the server (a git checkout)
                            (default: /var/www/mamta-bhoj-site)
  DEPLOY_RESTART_CMD        TRUSTED OPERATOR INPUT, run as-is on the server
                            (default: pm2 restart mamta-bhoj). Do not put
                            secrets in it: it is shown in the output and log
                            (hidden if it looks sensitive).
  DEPLOY_RESTART_SHELL      login (default: bash -lc, so PATH from the login
                            profile is available for pm2) | plain (bash -c)
  DEPLOY_DIAG_CMD           optional read-only command run on the server when
                            the live check fails (default for pm2: describe + 20
                            error-log lines)
  DEPLOY_PORT               ssh port (default 22)
  DEPLOY_SSH                full ssh command override (TRUSTED; simple words only)
  DEPLOY_BACKUP_DIR         absolute server directory for backups, outside the app
                            checkout. Default: ~/mamta-bhoj-backups of the deploy
                            user (always writable). The script checks it is
                            writable BEFORE changing anything.
  DEPLOY_PERSIST_DIR        also back up this server directory (if the app
                            uses PERSIST_DIR for data/uploads)
  DEPLOY_REMOTE_GIT_REMOTE  git remote name on the server (default: origin)
  DEPLOY_HEALTH_URL         live URL to verify (default: https://devmamflourishfoods.com)
  DEPLOY_NPM                auto | always | never   (default: auto = only when
                            package.json / package-lock.json changed)
  DEPLOY_WAIT_SECONDS       pause after restart before verifying (default 5)
  DEPLOY_NODE_MODULES       node_modules used by the local smoke test
                            (default: <repo>/node_modules)

Exit codes: 0 = success (or clean dry-run), 1 = a check or step failed,
            2 = usage / configuration error.
EOF
}

# ------------------------------- logging --------------------------------------
c() { if [ "$COLOR" -eq 1 ]; then printf '\033[%sm%s\033[0m' "$1" "$2"; else printf '%s' "$2"; fi; }
info()  { printf '  %s\n' "$*"; }
step()  { printf '\n%s %s\n' "$(c '1;34' '==>')" "$(c '1' "$*")"; }
ok()    { printf '  %s %s\n' "$(c 32 'PASS')" "$*"; }
warn()  { WARNS=$((WARNS + 1)); printf '  %s %s\n' "$(c 33 'WARN')" "$*"; }
fail()  { FAILS=$((FAILS + 1)); printf '  %s %s\n' "$(c 31 'FAIL')" "$*"; }
skipm() { printf '  %s %s\n' "$(c 36 'SKIP')" "$*"; }
dry()   { printf '  %s %s\n' "$(c 35 'DRY ')" "$*"; }
die_usage() { printf 'ERROR: %s\nTry: scripts/deploy-production.sh --help\n' "$*" >&2; exit 2; }
die() { printf '\n%s %s\n' "$(c 31 'ABORT:')" "$*" >&2; exit 1; }

cleanup() {
  if [ -n "$SMOKE_PID" ]; then kill "$SMOKE_PID" 2>/dev/null; wait "$SMOKE_PID" 2>/dev/null; fi
  local d tmproot="${TMPDIR:-/tmp}"
  # only ever remove paths this script created with mktemp under the temp root
  for d in ${TEMP_DIRS[@]+"${TEMP_DIRS[@]}"}; do
    case "$d" in "$tmproot"/mamta-*|"${tmproot%/}"/mamta-*) [ -e "$d" ] && rm -rf "$d" ;; esac
  done
  # let the log writer flush its last lines before the process exits
  if [ -n "$TEE_PID" ]; then exec >&- 2>&-; wait "$TEE_PID" 2>/dev/null || sleep 0.3; fi
}
trap cleanup EXIT
trap 'echo; echo "Interrupted."; exit 130' INT TERM

# ------------------------------- arguments ------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)                 DRY_RUN=1; shift ;;
    --yes|-y)                  ASSUME_YES=1; shift ;;
    --branch)                  [ $# -ge 2 ] || die_usage "--branch needs a value"; BRANCH="$2"; shift 2 ;;
    --allow-non-main)          ALLOW_NON_MAIN=1; shift ;;
    --base)                    [ $# -ge 2 ] || die_usage "--base needs a value"; BASE_REF="$2"; shift 2 ;;
    --allow-protected-changes) ALLOW_PROTECTED=1; shift ;;
    --skip-local-tests)        SKIP_LOCAL_TESTS=1; shift ;;
    --skip-post-check)         SKIP_POST_CHECK=1; shift ;;
    --health-url)              [ $# -ge 2 ] || die_usage "--health-url needs a value"; HEALTH_URL_OVERRIDE="$2"; shift 2 ;;
    --rollback)                [ $# -ge 2 ] || die_usage "--rollback needs a commit SHA"; ROLLBACK_SHA="$2"; shift 2 ;;
    --config)                  [ $# -ge 2 ] || die_usage "--config needs a file"; CONFIG_FILE="$2"; CONFIG_FROM_ARG=1; shift 2 ;;
    -h|--help)                 usage; exit 0 ;;
    *)                         die_usage "unknown option: $1" ;;
  esac
done

[[ "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || die_usage "invalid --branch name (must start with a letter or digit): $BRANCH"
if [ -n "$ROLLBACK_SHA" ]; then [[ "$ROLLBACK_SHA" =~ ^[0-9a-fA-F]{7,40}$ ]] || die_usage "--rollback needs a 7-40 character hex commit SHA"; fi
if [ -n "$HEALTH_URL_OVERRIDE" ]; then [[ "$HEALTH_URL_OVERRIDE" =~ ^https?://[^/[:space:]]+/?$ ]] || die_usage "--health-url must look like http(s)://host[:port]"; fi
if [ -n "$BASE_REF" ]; then [[ "$BASE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]*$ ]] || die_usage "--base must be a commit/branch/tag name that does not start with '-': $BASE_REF"; fi
[ -n "$REPO_ROOT" ] || die_usage "this script must live inside the Mamta Bhoj git repository"

# Log everything (screen + file). Colours stay on only when stdout was a terminal.
( umask 077; : > "$LOG_FILE" ) && chmod 600 "$LOG_FILE" 2>/dev/null
exec > >(tee -a "$LOG_FILE") 2>&1
TEE_PID=$!

# ------------------------------- config file ----------------------------------
# KEY=VALUE only, whitelisted keys, never evaluated as shell. Environment wins.
load_config_file() {
  local f="$1" line key val q
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|\#*|[[:space:]]*\#*) continue ;; esac
    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[2]}"; val="${BASH_REMATCH[3]}"
      q="${val:0:1}"
      if [ "${#val}" -ge 2 ] && { [ "$q" = '"' ] || [ "$q" = "'" ]; } && [ "${val: -1}" = "$q" ]; then val="${val:1:${#val}-2}"; fi
      case " $CONFIG_KEYS " in
        *" $key "*) if [ -z "${!key:-}" ]; then printf -v "$key" '%s' "$val"; export "${key?}"; fi ;;
        *) warn "config: ignoring unknown key '$key'" ;;
      esac
    else
      warn "config: ignoring unparsable line (KEY=VALUE expected)"
    fi
  done < "$f"
}

step "Mamta Bhoj safe deployment  ($( [ "$DRY_RUN" -eq 1 ] && echo 'DRY RUN - nothing will be executed on the server' || echo 'REAL RUN' ))"
info "log file: $LOG_FILE (mode 600)"
if [ "$SKIP_LOCAL_TESTS" -eq 1 ]; then BYPASSED="$BYPASSED --skip-local-tests"; warn "SAFETY VALIDATION BYPASSED: --skip-local-tests means the commit is NOT smoke-tested locally before it goes to the server"; fi
if [ "$SKIP_POST_CHECK" -eq 1 ]; then BYPASSED="$BYPASSED --skip-post-check"; warn "SAFETY VALIDATION BYPASSED: --skip-post-check means the LIVE site is NOT verified after the restart"; fi
[ -z "$CONFIG_FILE" ] && CONFIG_FILE="${DEPLOY_CONFIG:-${HOME:-/nonexistent}/.config/mamta-bhoj/deploy.env}"
if [ -f "$CONFIG_FILE" ]; then
  # refuse group/world-readable config (it may name servers and restart commands)
  perm="$(stat -c '%a' "$CONFIG_FILE" 2>/dev/null || stat -f '%Lp' "$CONFIG_FILE" 2>/dev/null || echo 600)"
  if [[ "$perm" =~ ^[0-7]{3,4}$ ]] && [ $(( 8#$perm & 077 )) -ne 0 ]; then warn "config file $CONFIG_FILE is group- or world-accessible (mode $perm); run: chmod 600 $CONFIG_FILE"; fi
  load_config_file "$CONFIG_FILE"; info "config: $CONFIG_FILE"
else
  info "config: none at $CONFIG_FILE (using environment variables only)"
fi

DEPLOY_PORT="${DEPLOY_PORT:-22}"
# Mamta Bhoj production defaults (override in the environment / deploy.env)
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/mamta-bhoj-site}"
DEPLOY_RESTART_CMD="${DEPLOY_RESTART_CMD:-pm2 restart mamta-bhoj}"
DEPLOY_RESTART_SHELL="${DEPLOY_RESTART_SHELL:-login}"
DEPLOY_DIAG_CMD="${DEPLOY_DIAG_CMD:-}"
DEPLOY_REMOTE_GIT_REMOTE="${DEPLOY_REMOTE_GIT_REMOTE:-origin}"
DEPLOY_NPM="${DEPLOY_NPM:-auto}"
DEPLOY_WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-5}"
DEPLOY_HEALTH_URL="${HEALTH_URL_OVERRIDE:-${DEPLOY_HEALTH_URL:-https://devmamflourishfoods.com}}"
DEPLOY_BACKUP_DIR="${DEPLOY_BACKUP_DIR:-}"   # empty = ~/mamta-bhoj-backups of the deploy user (resolved on the server)
DEPLOY_PERSIST_DIR="${DEPLOY_PERSIST_DIR:-}"
PLACE_HOST="${DEPLOY_HOST:-<DEPLOY_HOST not set>}"; PLACE_PATH="$DEPLOY_PATH"
PLACE_RESTART="$DEPLOY_RESTART_CMD"
DISPLAY_RESTART="$PLACE_RESTART"
printf -v RESTART_Q '%q' "$PLACE_RESTART"

# ------------------------------- config validation ----------------------------
step "Configuration"
CONFIG_OK=1
need() { # name
  if [ -z "${!1:-}" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then warn "$1 is not set (required for a real deployment; shown as a placeholder below)"; else fail "$1 is not set"; fi
    CONFIG_OK=0
  else ok "$1 is set"; fi
}
need DEPLOY_HOST; need DEPLOY_USER; need DEPLOY_PATH; need DEPLOY_RESTART_CMD
# host / user end up in the ssh command line: strict patterns, never a leading '-'
if [ -n "${DEPLOY_USER:-}" ]; then [[ "$DEPLOY_USER" =~ ^[A-Za-z_][A-Za-z0-9._-]{0,31}$ ]] && ok "DEPLOY_USER format is valid" || fail "DEPLOY_USER has an unsafe format (letters, digits . _ - ; must not start with '-' or a digit)"; fi
if [ -n "${DEPLOY_HOST:-}" ]; then [[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9._:-]{0,251}[A-Za-z0-9])?$ ]] && ok "DEPLOY_HOST format is valid" || fail "DEPLOY_HOST has an unsafe format (letters, digits . - : ; must start and end with a letter or digit)"; fi
[[ "$DEPLOY_REMOTE_GIT_REMOTE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "DEPLOY_REMOTE_GIT_REMOTE has an unsafe format"
[[ "$DEPLOY_RESTART_SHELL" =~ ^(login|plain)$ ]] || fail "DEPLOY_RESTART_SHELL must be login|plain (got: $DEPLOY_RESTART_SHELL)"
if [ -n "$DEPLOY_BACKUP_DIR" ]; then
  case "$DEPLOY_BACKUP_DIR" in /*) ;; *) fail "DEPLOY_BACKUP_DIR must be an absolute path (got: $DEPLOY_BACKUP_DIR)" ;; esac
  case "${DEPLOY_BACKUP_DIR%/}/" in "${DEPLOY_PATH%/}"/*) fail "DEPLOY_BACKUP_DIR must be OUTSIDE the app checkout $DEPLOY_PATH" ;; esac
fi
if [ -n "$DEPLOY_PERSIST_DIR" ]; then case "$DEPLOY_PERSIST_DIR" in /*) ;; *) fail "DEPLOY_PERSIST_DIR must be an absolute path" ;; esac; fi
if printf '%s' "$PLACE_RESTART" | grep -qiE '(pass(word|wd)?|secret|token|api[_-]?key|credential|private[_-]?key)[A-Za-z_]*[=:[:space:]]|://[^/[:space:]]*:[^@[:space:]]*@'; then
  RESTART_SENSITIVE=1; DISPLAY_RESTART="<hidden: DEPLOY_RESTART_CMD looks sensitive>"
  warn "DEPLOY_RESTART_CMD appears to contain sensitive material (password/token/key/credentials). It is hidden from output and the log; keep secrets in the server's own environment (e.g. the PM2 ecosystem file), not here."
fi
[[ "$DEPLOY_NPM" =~ ^(auto|always|never)$ ]] || fail "DEPLOY_NPM must be auto|always|never (got: $DEPLOY_NPM)"
[[ "$DEPLOY_WAIT_SECONDS" =~ ^[0-9]+$ ]] || fail "DEPLOY_WAIT_SECONDS must be a number"
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]] || fail "DEPLOY_PORT must be a number"
if [ -n "${DEPLOY_PATH:-}" ]; then
  case "$DEPLOY_PATH" in /*) ok "DEPLOY_PATH is absolute" ;; *) fail "DEPLOY_PATH must be an absolute path (got: $DEPLOY_PATH)" ;; esac
  case "${DEPLOY_PATH%/}" in ''|/|/home|/root|/var|/var/www|/usr|/etc|/opt) fail "DEPLOY_PATH '$DEPLOY_PATH' is too broad to be an app directory" ;; esac
fi
[[ "$DEPLOY_HEALTH_URL" =~ ^https?://[^/[:space:]]+/?$ ]] || fail "DEPLOY_HEALTH_URL must look like https://host"
info "target     : ${DEPLOY_USER:-<DEPLOY_USER not set>}@$PLACE_HOST:$PLACE_PATH (branch $BRANCH)"
info "restart    : $DISPLAY_RESTART  (via ${DEPLOY_RESTART_SHELL} shell; trusted operator input)"
info "backup dir : ${DEPLOY_BACKUP_DIR:-~/mamta-bhoj-backups of ${DEPLOY_USER:-<DEPLOY_USER not set>} on the server (default)}"
info "verify URL : $DEPLOY_HEALTH_URL"

# ssh command (array). A DEPLOY_SSH override is split on whitespace.
SSH_CMD=()
if [ -n "${DEPLOY_SSH:-}" ]; then
  read -r -a SSH_CMD <<< "$DEPLOY_SSH"
else
  SSH_CMD=(ssh -o BatchMode=yes -o ConnectTimeout=10 -p "$DEPLOY_PORT" -- "${DEPLOY_USER:-USER}@${DEPLOY_HOST:-HOST}")
fi

# =============================================================================
# LOCAL PRE-FLIGHT (read-only)
# =============================================================================
with_timeout() { # seconds cmd...
  local s="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$s" "$@"; else "$@"; fi
}

preflight() {
  step "Local pre-flight checks (read-only)"
  cd "$REPO_ROOT" || die "cannot enter $REPO_ROOT"
  local cur status remote_sha head_sha

  for t in git node curl; do command -v "$t" >/dev/null 2>&1 && ok "$t is installed" || fail "$t is required but not installed"; done
  if [ "$DRY_RUN" -eq 0 ] && [ -z "${DEPLOY_SSH:-}" ]; then command -v ssh >/dev/null 2>&1 && ok "ssh is installed" || fail "ssh is required for a real deployment"; fi

  cur="$(git symbolic-ref --short -q HEAD || true)"
  head_sha="$(git rev-parse HEAD 2>/dev/null || true)"
  TARGET_SHA="$head_sha"
  if [ -z "$cur" ]; then fail "HEAD is detached; check out '$BRANCH' first"
  elif [ "$cur" != "$BRANCH" ]; then fail "current branch is '$cur' but the deploy branch is '$BRANCH' (check out $BRANCH, or use --branch)"
  else ok "on branch $BRANCH"; fi
  if [ "$BRANCH" != "main" ]; then
    if [ "$ALLOW_NON_MAIN" -eq 1 ]; then warn "deploying non-main branch '$BRANCH' (--allow-non-main)"; else fail "'$BRANCH' is not main; production deploys come from main (override: --allow-non-main)"; fi
  fi

  status="$(git status --porcelain 2>/dev/null)"
  if [ -z "$status" ]; then ok "working tree is clean (no uncommitted or untracked files)"
  else fail "working tree is not clean:"; printf '%s\n' "$status" | head -10 | sed 's/^/        /'; fi

  remote_sha="$(GIT_TERMINAL_PROMPT=0 with_timeout 30 git ls-remote --heads origin "refs/heads/$BRANCH" 2>/dev/null | awk '{print $1}' | head -1)"
  if [ -z "$remote_sha" ]; then fail "could not read origin/$BRANCH (network problem, or the branch is not pushed)"
  elif [ "$remote_sha" = "$head_sha" ]; then ok "local HEAD ${head_sha:0:10} == origin/$BRANCH (pushed)"
  elif git merge-base --is-ancestor "$remote_sha" "$head_sha" 2>/dev/null; then fail "local HEAD has commits not pushed to origin/$BRANCH; push first"
  else fail "local HEAD ${head_sha:0:10} differs from origin/$BRANCH ${remote_sha:0:10}; pull/push first"; fi
  info "commit to deploy: ${head_sha:0:10} - $(git log -1 --format=%s 2>/dev/null)"

  # syntax: every tracked JS file + the two scripts
  local jsfail=0 f
  while IFS= read -r f; do [ -n "$f" ] && ! node --check "$f" 2>/dev/null && { fail "JS syntax error in $f"; jsfail=1; }; done < <(git ls-files '*.js')
  [ "$jsfail" -eq 0 ] && ok "all tracked JS files pass node --check"
  for f in scripts/deploy-production.sh scripts/seo-health-check.sh; do
    if [ -f "$f" ]; then bash -n "$f" 2>/dev/null && ok "bash -n $f" || fail "shell syntax error in $f"; fi
  done

  secret_scan
  protected_preview
}

secret_scan() {
  local hits names
  # high-signal patterns only (private keys, cloud/API tokens, assigned secrets with a real-looking value)
  local rx='-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{32,}|(SMTP_PASSWORD|SMTP_PASS|API_KEY|SECRET_KEY|ACCESS_TOKEN|AUTH_TOKEN)[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9/+_.@-]{12,}'
  hits="$(git grep -I -n -E -e "$rx" HEAD -- . 2>/dev/null | head -5)"
  if [ -z "$hits" ]; then ok "secret scan: no private keys, tokens or assigned secrets in tracked files"
  else fail "secret scan: possible secrets in tracked files (values hidden):"; printf '%s\n' "$hits" | sed -E 's/^(HEAD:[^:]+:[0-9]+:).*/        \1 <redacted>/'; fi
  names="$(git ls-files | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|(^|/)id_(rsa|ed25519)|(^|/)data/(enquiries|newsletter)\.json$' || true)"
  if [ -z "$names" ]; then ok "secret scan: no .env / key / PII data files are tracked"
  else fail "tracked files that must never be committed:"; printf '%s\n' "$names" | sed 's/^/        /'; fi
  git ls-files --error-unmatch data/admin.json >/dev/null 2>&1 && warn "data/admin.json (admin password HASH) is tracked in git; rotate the admin password and consider untracking it"
}

protected_preview() {
  if [ -n "$BASE_REF" ]; then
    if ! git rev-parse --verify -q "$BASE_REF^{commit}" >/dev/null; then fail "--base $BASE_REF is not a known commit"; return; fi
    local changed prot
    changed="$(git diff --name-only "$BASE_REF" HEAD --)"
    prot="$(printf '%s\n' "$changed" | grep -E "$PROTECTED_RE" || true)"
    info "files changed vs $BASE_REF: $(printf '%s\n' "$changed" | grep -c . || true)"
    if [ -z "$prot" ]; then ok "protected-path guard: no protected files change vs $BASE_REF"
    elif [ "$ALLOW_PROTECTED" -eq 1 ]; then warn "protected files change vs $BASE_REF (allowed by --allow-protected-changes):"; printf '%s\n' "$prot" | sed 's/^/        /'
    else fail "protected-path guard: this deploy would change protected files vs $BASE_REF:"; printf '%s\n' "$prot" | sed 's/^/        /'; info "(override only if intended: --allow-protected-changes)"; fi
  else
    skipm "protected-path guard preview: pass --base <live-commit> to preview it locally (the authoritative check runs on the server against the commit that is really live)"
  fi
}

# Isolated local smoke test: exports HEAD to a temp dir, runs it on a free port
# with a sanitised environment (no PERSIST_DIR / SMTP), runs the SEO health
# check against it, stops it. Nothing in the repo or any real data is touched.
local_smoke_test() {
  step "Local smoke test of the commit being deployed (isolated temp copy)"
  if [ "$SKIP_LOCAL_TESTS" -eq 1 ]; then skipm "BYPASSED: local smoke test NOT run (--skip-local-tests)"; return; fi
  [ -n "${TARGET_SHA:-}" ] || { fail "no commit to test"; return; }
  local tmp nm port out rc i up=0
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/mamta-deploy-smoke.XXXXXX")" || { fail "cannot create temp dir"; return; }
  TEMP_DIRS+=("$tmp")
  git -C "$REPO_ROOT" archive "$TARGET_SHA" | tar -x -C "$tmp" || { fail "git archive failed"; return; }
  nm="${DEPLOY_NODE_MODULES:-$REPO_ROOT/node_modules}"
  if [ ! -d "$nm" ]; then fail "node_modules not found at $nm (run 'npm ci' first, or set DEPLOY_NODE_MODULES)"; return; fi
  ln -s "$nm" "$tmp/node_modules"
  port="$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
  ( cd "$tmp" && exec env -u PERSIST_DIR -u FORCE_HTTPS -u SMTP_HOST -u SMTP_PORT -u SMTP_SECURE -u SMTP_USER -u SMTP_PASSWORD -u ENQUIRY_TO_EMAIL PORT="$port" node server.js >"$tmp/server.log" 2>&1 ) &
  SMOKE_PID=$!
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if curl -s -o /dev/null -m 2 "http://127.0.0.1:$port/robots.txt"; then up=1; break; fi
    kill -0 "$SMOKE_PID" 2>/dev/null || break
    sleep 0.5
  done
  if [ "$up" -ne 1 ]; then fail "local copy did not start; server log:"; tail -5 "$tmp/server.log" | sed 's/^/        /'; return; fi
  ok "local copy of ${TARGET_SHA:0:10} started on 127.0.0.1:$port"
  local checker="$tmp/scripts/seo-health-check.sh"; [ -x "$checker" ] || checker="$SCRIPT_DIR/seo-health-check.sh"
  out="$tmp/smoke-seo.txt"
  bash "$checker" --base-url "http://127.0.0.1:$port" --no-color --skip-links >"$out" 2>&1; rc=$?
  kill "$SMOKE_PID" 2>/dev/null; wait "$SMOKE_PID" 2>/dev/null; SMOKE_PID=""
  if [ "$rc" -eq 0 ]; then ok "SEO health check on the local copy: $(grep '^RESULT' "$out" | head -1)"
  else fail "SEO health check on the local copy failed (exit $rc):"; grep -E '^  FAIL|^RESULT|^ERROR' "$out" | head -12 | sed 's/^/        /'; fi
}

# =============================================================================
# REMOTE HELPERS
# =============================================================================
REMOTE_OUT=""
remote_run() { # label script
  local label="$1" script="$2" rc
  if [ "$DRY_RUN" -eq 1 ]; then
    local shown="$script"
    [ "$RESTART_SENSITIVE" -eq 1 ] && shown="${shown//"$RESTART_Q"/<hidden: DEPLOY_RESTART_CMD>}"
    dry "would run on $PLACE_HOST ($label):"; printf '%s\n' "$shown" | sed 's/^/        | /'; REMOTE_OUT=""; return 0
  fi
  info "remote: $label"
  REMOTE_OUT="$(printf '%s\n' "$script" | "${SSH_CMD[@]}" bash -s 2>&1)"; rc=$?
  [ -n "$REMOTE_OUT" ] && printf '%s\n' "$REMOTE_OUT" | redact | sed 's/^/        | /'
  return $rc
}
redact() { sed -E 's/((PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|AUTHORIZATION|password|passwd|secret|token|api_?key|authorization)[A-Za-z_]*[=:][ ]*)[^ ]+/\1<redacted>/g'; }
kv() { printf '%s\n' "$REMOTE_OUT" | sed -n "s/^$1=//p" | head -1; }
block() { printf '%s\n' "$REMOTE_OUT" | sed -n "/^$1_BEGIN\$/,/^$1_END\$/p" | sed '1d;$d'; }

remote_inspect_script() {
  printf 'set -euo pipefail\nAPP=%q\nMODE=%q\nCMD=%q\nBK=%q\ncd "$APP"\n' "${DEPLOY_PATH:-$PLACE_PATH}" "$DEPLOY_RESTART_SHELL" "$PLACE_RESTART" "$DEPLOY_BACKUP_DIR"
  cat <<'EOF'
git rev-parse --is-inside-work-tree >/dev/null
echo "PREV_SHA=$(git rev-parse HEAD)"
echo "CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD)"
echo "MODIFIED_BEGIN"; git status --porcelain --untracked-files=no | sed 's/^...//'; echo "MODIFIED_END"
# read-only readiness checks, so a missing pm2 or an unwritable backup dir is found BEFORE anything changes
FIRST="${CMD%% *}"
if [ "$MODE" = login ]; then
  if bash -lc 'command -v "$1" >/dev/null 2>&1' _ "$FIRST"; then echo "RESTART_BIN_OK=1"; else echo "RESTART_BIN_OK=0"; fi
else
  if bash -c 'command -v "$1" >/dev/null 2>&1' _ "$FIRST"; then echo "RESTART_BIN_OK=1"; else echo "RESTART_BIN_OK=0"; fi
fi
BKR="${BK:-$HOME/mamta-bhoj-backups}"
echo "BACKUP_DIR=$BKR"
d="$BKR"; while [ ! -e "$d" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done
if [ -d "$d" ] && [ -w "$d" ]; then echo "BACKUP_WRITABLE=1"; else echo "BACKUP_WRITABLE=0"; fi
case "$BKR/" in "${APP%/}"/*) echo "BACKUP_INSIDE_APP=1" ;; *) echo "BACKUP_INSIDE_APP=0" ;; esac
EOF
}

remote_backup_script() { # prev_sha
  printf 'set -euo pipefail\numask 077\nAPP=%q\nBK=%q\nPERSIST=%q\nPREV=%q\n' "${DEPLOY_PATH:-$PLACE_PATH}" "$DEPLOY_BACKUP_DIR" "${DEPLOY_PERSIST_DIR:-}" "$1"
  cat <<'EOF'
BK="${BK:-$HOME/mamta-bhoj-backups}"
mkdir -p "$BK"
FILE="$BK/mamta-bhoj-data-$(date +%Y%m%d-%H%M%S)-${PREV:0:8}.tgz"
cd "$APP"
set --
[ -d data ] && set -- "$@" data
[ -d public/uploads ] && set -- "$@" public/uploads
if [ -n "$PERSIST" ] && [ -d "$PERSIST" ]; then
  tar -czf "$FILE" "$@" -C / "${PERSIST#/}"
else
  [ "$#" -gt 0 ] && tar -czf "$FILE" "$@" || { echo "nothing to back up"; exit 0; }
fi
tar -tzf "$FILE" >/dev/null
echo "BACKUP_FILE=$FILE"
echo "BACKUP_BYTES=$(wc -c < "$FILE" | tr -d ' ')"
EOF
}

remote_fetch_script() { # prev target
  printf 'set -euo pipefail\nAPP=%q\nGR=%q\nBR=%q\nPREV=%q\nTARGET=%q\nPROT=%q\n' "${DEPLOY_PATH:-$PLACE_PATH}" "$DEPLOY_REMOTE_GIT_REMOTE" "$BRANCH" "$1" "$2" "$PROTECTED_RE"
  cat <<'EOF'
cd "$APP"
git fetch --quiet "$GR" "$BR"
git cat-file -e "${TARGET}^{commit}" 2>/dev/null || { echo "ERR=target commit not found on the server after fetch"; exit 11; }
git merge-base --is-ancestor "$PREV" "$TARGET" || { echo "ERR=server commit is not an ancestor of the target (not a fast-forward)"; exit 12; }
CHANGED="$(git diff --name-only "$PREV" "$TARGET")"
echo "CHANGED_COUNT=$(printf '%s\n' "$CHANGED" | grep -c . || true)"
echo "PKG_CHANGED=$(printf '%s\n' "$CHANGED" | grep -c -E '^(package\.json|package-lock\.json)$' || true)"
echo "PROTECTED_BEGIN"; printf '%s\n' "$CHANGED" | grep -E "$PROT" || true; echo "PROTECTED_END"
EOF
}

remote_apply_script() { # target
  printf 'set -euo pipefail\ncd %q\ngit merge --ff-only %q\ntest "$(git rev-parse HEAD)" = %q\necho "NOW_AT=$(git rev-parse HEAD)"\n' "${DEPLOY_PATH:-$PLACE_PATH}" "$1" "$1"
}
remote_npm_script() { printf 'set -euo pipefail\ncd %q\nnpm ci --omit=dev --no-audit --no-fund\n' "${DEPLOY_PATH:-$PLACE_PATH}"; }
remote_restart_script() {
  printf 'set -euo pipefail\ncd %q\nMODE=%q\nCMD=%q\n' "${DEPLOY_PATH:-$PLACE_PATH}" "$DEPLOY_RESTART_SHELL" "$PLACE_RESTART"
  cat <<'EOF'
if [ "$MODE" = login ]; then exec bash -lc "$CMD"; else exec bash -c "$CMD"; fi
EOF
}
remote_rollback_check_script() { # sha  (read-only: same guard as a deploy, applied to HEAD -> sha)
  printf 'set -euo pipefail\nAPP=%q\nSHA=%q\nPROT=%q\n' "${DEPLOY_PATH:-$PLACE_PATH}" "$1" "$PROTECTED_RE"
  cat <<'EOF'
cd "$APP"
git cat-file -e "${SHA}^{commit}" 2>/dev/null || { echo "ERR=rollback target not found on the server"; exit 11; }
git merge-base --is-ancestor "$SHA" HEAD || { echo "ERR=rollback target is not an ancestor of the server's current commit"; exit 12; }
CHANGED="$(git diff --name-only "$SHA" HEAD --)"
echo "CHANGED_COUNT=$(printf '%s\n' "$CHANGED" | grep -c . || true)"
echo "PKG_CHANGED=$(printf '%s\n' "$CHANGED" | grep -c -E '^(package\.json|package-lock\.json)$' || true)"
echo "PROTECTED_BEGIN"; printf '%s\n' "$CHANGED" | grep -E "$PROT" || true; echo "PROTECTED_END"
EOF
}
remote_diag_script() { # read-only diagnostics after a failed live check
  local dcmd="$DEPLOY_DIAG_CMD"
  if [ -z "$dcmd" ] && [[ "$PLACE_RESTART" =~ ^(sudo[[:space:]]+)?([^[:space:]]*/)?pm2[[:space:]]+(restart|reload)[[:space:]]+([A-Za-z0-9._-]+) ]]; then
    dcmd="${BASH_REMATCH[1]}${BASH_REMATCH[2]}pm2 describe ${BASH_REMATCH[4]}; ${BASH_REMATCH[1]}${BASH_REMATCH[2]}pm2 logs ${BASH_REMATCH[4]} --err --lines 20 --nostream"
  fi
  printf 'set -uo pipefail\ncd %q\nMODE=%q\nDIAG=%q\n' "${DEPLOY_PATH:-$PLACE_PATH}" "$DEPLOY_RESTART_SHELL" "$dcmd"
  cat <<'EOF'
echo "SERVER_HEAD=$(git rev-parse HEAD 2>&1)"
echo "SERVER_STATUS_BEGIN"; git status --short --untracked-files=no 2>&1 | head -10; echo "SERVER_STATUS_END"
if [ -n "$DIAG" ]; then
  if [ "$MODE" = login ]; then bash -lc "$DIAG" 2>&1 | head -80; else bash -c "$DIAG" 2>&1 | head -80; fi
else
  echo "(no DEPLOY_DIAG_CMD set and the restart command is not a recognised pm2 restart; no app diagnostics collected)"
fi
exit 0
EOF
}
remote_reset_keep_script() { # sha
  printf 'set -euo pipefail\ncd %q\ngit cat-file -e %q^{commit}\ngit merge-base --is-ancestor %q HEAD\ngit reset --keep %q\necho "NOW_AT=$(git rev-parse HEAD)"\n' "${DEPLOY_PATH:-$PLACE_PATH}" "$1" "$1" "$1"
}

confirm() { # prompt
  [ "$DRY_RUN" -eq 1 ] && return 0
  [ "$ASSUME_YES" -eq 1 ] && return 0
  if [ ! -t 0 ]; then die "confirmation needed but stdin is not a terminal; re-run with --yes if you really mean it"; fi
  printf '\n%s\nType the server name (%s) to continue: ' "$1" "${DEPLOY_HOST:-}"
  local ans; read -r ans
  [ -n "${DEPLOY_HOST:-}" ] && [ "$ans" = "$DEPLOY_HOST" ] || die "confirmation did not match; nothing was changed"
}

post_deploy_check() {
  step "Post-deploy verification of the LIVE site (read-only)"
  if [ "$SKIP_POST_CHECK" -eq 1 ]; then skipm "BYPASSED: live verification NOT run (--skip-post-check)"; return 0; fi
  if [ "$DRY_RUN" -eq 1 ]; then dry "would wait ${DEPLOY_WAIT_SECONDS}s, then run: scripts/seo-health-check.sh --base-url $DEPLOY_HEALTH_URL"; return 0; fi
  info "waiting ${DEPLOY_WAIT_SECONDS}s for the app to come up ..."; sleep "$DEPLOY_WAIT_SECONDS"
  local out rc; out="$(mktemp "${TMPDIR:-/tmp}/mamta-live-check.XXXXXX")"; TEMP_DIRS+=("$out")
  bash "$SCRIPT_DIR/seo-health-check.sh" --base-url "$DEPLOY_HEALTH_URL" --no-color >"$out" 2>&1; rc=$?
  grep -E '^  (FAIL|WARN)|^RESULT|^ERROR' "$out" | head -20 | sed 's/^/        /'
  if [ "$rc" -eq 0 ]; then ok "live SEO health check passed"; return 0; fi
  if [ "$rc" -eq 2 ]; then fail "live site could not be verified (unreachable or check error)"; else fail "live SEO health check FAILED"; fi
  return 1
}

print_rollback_help() { # prev_sha backup
  local base="scripts/deploy-production.sh --rollback $1" extra=""
  [ "$BRANCH" != "main" ] && extra="$extra --branch $BRANCH --allow-non-main"
  [ "$CONFIG_FROM_ARG" -eq 1 ] && extra="$extra --config $(printf '%q' "$CONFIG_FILE")"
  cat <<EOF

  NOT rolled back automatically. The new code is still live. If you decide to roll back, the safe command is:
    1. Preview :  $base$extra --dry-run
    2. Execute :  $base$extra
       Previous commit: $1$( [ -n "${2:-}" ] && printf '\n       Backup of data/ + uploads: %s' "$2" )
       (uses 'git reset --keep': local edits to data/ on the server are preserved and
        it is REFUSED if it would alter data/, uploads, .env, mailer or admin/auth files;
        data/ and uploads are not restored automatically - the backup tarball is only
        needed if data was damaged.)
EOF
}

# Read-only server diagnostics + local HTTP probes after a failed restart / live check.
failure_diagnostics() {
  [ "$DRY_RUN" -eq 1 ] && return 0
  step "Diagnostics (read-only)"
  local p code
  for p in / /robots.txt /sitemap.xml; do
    code="$(curl -sS -o /dev/null -m 10 -w '%{http_code}' "$DEPLOY_HEALTH_URL$p" 2>&1 | tail -1)"; info "GET $p -> $code"
  done
  remote_run "diagnostics" "$(remote_diag_script)" || info "(could not collect server diagnostics)"
}

# Shared read-only readiness checks from the inspect step.
check_server_ready() {
  local rb bw bi
  rb="$(kv RESTART_BIN_OK)"; bw="$(kv BACKUP_WRITABLE)"; bi="$(kv BACKUP_INSIDE_APP)"
  info "backup dir on server: $(kv BACKUP_DIR)"
  [ "$bi" = "0" ] || die "the backup directory is inside the app checkout; set DEPLOY_BACKUP_DIR outside it. Nothing was changed."
  [ "$bw" = "1" ] || die "the backup directory ($(kv BACKUP_DIR)) is not writable by ${DEPLOY_USER:-the deploy user} and cannot be created. Set DEPLOY_BACKUP_DIR to a writable path (default is ~/mamta-bhoj-backups). Nothing was changed."
  [ "$rb" = "1" ] || die "the restart command's program ('${PLACE_RESTART%% *}') was not found on the server's PATH (DEPLOY_RESTART_SHELL=$DEPLOY_RESTART_SHELL). Use an absolute path (e.g. /usr/bin/pm2) or fix the login profile. Nothing was changed."
  ok "server readiness: backup dir writable, restart program found"
}

# =============================================================================
# MAIN FLOWS
# =============================================================================
do_deploy() {
  preflight
  local_smoke_test
  PRE_FAILS="$FAILS"
  if [ "$FAILS" -gt 0 ]; then
    step "Result of the local checks"
    printf '  %s %s check(s) FAILED before any server action.\n' "$(c 31 'REFUSED:')" "$FAILS"
    if [ "$DRY_RUN" -eq 0 ]; then info "Nothing was changed on the server."; return 1; fi
    info "(dry run: a real deployment would be REFUSED. The plan below is shown for review only; nothing is executed.)"
  fi
  [ "$CONFIG_OK" -eq 1 ] || { [ "$DRY_RUN" -eq 1 ] || die "configuration incomplete"; }

  step "Deployment plan  (server: $PLACE_HOST, app: $PLACE_PATH)"
  info "1 inspect server checkout   2 back up data/ + uploads   3 git fetch + fast-forward check"
  info "4 protected-path guard      5 git merge --ff-only        6 npm ci (only if package files changed)"
  info "7 restart app               8 verify live site (SEO health check)"
  confirm "About to DEPLOY ${TARGET_SHA:0:10} to $PLACE_HOST."

  step "1/8 Inspect the server checkout (read-only)"
  local prev="" cur="" modified="" bad="" backup="" changed_count="" pkg=0 prot=""
  remote_run "inspect" "$(remote_inspect_script)" || die "could not inspect the server checkout (ssh/path problem). Nothing was changed."
  if [ "$DRY_RUN" -eq 0 ]; then
    prev="$(kv PREV_SHA)"; cur="$(kv CUR_BRANCH)"; modified="$(block MODIFIED)"
    [[ "$prev" =~ ^[0-9a-f]{40}$ ]] || die "could not read the server's current commit. Nothing was changed."
    info "server is at ${prev:0:10} on branch '$cur'"
    check_server_ready
    [ "$cur" = "$BRANCH" ] || die "server checkout is on '$cur', expected '$BRANCH'. Nothing was changed."
    bad="$(printf '%s\n' "$modified" | grep -v '^$' | grep -v -E "$SERVER_DATA_RE" || true)"
    [ -z "$bad" ] || { printf '%s\n' "$bad" | sed 's/^/        /'; die "the server has uncommitted local changes outside data/ and uploads (drift). Resolve them by hand; nothing was changed."; }
    [ -z "$(printf '%s' "$modified" | tr -d '[:space:]')" ] && info "no local modifications on the server" || info "server has local data/ edits (kept untouched): $(printf '%s\n' "$modified" | grep -c . || true) file(s)"
    if [ "$prev" = "$TARGET_SHA" ]; then
      step "Result"; ok "server is already at ${TARGET_SHA:0:10}; nothing to deploy"
      post_deploy_check || return 1
      return 0
    fi
  else
    prev="<server-commit>"
  fi

  step "2/8 Back up data/ and uploads on the server"
  remote_run "backup" "$(remote_backup_script "$prev")" || die "backup FAILED, so nothing was deployed or changed."
  [ "$DRY_RUN" -eq 0 ] && { backup="$(kv BACKUP_FILE)"; [ -n "$backup" ] && ok "backup written: $backup ($(kv BACKUP_BYTES) bytes)" || info "no backup file produced ($(printf '%s' "$REMOTE_OUT" | tr '\n' ' '))"; }

  step "3-4/8 Fetch, fast-forward check and protected-path guard"
  remote_run "fetch + verify + guard" "$(remote_fetch_script "$prev" "${TARGET_SHA:-<target>}")" || { [ "$DRY_RUN" -eq 1 ] || die "server-side verification failed: $(kv ERR). Nothing was changed (a backup exists at ${backup:-n/a})."; }
  if [ "$DRY_RUN" -eq 0 ]; then
    changed_count="$(kv CHANGED_COUNT)"; pkg="$(kv PKG_CHANGED)"; prot="$(block PROTECTED)"
    ok "fast-forward OK; $changed_count file(s) will change"
    if [ -n "$(printf '%s' "$prot" | tr -d '[:space:]')" ]; then
      printf '%s\n' "$prot" | sed 's/^/        /'
      [ "$ALLOW_PROTECTED" -eq 1 ] && warn "protected files change (allowed by --allow-protected-changes)" || die "this deploy would change PROTECTED files (listed above). Nothing was changed. Re-run with --allow-protected-changes only if intended."
    else ok "protected-path guard: no protected files change"; fi
  fi

  step "5/8 Fast-forward the server to ${TARGET_SHA:0:10}"
  remote_run "git merge --ff-only" "$(remote_apply_script "${TARGET_SHA:-<target>}")" || die "merge failed on the server; the working tree was not changed by git. Backup: ${backup:-n/a}."

  step "6/8 Dependencies"
  if [ "$DEPLOY_NPM" = "never" ]; then skipm "DEPLOY_NPM=never"
  elif [ "$DEPLOY_NPM" = "always" ] || [ "$pkg" != "0" ] || [ "$DRY_RUN" -eq 1 ]; then
    [ "$DRY_RUN" -eq 1 ] && info "(runs only if package.json / package-lock.json changed, or DEPLOY_NPM=always)"
    remote_run "npm ci --omit=dev" "$(remote_npm_script)" || { print_rollback_help "$prev" "$backup"; die "npm ci failed on the server. The app was NOT restarted (it is still running the old code in memory) but node_modules may be incomplete: fix dependencies before any restart (including pm2 resurrect/reboot)."; }
  else skipm "package files unchanged"; fi

  step "7/8 Restart the application"
  remote_run "restart" "$(remote_restart_script)" || { failure_diagnostics; print_rollback_help "$prev" "$backup"; die "restart command failed on the server"; }

  step "8/8 Verify"
  if ! post_deploy_check; then failure_diagnostics; print_rollback_help "$prev" "$backup"; return 1; fi

  step "Result"
  if [ "$DRY_RUN" -eq 1 ]; then
    if [ "$PRE_FAILS" -gt 0 ]; then
      printf '  %s dry run finished, but %s pre-flight check(s) failed: a real deployment would be refused. No server command was executed.\n' "$(c 31 'NOT READY:')" "$PRE_FAILS"
      return 1
    fi
    ok "DRY RUN complete: all local checks passed; no server command was executed"
  else ok "deployed ${TARGET_SHA:0:10} to $PLACE_HOST and verified"; [ -n "$backup" ] && info "backup: $backup"; fi
  return 0
}

do_rollback() {
  step "Rollback to $ROLLBACK_SHA"
  [ "$CONFIG_OK" -eq 1 ] || { [ "$DRY_RUN" -eq 1 ] || die "configuration incomplete"; }
  [ "$FAILS" -eq 0 ] || die "configuration errors; nothing was changed"
  confirm "About to ROLL BACK $PLACE_HOST to $ROLLBACK_SHA."
  local prev="" cur="" modified="" bad="" backup="" pkg=0 prot="" changed_count=""
  remote_run "inspect" "$(remote_inspect_script)" || die "could not inspect the server checkout. Nothing was changed."
  if [ "$DRY_RUN" -eq 0 ]; then
    prev="$(kv PREV_SHA)"; cur="$(kv CUR_BRANCH)"; modified="$(block MODIFIED)"
    [[ "$prev" =~ ^[0-9a-f]{40}$ ]] || die "could not read the server's commit"
    [ "$cur" = "$BRANCH" ] || die "server is on '$cur', expected '$BRANCH'"
    bad="$(printf '%s\n' "$modified" | grep -v '^$' | grep -v -E "$SERVER_DATA_RE" || true)"
    [ -z "$bad" ] || { printf '%s\n' "$bad" | sed 's/^/        /'; die "uncommitted local changes outside data/ and uploads on the server; nothing was changed"; }
    check_server_ready
  else prev="<server-commit>"; fi

  step "Rollback guard (read-only): what would change between the server's commit and $ROLLBACK_SHA"
  remote_run "rollback guard" "$(remote_rollback_check_script "$ROLLBACK_SHA")" || { [ "$DRY_RUN" -eq 1 ] || die "rollback target rejected: $(kv ERR). Nothing was changed."; }
  if [ "$DRY_RUN" -eq 0 ]; then
    changed_count="$(kv CHANGED_COUNT)"; pkg="$(kv PKG_CHANGED)"; prot="$(block PROTECTED)"
    ok "rollback target is an ancestor of the server commit; $changed_count file(s) would change"
    if [ -n "$(printf '%s' "$prot" | tr -d '[:space:]')" ]; then
      printf '%s\n' "$prot" | sed 's/^/        /'
      [ "$ALLOW_PROTECTED" -eq 1 ] && warn "rollback will change PROTECTED files (allowed by --allow-protected-changes)" || die "this rollback would change PROTECTED files (listed above: data/, uploads, .env, mailer or admin/auth). Nothing was changed. Re-run with --allow-protected-changes only if that is truly intended."
    else ok "protected-path guard: the rollback changes no protected files"; fi
  fi

  step "Back up data/ and uploads, then reset"
  remote_run "backup" "$(remote_backup_script "$prev")" || die "backup FAILED; nothing was changed"
  [ "$DRY_RUN" -eq 0 ] && backup="$(kv BACKUP_FILE)"
  remote_run "git reset --keep" "$(remote_reset_keep_script "$ROLLBACK_SHA")" || die "rollback refused by git (local data edits would be overwritten, or the SHA is not an ancestor). Nothing was changed. Backup: ${backup:-n/a}"

  step "Dependencies"
  if [ "$DEPLOY_NPM" = "never" ]; then skipm "DEPLOY_NPM=never"
  elif [ "$DEPLOY_NPM" = "always" ] || [ "$pkg" != "0" ] || [ "$DRY_RUN" -eq 1 ]; then
    [ "$DRY_RUN" -eq 1 ] && info "(runs only if package.json / package-lock.json differ at the target, or DEPLOY_NPM=always)"
    remote_run "npm ci --omit=dev" "$(remote_npm_script)" || die "npm ci failed after the reset. The app was NOT restarted (still running the old code in memory) but node_modules may be incomplete: fix dependencies before any restart. Server is at $ROLLBACK_SHA. Backup: ${backup:-n/a}"
  else skipm "package files unchanged between the two commits"; fi

  step "Restart the application (only now that code and dependencies are in place)"
  remote_run "restart" "$(remote_restart_script)" || { failure_diagnostics; die "restart failed after rollback"; }
  if ! post_deploy_check; then
    failure_diagnostics
    info "the server IS on $ROLLBACK_SHA and the app was restarted; the failures above are SEO rules the OLDER code does not meet (expected when rolling back past SEO fixes). Check the site manually."
    return 1
  fi
  step "Result"; [ "$DRY_RUN" -eq 1 ] && ok "DRY RUN complete: nothing was executed" || ok "rolled back to $ROLLBACK_SHA and verified"
  return 0
}

if [ -n "$ROLLBACK_SHA" ]; then
  do_rollback; rc=$?
else
  do_deploy; rc=$?
fi
echo
[ -n "$BYPASSED" ] && printf '%s safety validation was BYPASSED by:%s\n' "$(c 33 'NOTE:')" "$BYPASSED"
if [ "$rc" -eq 0 ]; then printf '%s  (warnings: %s, log: %s)\n' "$(c 32 'DEPLOY SCRIPT: OK')" "$WARNS" "$LOG_FILE"
else printf '%s  (failed checks: %s, warnings: %s, log: %s)\n' "$(c 31 'DEPLOY SCRIPT: STOPPED')" "$FAILS" "$WARNS" "$LOG_FILE"; fi
exit "$rc"
