# MQTT link to AWS IoT Core: read side for the MQTT page (Maintenance/MQTT, route /mqtt). The connection itself is the gateway tag script
# [cal1615]HMI/mqtt_tick (tools/mqtt_tick.py), which also creates MQTT_CFG in myOracle. The last messages are kept in the gateway globals.
import sys

DB = 'myOracle'

# setting key -> (label, default). The tag script reads them from MQTT_CFG every 15 seconds.
SETTINGS = [
	('enabled', 'MQTT on (1 = on, 0 = off)', '0'),
	('format', 'Format: sparkplug (MachineIQ) or json (one plain topic)', 'sparkplug'),
	('endpoint', 'AWS IoT endpoint (xxxx-ats.iot.<region>.amazonaws.com)', ''),
	('port', 'Port', '8883'),
	('group_id', 'Sparkplug group = customer', 'CUST07'),
	('edge_node_id', 'Sparkplug edge node = machine', 'MACH00'),
	('device_id', 'Sparkplug device = location', 'LOC00'),
	('topic', 'Topic (json format only)', 'CUST07/LOC00/MACH00'),
	('client_id', 'Client id (must be allowed by the AWS IoT policy)', 'cal1615-MACH00'),
	('publish_s', 'Check for changes every (seconds)', '5'),
	('float_tol', 'A float is sent only when it moved more than', '0.2'),
	('critical_s', 'Critical metrics are re-sent every (seconds)', '300'),
	('qos', 'QoS (0 or 1)', '1'),
	('write_tags', 'Metrics / tags that incoming commands may write (comma list, empty = none)', ''),
	('publish_tags', 'Tags to publish (json format only; empty = all logged process values)', ''),
]


def get_cfg():
	"""The settings as a dict (defaults for anything not stored yet)."""
	out = dict((k, d) for k, label, d in SETTINGS)
	try:
		for r in system.db.runPrepQuery('SELECT k AS "k", v AS "v" FROM MQTT_CFG', [], DB):
			if r['k'] in out and r['v'] is not None:
				out[r['k']] = r['v']
	except:
		pass
	return out


def set_cfg(key, value, user=''):
	"""Store one setting. The gateway script picks it up within 15 seconds."""
	if key not in [k for k, label, d in SETTINGS]:
		return False, 'Unknown setting.'
	value = '' if value is None else str(value).strip()
	if key == 'enabled' and value not in ('0', '1'):
		return False, 'MQTT on must be 1 or 0.'
	try:
		system.db.runPrepUpdate('MERGE INTO MQTT_CFG c USING (SELECT ? AS k, ? AS v FROM DUAL) s ON (c.k = s.k) WHEN MATCHED THEN UPDATE SET c.v = s.v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (s.k, s.v)',
			[key, value], DB)
	except:
		return False, 'Could not save: the MQTT table does not exist yet (it is created when the MQTT script first runs).'
	system.util.getLogger('cal1615.mqtt').info('%s set %s = %s' % (user, key, value))
	return True, 'Saved. The MQTT link picks it up within 15 seconds.'


def recent(limit=60):
	"""The last messages, newest first, for the page table."""
	st = system.util.getGlobals().get('cal1615_mqtt')
	if not st:
		return []
	rows = []
	for e in reversed(st['log'][-int(limit):]):
		rows.append({'time': system.date.format(system.date.fromMillis(e['t']), 'MM-dd HH:mm:ss'), 'kind': e['kind'], 'text': e['text']})
	return rows


# ---------------------------------------------------------------- Register with PulseMQ (MachineIQ): the gateway gets its own AWS IoT identity
# The same exchange as the bridge's "Register with PulseMQ" (mqtt-iot-bridge iot_registration.py): the key pair and the certificate request are made HERE, the
# operator signs in to PulseMQ (Cognito) for this one request, MachineIQ (POST /api/edge/iot-register) issues a certificate for the thing
# <customer>-<machine>-<serial>, and only then do the key and the certificate touch the disk. The password and the tokens stay in local variables.
CLOUD_API = 'https://d3c2dqmos71k5j.cloudfront.net/prod'
COGNITO_REGION = 'us-east-2'
COGNITO_CLIENT = 'blr8lujku1ua8qk7bto0g9hsf'
AMAZON_ROOT_CA1_SHA256 = '8ecde6884f3d87b1125ba31ac3fcb13d7016de7f57cc904fe1cb97c6ae98196e'
CERT_DIR = '/usr/local/bin/ignition/data/mqtt/'


def _ints(jbytes):
	return [b & 255 for b in jbytes]


def _sb(vals):
	import jarray
	return jarray.array([(b - 256 if b > 127 else b) for b in vals], 'b')


def _len(n):
	if n < 128:
		return [n]
	b = []
	while n:
		b.insert(0, n & 255)
		n >>= 8
	return [128 | len(b)] + b


def _der(tag, content):
	return [tag] + _len(len(content)) + content


def _pem(label, vals):
	from java.util import Base64
	body = Base64.getMimeEncoder(64, _sb([10])).encodeToString(_sb(vals))
	return '-----BEGIN %s-----\n%s\n-----END %s-----\n' % (label, body, label)


def make_key_and_csr(thing_name):
	"""RSA-2048 key pair and a PEM certificate request whose only subject attribute is CN = thing name (PKCS#10, SHA-256 with RSA)."""
	from java.security import KeyPairGenerator, Signature
	kpg = KeyPairGenerator.getInstance('RSA')
	kpg.initialize(2048)
	kp = kpg.generateKeyPair()
	cn = _der(0x30, _der(0x31, _der(0x30, [0x06, 0x03, 0x55, 0x04, 0x03] + _der(0x0c, list(bytearray(thing_name.encode('utf-8')))))))
	info = _der(0x30, [0x02, 0x01, 0x00] + cn + _ints(kp.getPublic().getEncoded()) + [0xa0, 0x00])
	sig = Signature.getInstance('SHA256withRSA')
	sig.initSign(kp.getPrivate())
	sig.update(_sb(info))
	alg = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00]
	csr = _der(0x30, info + alg + _der(0x03, [0x00] + _ints(sig.sign())))
	return kp, _pem('CERTIFICATE REQUEST', csr)


def _post(url, headers, body):
	r = system.net.httpClient(timeout=30000).post(url, data=body, headers=headers)
	return r.statusCode, r.text


def _json(text):
	try:
		d = system.util.jsonDecode(text)
		return d if isinstance(d, dict) else {}
	except:
		return {}


def _put(key, value):
	system.db.runPrepUpdate('MERGE INTO MQTT_CFG c USING (SELECT ? AS k, ? AS v FROM DUAL) s ON (c.k = s.k) WHEN MATCHED THEN UPDATE SET c.v = s.v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (s.k, s.v)', [key, str(value)], DB)


def default_serial():
	"""This gateway's serial for the thing name: made once, then kept in MQTT_CFG (8-32 letters or digits)."""
	try:
		for r in system.db.runPrepQuery('SELECT v AS "v" FROM MQTT_CFG WHERE k = ?', ['serial'], DB):
			if r['v']:
				return r['v']
	except:
		return ''
	from java.util import UUID
	serial = UUID.randomUUID().toString().replace('-', '')[:16]
	try:
		_put('serial', serial)
	except:
		pass
	return serial


def _fail(code, text):
	return False, '%s: %s' % (code, text)


def register(customer, machine, serial, email, password, rotate=False, urls=None, directory=None):
	"""One click: returns (ok, message). The message never holds the password, a token, the key or the certificate."""
	import re
	from java.io import ByteArrayInputStream
	from java.security import MessageDigest
	from java.security.cert import CertificateFactory
	u = {'api': CLOUD_API, 'cognito': 'https://cognito-idp.%s.amazonaws.com/' % COGNITO_REGION, 'client': COGNITO_CLIENT}
	u.update(urls or {})
	directory = directory or CERT_DIR
	customer, machine, serial, email = [(x or '').strip() for x in (customer, machine, serial, email)]
	if not serial:
		serial = default_serial()
	if not re.match(r'^[A-Za-z0-9_]{1,40}$', customer) or not re.match(r'^[A-Za-z0-9_]{1,40}$', machine):
		return _fail('BAD_ID', 'Customer and machine must be 1-40 letters, digits or _.')
	if not re.match(r'^[A-Za-z0-9]{8,32}$', serial):
		return _fail('BAD_SERIAL', 'Serial must be 8-32 letters or digits.')
	if not re.match(r'^[^@\s]{1,128}@[^@\s]{1,253}$', email) or not password:
		return _fail('CREDENTIALS_REQUIRED', 'PulseMQ email and password are required.')
	if not (u['api'].startswith('https://') or u['api'].startswith('http://127.0.0.1')):
		return _fail('BAD_CONFIG', 'The cloud address must be https.')
	thing = '%s-%s-%s' % (customer, machine, serial)
	kp, csr = make_key_and_csr(thing)

	try:                                                                  # 1. sign in (the password is used for this one request)
		status, text = _post(u['cognito'], {'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'},
			system.util.jsonEncode({'AuthFlow': 'USER_PASSWORD_AUTH', 'ClientId': u['client'], 'AuthParameters': {'USERNAME': email, 'PASSWORD': password}}))
	except:
		return _fail('COGNITO_UNREACHABLE', 'Could not reach PulseMQ sign-in.')
	data = _json(text)
	if status != 200:
		kind = str(data.get('__type') or '').split('#')[-1]
		if kind in ('NotAuthorizedException', 'UserNotFoundException'):
			return _fail('SIGN_IN_FAILED', 'wrong PulseMQ email or password.')
		return _fail('SIGN_IN_FAILED', 'PulseMQ sign-in failed (HTTP %s %s).' % (status, kind or 'error'))
	if data.get('ChallengeName'):
		return _fail('SIGN_IN_CHALLENGE', 'PulseMQ asks for %s. Sign in to the PulseMQ dashboard once to complete it, then try again.' % data['ChallengeName'])
	token = (data.get('AuthenticationResult') or {}).get('IdToken')
	if not token:
		return _fail('SIGN_IN_FAILED', 'PulseMQ returned no ID token.')

	try:                                                                  # 2. MachineIQ issues the certificate
		status, text = _post(u['api'].rstrip('/') + '/api/edge/iot-register', {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
			system.util.jsonEncode({'customerId': customer, 'machineId': machine, 'serial': serial, 'csrPem': csr, 'rotate': bool(rotate)}))
	except:
		return _fail('CLOUD_UNREACHABLE', 'Could not reach PulseMQ.')
	finally:
		token = None
	res = _json(text)
	if status != 200 or not res.get('success'):
		return _fail(str(res.get('error') or 'CLOUD_ERROR'), 'PulseMQ refused the registration: %s' % (res.get('message') or res.get('Message') or 'HTTP %s' % status))

	# 3. trust nothing in the answer that can be checked
	endpoint = str(res.get('endpoint') or '')
	if res.get('thingName') != thing:
		return _fail('BAD_RESPONSE', 'PulseMQ returned a certificate for a different thing.')
	if not re.match(r'^[a-z0-9]+-ats\.iot\.[a-z]{2}(-gov)?-[a-z]+-\d\.amazonaws\.com$', endpoint):
		return _fail('BAD_RESPONSE', 'PulseMQ returned an unexpected IoT endpoint.')
	try:
		cf = CertificateFactory.getInstance('X.509')
		cert = cf.generateCertificate(ByteArrayInputStream(_sb(list(bytearray(str(res.get('certificatePem') or ''))))))
		ca = cf.generateCertificate(ByteArrayInputStream(_sb(list(bytearray(str(res.get('caPem') or ''))))))
	except:
		return _fail('BAD_RESPONSE', 'PulseMQ returned an unreadable certificate.')
	if _ints(cert.getPublicKey().getEncoded()) != _ints(kp.getPublic().getEncoded()):
		return _fail('BAD_RESPONSE', "The issued certificate is not for this gateway's key.")
	fp = ''.join(['%02x' % b for b in _ints(MessageDigest.getInstance('SHA-256').digest(ca.getEncoded()))])
	if fp != AMAZON_ROOT_CA1_SHA256:
		return _fail('BAD_RESPONSE', 'PulseMQ returned a CA that is not Amazon Root CA 1.')

	# 4. only now does the private key touch the disk; the files being replaced are moved aside, not deleted
	from java.io import File
	from java.nio.file import Files, Paths, StandardCopyOption
	try:
		stamp = system.date.format(system.date.now(), 'yyyyMMdd-HHmmss-SSS')
		old = [n for n in ('certificate.pem.crt', 'private.pem.key', 'AmazonRootCA1.pem') if File(directory + n).exists()]
		if old:
			File(directory + 'replaced-' + stamp).mkdirs()
			for n in old:
				Files.move(Paths.get(directory + n), Paths.get(directory + 'replaced-' + stamp + '/' + n))
		for name, text, private in (('private.pem.key', _pem('PRIVATE KEY', _ints(kp.getPrivate().getEncoded())), True), ('certificate.pem.crt', _pem('CERTIFICATE', _ints(cert.getEncoded())), False),
				('AmazonRootCA1.pem', _pem('CERTIFICATE', _ints(ca.getEncoded())), False)):
			tmp = Paths.get(directory + '.' + name + '.tmp')
			Files.write(tmp, _sb(list(bytearray(text.encode('utf-8')))))
			if private:
				try:
					from java.nio.file.attribute import PosixFilePermissions
					Files.setPosixFilePermissions(tmp, PosixFilePermissions.fromString('rw-------'))
				except:
					pass
			Files.move(tmp, Paths.get(directory + name), StandardCopyOption.REPLACE_EXISTING)
	except:
		return _fail('WRITE_FAILED', 'The certificate was issued but could not be saved (%s). Register again with "replace existing" ticked to get a new one.' % sys.exc_info()[1])

	try:
		for k, v in (('group_id', customer), ('edge_node_id', machine), ('client_id', thing), ('endpoint', endpoint), ('serial', serial)):
			_put(k, v)
	except:
		return _fail('SETTINGS_FAILED', 'The certificate was saved but the settings could not be updated. Set the client id to %s by hand.' % thing)
	system.util.getLogger('cal1615.mqtt').info('Registered thing %s (certificate %s)' % (thing, res.get('certificateId')))
	return True, 'Registered %s. Certificate %s. The gateway reconnects with it within a minute.' % (thing, res.get('certificateId') or '')
