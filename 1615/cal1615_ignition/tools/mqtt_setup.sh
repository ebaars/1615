#!/bin/bash
# One-time setup of the MQTT link on the gateway container: creates data/mqtt and puts the Paho client jar in data/mqtt/lib.
# The certificate files are NOT handled here (the private key must never pass through git or a script log). Copy them yourself:
#   docker cp certificate.pem.crt ignition8-3:/usr/local/bin/ignition/data/mqtt/
#   docker cp private.pem.key     ignition8-3:/usr/local/bin/ignition/data/mqtt/
#   docker cp AmazonRootCA1.pem   ignition8-3:/usr/local/bin/ignition/data/mqtt/
# Then fill in the endpoint on the MQTT page (Maintenance > MQTT) and switch MQTT on.
set -e
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
C="${CONTAINER:-ignition8-3}"
V=1.2.5
J="org.eclipse.paho.client.mqttv3-$V.jar"
mkdir -p logs
curl -sSfL -o "logs/$J" "https://repo1.maven.org/maven2/org/eclipse/paho/org.eclipse.paho.client.mqttv3/$V/$J"
docker exec "$C" mkdir -p /usr/local/bin/ignition/data/mqtt/lib
docker cp "logs/$J" "$C:/usr/local/bin/ignition/data/mqtt/lib/$J"
rm -f "logs/$J"
docker exec "$C" ls -la /usr/local/bin/ignition/data/mqtt /usr/local/bin/ignition/data/mqtt/lib
