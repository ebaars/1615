# Test of the MQTT script (tools/mqtt_tick.py) against a real broker with TLS and client certificates (Mosquitto), with fake tags and a fake Oracle.
# Jython, no gateway. Needs the broker and certificates: tools/mqtt_test.sh sets all of it up and runs this file.
#   docker exec ignition8-3 java -Dpython.import.site=false -Dpython.path=/usr/local/bin/ignition/user-lib/pylib \
#     -cp /usr/local/bin/ignition/lib/core/common/jython-ia-2.7.4.0.jar org.python.util.jython -S /tmp/mqtt_test.py
from __future__ import division
import json, os, sys, time

SRC = open('/tmp/mqtt_tick.py').read()
D = '/tmp/mqtt_test/'
SRC = SRC.replace("DIR = '/usr/local/bin/ignition/data/mqtt/'", "DIR = '" + D + "'")
AJT = [('p01r12_master_ramped_speed', 't_speed', 'float', False), ('p01_recipe_active_line_speed_sp', 't_sp', 'float', True), ('p23_di_impreg_tank_up', 't_tank', 'bool', False),
	('p01r13_status', 't_status', 'int', False), ('p01_recipe_active_name', 't_name', 'string', False), ('p25_ai_speed', 't_bad2', 'float', False)]
SRC = SRC.replace('AJ = []     # @@AJ@@', 'AJ = ' + repr(AJT))
CODE_SRC = SRC.replace('TAGS = []   # @@TAGS@@', "TAGS = ['[cal1615]t_temp', '[cal1615]t_speed', '[cal1615]t_bad']")
P = '[cal1615]'
H = P + 'HMI/MQTT/'
TOPIC = 'CUST09/LOC00/MACH00'

from java.util import Date
from java.lang import Thread


class Q(object):
	def __init__(self, v, good=True):
		self.value, self.good = v, good
		self.quality = self

	def isGood(self):
		return self.good


class FakeSystem(object):
	pass


tags = {P + 't_temp': 165.25, P + 't_speed': 21.0, P + 'HMI/LineState/state': 'RUNNING', P + 'HMI/x': 0, P + 'secret': 0, H + 'publish_now': False}
bad = [P + 't_bad']
writes = []
dbcfg = {}
GL = {}
system = FakeSystem()


class _N(object):
	pass


system.util, system.date, system.tag, system.db, system.file = _N(), _N(), _N(), _N(), _N()


class Log(object):
	def __init__(self, n):
		self.n = n

	def info(self, m):
		print '      [info]', m

	def warn(self, m):
		print '      [warn]', m

	def error(self, m):
		print '      [error]', m


system.util.getGlobals = lambda: GL
system.util.getLogger = lambda n: Log(n)
system.util.jsonEncode = lambda o: json.dumps(o)
system.util.jsonDecode = lambda s: json.loads(s)
system.date.now = lambda: Date()
system.date.fromMillis = lambda ms: Date(long(ms))


def read(paths):
	return [Q(None, False) if p in bad else Q(tags.get(p)) for p in paths]


def write(paths, vals):
	for p, v in zip(paths, vals):
		tags[p] = v
		writes.append((p, v))


system.tag.readBlocking = read
system.tag.writeBlocking = write
system.file.fileExists = lambda p: os.path.exists(p)


def runPrepQuery(sql, args, db):
	return [{'k': k, 'v': v} for k, v in dbcfg.items()]


def runPrepUpdate(sql, args, db):
	if 'MERGE' in sql and args[0] not in dbcfg:
		dbcfg[args[0]] = args[1]
	return 1


system.db.runUpdateQuery = lambda sql, db: 1
system.db.runPrepQuery = runPrepQuery
system.db.runPrepUpdate = runPrepUpdate


from org.python.util import PythonInterpreter
from org.python.core import PySystemState, PyStringMap


class Run(object):
	"""The globals of one script run."""
	def __init__(self, it):
		self.it = it

	def __getitem__(self, name):
		return self.it.get(name)

	def __setitem__(self, name, value):
		self.it.set(name, value)


def tick():
	# every run gets its own Jython interpreter and sys.path, like a tag event script on the gateway: a jar put on the path by one run is not on the next one's
	it = PythonInterpreter(PyStringMap(), PySystemState())
	it.set('system', system)
	it.exec(CODE_SRC)
	return Run(it)


def st():
	return GL['cal1615_mqtt']


def until(cond, secs, what):
	end = time.time() + secs
	while time.time() < end:
		tick()
		if cond():
			return True
		Thread.sleep(300)
	return False


passed = failed = 0


def check(name, ok, extra=''):
	global passed, failed
	if ok:
		passed += 1
	else:
		failed += 1
	print '   %s  %s %s' % ('PASS' if ok else 'FAIL', name, extra if not ok else '')


inbox = []


print 'scenario 1: switched off and not configured'
dbcfg.update({'enabled': '0', 'format': 'json', 'endpoint': '', 'publish_s': '1', 'write_tags': 'HMI/x', 'client_id': 'cal1615-gateway', 'topic': TOPIC, 'qos': '1', 'port': '8883'})
tick()
check('off: state DISABLED', st()['state'] == 'DISABLED', st()['state'])
check('off: no client', st()['client'] is None)
check('off: state written to the tags', tags.get(H + 'state') == 'DISABLED')
dbcfg['enabled'] = '1'
st()['t_cfg'] = 0
tick()
check('on without endpoint: NOT CONFIGURED', st()['state'] == 'NOT CONFIGURED', st()['state'])

print 'scenario 2: connects over TLS with the PKCS#1 key AWS hands out'
dbcfg['endpoint'] = 'localhost'
st()['t_cfg'] = 0
check('connects', until(lambda: st()['connected'], 25, 'connect'), st()['msg'])
check('state CONNECTED', st()['state'] == 'CONNECTED', st()['state'])

K = st()['cls']
MqttClient, MqttConnectOptions, MqttCallback, MqttMessage, MemoryPersistence = K['MqttClient'], K['MqttConnectOptions'], K['MqttCallback'], K['MqttMessage'], K['MemoryPersistence']


class Obs(MqttCallback):
	def connectionLost(self, c):
		pass

	def messageArrived(self, t, m):
		try:
			inbox.append(json.loads(bytes(bytearray([b & 255 for b in m.getPayload()]))))
		except ValueError:
			pass

	def deliveryComplete(self, t):
		pass


obs = MqttClient('ssl://localhost:8883', 'aws-side', MemoryPersistence())
obs.setCallback(Obs())
o = MqttConnectOptions()
# build the observer's socket factory with the script's own function
ns = tick()
o.setSocketFactory(ns['socket_factory']())
obs.connect(o)
obs.subscribe(TOPIC, 1)

print 'scenario 3: publishes the values as JSON'
check('a message arrives', until(lambda: len(inbox) > 0, 8, 'publish'))
m = inbox[0] if inbox else {}
names = dict((x['name'], x['value']) for x in m.get('metrics', []))
check('src is the client id', m.get('src') == 'cal1615-gateway', str(m.get('src')))
check('topic and ts present', m.get('topic') == TOPIC and 'T' in str(m.get('ts')), str(m.get('ts')))
check('values without the provider name', names.get('t_temp') == 165.25 and names.get('t_speed') == 21.0, str(names))
check('extra tag published', names.get('HMI/LineState/state') == 'RUNNING', str(names))
check('bad quality left out', 't_bad' not in names)
n1 = len(inbox)
until(lambda: len(inbox) > n1, 8, 'second publish')
check('second message has a higher seq', len(inbox) > n1 and inbox[-1]['seq'] > inbox[0]['seq'])
check('our own messages are not counted as received', st()['n_in'] == 0, str(st()['n_in']))

print 'scenario 4: publish now button'
st()['t_pub'] = long(time.time() * 1000) + 600000          # next timed publish far away
n = len(inbox)
tags[H + 'publish_now'] = True
until(lambda: len(inbox) > n, 5, 'pulse')
check('pulse publishes at once', len(inbox) > n)
check('pulse is reset', tags[H + 'publish_now'] is False)

print 'scenario 5: incoming messages write only the allowed tags'
msg = MqttMessage(json.dumps({'src': 'aws', 'metrics': [{'name': 'HMI/x', 'value': 7}, {'name': 'secret', 'value': 9}]}).encode('utf-8'))
msg.setQos(1)
obs.publish(TOPIC, msg)
check('allowed tag written', until(lambda: tags.get(P + 'HMI/x') == 7, 6, 'write'), str(tags.get(P + 'HMI/x')))
check('other tag not written', tags[P + 'secret'] == 0)
check('counted received and rejected', st()['n_in'] == 1 and st()['n_rej'] == 1, '%s %s' % (st()['n_in'], st()['n_rej']))
obs.publish(TOPIC, MqttMessage(json.dumps({'name': 'HMI/x', 'value': 11}).encode('utf-8')))
check('single name/value form works', until(lambda: tags.get(P + 'HMI/x') == 11, 6, 'single'))
obs.publish(TOPIC, MqttMessage('not json'.encode('utf-8')))
until(lambda: st()['n_in'] == 3, 5, 'junk')
check('junk is logged, nothing written', st()['n_in'] == 3 and tags[P + 'secret'] == 0)
check('page log has entries', len([e for e in st()['log'] if e['kind'] in ('IN', 'OUT', 'REJ')]) >= 5)

print 'scenario 6: switching off disconnects'
dbcfg['enabled'] = '0'
st()['t_cfg'] = 0
tick()
check('client dropped', st()['client'] is None and not st()['connected'])
check('state DISABLED again', st()['state'] == 'DISABLED')
try:
	obs.disconnect()
except:
	pass

print 'scenario 7: an unreachable broker backs off'
dbcfg.update({'enabled': '1', 'port': '1'})
st()['t_cfg'] = 0
until(lambda: st()['fail'] >= 1, 20, 'fail')
check('state ERROR with a reason', st()['state'] == 'ERROR' and 'failed' in st()['msg'], st()['state'] + ' ' + st()['msg'])
f = st()['fail']
tick()
tick()
check('no retry before the pause is over', st()['fail'] == f)

print 'scenario 8: a PKCS#8 key works too'
ns = tick()
ns['KEY'] = D + 'private8.pem.key'
sf = None
try:
	sf = ns['socket_factory']()
except:
	print '      ', sys.exc_info()[1]
check('PKCS#8 key accepted', sf is not None)

# ================================================================ Sparkplug B (what MachineIQ ingests)
print 'scenario 9: Sparkplug births on connect'
import java.io
dump_n = [0]
spb_in = []


class Obs2(MqttCallback):
	def connectionLost(self, c):
		pass

	def messageArrived(self, t, m):
		if '/NCMD/' in str(t) or '/DCMD/' in str(t):
			return                         # our own commands
		raw = bytes(bytearray([b & 255 for b in m.getPayload()]))
		spb_in.append((str(t), raw))
		dump_n[0] += 1
		f = open('/tmp/spb_dump/%03d_%s.bin' % (dump_n[0], str(t).split('/')[2]), 'wb')
		f.write(raw)
		f.close()

	def deliveryComplete(self, t):
		pass


java.io.File('/tmp/spb_dump').mkdirs()
dbcfg.update({'enabled': '1', 'format': 'sparkplug', 'port': '8883', 'publish_s': '1', 'float_tol': '0.2', 'critical_s': '300',
	'write_tags': 'p01_recipe_active_line_speed_sp'})
bad.append(P + 't_bad2')
for k, v in {'t_speed': 21.0, 't_sp': 50.0, 't_tank': True, 't_status': 5, 't_name': 'KEVLAR_285_PHEN', 't_bad2': 3.0, 't_other': 1.0}.items():
	tags[P + k] = v
GL['cal1615_mqtt']['client'] = None          # a fresh connection in the new format
st()['t_cfg'] = 0
st()['conn_id'] += 1
st()['fail'] = 0
st()['t_try'] = 0
obs2 = MqttClient('ssl://localhost:8883', 'aws-side-2', MemoryPersistence())
obs2.setCallback(Obs2())
o2 = MqttConnectOptions()
o2.setSocketFactory(tick()['socket_factory']())
obs2.connect(o2)
obs2.subscribe('spBv1.0/CUST07/#', 1)
check('connects in Sparkplug mode', until(lambda: st()['connected'] and len(spb_in) >= 2, 25, 'birth'), st()['msg'])
kinds = [t.split('/')[2] for t, r in spb_in]
check('NBIRTH then DBIRTH', kinds[:2] == ['NBIRTH', 'DBIRTH'], str(kinds))
check('topics: node and device', spb_in[0][0] == 'spBv1.0/CUST07/NBIRTH/MACH00' and spb_in[1][0] == 'spBv1.0/CUST07/DBIRTH/MACH00/LOC00', str([t for t, r in spb_in[:2]]))
ns = tick()
nb = dict((m['name'], m['value']) for m in ns['decode_metrics'](spb_in[0][1]))
check('NBIRTH carries bdSeq and Rebirth', 'bdSeq' in nb and nb.get('Node Control/Rebirth') is False, str(nb))
db = ns['decode_metrics'](spb_in[1][1])
dbn = dict((m['name'], m['value']) for m in db)
check('DBIRTH has every metric (also the one with no good value)', len(db) == len(ns['AJ']) and 'p25_ai_speed' in dbn, '%d of %d' % (len(db), len(ns['AJ'])))
check('DBIRTH values and types', dbn.get('p01r12_master_ramped_speed') == 21.0 and dbn.get('p23_di_impreg_tank_up') is True and dbn.get('p01r13_status') == 5
	and dbn.get('p01_recipe_active_name') == 'KEVLAR_285_PHEN', str(dbn))

print 'scenario 10: DDATA only for what changed'
n0 = len(spb_in)
until(lambda: False, 3, 'quiet')
check('nothing changed, nothing sent', len(spb_in) == n0, '%d new' % (len(spb_in) - n0))
tags[P + 't_speed'] = 21.1                       # below the 0.2 deadband
until(lambda: False, 3, 'small')
check('float inside the deadband is not sent', len(spb_in) == n0)
tags[P + 't_speed'] = 21.5
check('float past the deadband is sent', until(lambda: len(spb_in) > n0, 6, 'big'))
d = ns['decode_metrics'](spb_in[-1][1])
check('DDATA topic and content', spb_in[-1][0] == 'spBv1.0/CUST07/DDATA/MACH00/LOC00' and [m['name'] for m in d] == ['p01r12_master_ramped_speed'] and abs(d[0]['value'] - 21.5) < 1e-4, str(d))
n1 = len(spb_in)
tags[P + 't_sp'] = 50.05                         # critical: any change goes out
check('a critical metric goes out on any change', until(lambda: len(spb_in) > n1, 6, 'crit'))
n2 = len(spb_in)
tags[P + 't_tank'] = False
tags[P + 't_status'] = 6
check('bool and int changes go out together', until(lambda: len(spb_in) > n2, 6, 'bool'))
d = dict((m['name'], m['value']) for m in ns['decode_metrics'](spb_in[-1][1]))
check('both in one DDATA', d.get('p23_di_impreg_tank_up') is False and d.get('p01r13_status') == 6, str(d))
seqs = [ns['pb_read'](list(bytearray(r))) for t, r in spb_in]
seqn = [[v for f, w, v in x if f == 3][0] for x in seqs]
check('seq counts 0, 1, 2 ...', seqn == range(len(seqn)), str(seqn))

print 'scenario 11: rebirth on request'
n3 = len(spb_in)
cmd = ns['payload_pb'](long(time.time() * 1000), [ns['metric_pb']('Node Control/Rebirth', 0, 11, True)], None)
m = MqttMessage(ns['signed'](cmd))
m.setQos(1)
obs2.publish('spBv1.0/CUST07/NCMD/MACH00', m)
check('NBIRTH and DBIRTH again', until(lambda: len(spb_in) >= n3 + 2, 8, 'rebirth'))
check('after the rebirth: NBIRTH, DBIRTH with seq restarted', [t.split('/')[2] for t, r in spb_in[n3:n3 + 2]] == ['NBIRTH', 'DBIRTH'])
check('bdSeq unchanged by a rebirth', dict((x['name'], x['value']) for x in ns['decode_metrics'](spb_in[n3][1])).get('bdSeq') == nb['bdSeq'])

print 'scenario 12: commands write only the allowed metrics'
cmd = ns['payload_pb'](long(time.time() * 1000), [ns['metric_pb']('p01_recipe_active_line_speed_sp', 0, 9, 33.5), ns['metric_pb']('p01r12_master_ramped_speed', 0, 9, 99.0)], None)
m = MqttMessage(ns['signed'](cmd))
m.setQos(1)
obs2.publish('spBv1.0/CUST07/DCMD/MACH00/LOC00', m)
check('allowed metric written to its tag', until(lambda: abs(tags.get(P + 't_sp', 0) - 33.5) < 1e-3, 6, 'write'), str(tags.get(P + 't_sp')))
check('other metric refused', abs(tags[P + 't_speed'] - 21.5) < 1e-6 and st()['n_rej'] >= 1, str(tags[P + 't_speed']))
try:
	obs2.disconnect()
except:
	pass

print
print '=' * 78
print 'RESULT: %d of %d checks passed' % (passed, passed + failed)
sys.exit(0 if failed == 0 else 1)
