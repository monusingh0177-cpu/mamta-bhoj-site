#!/usr/bin/env bash
# One-time installer for the SEO autopilot's systemd timer.
#   sudo deploy/autopilot/install-autopilot.sh --user deploy                 # install and start the daily timer
#   sudo deploy/autopilot/install-autopilot.sh --user deploy --no-start      # install, enable nothing yet
#        deploy/autopilot/install-autopilot.sh --user deploy --dry-run       # show what would happen, change nothing
#   sudo deploy/autopilot/install-autopilot.sh --user deploy --auto-publish --restart-helper
#                                    # opt-in for AUTOPILOT_MODE=auto: narrow write-access drop-in + root-owned restart helper
# It only creates: /etc/mamta-autopilot/autopilot.env (from the example, if missing), the state directory,
# and two systemd unit files. It does NOT touch the website, PM2, nginx, .env, data/ or uploads, and it does not
# switch on proposals: the default mode is report-only. Re-running it is safe.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_USER=""; STATE="/var/lib/mamta-autopilot"; NODE_BIN="$(command -v node || true)"
PREFIX=""; DRY=0; START=1; AUTO=0; PM2HOME=""; RHELP=0
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
    --pm2-home) PM2HOME="$2"; shift 2 ;; # PM2 home of the service user (default /home/<user>/.pm2); not used with --restart-helper
    --restart-helper) RHELP=1; shift ;;  # install the root-owned, fixed-command restart helper (PM2 runs as another account, e.g. root)
    -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SERVICE_USER" ] || { echo "ERROR: --user <account that owns $REPO> is required" >&2; exit 2; }
# least privilege: the service must be an ordinary account, never root
case "$SERVICE_USER" in root|0) echo "ERROR: --user root is refused: the autopilot must run as an unprivileged account (least privilege)" >&2; exit 2 ;; esac
[[ "$SERVICE_USER" =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]] || { echo "ERROR: --user '$SERVICE_USER' is not a valid account name" >&2; exit 2; }
[ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ] || { echo "ERROR: node not found; pass --node /path/to/node" >&2; exit 2; }
[ -f "$REPO/autopilot/cli.js" ] || { echo "ERROR: $REPO/autopilot/cli.js not found" >&2; exit 2; }
# A real install writes these paths into a systemd unit (ExecStart= is split on spaces and expands % and $), so refuse
# anything that is not plain. (A scratch --prefix install or a --dry-run only renders text, so it is not restricted.)
if [ "$DRY" -eq 0 ] && [ -z "$PREFIX" ]; then
  for v in "$REPO" "$STATE" "$NODE_BIN"; do
    [[ "$v" =~ ^/[A-Za-z0-9._/+@:-]*$ ]] || { echo "ERROR: unsafe path for a systemd unit: '$v' (use an absolute path without spaces or shell/systemd special characters)" >&2; exit 2; }
  done
fi
if [ "$DRY" -eq 0 ] && [ -z "$PREFIX" ] && [ "$(id -u)" -ne 0 ]; then echo "ERROR: run with sudo (or use --dry-run)" >&2; exit 2; fi
# values substituted into the unit files: escape the characters sed treats specially (backslash, &, and the # delimiter)
sedq() { printf '%s' "$1" | sed -e 's/[\\&#]/\\&/g'; }
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
    sed -e "s#@REPO@#$(sedq "$REPO")#g" -e "s#@USER@#$(sedq "$SERVICE_USER")#g" -e "s#@STATE@#$(sedq "$STATE")#g" -e "s#@NODE@#$(sedq "$NODE_BIN")#g" "$REPO/deploy/autopilot/$u" > "$UNITS/$u"; chmod 644 "$UNITS/$u"; say "wrote $UNITS/$u"
  fi
done
if [ "$AUTO" -eq 1 ]; then
  [ -n "$PM2HOME" ] || PM2HOME="/home/$SERVICE_USER/.pm2"
  DROPIN="$UNITS/mamta-autopilot.service.d"
  if [ "$RHELP" -eq 1 ]; then
    if [ "$DRY" -eq 1 ]; then say "[dry-run] write $DROPIN/auto-publish.conf (extra write access: $REPO/views and the restart-request directory only)"; else
      mkdir -p "$DROPIN"
      sed -e "s#@REPO@#$(sedq "$REPO")#g" "$REPO/deploy/autopilot/auto-publish-helper.conf" > "$DROPIN/auto-publish.conf"; chmod 644 "$DROPIN/auto-publish.conf"; say "wrote $DROPIN/auto-publish.conf"
    fi
  elif [ "$DRY" -eq 1 ]; then say "[dry-run] write $DROPIN/auto-publish.conf (extra write access: $REPO/views and $PM2HOME only)"; else
    mkdir -p "$DROPIN"
    sed -e "s#@REPO@#$(sedq "$REPO")#g" -e "s#@PM2HOME@#$(sedq "$PM2HOME")#g" "$REPO/deploy/autopilot/auto-publish.conf" > "$DROPIN/auto-publish.conf"; chmod 644 "$DROPIN/auto-publish.conf"; say "wrote $DROPIN/auto-publish.conf"
  fi
  say "This only grants write access. Publishing stays OFF until AUTOPILOT_MODE=auto is set AND: node $REPO/autopilot/cli.js activate-auto passes (docs/seo-autopilot.md)"
fi
if [ "$RHELP" -eq 1 ]; then
  HD="$REPO/deploy/autopilot/restart-helper"; SBIN="$PREFIX/usr/local/sbin"; BIN="$PREFIX/usr/local/bin"; TMPF="$PREFIX/etc/tmpfiles.d"
  if [ "$DRY" -eq 1 ]; then
    say "[dry-run] install $SBIN/mamta-autopilot-restart (0750 root:root: restarts ONE pm2 app, mamta-bhoj, nothing else)"
    say "[dry-run] install $BIN/mamta-autopilot-restart-request (0755: the command to put in AUTOPILOT_RESTART_CMD)"
    say "[dry-run] write $UNITS/mamta-autopilot-restart.service and .path, $TMPF/mamta-autopilot-restart.conf; no sudo rule is created"
  else
    mkdir -p "$SBIN" "$BIN" "$TMPF"
    install -m 0750 "$HD/mamta-autopilot-restart" "$SBIN/mamta-autopilot-restart"; install -m 0755 "$HD/mamta-autopilot-restart-request" "$BIN/mamta-autopilot-restart-request"
    [ -n "$PREFIX" ] || chown root:root "$SBIN/mamta-autopilot-restart"
    for u in mamta-autopilot-restart.service mamta-autopilot-restart.path; do sed -e "s#@REPO@#$(sedq "$REPO")#g" "$HD/$u" > "$UNITS/$u"; chmod 644 "$UNITS/$u"; done
    sed -e "s#@USER@#$(sedq "$SERVICE_USER")#g" "$HD/mamta-autopilot-restart.tmpfiles" > "$TMPF/mamta-autopilot-restart.conf"; chmod 644 "$TMPF/mamta-autopilot-restart.conf"
    say "installed the restart helper; set AUTOPILOT_RESTART_CMD=/usr/local/bin/mamta-autopilot-restart-request in $ETC/autopilot.env"
  fi
  if [ -z "$PREFIX" ]; then do_ "systemd-tmpfiles --create /etc/tmpfiles.d/mamta-autopilot-restart.conf"; fi
fi
if [ -z "$PREFIX" ]; then
  do_ "systemctl daemon-reload"
  if [ "$RHELP" -eq 1 ]; then do_ "systemctl enable --now mamta-autopilot-restart.path"; fi
  if [ "$START" -eq 1 ]; then do_ "systemctl enable --now mamta-autopilot.timer"; else say "timer installed but NOT enabled (run: sudo systemctl enable --now mamta-autopilot.timer)"; fi
fi
echo "Next steps"
say "1. First audit (changes nothing):   sudo -u $SERVICE_USER AUTOPILOT_STATE_DIR=$STATE $NODE_BIN $REPO/autopilot/cli.js dry-run"
say "2. Read it:                         sudo -u $SERVICE_USER AUTOPILOT_STATE_DIR=$STATE $NODE_BIN $REPO/autopilot/cli.js report"
say "3. Add Google/AI credentials to /etc/mamta-autopilot/autopilot.env only if you want them (see docs/seo-autopilot.md)"
say "4. Timer status:                    systemctl list-timers mamta-autopilot.timer"
