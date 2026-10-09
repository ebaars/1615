#!/bin/bash
# Runs tools/mqtt_test.py: starts a throw-away Mosquitto broker with TLS and required client certificates (docker, sharing the Ignition container's
# network), makes test certificates, copies the script and the Paho jar into the container and runs the test under Jython. Nothing of the real
# gateway is touched; the test files go to /tmp in the container and tools/logs/mqtt_test.
set -e
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
C="${CONTAINER:-ignition8-3}"
T=logs/mqtt_test; mkdir -p "$T"; W=$(cygpath -m "$PWD/$T")
docker run --rm -v "$W:/w" -w /w alpine sh -c '
 apk add -q openssl >/dev/null 2>&1
 openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out AmazonRootCA1.pem -subj "/CN=Test Root CA" -days 2 2>/dev/null
 openssl genrsa -traditional -out server.key 2048 2>/dev/null
 openssl req -new -key server.key -subj "/CN=localhost" -out s.csr
 printf "subjectAltName=DNS:localhost,IP:127.0.0.1" > san.ext
 openssl x509 -req -in s.csr -CA AmazonRootCA1.pem -CAkey ca.key -CAcreateserial -out server.crt -days 2 -extfile san.ext 2>/dev/null
 openssl genrsa -traditional -out private.pem.key 2048 2>/dev/null
 openssl pkcs8 -topk8 -nocrypt -in private.pem.key -out private8.pem.key
 openssl req -new -key private.pem.key -subj "/CN=cal1615-gateway" -out c.csr
 openssl x509 -req -in c.csr -CA AmazonRootCA1.pem -CAkey ca.key -CAcreateserial -out certificate.pem.crt -days 2 2>/dev/null
 printf "listener 8883\ncafile /m/AmazonRootCA1.pem\ncertfile /m/server.crt\nkeyfile /m/server.key\nrequire_certificate true\nallow_anonymous true\n" > mosquitto.conf
 chmod 644 *'
docker rm -f mq-test >/dev/null 2>&1 || true
docker run -d --name mq-test --network "container:$C" -v "$W:/m" eclipse-mosquitto:2 mosquitto -c /m/mosquitto.conf >/dev/null
trap 'docker rm -f mq-test >/dev/null 2>&1; sleep 1; rm -rf "$T" 2>/dev/null || true' EXIT
sleep 3
docker exec "$C" sh -c 'rm -rf /tmp/mqtt_test; mkdir -p /tmp/mqtt_test/lib'
for f in AmazonRootCA1.pem certificate.pem.crt private.pem.key private8.pem.key; do docker cp "$T/$f" "$C:/tmp/mqtt_test/$f"; done
docker exec "$C" sh -c 'cp /usr/local/bin/ignition/data/mqtt/lib/*.jar /tmp/mqtt_test/lib/'
docker cp mqtt_tick.py "$C:/tmp/mqtt_tick.py"; docker cp mqtt_test.py "$C:/tmp/mqtt_test.py"
docker exec "$C" java -Dpython.import.site=false -Dpython.path=/usr/local/bin/ignition/user-lib/pylib \
  -cp /usr/local/bin/ignition/lib/core/common/jython-ia-2.7.4.0.jar org.python.util.jython -S /tmp/mqtt_test.py
