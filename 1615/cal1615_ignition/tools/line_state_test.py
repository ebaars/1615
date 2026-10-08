# Test of the line state script (tools/line_tick.py) in fake time with fake tags and a fake Oracle. Jython, no gateway:
#   docker cp tools/line_tick.py ignition8-3:/tmp/ ; docker cp tools/line_state_test.py ignition8-3:/tmp/
#   docker exec ignition8-3 java -Dpython.import.site=false -Dpython.path=/usr/local/bin/ignition/user-lib/pylib \
#     -cp /usr/local/bin/ignition/lib/core/common/jython-ia-2.7.4.0.jar org.python.util.jython -S /tmp/line_state_test.py
from __future__ import division

CODE = compile(open('/tmp/line_tick.py').read(), 'line_tick.py', 'exec')
P = '[cal1615]'
H = P + 'HMI/LineState/'

class NS(object):
	pass

class Q(object):
	def __init__(self, g):
		self.g = g
	def isGood(self):
		return self.g

class Rs(object):
	def __init__(self, v, g):
		self.value, self.quality = v, Q(g)

class DS(list):
	def getRowCount(self):
		return len(self)

class World(object):
	def __init__(self):
		self.now = 5000000.0
		self.tags = {P + 'p01r13_line_running': False, P + 'p01r02_fault_exists': False,
			P + 'p11r20_status': 2, P + 'p12r20_status': 2, P + 'p13r20_status': 2}
		self.rows = []          # [state, start_ms, end_ms or None]
		self.GL = {}
		self.fail = False
		w = self
		class STag(object):
			def readBlocking(self, paths):
				return [Rs(w.tags.get(p), p in w.tags) for p in paths]
			def writeBlocking(self, paths, values):
				for p, v in zip(paths, values):
					w.tags[p] = v
		class SDb(object):
			def runUpdateQuery(self, sql, db):
				return 0
			def runPrepUpdate(self, sql, args, db):
				if w.fail:
					raise Exception('database down')
				if sql.startswith('UPDATE LINE_STATE_LOG'):
					for r in w.rows:
						if r[2] is None:
							r[2] = w.now - args[0] * 1000.0
				elif sql.startswith('INSERT INTO LINE_STATE_LOG'):
					w.rows.append([args[0], w.now - args[1] * 1000.0, None])
				else:
					raise Exception('unhandled ' + sql[:50])
			def runPrepQuery(self, sql, args, db):
				if w.fail:
					raise Exception('database down')
				if 'WHERE end_ts IS NULL' in sql:
					op = [r for r in w.rows if r[2] is None]
					return DS([{'state': r[0], 'age': (w.now - r[1]) / 1000.0} for r in op[-1:]])
				lo = w.now - args[0] * 3600000.0
				out = {}
				for s, a, b in w.rows:
					b = w.now if b is None else min(b, w.now)
					a = max(a, lo)
					if b > a:
						out[s] = out.get(s, 0.0) + (b - a) / 1000.0
				return DS([{'state': s, 'secs': v} for s, v in out.items()])
		class SUtil(object):
			def getGlobals(self):
				return w.GL
			def getLogger(self, n):
				class L(object):
					def info(self, m, *a):
						pass
					def warn(self, m, *a):
						print '     [warn]', m
					def error(self, m, *a):
						print '     [error]', m
				return L()
		class Stamp(object):
			def getTime(self):
				return int(w.now)
		class SDate(object):
			def now(self):
				return Stamp()
			def fromMillis(self, ms):
				return ms
		self.ns = {'system': NS()}
		s = self.ns['system']
		s.tag, s.util, s.date, s.db = STag(), SUtil(), SDate(), SDb()
	def tick(self, seconds=1.0):
		for i in range(int(seconds)):
			self.now += 1000.0
			exec CODE in self.ns
	def set(self, **kw):
		m = {'run': 'p01r13_line_running', 'fault': 'p01r02_fault_exists', 'z1': 'p11r20_status', 'z2': 'p12r20_status', 'z3': 'p13r20_status'}
		for k, v in kw.items():
			self.tags[P + m[k]] = v
	def state(self):
		return self.tags.get(H + 'state')

results = []
def check(name, ok, detail=''):
	print '   %s  %s %s' % ('PASS' if ok else 'FAIL', name, detail)
	results.append(bool(ok))

print '=' * 78
print '1. The four states'
w = World()
w.tick(2)
check('idle when nothing is going on', w.state() == 'IDLE')
w.set(z1=9)
w.tick(5)
check('SETUP while a zone heats up (status 9)', w.state() == 'SETUP')
w.set(z1=10)
w.tick(5)
check('IDLE again at Control to SP', w.state() == 'IDLE')
w.set(z1=11)
w.tick(5)
check('SETUP during cooldown', w.state() == 'SETUP')
w.set(z1=2, run=True)
w.tick(5)
check('RUNNING when the line runs', w.state() == 'RUNNING')
w.set(run=False, fault=True)
w.tick(5)
check('DOWN when stopped with a fault', w.state() == 'DOWN')
w.set(fault=False, z1=9)
w.tick(5)
check('fault cleared while a zone heats: SETUP', w.state() == 'SETUP')
w.set(run=True, fault=True)
w.tick(5)
check('running beats a fault', w.state() == 'RUNNING')

print '=' * 78
print '2. Debounce and time in state'
w = World()
w.tick(5)
w.set(run=True)
w.tick(2)
check('a 2 s blip does not change the state', w.state() == 'IDLE')
w.set(run=False)
w.tick(5)
check('and nothing was logged for it', len(w.rows) == 1)
w.set(run=True)
w.tick(10)
since = w.tags[H + 'since']
check('RUNNING; since = when the change first appeared (about 10 s ago, not 7)', w.state() == 'RUNNING' and abs((w.now - since) / 1000.0 - 10.0) < 1.5)
check('two log rows, the first closed', len(w.rows) == 2 and w.rows[0][2] is not None and w.rows[1][2] is None)

print '=' * 78
print '3. Share of the last 8 hours (published once a minute)'
w = World()
w.tick(2)
w.set(run=True)
w.tick(120 * 60)        # 2 h running
w.set(run=False)
w.tick(30 * 60)         # 0.5 h idle
w.set(run=False, fault=True)
w.tick(30 * 60)         # 0.5 h down
p = dict((s, w.tags.get(H + 'pct_' + s.lower())) for s in ('RUNNING', 'IDLE', 'SETUP', 'DOWN'))
print '   shares: %s' % p
check('about 66 / 17 / 0 / 17 %', abs(p['RUNNING'] - 66.7) < 2.5 and abs(p['IDLE'] - 16.7) < 2.5 and p['SETUP'] == 0.0 and abs(p['DOWN'] - 16.7) < 2.5)
check('they add up to 100', abs(sum(p.values()) - 100.0) < 0.5)

print '=' * 78
print '4. Gateway restart keeps the open state and its start'
w = World()
w.tick(2)
w.set(run=True)
w.tick(60)
t0 = w.tags[H + 'since']
w.GL.clear()
w.tick(3)
check('still RUNNING with the same start (no new log row)', w.state() == 'RUNNING' and len(w.rows) == 2 and abs(w.tags[H + 'since'] - t0) < 1500)

print '=' * 78
print '5. Database outage and a bad run tag'
w = World()
w.tick(3)
w.fail = True
w.set(run=True)
w.tick(10)
check('the state still follows the line while the database is down', w.state() == 'RUNNING')
w.fail = False
w.tags.pop(P + 'p01r13_line_running')
w.set(fault=True)
w.tick(10)
check('an unreadable run bit changes nothing', w.state() == 'RUNNING')

print '=' * 78
print 'RESULT: %d of %d checks passed' % (len([r for r in results if r]), len(results))
