#!/bin/bash
# Regenerate cal1615_ignition from tools/, copy it into the local ignition8-3 container,
# restart the gateway so it loads, and optionally screenshot pages:
#   ./deploy.sh "/overview,1920,1080,desk" "/overview,400,2400,phone"
set -e
cd "$(dirname "$0")"
D="${DOCKER:-/c/Users/ErikBaars/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe}"
C="${CONTAINER:-ignition8-3}"
O="$(cd .. && pwd)"
node gen.js "$O" tagmap.json base-session-props.json
rm -rf .deploy; mkdir -p .deploy/cal1615_ignition
cp -r "$O/project.json" "$O/com.inductiveautomation.perspective" "$O/ignition" .deploy/cal1615_ignition/
export MSYS_NO_PATHCONV=1
"$D" exec -u root "$C" rm -rf /usr/local/bin/ignition/data/projects/cal1615_ignition
(cd .deploy && "$D" cp cal1615_ignition "$C":/usr/local/bin/ignition/data/projects/)
"$D" exec -u root "$C" chown -R ignition:ignition /usr/local/bin/ignition/data/projects/cal1615_ignition
rm -rf .deploy
"$D" restart "$C" >/dev/null
U=http://localhost:7088/data/perspective/client/cal1615_ignition
for i in $(seq 1 40); do sleep 3; c=$(curl -s -o /dev/null -w "%{http_code}" "$U" || true); [ "$c" = "200" ] && break; done
echo "gateway up ($c)"
mkdir -p shots
for s in "$@"; do sleep 5; IFS=, read page w h name <<< "$s"; node --experimental-websocket shot.js "$U$page" "$w" "$h" "shots/$name.png" 14000 2>&1 | grep -v Warning; done
