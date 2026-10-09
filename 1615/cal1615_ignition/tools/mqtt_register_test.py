# Test of the Register button's code (cal1615.mqtt.register in ignition/script-python/cal1615/mqtt/code.py) against tools/mqtt_mock_cloud.py, which stands in for
# PulseMQ and checks the certificate request with the cloud's own parser. Jython, no gateway. Run by tools/mqtt_test.sh.
from __future__ import division
import json, os, sys

SRC = open('/tmp/mqtt_code.py').read()
D = '/tmp/regtest/'
URLS = {'api': 'http://127.0.0.1:8099', 'cognito': 'http://127.0.0.1:8099/cognito', 'client': 'test-client'}

from java.util import Date, Scanner
from java.text import SimpleDateFormat
from java.net import URL
import jarray


class Resp(object):
	pass


class Client(object):
	def post(self, url, data=None, headers=None):
		c = URL(url).openConnection()
		c.setRequestMethod('POST')
		c.setDoOutput(True)
		for k, v in (headers or {}).items():
			c.setRequestProperty(k, v)
		raw = bytearray(data.encode('utf-8'))
		c.getOutputStream().write(jarray.array([(b - 256 if b > 127 else b) for b in raw], 'b'))
		r = Resp()
		r.statusCode = c.getResponseCode()
		s = c.getInputStream() if r.statusCode < 400 else c.getErrorStream()
		r.text = Scanner(s, 'UTF-8').useDelimiter('\\A').next() if s is not None else ''
		return r


class _N(object):
	pass


class Log(object):
	def info(self, m):
		print '      [info]', m


system = _N()
system.util, system.date, system.db, system.net = _N(), _N(), _N(), _N()
system.util.jsonEncode = lambda o: json.dumps(o)
system.util.jsonDecode = lambda s: json.loads(s)
system.util.getLogger = lambda n: Log()
system.date.now = lambda: Date()
system.date.format = lambda d, p: SimpleDateFormat(p).format(d)
system.net.httpClient = lambda timeout=0: Client()
cfg = {}
system.db.runPrepUpdate = lambda sql, args, db: cfg.__setitem__(args[0], args[1])
system.db.runPrepQuery = lambda sql, args, db: [{'v': cfg[args[0]]}] if args and args[0] in cfg else []

ns = {'system': system, '__name__': 'mqtt_code'}
exec compile(SRC, 'code.py', 'exec') in ns
register = ns['register']

passed = failed = 0


def check(name, ok, extra=''):
	global passed, failed
	if ok:
		passed += 1
	else:
		failed += 1
	print '   %s  %s %s' % ('PASS' if ok else 'FAIL', name, extra if not ok else '')


def ls(path):
	return sorted(os.listdir(path)) if os.path.isdir(path) else []


def put(name, text):
	f = open(D + name, 'w')
	f.write(text)
	f.close()


def get(name):
	f = open(D + name)
	try:
		return f.read()
	finally:
		f.close()


os.path.isdir(D) or os.makedirs(D)
for n in ls(D):
	if os.path.isfile(D + n):
		os.remove(D + n)
put('certificate.pem.crt', 'OLD CERT')
put('private.pem.key', 'OLD KEY')
put('AmazonRootCA1.pem', 'OLD CA')

print 'scenario 1: inputs are checked before anything is sent'
ok, msg = register('CUST 04', 'MACH00', '', 'tester@example.com', 'correct-password', urls=URLS, directory=D)
check('bad customer id refused', not ok and msg.startswith('BAD_ID'), msg)
ok, msg = register('CUST04', 'MACH00', 'short', 'tester@example.com', 'correct-password', urls=URLS, directory=D)
check('bad serial refused', not ok and msg.startswith('BAD_SERIAL'), msg)
ok, msg = register('CUST04', 'MACH00', 'GATEWAY0000001', 'not-an-email', 'x', urls=URLS, directory=D)
check('bad email refused', not ok and msg.startswith('CREDENTIALS_REQUIRED'), msg)
ok, msg = register('CUST04', 'MACH00', 'GATEWAY0000001', 'tester@example.com', 'correct-password', urls={'api': 'http://example.com'}, directory=D)
check('plain http to a real host refused', not ok and msg.startswith('BAD_CONFIG'), msg)
check('the old files are untouched', get('private.pem.key') == 'OLD KEY' and get('certificate.pem.crt') == 'OLD CERT')

print 'scenario 2: wrong password and refusals leave the old identity alone'
ok, msg = register('CUST04', 'MACH00', 'GATEWAY0000001', 'tester@example.com', 'wrong', urls=URLS, directory=D)
check('wrong password: sign-in failed, message has no password', not ok and msg.startswith('SIGN_IN_FAILED') and 'wrong' not in msg.replace('wrong PulseMQ', ''), msg)
ok, msg = register('CUST04', 'MACH00', 'ACTIVEPRINCIPAL', 'tester@example.com', 'correct-password', urls=URLS, directory=D)
check('cloud refusal (active certificate exists) is passed on', not ok and msg.startswith('ACTIVE_PRINCIPAL_EXISTS') and 'rotate' in msg, msg)
ok, msg = register('CUST04', 'MACH00', 'WRONGKEY00000', 'tester@example.com', 'correct-password', urls=URLS, directory=D)
check('a certificate for another key is not saved', not ok and 'not for this gateway' in msg, msg)
ok, msg = register('CUST04', 'MACH00', 'WRONGCA0000000', 'tester@example.com', 'correct-password', urls=URLS, directory=D)
check('a CA that is not Amazon Root CA 1 is not saved', not ok and 'Amazon Root CA 1' in msg, msg)
check('still the old files, nothing moved aside', get('private.pem.key') == 'OLD KEY' and get('certificate.pem.crt') == 'OLD CERT' and not [n for n in ls(D) if n.startswith('replaced')], str(ls(D)))

print 'scenario 3: a good registration'
ok, msg = register('CUST04', 'MACH00', 'GATEWAY0000001', 'tester@example.com', 'correct-password', urls=URLS, directory=D)
check('registers (the cloud accepted our certificate request)', ok, msg)
check('the message names the thing', 'CUST04-MACH00-GATEWAY0000001' in msg and 'correct-password' not in msg, msg)
key, crt, ca = get('private.pem.key'), get('certificate.pem.crt'), get('AmazonRootCA1.pem')
check('key, certificate and CA written', key.startswith('-----BEGIN PRIVATE KEY-----') and crt.startswith('-----BEGIN CERTIFICATE-----') and ca.startswith('-----BEGIN CERTIFICATE-----'))
check('the old files were moved aside, not deleted', [n for n in ls(D) if n.startswith('replaced-')] and ls(D + [n for n in ls(D) if n.startswith('replaced-')][0]) == ['AmazonRootCA1.pem', 'certificate.pem.crt', 'private.pem.key'])
check('the settings follow the identity', cfg.get('client_id') == 'CUST04-MACH00-GATEWAY0000001' and cfg.get('group_id') == 'CUST04' and cfg.get('edge_node_id') == 'MACH00'
	and cfg.get('endpoint') == 'a16mfljxlncm8y-ats.iot.us-east-2.amazonaws.com' and cfg.get('serial') == 'GATEWAY0000001', str(cfg))
check('no temporary files left behind', not [n for n in ls(D) if n.endswith('.tmp')], str(ls(D)))
open(D + 'new_key.pem', 'w').write(key)

print 'scenario 4: the serial is made once and kept'
cfg.pop('serial')
s1 = ns['default_serial']()
s2 = ns['default_serial']()
check('a serial of 16 characters, the same the second time', len(s1) == 16 and s1 == s2 and cfg['serial'] == s1, '%s %s' % (s1, s2))
ok, msg = register('CUST04', 'MACH00', '', 'tester@example.com', 'correct-password', urls=URLS, directory=D)
check('an empty serial field uses it', ok and ('CUST04-MACH00-' + s1) in msg, msg)

print
print '=' * 78
print 'RESULT: %d of %d checks passed' % (passed, passed + failed)
sys.exit(0 if failed == 0 else 1)
