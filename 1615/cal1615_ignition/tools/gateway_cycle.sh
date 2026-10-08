#!/bin/bash
# Gateway restart soak test: restarts the local Ignition container every INTERVAL minutes, CYCLES times, and writes what happened after
# each restart to logs/gateway_cycle.log (time to RUNNING, whether the project answers, new errors in the gateway log, whether the
# roll / line-state / tuning-watchdog scripts picked their state up again). Use it to see that nothing is lost across restarts.
#
#   tools/gateway_cycle.sh [--interval MIN] [--cycles N] [--first-now] [--check-only]
#   stop it:   touch tools/logs/STOP        (it stops at the next 30 s slice; remove the file before arming again)
#   --check-only   run the checks once on the running gateway, restart nothing
# Local dev gateway only (container ignition8-3). A restart interrupts anything running on it: a PID tuning test is cleaned up by the
# watchdog tag after a restart, and an open roll resumes flagged GAP.
cd "$(dirname "$0")"
D="${DOCKER:-/c/Users/ErikBaars/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe}"
C="${CONTAINER:-ignition8-3}"
URL=http://localhost:7088
export MSYS_NO_PATHCONV=1
INTERVAL=90; CYCLES=6; FIRST_NOW=0; CHECK_ONLY=0
while [ $# -gt 0 ]; do case "$1" in
  --interval) INTERVAL="$2"; shift;; --cycles) CYCLES="$2"; shift;; --first-now) FIRST_NOW=1;; --check-only) CHECK_ONLY=1;; esac; shift; done
mkdir -p logs
LOG=logs/gateway_cycle.log
STOP=logs/STOP
NOISE='Exchange|CSSAnimation|Outputs|Designer session|RPC|Error handling route|HASP|Two-Way Auth|Java Serialization|metroKeystore|TagTraceBatch|Websocket connection|already exists'
say() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" | tee -a "$LOG"; }

# the checks run inside the container: a process started through WMI cannot always reach localhost:7088 from the host
state() { "$D" exec "$C" curl -s -m 3 http://localhost:8088/StatusPing 2>/dev/null | sed -n 's/.*"state":"\([A-Z]*\)".*/\1/p'; }

# what happened since $1 (an epoch second): errors that are not the known noise, and our scripts' own log lines
check() {
  local since="$1" n
  local logs; logs="$("$D" logs --since "$since" "$C" 2>&1)"
  local page; page=$("$D" exec "$C" curl -s -o /dev/null -m 10 -w '%{http_code}' http://localhost:8088/data/perspective/client/cal1615_std 2>/dev/null)
  n=$(echo "$logs" | grep -E ' E \[' | grep -vE "$NOISE" | wc -l)
  say "  project page HTTP $page; new error lines (not the known noise): $n"
  echo "$logs" | grep -E ' E \[' | grep -vE "$NOISE" | sed 's/^.*| //' | cut -c1-170 | sort | uniq -c | sort -rn | head -5 | sed 's/^/      /' | tee -a "$LOG"
  local fresh; fresh=$(echo "$logs" | grep -c 'Line state None')
  say "  line state: $([ "$fresh" = 0 ] && echo 'carried on (no fresh start)' || echo 'STARTED FRESH (the open state was not restored)'); roll logging lines: $(echo "$logs" | grep -c '\[c\.rolls'); watchdog lines: $(echo "$logs" | grep -c '\[c\.tunewatchdog')"
}

wait_running() {   # up to 5 minutes; echoes the seconds it took
  local t0=$SECONDS
  while [ $((SECONDS - t0)) -lt 300 ]; do [ "$(state)" = RUNNING ] && { echo $((SECONDS - t0)); return 0; }; sleep 3; done
  echo "-1"; return 1
}

if [ "$CHECK_ONLY" = 1 ]; then say "check only (gateway state: $(state))"; check "$(date -d '-10 minutes' +%s)"; exit 0; fi

say "armed: restart every $INTERVAL min, $CYCLES cycle(s)$([ "$FIRST_NOW" = 1 ] && echo ', first one now'); stop with: touch tools/logs/STOP"
for i in $(seq 1 "$CYCLES"); do
  if [ "$i" -gt 1 ] || [ "$FIRST_NOW" = 0 ]; then
    left=$((INTERVAL * 60))
    while [ "$left" -gt 0 ]; do
      [ -f "$STOP" ] && { say "stop file found: ending after $((i - 1)) cycle(s)"; exit 0; }
      sleep 30; left=$((left - 30))
    done
  fi
  [ -f "$STOP" ] && { say "stop file found: ending after $((i - 1)) cycle(s)"; exit 0; }
  say "cycle $i of $CYCLES: restarting $C"
  t=$(date +%s)
  "$D" restart "$C" >/dev/null 2>&1
  took=$(wait_running)
  if [ "$took" = "-1" ]; then say "  gateway NOT running 5 minutes after the restart (state: $(state))"; else say "  RUNNING after ${took}s"; fi
  sleep 120     # let the tag scripts, the database and the OPC connection settle
  check "$t"
  say "cycle $i done"
done
say "all $CYCLES cycle(s) done"
