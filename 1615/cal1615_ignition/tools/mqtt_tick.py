# cal1615 MQTT link to AWS IoT Core. Runs on the gateway every second (the expression tag [cal1615]HMI/mqtt_tick, now(1000), valueChanged), with no
# page open. Source of the tag script (tools/mqtt_logging.js indents it into the tag) and of the test (tools/mqtt_test.py).
#
# WHAT IT DOES
#  1. Keeps one MQTT client connected to AWS IoT Core (TLS, X.509 device certificate) and reconnects with a growing pause after a failure.
#  2. format = sparkplug (default): speaks Sparkplug B, which is what the MachineIQ cloud ingests, with the default identity (group CUST07, edge node MACH00, device LOC00):
#       NBIRTH + DBIRTH (retained) on connect, DDATA with the metrics that changed (floats only past float_tol, critical ones on any change and every
#       critical_s), NDEATH as last will, and a rebirth when an NCMD asks for Node Control/Rebirth. The metrics are the 109 PLC tags of
#       tools/aj_line_tags.csv under the names MachineIQ expects (the MES Signal column). Commands (NCMD/DCMD) write tags listed in write_tags only.
#     format = json: one JSON message every publish_s seconds to the setting topic, {"src", "topic", "ts", "seq", "metrics": [{"name", "value"}]}, and the
#     same topic is subscribed: name/value metrics write the tags in write_tags. Our own messages coming back (src = client id) are ignored.
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
# the Sparkplug metrics: (metric name, Ignition tag path without the provider, type float|int|bool|string, critical)
AJ = []     # @@AJ@@
DEFAULTS = [('enabled', '0'), ('format', 'sparkplug'), ('endpoint', ''), ('port', '8883'), ('group_id', 'CUST07'), ('edge_node_id', 'MACH00'), ('device_id', 'LOC00'),
	('topic', 'CUST07/LOC00/MACH00'), ('client_id', 'cal1615-MACH00'), ('publish_s', '5'), ('float_tol', '0.2'), ('critical_s', '300'), ('qos', '1'),
	('write_tags', ''), ('publish_tags', '')]
GL = system.util.getGlobals()
log = system.util.getLogger('cal1615.mqtt')
st = GL.get('cal1615_mqtt')
if st is None:
	st = {'busy': False, 'ready': False, 'cfg': dict(DEFAULTS), 't_cfg': 0, 'client': None, 'connecting': False, 'fail': 0, 't_try': 0, 't_pub': 0,
		'inq': [], 'log': [], 'warned': {}, 'shown': {}, 'seq': 0, 'n_in': 0, 'n_out': 0, 'n_rej': 0, 'state': 'DISABLED', 'msg': '', 'paho': False,
		'connected': False, 'last_in': None, 'last_out': None, 'conn_id': 0,
		'need_birth': False, 'spb_seq': 0, 'bd_seq': 0, 'last': {}, 'last_t': {}}
	GL['cal1615_mqtt'] = st
for _k, _v in {'need_birth': False, 'spb_seq': 0, 'bd_seq': 0, 'last': {}, 'last_t': {}, 'cls': None}.items():
	st.setdefault(_k, _v)
for _k, _v in DEFAULTS:      # state kept in the globals by an older version of this script lacks settings added later
	st['cfg'].setdefault(_k, _v)


def err(key, msg):
	"""Log an error at most once a minute per kind: a broken connection must not write a line every second."""
	now = system.date.now().getTime()
	key = key + msg[:80]
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
	"""Load the Paho jar ONCE, with a class loader of its own, and keep the classes in the gateway globals. The jar is not part of Ignition and is not in
	git: tools/mqtt_setup.sh downloads it. Putting it on sys.path would not do: every tag event run has its own Jython path, so a class that Paho's own
	threads load later (CommsReceiver ...) is not found once the run that added the path has ended."""
	if st.get('cls'):
		return True
	from java.io import File
	jars = [f for f in (File(LIBDIR).list() or []) if f.startswith('org.eclipse.paho.client.mqttv3') and f.endswith('.jar')]
	if not jars:
		return False
	import jarray
	from java.lang import Class, ClassLoader
	from java.net import URL, URLClassLoader
	from org.python.core import Py
	loader = URLClassLoader(jarray.array([File(LIBDIR + jars[0]).toURI().toURL()], URL), ClassLoader.getSystemClassLoader())

	def jc(name):
		return Py.java2py(Class.forName(name, True, loader))
	base = 'org.eclipse.paho.client.mqttv3.'
	st['cls'] = {'MqttClient': jc(base + 'MqttClient'), 'MqttConnectOptions': jc(base + 'MqttConnectOptions'), 'MqttCallback': jc(base + 'MqttCallback'),
		'MqttMessage': jc(base + 'MqttMessage'), 'MemoryPersistence': jc(base + 'persist.MemoryPersistence')}
	st['paho'] = True
	log.info('Paho loaded from %s' % (LIBDIR + jars[0]))
	return True


# ---------------------------------------------------------------- connection
def connect_worker(conn_id):
	"""Runs in its own thread: connecting can take 15 s and must not hold up the tag event."""
	try:
		K = st['cls']
		MqttClient, MqttConnectOptions, MqttCallback, MemoryPersistence = K['MqttClient'], K['MqttConnectOptions'], K['MqttCallback'], K['MemoryPersistence']

		class Callback(MqttCallback):
			def connectionLost(self, cause):
				st['connected'] = False
				why = 'Connection lost after %d s, while: %s (%s)' % ((system.date.now().getTime() - st.get('t_conn', 0)) / 1000, st.get('op', '?'), cause)
				setmsg('RECONNECTING', why)
				note('EVT', why)
				err('lost', 'MQTT ' + why)

			def messageArrived(self, topic, message):
				st['inq'].append((str(topic), bytes(bytearray([b & 255 for b in message.getPayload()])), system.date.now().getTime()))
				del st['inq'][:-200]

			def deliveryComplete(self, token):
				pass

		cfg = st['cfg']
		spb = cfg['format'].strip().lower() == 'sparkplug'
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
		now = system.date.now().getTime()
		if spb:                               # NDEATH is the last will; its bdSeq pairs it with this connection's NBIRTH
			st['bd_seq'] = (st['bd_seq'] + 1) & 255
			opts.setWill(spb_topic('NDEATH'), signed(payload_pb(now, [metric_pb('bdSeq', now, 4, st['bd_seq'])], None)), 1, False)
		st['op'] = 'connecting'
		client.connect(opts)
		st['t_conn'] = system.date.now().getTime()
		st['op'] = 'subscribing'
		subs = [spb_topic('NCMD'), spb_topic('DCMD')] if spb else [cfg['topic'].strip()]
		for t in subs:
			client.subscribe(t, int(num('qos', 1)))
		if conn_id != st['conn_id']:           # the settings changed while connecting
			client.disconnect()
			client.close()
			return
		st['client'], st['connected'], st['fail'], st['need_birth'] = client, True, 0, spb
		st['op'] = 'connected, nothing sent yet'
		setmsg('CONNECTED', 'Connected to %s, subscribed to %s' % (cfg['endpoint'].strip(), ', '.join(subs)))
		note('EVT', 'Connected to %s as %s, subscribed to %s' % (cfg['endpoint'].strip(), cid, ', '.join(subs)))
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
	log.warn('MQTT dropped: %s (last operation: %s)' % (why, st.get('op', '?')))
	st['client'], st['connected'] = None, False
	if c is not None:
		try:
			if c.isConnected():
				c.disconnect(2000)
			c.close()
		except:
			pass
		note('EVT', why)


def ident():
	"""What the connection depends on: when it changes (new certificate after a registration, another endpoint or client id) the gateway reconnects."""
	from java.io import File
	c = st['cfg']
	return (c['endpoint'].strip(), c['port'], c['client_id'].strip(), c['format'], c['group_id'].strip(), c['edge_node_id'].strip(), c['device_id'].strip(), c['topic'].strip(),
		File(CERT).lastModified(), File(KEY).lastModified(), File(CA).lastModified())


def start_connect(now):
	st['ident'] = ident()
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
	MqttMessage = st['cls']['MqttMessage']
	body = system.util.jsonEncode(msg)
	m = MqttMessage(body.encode('utf-8'))
	m.setQos(int(num('qos', 1)))
	m.setRetained(False)
	st['client'].publish(cfg['topic'].strip(), m)
	st['n_out'] += 1
	st['last_out'] = now
	note('OUT', '%d values, %d bytes (message %d)' % (len(metrics), len(body), st['seq']))


def handle_in():
	if st['cfg']['format'].strip().lower() == 'sparkplug':
		return handle_in_spb()
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


# ---------------------------------------------------------------- Sparkplug B (the protobuf is written by hand: the gateway has no protobuf library)
DT = {'float': 9, 'int': 3, 'bool': 11, 'string': 12}      # Sparkplug datatypes: Float, Int32, Boolean, String


def vint(n):
	n = long(n)
	out = []
	while True:
		b = n & 0x7f
		n >>= 7
		if n:
			out.append(b | 0x80)
		else:
			out.append(b)
			return out


def pb_len(tag, data):
	return [tag] + vint(len(data)) + data


def pb_str(s):
	if not isinstance(s, unicode):
		s = unicode(str(s), 'utf-8', 'replace')
	return list(bytearray(s.encode('utf-8')))


def metric_pb(name, ts, dtype, value, is_null=False):
	"""One Metric: name (1), timestamp (3), datatype (4), is_null (7), then the value in the field its datatype uses (10 int, 11 long, 12 float, 14 bool, 15 string)."""
	import struct
	out = pb_len(0x0a, pb_str(name)) + [0x18] + vint(ts) + [0x20] + vint(dtype)
	if is_null:
		return out + [0x38, 1]
	if dtype == 3:
		out += [0x50] + vint(int(value) & 0xFFFFFFFF)               # Int32 as 32-bit two's complement, as the cloud decoder expects
	elif dtype == 4:
		out += [0x58] + vint(int(value) & 0xFFFFFFFFFFFFFFFF)
	elif dtype == 9:
		out += [0x65] + list(bytearray(struct.pack('<f', float(value))))
	elif dtype == 11:
		out += [0x70, 1 if value else 0]
	else:
		out += pb_len(0x7a, pb_str(value))
	return out


def payload_pb(ts, metrics, seq):
	out = [0x08] + vint(ts)
	for m in metrics:
		out += pb_len(0x12, m)
	if seq is not None:
		out += [0x18] + vint(seq)
	return out


def rd_varint(data, i):
	v, shift = 0, 0
	while True:
		b = data[i]
		i += 1
		v |= (b & 0x7f) << shift
		if not b & 0x80:
			return v, i
		shift += 7


def pb_read(data):
	"""All (field, wire type, value) of one message; a length-delimited value is a list of byte ints."""
	i, out = 0, []
	while i < len(data):
		key, i = rd_varint(data, i)
		f, wt = key >> 3, key & 7
		if wt == 0:
			v, i = rd_varint(data, i)
		elif wt == 2:
			n, i = rd_varint(data, i)
			v, i = data[i:i + n], i + n
		elif wt == 5:
			v, i = data[i:i + 4], i + 4
		elif wt == 1:
			v, i = data[i:i + 8], i + 8
		else:
			raise ValueError('wire type %d' % wt)
		out.append((f, wt, v))
	return out


def decode_metrics(raw):
	"""The metrics of a Sparkplug payload as dicts {name, datatype, value} (enough to read a rebirth request or a write command)."""
	import struct
	out = []
	for f, wt, v in pb_read(list(bytearray(raw))):
		if f != 2:
			continue
		m = {'name': '', 'datatype': 0, 'value': None}
		for f2, wt2, v2 in pb_read(v):
			if f2 == 1:
				m['name'] = str(bytearray(v2)).decode('utf-8', 'replace')
			elif f2 == 4:
				m['datatype'] = v2
			elif f2 == 10:
				m['value'] = v2 - 0x100000000 if v2 >= 0x80000000 else v2
			elif f2 == 11:
				m['value'] = v2 - 0x10000000000000000 if v2 >= 0x8000000000000000 else v2
			elif f2 == 12:
				m['value'] = struct.unpack('<f', str(bytearray(v2)))[0]
			elif f2 == 13:
				m['value'] = struct.unpack('<d', str(bytearray(v2)))[0]
			elif f2 == 14:
				m['value'] = bool(v2)
			elif f2 == 15:
				m['value'] = str(bytearray(v2)).decode('utf-8', 'replace')
		out.append(m)
	return out


def spb_topic(kind):
	c = st['cfg']
	t = 'spBv1.0/%s/%s/%s' % (c['group_id'].strip(), kind, c['edge_node_id'].strip())
	if kind.startswith('D'):
		t += '/' + c['device_id'].strip()
	return t


def spb_send(kind, metrics, retain, now):
	MqttMessage = st['cls']['MqttMessage']
	if kind == 'NBIRTH':
		st['spb_seq'] = 0
	seq = st['spb_seq']
	st['spb_seq'] = (seq + 1) & 255
	m = MqttMessage(signed(payload_pb(now, metrics, seq)))
	m.setQos(int(num('qos', 1)))
	m.setRetained(retain)
	st['op'] = 'publishing %s (%d bytes%s)' % (kind, len(payload_pb(now, metrics, seq)), ', retained' if retain else '')
	st['client'].publish(spb_topic(kind), m)
	st['op'] = 'idle after %s' % kind
	st['n_out'] += 1
	st['last_out'] = now


def read_aj():
	"""[(metric definition, value in the metric's type or None, good)] for every Sparkplug metric."""
	out = []
	for a, q in zip(AJ, system.tag.readBlocking([P + d[1] for d in AJ])):
		v = q.value
		good = bool(q.quality.isGood()) and v is not None
		if good:
			try:
				if a[2] == 'float':
					v = float(v)
					good = v == v and v not in (float('inf'), float('-inf'))
				elif a[2] == 'int':
					v = int(v)
				elif a[2] == 'bool':
					v = bool(v)
				else:
					v = v if isinstance(v, basestring) else str(v)
			except:
				good = False
		out.append((a, v if good else None, good))
	return out


def spb_birth(now):
	"""NBIRTH, then DBIRTH with EVERY metric: the cloud replaces its whole signal map with a birth, so a metric left out is deleted there."""
	spb_send('NBIRTH', [metric_pb('bdSeq', now, 4, st['bd_seq']), metric_pb('Node Control/Rebirth', now, 11, False), metric_pb('Node Control/Reboot', now, 11, False),
		metric_pb('Properties/Version', now, 12, '1.0.0'), metric_pb('Properties/Software', now, 12, 'cal1615 Ignition gateway')], True, now)
	st['last'], st['last_t'] = {}, {}
	ms, bad = [], 0
	for a, v, good in read_aj():
		ms.append(metric_pb(a[0], now, DT[a[2]], v, not good))
		bad += 0 if good else 1
		if good:
			st['last'][a[0]], st['last_t'][a[0]] = v, now
	spb_send('DBIRTH', ms, True, now)
	note('OUT', 'NBIRTH + DBIRTH, %d metrics, %d with no good value' % (len(ms), bad))


def spb_changes(now, everything=False):
	"""DDATA with what changed: a float only when it moved more than float_tol, a critical metric on any change and again every critical_s."""
	tol, crit = num('float_tol', 0.2), num('critical_s', 300.0) * 1000.0
	ms = []
	for a, v, good in read_aj():
		if not good:
			continue
		name = a[0]
		send = everything or name not in st['last']
		if not send:
			old = st['last'][name]
			if a[2] == 'float':
				send = abs(v - old) > tol or (a[3] and v != old)
			else:
				send = v != old
			if not send and a[3] and now - st['last_t'].get(name, 0) >= crit:
				send = True
		if send:
			ms.append(metric_pb(name, now, DT[a[2]], v))
			st['last'][name], st['last_t'][name] = v, now
	if ms:
		spb_send('DDATA', ms, False, now)
		note('OUT', 'DDATA, %d metrics (message %d)' % (len(ms), (st['spb_seq'] - 1) & 255))


def spb_cycle(now, pulse):
	if st['need_birth']:
		st['need_birth'] = False
		spb_birth(now)
		st['t_pub'] = now
		return
	if pulse or now - st['t_pub'] >= max(1.0, num('publish_s', 5.0)) * 1000.0:
		st['t_pub'] = now
		spb_changes(now, bool(pulse))


def handle_in_spb():
	allowed = [n.strip() for n in st['cfg']['write_tags'].split(',') if n.strip()]
	paths = dict((a[0], a[1]) for a in AJ)
	while st['inq']:
		topic, payload, t = st['inq'].pop(0)
		st['n_in'] += 1
		st['last_in'] = t
		kind = topic.split('/')[2] if topic.count('/') >= 3 else '?'
		try:
			metrics = decode_metrics(payload)
		except:
			note('IN', '%s: not a Sparkplug payload (%s)' % (kind, sys.exc_info()[1]))
			continue
		wrote, rej = [], []
		for m in metrics:
			if m['name'] == 'Node Control/Rebirth' and m['value']:
				st['need_birth'] = True
				note('IN', '%s: rebirth requested' % kind)
			elif m['name'] in ('Node Control/Reboot', 'Node Control/Next Server', 'Node Control/Scan Rate'):
				rej.append('%s (not supported)' % m['name'])
			elif m['name'] in allowed and m['value'] is not None:
				try:
					system.tag.writeBlocking([P + paths.get(m['name'], m['name'])], [m['value']])
					wrote.append(m['name'])
				except:
					rej.append('%s (%s)' % (m['name'], sys.exc_info()[1]))
			else:
				rej.append('%s (not in write_tags)' % m['name'])
		st['n_rej'] += len(rej)
		if wrote:
			note('IN', '%s: wrote %s' % (kind, ', '.join(wrote)))
		if rej:
			note('REJ', 'refused: ' + ', '.join(rej)[:300])


def show(now):
	"""Write the state tags that changed since the last time."""
	want = {'state': st['state'], 'msg': st['msg'], 'connected': bool(st['connected']), 'count_out': st['n_out'], 'count_in': st['n_in'], 'rejected': st['n_rej']}
	if st['last_out']:
		want['last_out'] = system.date.fromMillis(st['last_out'])
	if st['last_in']:
		want['last_in'] = system.date.fromMillis(st['last_in'])
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
	if c is not None and st.get('ident') != ident():
		drop('Settings or certificate changed: reconnecting')
		st['fail'], st['t_try'] = 0, 0
		c = None
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
	if pulse:
		system.tag.writeBlocking([H + 'publish_now'], [False])
	if cfg['format'].strip().lower() == 'sparkplug':
		spb_cycle(now, pulse)
		show(now)
		return
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
