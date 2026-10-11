#!/usr/bin/env bash
# Removes the SEO autopilot's systemd timer and service. By default it keeps the state directory (reports, audit
# log, baseline) and /etc/mamta-autopilot (your credentials file); pass --purge to delete those too.
#   sudo deploy/autopilot/uninstall-autopilot.sh [--purge] [--state-dir DIR] [--dry-run]
set -euo pipefail
STATE="/var/lib/mamta-autopilot"; PURGE=0; DRY=0; PREFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --purge) PURGE=1; shift ;; --state-dir) STATE="$2"; shift 2 ;; --dry-run) DRY=1; shift ;; --prefix) PREFIX="$2"; shift 2 ;;
    -h|--help) sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
if [ "$DRY" -eq 0 ] && [ -z "$PREFIX" ] && [ "$(id -u)" -ne 0 ]; then echo "ERROR: run with sudo (or use --dry-run)" >&2; exit 2; fi
UNITS="$PREFIX/etc/systemd/system"
do_() { if [ "$DRY" -eq 1 ]; then echo "  [dry-run] $*"; else eval "$@"; fi; }
if [ -z "$PREFIX" ]; then do_ "systemctl disable --now mamta-autopilot.timer 2>/dev/null || true"; do_ "systemctl stop mamta-autopilot.service 2>/dev/null || true"; fi
do_ "rm -f '$UNITS/mamta-autopilot.service' '$UNITS/mamta-autopilot.timer'"
[ -n "$PREFIX" ] || do_ "systemctl daemon-reload"
if [ "$PURGE" -eq 1 ]; then do_ "rm -rf '$PREFIX$STATE' '$PREFIX/etc/mamta-autopilot'"; else echo "  kept $STATE and /etc/mamta-autopilot (use --purge to remove)"; fi
echo "Autopilot timer removed. The website, PM2, nginx, .env, data/ and uploads were not touched."
echo "Leftover proposal branches (seo-autopilot/*) stay in git until you delete them: git branch --list 'seo-autopilot/*'"
