#!/bin/bash
# Deploy cal1615_std AND a temporary no-login copy (cal1615_std_check) to the local gateway, for screenshots with tools/shot.js:
#   node --experimental-websocket shot.js http://localhost:7088/data/perspective/client/cal1615_std_check/overview 1920 1080 out.png 35000
# The copy has its session-permissions removed (so no login) and is NOT meant to stay: run  tools/check_copy.sh --delete  when done.
#   --dark   start the check copy in the dark theme (the theme dropdown cannot be clicked headless)
#   --demo   also replace references to not-yet-imported tags (HMI/LineState, HMI/Rolls, HMI/Job) with demo values, to see a page with data
# Pull the real project from the gateway first (see deploy_std.sh); this restarts the gateway like deploy_std.sh does.
set -e
cd "$(dirname "$0")"
D="${DOCKER:-/c/Users/ErikBaars/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe}"
C="${CONTAINER:-ignition8-3}"
G=/usr/local/bin/ignition/data
export MSYS_NO_PATHCONV=1
DEMO=0; DARK=0
for a in "$@"; do [ "$a" = "--demo" ] && DEMO=1; [ "$a" = "--dark" ] && DARK=1; done
if [ "$1" = "--delete" ]; then
  "$D" exec -u root "$C" rm -rf $G/projects/cal1615_std_check
  "$D" restart "$C" >/dev/null
  echo "check copy deleted, gateway restarted"
  exit 0
fi
SRC="$(cd ../.. && pwd)"
T="$(mktemp -d)"
TW="$(cygpath -m "$T")"   # Windows form for node and docker.exe
cp -r "$SRC/cal1615_std" "$T/cal1615_std_check"
rm -rf "$T/cal1615_std_check/com.inductiveautomation.perspective/session-permissions"
[ "$DEMO" = 1 ] && node demo_values.js "$TW/cal1615_std_check"
if [ "$DARK" = 1 ]; then node -e 'const fs=require("fs");const f=process.argv[1]+"/cal1615_std_check/com.inductiveautomation.perspective/session-props/props.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));j.props.theme="dark";fs.writeFileSync(f,JSON.stringify(j,null,2))' "$TW"; fi
node -e 'const f=process.argv[1]+"/cal1615_std_check/project.json";const fs=require("fs");const j=JSON.parse(fs.readFileSync(f,"utf8"));j.title="cal1615 check (temporary)";fs.writeFileSync(f,JSON.stringify(j,null,2))' "$TW"
"$D" exec -u root "$C" rm -rf $G/projects/cal1615_std_check
"$D" cp "$TW/cal1615_std_check" "$C":$G/projects/
"$D" exec -u root "$C" chown -R ignition:ignition $G/projects/cal1615_std_check
rm -rf "$T"
./deploy_std.sh | tail -1
