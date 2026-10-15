#!/usr/bin/env bash
# Store the Gemini API key in the autopilot's env file WITHOUT ever echoing it, putting it in a command line, a log or Git.
#   sudo deploy/autopilot/set-ai-key.sh [--env-file /etc/mamta-autopilot/autopilot.env] [--model gemini-2.5-flash] [--enable]
# The key is validated (20-512 characters of A-Za-z0-9._~+/=-) and read from the terminal with echo off (/dev/tty), so it cannot be piped in or passed as an argument.
# It sets AUTOPILOT_AI_MODEL and AUTOPILOT_AI_API_KEY (and AUTOPILOT_AI_MODE=gemini only with --enable, once the deployed code supports it) and leaves every other line untouched
# (Google OAuth values, limits, mode). A timestamped 600 backup is made first; the new file is written next to the old one
# and renamed over it (atomic), keeping the original owner, group and mode. Nothing is restarted.
set -euo pipefail
export LC_ALL=C   # byte-wise character classes: A-Za-z never matches accented letters
ENVF="/etc/mamta-autopilot/autopilot.env"; MODEL="gemini-2.5-flash"; ENABLE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENVF="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --enable) ENABLE=1; shift ;;
    -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ "$MODEL" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$ ]] || { echo "ERROR: invalid model name" >&2; exit 2; }
[ -f "$ENVF" ] || { echo "ERROR: $ENVF not found" >&2; exit 2; }
[ -w "$ENVF" ] || { echo "ERROR: cannot write $ENVF (run with sudo)" >&2; exit 2; }
TTY_DEV="${SET_AI_KEY_TTY:-/dev/tty}"; PROMPT_DEV="${SET_AI_KEY_TTY:+/dev/null}"; PROMPT_DEV="${PROMPT_DEV:-/dev/tty}"   # SET_AI_KEY_TTY is a test hook only
[ -r "$TTY_DEV" ] || { echo "ERROR: needs an interactive terminal (ssh -t ...) so the key can be typed without echo" >&2; exit 2; }

umask 077
printf 'Paste the Gemini API key (nothing is shown) and press Enter: ' > "$PROMPT_DEV"
IFS= read -r -s KEY < "$TTY_DEV" || true
printf '\n' > "$PROMPT_DEV"
KEY="${KEY//$'\r'/}"
[ -n "$KEY" ] || { echo "ERROR: empty input; nothing changed" >&2; exit 1; }
# Accepted: 20-512 characters from  A-Z a-z 0-9 . _ ~ + / = -  (covers the classic "AIza..." keys and the newer "AQ.<token>" keys, which contain a dot).
# Whitespace, control characters, quotes, #, $, backslash, backtick and anything else are refused, so the value is safe in the env file.
# On refusal only the length or the kind of problem is printed, never the key or the offending character.
KLEN=${#KEY}
if [ "$KLEN" -lt 20 ] || [ "$KLEN" -gt 512 ]; then echo "ERROR: unexpected key length ($KLEN characters; expected 20-512); nothing changed" >&2; unset KEY; exit 1; fi
if [[ "$KEY" =~ [[:space:][:cntrl:]] ]]; then echo "ERROR: the key contains whitespace or control characters; nothing changed" >&2; unset KEY; exit 1; fi
[[ "$KEY" =~ ^[A-Za-z0-9._~+/=-]+$ ]] || { echo "ERROR: the key contains characters other than letters, digits and . _ ~ + / = - ; nothing changed" >&2; unset KEY; exit 1; }

DIR="$(dirname "$ENVF")"; BAK="$ENVF.bak-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$ENVF" "$BAK"; chmod 600 "$BAK"
TMP="$(mktemp "$DIR/.autopilot.env.XXXXXX")"; trap 'rm -f "$TMP"' EXIT
# the key goes in through the environment of this one awk process, never an argument
AIKEY="$KEY" MODEL="$MODEL" ENABLE="$ENABLE" awk '
  BEGIN { k = ENVIRON["AIKEY"]; m = ENVIRON["MODEL"]; en = ENVIRON["ENABLE"] == "1" }
  /^[[:space:]]*AUTOPILOT_AI_MODE=/    { if (en) { if (!a) print "AUTOPILOT_AI_MODE=gemini"; a = 1; next } }
  /^[[:space:]]*AUTOPILOT_AI_MODEL=/   { if (!b) print "AUTOPILOT_AI_MODEL=" m; b = 1; next }
  /^[[:space:]]*AUTOPILOT_AI_API_KEY=/ { if (!c) print "AUTOPILOT_AI_API_KEY=" k; c = 1; next }
  { print }
  END { if (en && !a) print "AUTOPILOT_AI_MODE=gemini"; if (!b) print "AUTOPILOT_AI_MODEL=" m; if (!c) print "AUTOPILOT_AI_API_KEY=" k }
' "$ENVF" > "$TMP"
unset KEY
chown --reference="$ENVF" "$TMP"; chmod --reference="$ENVF" "$TMP"
mv -f "$TMP" "$ENVF"; trap - EXIT
echo "updated $ENVF: $([ "$ENABLE" -eq 1 ] && echo AUTOPILOT_AI_MODE=gemini, || echo "AUTOPILOT_AI_MODE unchanged,") AUTOPILOT_AI_MODEL=$MODEL, AUTOPILOT_AI_API_KEY=(set, hidden)"
echo "backup: $BAK"; ls -l "$ENVF" | awk '{print "mode/owner: " $1 " " $3 ":" $4}'
