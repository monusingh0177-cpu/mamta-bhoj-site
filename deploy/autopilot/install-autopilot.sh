#!/usr/bin/env bash
# One-time installer for the SEO autopilot's systemd timer.
#   sudo deploy/autopilot/install-autopilot.sh --user deploy                 # install and start the daily timer
#   sudo deploy/autopilot/install-autopilot.sh --user deploy --no-start      # install, enable nothing yet
#        deploy/autopilot/install-autopilot.sh --user deploy --dry-run       # show what would happen, change nothing
# It only creates: /etc/mamta-autopilot/autopilot.env (from the example, if missing), the state directory,
# and two systemd unit files. It does NOT touch the website, PM2, nginx, .env, data/ or uploads, and it does not
# switch on proposals: the default mode is report-only. Re-running it is safe.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_USER=""; STATE="/var/lib/mamta-autopilot"; NODE_BIN="$(command -v node || true)"
PREFIX=""; DRY=0; START=1; AUTO=0; PM2HOME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --user) SERVICE_USER="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --state-dir) STATE="$2"; shift 2 ;;
    --node) NODE_BIN="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;   # install into a scratch root (tests); skips systemctl
    --dry-run) DRY=1; shift ;;
    --no-start) START=0; shift ;;
    --auto-publish) AUTO=1; shift ;;     # also install the narrow write-access drop-in that automatic publishing needs
    --pm2-home) PM2HOME="$2"; shift 2 ;; # PM2 home of the service user (default /home/<user>/.pm2)
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SERVICE_USER" ] || { echo "ERROR: --user <account that owns $REPO> is required" >&2; exit 2; }
[ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ] || { echo "ERROR: node not found; pass --node /path/to/node" >&2; exit 2; }
[ -f "$REPO/autopilot/cli.js" ] || { echo "ERROR: $REPO/autopilot/cli.js not found" >&2; exit 2; }
if [ "$DRY" -eq 0 ] && [ -z "$PREFIX" ] && [ "$(id -u)" -ne 0 ]; then echo "ERROR: run with sudo (or use --dry-run)" >&2; exit 2; fi
ETC="$PREFIX/etc/mamta-autopilot"; UNITS="$PREFIX/etc/systemd/system"; STATE_DIR="$PREFIX$STATE"
say() { echo "  $*"; }
do_() { if [ "$DRY" -eq 1 ]; then say "[dry-run] $*"; else eval "$@"; fi; }

echo "Installing the SEO autopilot timer"
say "repo: $REPO | service user: $SERVICE_USER | state: $STATE | node: $NODE_BIN"
do_ "mkdir -p '$ETC' '$UNITS' '$STATE_DIR'"
if [ ! -f "$ETC/autopilot.env" ]; then
  do_ "install -m 600 '$REPO/deploy/autopilot/autopilot.env.example' '$ETC/autopilot.env'"
  [ -n "$PREFIX" ] || do_ "chown '$SERVICE_USER' '$ETC/autopilot.env'"
else say "keeping existing $ETC/autopilot.env"; fi
[ -n "$PREFIX" ] || do_ "chown '$SERVICE_USER' '$STATE_DIR' && chmod 750 '$STATE_DIR'"
for u in mamta-autopilot.service mamta-autopilot.timer; do
  if [ "$DRY" -eq 1 ]; then say "[dry-run] write $UNITS/$u"; else
    sed -e "s#@REPO@#$REPO#g" -e "s#@USER@#$SERVICE_USER#g" -e "s#@STATE@#$STATE#g" -e "s#@NODE@#$NODE_BIN#g" "$REPO/deploy/autopilot/$u" > "$UNITS/$u"; chmod 644 "$UNITS/$u"; say "wrote $UNITS/$u"
  fi
done
if [ "$AUTO" -eq 1 ]; then
  [ -n "$PM2HOME" ] || PM2HOME="/home/$SERVICE_USER/.pm2"
  DROPIN="$UNITS/mamta-autopilot.service.d"
  if [ "$DRY" -eq 1 ]; then say "[dry-run] write $DROPIN/auto-publish.conf (extra write access: $REPO/views and $PM2HOME only)"; else
    mkdir -p "$DROPIN"
    sed -e "s#@REPO@#$REPO#g" -e "s#@PM2HOME@#$PM2HOME#g" "$REPO/deploy/autopilot/auto-publish.conf" > "$DROPIN/auto-publish.conf"; chmod 644 "$DROPIN/auto-publish.conf"; say "wrote $DROPIN/auto-publish.conf"
  fi
  say "This only grants write access. Publishing stays OFF until AUTOPILOT_MODE=auto is set AND: node $REPO/autopilot/cli.js activate-auto passes (docs/seo-autopilot.md)"
fi
if [ -z "$PREFIX" ]; then
  do_ "systemctl daemon-reload"
  if [ "$START" -eq 1 ]; then do_ "systemctl enable --now mamta-autopilot.timer"; else say "timer installed but NOT enabled (run: sudo systemctl enable --now mamta-autopilot.timer)"; fi
fi
echo "Next steps"
say "1. First audit (changes nothing):   sudo -u $SERVICE_USER AUTOPILOT_STATE_DIR=$STATE $NODE_BIN $REPO/autopilot/cli.js dry-run"
say "2. Read it:                         sudo -u $SERVICE_USER AUTOPILOT_STATE_DIR=$STATE $NODE_BIN $REPO/autopilot/cli.js report"
say "3. Add Google/AI credentials to /etc/mamta-autopilot/autopilot.env only if you want them (see docs/seo-autopilot.md)"
say "4. Timer status:                    systemctl list-timers mamta-autopilot.timer"
