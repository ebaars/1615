"""A stand-in for PulseMQ (Cognito sign-in + MachineIQ POST /api/edge/iot-register) to test the gateway's Register button without real credentials.
Run by mqtt_test.sh in a python container that shares the Ignition container's network:  python mqtt_mock_cloud.py /ingest-parent
The certificate request is checked with the CLOUD's own parser (edge_iot_registration.check_csr, MachineIQ lambda/machines/MachineManagement), so a request the
real cloud would refuse fails here too. Behaviour is chosen by the serial: ACTIVEPRINCIPAL -> 409, WRONGKEY00000 -> a certificate for another key,
WRONGCA0000000 -> a CA that is not Amazon Root CA 1, anything else -> a good certificate. Login: tester@example.com / correct-password."""
import datetime, json, sys, types, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

# the cloud module imports boto3 and its own helpers at the top; only the CSR parser is needed here
for name in ("boto3", "boto3.dynamodb", "boto3.dynamodb.conditions", "authz", "esignature"):
    sys.modules[name] = types.ModuleType(name)
sys.modules["boto3.dynamodb.conditions"].Attr = sys.modules["boto3.dynamodb.conditions"].Key = object
sys.path.insert(0, sys.argv[1])
import edge_iot_registration as cloud

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

CA_PEM = urllib.request.urlopen("https://www.amazontrust.com/repository/AmazonRootCA1.pem", timeout=30).read().decode()
ca_cert = x509.load_pem_x509_certificate(CA_PEM.encode())
assert ca_cert.fingerprint(hashes.SHA256()).hex() == "8ecde6884f3d87b1125ba31ac3fcb13d7016de7f57cc904fe1cb97c6ae98196e"
ISSUER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ENDPOINT = "a16mfljxlncm8y-ats.iot.us-east-2.amazonaws.com"


def issue(public_key, thing):
    now = datetime.datetime.now(datetime.timezone.utc)
    return (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, thing)]))
            .issuer_name(ca_cert.subject).public_key(public_key).serial_number(x509.random_serial_number())
            .not_valid_before(now).not_valid_after(now + datetime.timedelta(days=365)).sign(ISSUER_KEY, hashes.SHA256()))


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(200, {"ok": True})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if self.path == "/cognito":
            p = body.get("AuthParameters", {})
            if body.get("AuthFlow") != "USER_PASSWORD_AUTH" or self.headers.get("X-Amz-Target") != "AWSCognitoIdentityProviderService.InitiateAuth":
                return self.reply(400, {"__type": "InvalidParameterException"})
            if p.get("USERNAME") == "tester@example.com" and p.get("PASSWORD") == "correct-password":
                return self.reply(200, {"AuthenticationResult": {"IdToken": "test-id-token"}})
            return self.reply(400, {"__type": "NotAuthorizedException", "message": "Incorrect username or password."})
        if self.path == "/api/edge/iot-register":
            if self.headers.get("Authorization") != "Bearer test-id-token":
                return self.reply(401, {"success": False, "error": "UNAUTHORIZED", "message": "bad token"})
            thing = "%s-%s-%s" % (body["customerId"], body["machineId"], body["serial"])
            try:
                cloud.check_csr(body["csrPem"], thing)
            except Exception as e:
                return self.reply(400, {"success": False, "error": "BAD_CSR", "message": "the cloud's own check refused the request: %s" % e})
            serial = body["serial"]
            if serial == "ACTIVEPRINCIPAL":
                return self.reply(409, {"success": False, "error": "ACTIVE_PRINCIPAL_EXISTS", "message": "Thing %s already has an active certificate. Re-register with rotate=true" % thing})
            csr = x509.load_pem_x509_csr(body["csrPem"].encode())
            key = OTHER_KEY.public_key() if serial == "WRONGKEY00000" else csr.public_key()
            cert = issue(key, thing)
            return self.reply(200, {"success": True, "thingName": thing, "certificateId": "c0ffee" + serial[:8].lower(), "thingCreated": True, "endpoint": ENDPOINT,
                                    "certificatePem": cert.public_bytes(serialization.Encoding.PEM).decode(),
                                    "caPem": (ISSUER_KEY.public_key() and issue(ISSUER_KEY.public_key(), "Not Amazon").public_bytes(serialization.Encoding.PEM).decode()) if serial == "WRONGCA0000000" else CA_PEM})
        self.reply(404, {"error": "NOT_FOUND"})


print("mock cloud ready", flush=True)
HTTPServer(("127.0.0.1", 8099), H).serve_forever()
