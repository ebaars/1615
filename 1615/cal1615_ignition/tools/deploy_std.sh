#!/bin/bash
# Copy the cal1615_std project and its drawings (Image Management: Custom/cal1615) into the local
# ignition8-3 container and restart the gateway so it loads them.
set -e
cd "$(dirname "$0")"
D="${DOCKER:-/c/Users/ErikBaars/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe}"
C="${CONTAINER:-ignition8-3}"
SRC="$(cd ../.. && pwd)"
export MSYS_NO_PATHCONV=1
G=/usr/local/bin/ignition/data
"$D" exec -u root "$C" rm -rf $G/projects/cal1615_std $G/config/resources/core/ignition/images/Custom/cal1615
(cd "$SRC" && "$D" cp cal1615_std "$C":$G/projects/)
(cd "$SRC/cal1615_std_images" && "$D" cp cal1615 "$C":$G/config/resources/core/ignition/images/Custom/)
"$D" exec -u root "$C" chown -R ignition:ignition $G/projects/cal1615_std $G/config/resources/core/ignition/images/Custom/cal1615
"$D" restart "$C" >/dev/null
for i in $(seq 1 60); do c=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://localhost:7088/data/perspective/client/cal1615_std || true); [ "$c" = "200" ] && break; sleep 5; done
echo "gateway up ($c)"
