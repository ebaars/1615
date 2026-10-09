# cal1615 MQTT link to AWS IoT Core. Runs on the gateway every second (the expression tag [cal1615]HMI/mqtt_tick, now(1000), valueChanged), with no
# page open. Source of the tag script (tools/mqtt_logging.js indents it into the tag) and of the test (tools/mqtt_test.py).
#
# WHAT IT DOES
#  1. Keeps one MQTT client connected to AWS IoT Core (TLS, X.509 device certificate) and reconnects with a growing pause after a failure.
#  2. Publishes the line's process values as one JSON message every publish_s seconds to the topic (default CUST09/LOC00/MACH00):
#       {"src": client_id, "topic": ..., "ts": "2026-10-09T13:00:00Z", "seq": 12, "metrics": [{"name": "p01r12_master_ramped_speed", "value": 21.0}, ...]}
#     The names are tag paths without the [cal1615] provider, the same name/value metrics the Raspberry Pi bridge (mqtt-iot-bridge) uses.
#  3. Subscribes to the same topic. A message in the same format (or a single {"name": ..., "value": ...}) is written to the tag, but ONLY for
#     tags listed in the setting write_tags. Everything else is counted as rejected. Our own messages coming back are ignored (src = client_id).
# Files (the private key never goes into git): data/mqtt/{certificate.pem.crt, private.pem.key, AmazonRootCA1.pem, lib/org.eclipse.paho.client.mqttv3-*.jar}
# Settings: table MQTT_CFG (page Maintenance/MQTT). Messages shown on the page are kept in the gateway globals (cal1615_mqtt).
import sys

DB = 'myOracle'
P = '[cal1615]'
H = P + 'HMI/MQTT/'                  # state shown on the page, and the Publish now button (a pulse)
DIR = '/usr/local/bin/ignition/data/mqtt/'
CERT, KEY, CA = DIR + 'certificate.pem.crt', DIR + 'private.pem.key', DIR + 'AmazonRootCA1.pem'
LIBDIR = DIR + 'lib/'
EXTRA = ['HMI/LineState/state', 'HMI/Rolls/state', 'HMI/Rolls/rolls_done', 'HMI/Rolls/ft_done', 'HMI/shop_order', 'p01_recipe_active/name/name']
TAGS = []   # @@TAGS@@
DEFAULTS = [('enabled', '0'), ('endpoint', ''), ('port', '8883'), ('topic', 'CUST09/LOC00/MACH00'), ('client_id', 'cal1615-gateway'),
	('publish_s', '10'), ('qos', '1'), ('write_tags', ''), ('publish_tags', '')]
GL = system.util.getGlobals()
log = system.util.getLogger('cal1615.mqtt')
st = GL.get('cal1615_mqtt')
if st is None:
	st = {'busy': False, 'ready': False, 'cfg': dict(DEFAULTS), 't_cfg': 0, 'client': None, 'connecting': False, 'fail': 0, 't_try': 0, 't_pub': 0,
		'inq': [], 'log': [], 'warned': {}, 'shown': {}, 'seq': 0, 'n_in': 0, 'n_out': 0, 'n_rej': 0, 'state': 'DISABLED', 'msg': '', 'paho': False,
		'connected': False, 'last_in': None, 'last_out': None, 'conn_id': 0}
	GL['cal1615_mqtt'] = st
for _k, _v in DEFAULTS:      # state kept in the globals by an older version of this script lacks settings added later
	st['cfg'].setdefault(_k, _v)


def err(key, msg):
	"""Log an error at most once a minute per kind: a broken connection must not write a line every second."""
	now = system.date.now().getTime()
	if now - st['warned'].get(key, 0) >= 60000:
		st['warned'][key] = now
		log.error(msg)


def note(kind, text):
	"""Keep the last messages for the page (kind: IN, OUT, EVT, REJ)."""
	st['log'].append({'t': system.date.now().getTime(), 'kind': kind, 'text': text})
	del st['log'][:-100]


def ddl(sql, code):
	return "BEGIN EXECUTE IMMEDIATE '" + sql.replace("'", "''") + "'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != " + str(code) + " THEN RAISE; END IF; END;"


def ensure_db():
	system.db.runUpdateQuery(ddl('CREATE TABLE MQTT_CFG (k VARCHAR2(40) PRIMARY KEY, v VARCHAR2(2000))', -955), DB)
	for k, v in DEFAULTS:
		system.db.runPrepUpdate('MERGE INTO MQTT_CFG c USING (SELECT ? AS k, ? AS v FROM DUAL) s ON (c.k = s.k) WHEN NOT MATCHED THEN INSERT (k, v) VALUES (s.k, s.v)', [k, v], DB)
	st['ready'] = True


def load_cfg(now):
	if st['t_cfg'] and now - st['t_cfg'] < 15000:
		return
	st['t_cfg'] = now
	try:
		if not st['ready']:
			ensure_db()
		for r in system.db.runPrepQuery('SELECT k AS "k", v AS "v" FROM MQTT_CFG', [], DB):
			if r['v'] is not None:
				st['cfg'][r['k']] = r['v']
	except:
		err('cfg', 'Could not read MQTT_CFG: %s' % sys.exc_info()[1])


def num(key, default):
	try:
		return float(st['cfg'][key])
	except:
		return default


def setmsg(state, msg):
	st['state'], st['msg'] = state, msg


# ---------------------------------------------------------------- TLS from the PEM files
def der_len(n):
	if n < 128:
		return [n]
	b = []
	while n:
		b.insert(0, n & 255)
		n >>= 8
	return [128 | len(b)] + b


def pkcs8(pkcs1):
	"""Wrap an RSA PKCS#1 key ("BEGIN RSA PRIVATE KEY", what AWS hands out) in the PKCS#8 envelope Java reads."""
	alg = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]
	inner = [0x02, 0x01, 0x00] + alg + [0x04] + der_len(len(pkcs1)) + pkcs1
	return [0x30] + der_len(len(inner)) + inner


def read_pem(path):
	f = open(path, 'r')
	try:
		return f.read()
	finally:
		f.close()


def pem_bytes(text):
	from java.util import Base64
	body = ''.join([l.strip() for l in text.splitlines() if l.strip() and not l.startswith('-----')])
	return [b & 255 for b in Base64.getMimeDecoder().decode(body)]


def signed(vals):
	import jarray
	return jarray.array([(b - 256 if b > 127 else b) for b in vals], 'b')


def socket_factory():
	from java.io import FileInputStream
	from java.security import KeyStore, KeyFactory
	from java.security.cert import CertificateFactory
	from java.security.spec import PKCS8EncodedKeySpec
	from javax.net.ssl import KeyManagerFactory, TrustManagerFactory, SSLContext
	cf = CertificateFactory.getInstance('X.509')
	cert = cf.generateCertificate(FileInputStream(CERT))
	ca = cf.generateCertificate(FileInputStream(CA))
	text = read_pem(KEY)
	raw = pem_bytes(text)
	der = raw if 'BEGIN PRIVATE KEY' in text else pkcs8(raw)
	pk = KeyFactory.getInstance('RSA').generatePrivate(PKCS8EncodedKeySpec(signed(der)))
	pw = list('mqtt-link')
	ks = KeyStore.getInstance('PKCS12')
	ks.load(None, None)
	ks.setKeyEntry('device', pk, pw, [cert])
	kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
	kmf.init(ks, pw)
	ts = KeyStore.getInstance(KeyStore.getDefaultType())
	ts.load(None, None)
	ts.setCertificateEntry('ca', ca)
	tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
	tmf.init(ts)
	ctx = SSLContext.getInstance('TLSv1.2')
	ctx.init(kmf.getKeyManagers(), tmf.getTrustManagers(), None)
	return ctx.getSocketFactory()


def load_paho():
	"""Put the Paho jar on the Jython path (once). It is not part of Ignition and is not in git: tools/mqtt_setup.sh downloads it."""
	if st['paho']:
		return True
	from java.io import File
	jars = [f for f in (File(LIBDIR).list() or []) if f.startswith('org.eclipse.paho.client.mqttv3') and f.endswith('.jar')]
	if not jars:
		return False
	if LIBDIR + jars[0] not in sys.path:
		sys.path.append(LIBDIR + jars[0])
	st['paho'] = True
	return True


# ---------------------------------------------------------------- connection
def connect_worker(conn_id):
	"""Runs in its own thread: connecting can take 15 s and must not hold up the tag event."""
	try:
		from org.eclipse.paho.client.mqttv3 import MqttClient, MqttConnectOptions, MqttCallback
		from org.eclipse.paho.client.mqttv3.persist import MemoryPersistence

		class Callback(MqttCallback):
			def connectionLost(self, cause):
				st['connected'] = False
				setmsg('RECONNECTING', 'Connection lost: %s' % cause)
				note('EVT', 'Connection lost: %s' % cause)

			def messageArrived(self, topic, message):
				st['inq'].append((str(topic), bytes(bytearray([b & 255 for b in message.getPayload()])), system.date.now().getTime()))
				del st['inq'][:-200]

			def deliveryComplete(self, token):
				pass

		cfg = st['cfg']
		url = 'ssl://%s:%d' % (cfg['endpoint'].strip(), int(num('port', 8883)))
		cid = cfg['client_id'].strip() or 'cal1615-gateway'
		client = MqttClient(url, cid, MemoryPersistence())
		client.setTimeToWait(10000)
		client.setCallback(Callback())
		opts = MqttConnectOptions()
		opts.setCleanSession(True)
		opts.setKeepAliveInterval(60)
		opts.setConnectionTimeout(15)
		opts.setAutomaticReconnect(False)
		opts.setSocketFactory(socket_factory())
		client.connect(opts)
		client.subscribe(cfg['topic'].strip(), int(num('qos', 1)))
		if conn_id != st['conn_id']:           # the settings changed while connecting
			client.disconnect()
			client.close()
			return
		st['client'], st['connected'], st['fail'] = client, True, 0
		setmsg('CONNECTED', 'Connected to %s, subscribed to %s' % (cfg['endpoint'].strip(), cfg['topic'].strip()))
		note('EVT', 'Connected to %s as %s, subscribed to %s' % (cfg['endpoint'].strip(), cid, cfg['topic'].strip()))
		log.info('MQTT connected to %s as %s' % (cfg['endpoint'].strip(), cid))
	except:
		st['fail'] += 1
		e = str(sys.exc_info()[1])
		setmsg('ERROR', 'Connect failed: %s' % e)
		err('connect', 'MQTT connect failed: %s' % e)
		note('EVT', 'Connect failed: %s' % e)
	finally:
		st['connecting'] = False


def drop(why):
	c = st['client']
	st['client'], st['connected'] = None, False
	if c is not None:
		try:
			if c.isConnected():
				c.disconnect(2000)
			c.close()
		except:
			pass
		note('EVT', why)


def start_connect(now):
	st['connecting'] = True
	st['t_try'] = now
	st['conn_id'] += 1
	import threading
	t = threading.Thread(target=connect_worker, args=(st['conn_id'],))
	t.setDaemon(True)
	t.start()


# ---------------------------------------------------------------- publish and receive
def clean(v):
	if v is None:
		return None
	if isinstance(v, bool):
		return v
	if isinstance(v, (int, long)):
		return v
	if isinstance(v, float):
		return None if (v != v or v in (float('inf'), float('-inf'))) else round(v, 4)
	if hasattr(v, 'getTime'):
		return int(v.getTime())
	return str(v)


def publish(now):
	cfg = st['cfg']
	names = [n.strip() for n in cfg['publish_tags'].split(',') if n.strip()] or [t.replace(P, '', 1) for t in TAGS] + EXTRA
	vals = system.tag.readBlocking([P + n for n in names])
	metrics = []
	for n, q in zip(names, vals):
		if q.quality.isGood() and clean(q.value) is not None:
			metrics.append({'name': n, 'value': clean(q.value)})
	st['seq'] += 1
	from java.time import Instant
	msg = {'src': cfg['client_id'].strip(), 'topic': cfg['topic'].strip(), 'ts': Instant.now().toString(),
		'seq': st['seq'], 'metrics': metrics}
	from org.eclipse.paho.client.mqttv3 import MqttMessage
	body = system.util.jsonEncode(msg)
	m = MqttMessage(body.encode('utf-8'))
	m.setQos(int(num('qos', 1)))
	m.setRetained(False)
	st['client'].publish(cfg['topic'].strip(), m)
	st['n_out'] += 1
	st['last_out'] = now
	note('OUT', '%d values, %d bytes (message %d)' % (len(metrics), len(body), st['seq']))


def handle_in():
	allowed = [n.strip() for n in st['cfg']['write_tags'].split(',') if n.strip()]
	own = st['cfg']['client_id'].strip()
	while st['inq']:
		topic, payload, t = st['inq'].pop(0)
		try:
			text = payload.decode('utf-8')
			d = system.util.jsonDecode(text)
		except:
			note('IN', 'not JSON: %s' % payload[:200])
			st['n_in'] += 1
			st['last_in'] = t
			continue
		if isinstance(d, dict) and d.get('src') == own:
			continue                       # our own message, echoed back by the broker
		st['n_in'] += 1
		st['last_in'] = t
		metrics = d.get('metrics') if isinstance(d, dict) else None
		if metrics is None and isinstance(d, dict) and 'name' in d and 'value' in d:
			metrics = [d]
		if not metrics:
			note('IN', 'no metrics: %s' % text[:200])
			continue
		wrote, rej = [], []
		for m in metrics:
			try:
				name, value = m.get('name'), m.get('value')
			except:
				continue
			if name in allowed and value is not None:
				try:
					system.tag.writeBlocking([P + name], [value])
					wrote.append(name)
				except:
					rej.append('%s (%s)' % (name, sys.exc_info()[1]))
			else:
				rej.append('%s (not in write_tags)' % name)
		st['n_rej'] += len(rej)
		note('IN', '%d metrics: wrote %s' % (len(metrics), ', '.join(wrote) if wrote else 'nothing'))
		if rej:
			note('REJ', 'refused: ' + ', '.join(rej)[:300])


def show(now):
	"""Write the state tags that changed since the last time."""
	want = {'state': st['state'], 'msg': st['msg'], 'connected': bool(st['connected']), 'count_out': st['n_out'], 'count_in': st['n_in'], 'rejected': st['n_rej']}
	if st['last_out']:
		want['last_out'] = system.date.toDate(st['last_out'])
	if st['last_in']:
		want['last_in'] = system.date.toDate(st['last_in'])
	chg = [k for k in want if st['shown'].get(k) != want[k]]
	if chg:
		system.tag.writeBlocking([H + k for k in chg], [want[k] for k in chg])
		for k in chg:
			st['shown'][k] = want[k]


def run():
	now = system.date.now().getTime()
	load_cfg(now)
	cfg = st['cfg']
	if cfg['enabled'].strip() not in ('1', '1.0', 'true', 'True'):
		if st['client'] is not None:
			drop('MQTT switched off')
		st['conn_id'] += 1
		setmsg('DISABLED', 'MQTT is off. Switch it on on the MQTT page once the endpoint is set.')
		show(now)
		return
	if not cfg['endpoint'].strip():
		setmsg('NOT CONFIGURED', 'No AWS IoT endpoint set.')
		show(now)
		return
	if not load_paho():
		setmsg('NO LIBRARY', 'The Paho jar is missing from %s (run tools/mqtt_setup.sh).' % LIBDIR)
		show(now)
		return
	if not (system.file.fileExists(CERT) and system.file.fileExists(KEY) and system.file.fileExists(CA)):
		setmsg('NO CERTIFICATE', 'Put certificate.pem.crt, private.pem.key and AmazonRootCA1.pem in %s' % DIR)
		show(now)
		return
	c = st['client']
	if c is not None and not c.isConnected():
		drop('Connection lost')
		c = None
	if c is None:
		if not st['connecting'] and now - st['t_try'] >= min(60000, 5000 * (2 ** min(st['fail'], 4))):
			setmsg('CONNECTING', 'Connecting to %s ...' % cfg['endpoint'].strip())
			start_connect(now)
		show(now)
		return
	handle_in()
	pulse = system.tag.readBlocking([H + 'publish_now'])[0].value
	if pulse or now - st['t_pub'] >= max(1.0, num('publish_s', 10.0)) * 1000.0:
		st['t_pub'] = now
		if pulse:
			system.tag.writeBlocking([H + 'publish_now'], [False])
		publish(now)
	show(now)


if not st['busy']:                           # two overlapping runs would publish twice
	st['busy'] = True
	try:
		run()
	except:
		err('run', 'MQTT failed: %s' % sys.exc_info()[1])
		setmsg('ERROR', str(sys.exc_info()[1]))
	finally:
		st['busy'] = False
