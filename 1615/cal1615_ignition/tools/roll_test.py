# Test of the roll logging script (tools/roll_tick.py) in fake time with fake tags and a fake Oracle. Jython, no gateway:
#   docker cp tools/roll_tick.py ignition8-3:/tmp/roll_tick.py ; docker cp tools/roll_test.py ignition8-3:/tmp/
#   docker exec ignition8-3 java -Dpython.import.site=false -Dpython.path=/usr/local/bin/ignition/user-lib/pylib \
#     -cp /usr/local/bin/ignition/lib/core/common/jython-ia-2.7.4.0.jar org.python.util.jython -S /tmp/roll_test.py
from __future__ import division
import json, re

SRC = open('/tmp/roll_tick.py').read()
PTAGS = ['[cal1615]t_temp', '[cal1615]t_speed', '[cal1615]t_tension']
CODE = compile(SRC.replace('TAGS = []   # @@TAGS@@', 'TAGS = ' + repr(PTAGS)), 'roll_tick.py', 'exec')
P = '[cal1615]'
H = P + 'HMI/Rolls/'

class NS(object):
	pass

class Q(object):
	def __init__(self, good):
		self.good = good
	def isGood(self):
		return self.good

class Rs(object):
	def __init__(self, v, good):
		self.value, self.quality = v, Q(good)

class DS(list):
	def getRowCount(self):
		return len(self)

class FakeDb(object):
	"""Just enough Oracle for the statements roll_tick.py issues."""
	def __init__(self):
		self.cfg, self.rolls, self.log, self.stat, self.events, self.tagsets = {}, {}, [], [], [], {}
		self.state, self.seq, self.fail = None, 0, False
	def runUpdateQuery(self, sql, db):
		return 0
	def _cols(self, sql):
		return [c.strip() for c in re.search(r'\((.*?)\) VALUES', sql, re.S).group(1).split(',')]
	def runPrepUpdate(self, sql, args, db):
		if self.fail:
			raise Exception('database down')
		args = list(args)
		if sql.startswith('MERGE INTO ROLL_CFG'):
			self.cfg.setdefault(args[0], args[1])
		elif sql.startswith('MERGE INTO ROLL_STATE'):
			self.state = args[0]
		elif sql.startswith('INSERT ALL'):
			for i in range(0, len(args), 7):
				self.stat.append(dict(zip(['roll_id', 'tag', 'n', 'avg', 'min', 'max', 'sd'], args[i:i + 7])))
		elif sql.startswith('INSERT INTO ROLL_LOG'):
			self.log.append(dict(zip(self._cols(sql), args)))
		elif sql.startswith('INSERT INTO ROLL_EVENT'):
			self.events.append(dict(zip(self._cols(sql), args)))
		elif sql.startswith('INSERT INTO ROLL_TAGSET'):
			self.tagsets[args[0]] = args[1]
		elif sql.startswith('INSERT INTO ROLL ('):
			self.rolls[args[0]] = dict(zip(self._cols(sql), args))
		elif sql.startswith('UPDATE ROLL SET'):
			body = re.search(r'SET (.*) WHERE id = \?', sql, re.S).group(1)
			row = self.rolls[args[-1]]
			i = 0
			for a in body.split(','):
				col, rhs = [x.strip() for x in a.split('=')]
				if rhs == '?':
					row[col] = args[i]
					i += 1
				else:
					row[col] = rhs
		elif sql.startswith('DELETE FROM ROLL_LOG'):
			pass
		else:
			raise Exception('fake db: unhandled ' + sql[:60])
		return 1
	def runScalarPrepQuery(self, sql, args, db):
		if self.fail:
			raise Exception('database down')
		if 'ROLL_SEQ.NEXTVAL' in sql:
			self.seq += 1
			return self.seq
		if 'COUNT(*) FROM ROLL_TAGSET' in sql:
			return 1 if args[0] in self.tagsets else 0
		if 'FROM ROLL_STATE' in sql:
			return self.state
		raise Exception('fake db: unhandled ' + sql[:60])
	def runPrepQuery(self, sql, args, db):
		if self.fail:
			raise Exception('database down')
		if 'FROM ROLL_CFG' in sql:
			return DS([{'k': k, 'v': v} for k, v in self.cfg.items()])
		if 'FROM ROLL_LOG' in sql:
			sid, ts, lo, hi = args
			rows = [r for r in self.log if r['session_id'] == sid and r['tagset'] == ts and lo <= r['g_ft'] <= hi]
			rows.sort(key=lambda r: r['g_ft'])
			return DS([{'g': r['g_ft'], 'vals': r['vals']} for r in rows])
		raise Exception('fake db: unhandled ' + sql[:60])

ERRORS = []

class Log(object):
	def info(self, m, *a):
		pass
	def warn(self, m, *a):
		print '     [warn]', m
	def error(self, m, *a):
		print '     [error]', m
		ERRORS.append(m)

class World(object):
	"""The line: winder counters and run bits, accumulator, and the process values (a function of where the fabric is at the coater)."""
	def __init__(self, path=100.0, cap=200.0, acc=50.0):
		self.now = 1000000.0
		self.db = FakeDb()
		self.GL = {}
		self.tags = {}
		self.ft = {'A': 0.0, 'B': 0.0}
		self.run = {'A': False, 'B': False}
		self.line, self.tank, self.rto = True, True, True
		self.acc, self.fpm = acc, 100.0
		self.wound = 0.0           # true feet wound since production started (what the script should reproduce)
		self.counting = False
		self.bad = set()
		self.db.cfg.update({'path_len_ft': path, 'acc_cap_ft': cap})
		w = self
		class STag(object):
			def readBlocking(self, paths):
				return [Rs(w.tags.get(p), p not in w.bad and p in w.tags) for p in paths]
			def writeBlocking(self, paths, values):
				for p, v in zip(paths, values):
					w.tags[p] = v
				return [Q(True) for p in paths]
		class SUtil(object):
			def getGlobals(self):
				return w.GL
			def getLogger(self, n):
				return Log()
			def jsonEncode(self, o):
				return json.dumps(o)
			def jsonDecode(self, s):
				return json.loads(s)
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
		s.tag, s.util, s.date, s.db = STag(), SUtil(), SDate(), self.db
		self.tags.update({H + 'state': 'IDLE', H + 'roll_no': -1, H + 'roll_ft': 0.0, H + 'winder': '', H + 'msg': '', H + 'prod_start': False, H + 'prod_stop': False,
			P + 'p01_recipe_active/name/name': 'RCP1', P + 'HMI/shop_order': 'SO1', P + 'p29r15_request_run': False, P + 'p29r16_request_run': False})
	def stored(self):
		return self.db.cfg['path_len_ft'] + self.db.cfg['acc_cap_ft'] * self.acc / 100.0
	def publish(self):
		t = self.tags
		t[P + 'p29r13_ai_wa_footage_ft'], t[P + 'p29r13_ai_wb_footage_ft'] = self.ft['A'], self.ft['B']
		t[P + 'p29r10_request_run'], t[P + 'p29r11_request_run'] = self.run['A'], self.run['B']
		t[P + 'p01r13_line_running'], t[P + 'p23_di_impreg_tank_up'], t[P + 'p01r13_permissive_oxidizer'] = self.line, self.tank, self.rto
		t[P + 'p00_wac_position_pct'], t[P + 'p01r12_master_ramped_speed'] = self.acc, self.fpm
		g = self.wound + self.stored()
		t['[cal1615]t_temp'], t['[cal1615]t_speed'], t['[cal1615]t_tension'] = (10.0 if g <= 900.0 else 20.0), self.fpm, 5.0
	def tick(self):
		self.now += 500.0
		self.publish()
		exec CODE in self.ns
	def ticks(self, seconds):
		for i in range(int(seconds * 2)):
			self.tick()
	def wind(self, w, feet):
		"""Wind 'feet' onto winder w at the line speed (the line runs, the other winder is stopped)."""
		self.run = {'A': w == 'A', 'B': w == 'B'}
		self.line = True
		per = self.fpm / 60.0 * 0.5
		left = feet
		while left > 1e-9:
			d = min(per, left)
			self.ft[w] += d
			if self.counting:
				self.wound += d
			left -= d
			self.tick()
	def stop(self, seconds=6.0):
		self.run = {'A': False, 'B': False}
		self.line = False
		self.ticks(seconds)
	def start_production(self):
		self.counting = True
	def rolls(self):
		return [self.db.rolls[k] for k in sorted(self.db.rolls)]

results = []
def check(name, ok, detail=''):
	print '   %s  %s %s' % ('PASS' if ok else 'FAIL', name, detail)
	results.append(bool(ok))

def stat(w, roll, tag):
	for r in w.db.stat:
		if r['roll_id'] == roll['id'] and r['tag'] == tag:
			return r
	return None

def production(w, rolls=3, feet=600.0, leader_ft=300.0):
	"""Leader on A, then good rolls alternating B, A, B ... with a reset counter at each cut."""
	w.ft = {'A': 0.0, 'B': 0.0}
	w.counting = True
	w.wind('A', leader_ft)
	cur = 'A'
	for i in range(rolls):
		w.stop()
		cur = 'B' if cur == 'A' else 'A'
		w.ft[cur] = 0.0
		w.wind(cur, feet)
	return cur

print '=' * 78
print '1. Production from the gates: leader roll, then good rolls cut on the winder counter reset'
w = World()
w.ticks(2)
check('idle before production (winder winding, tank down)', True)
w.tank = False
w.wind('A', 100.0)
check('no roll while the tank is down', not w.rolls() and w.tags[H + 'state'] == 'IDLE')
w.tank = True
w.ft = {'A': 0.0, 'B': 0.0}
w.counting = True
w.wind('A', 300.0)
cur = 'A'
for i in range(3):
	w.stop()
	cur = 'B' if cur == 'A' else 'A'
	w.ft[cur] = 0.0
	w.wind(cur, 600.0)
w.stop(2.0)
w.tank = False
w.ticks(70.0)
rs = w.rolls()
print '   rolls: ' + '; '.join('#%d %s %s %.0f ft %s' % (r['roll_no'], r['winder'], r['status'], r.get('length_ft') or 0, r['flags']) for r in rs)
check('four rolls: leader + 3', len(rs) == 4)
check('roll 0 is the leader and the only one', rs[0]['leader'] == 1 and all(r['leader'] == 0 for r in rs[1:]))
check('numbering 0, 1, 2, 3', [r['roll_no'] for r in rs] == [0, 1, 2, 3])
check('winders A, B, A, B', [r['winder'] for r in rs] == ['A', 'B', 'A', 'B'])
check('lengths 300, 600, 600, 600 within 2 ft', all(abs(r['length_ft'] - e) < 2.0 for r, e in zip(rs, [300, 600, 600, 600])))
check('first three CLOSED, the last PARTIAL (tank down)', [r['status'] for r in rs] == ['CLOSED', 'CLOSED', 'CLOSED', 'PARTIAL'])
check('no flags', all(not r['flags'] for r in rs))
check('state tags back to IDLE', w.tags[H + 'state'] == 'IDLE' and w.tags[H + 'roll_no'] == -1)
t1, t2 = stat(w, rs[1], '[cal1615]t_temp'), stat(w, rs[2], '[cal1615]t_temp')
print '   roll 1 temp avg %.2f (n %d), roll 2 temp avg %.2f (n %d); rows %s' % (t1['avg'], t1['n'], t2['avg'], t2['n'], [r['rows_n'] for r in rs])
check('roll 1 saw the fabric that was at the coater 200 ft earlier: avg 10 (time-based would mix 10 and 20)', abs(t1['avg'] - 10.0) < 0.01 and t1['sd'] < 0.01)
check('roll 2 avg 20', abs(t2['avg'] - 20.0) < 0.01)
check('snapshots cover the roll (>= 90 % of its length)', all(r['covered_ft'] > 0.9 * r['length_ft'] for r in rs[1:3]))
check('events written (start, cuts, end)', len(w.db.events) >= 8)
check('job counters: 2 good rolls cut, 1800 ft of good material (the partial counts feet, not a roll)', w.tags[H + 'rolls_done'] == 2 and abs(w.tags[H + 'ft_done'] - 1800.0) < 4.0)
check('session start published', w.tags.get(H + 'session_start') is not None)

print '=' * 78
print '2. The index alone is not a cut: A keeps winding, then both stop and A restarts WITHOUT a counter reset'
w = World()
w.counting = True
w.wind('A', 400.0)
w.stop()
w.wind('A', 200.0)     # same winder, counter not reset: the same roll goes on
rs = w.rolls()
check('still one open roll', len(rs) == 1 and rs[0]['status'] == 'OPEN')
check('its length keeps growing (600 ft)', abs(w.tags[H + 'roll_ft'] - 600.0) < 2.0)

print '=' * 78
print '3. Other winder starts but its counter was not reset (300 ft): no cut, flagged'
w = World()
w.counting = True
w.wind('A', 500.0)
w.stop()
w.ft['B'] = 300.0
w.wind('B', 50.0)
rs = w.rolls()
check('no new roll', len(rs) == 1)
check('NOCLEAR flag set and an event written', 'NOCLEAR' in rs[0]['flags'] and any(e['kind'] == 'WARN' for e in w.db.events))
w.stop()
w.ft['B'] = 0.0
w.wind('B', 100.0)
check('after the counter is reset the cut is counted', len(w.rolls()) == 2 and w.rolls()[0]['status'] == 'CLOSED')

print '=' * 78
print '4. Same winder, counter reset after doff: new roll; a tiny roll is flagged SHORT'
w = World()
w.counting = True
w.wind('A', 500.0)
w.stop()
w.ft['A'] = 0.0
w.wind('A', 150.0)
rs = w.rolls()
check('two rolls, both on A', len(rs) == 2 and rs[0]['winder'] == 'A' and rs[1]['winder'] == 'A')
check('the first closed by the reset', 'counter reset' in rs[0]['reason'])
w.stop()
w.ft['B'] = 0.0
w.wind('B', 40.0)
w.stop()
w.ft['A'] = 0.0
w.wind('A', 200.0)
rs = w.rolls()
check('the 40 ft roll is flagged SHORT', 'SHORT' in rs[2].get('flags'))

print '=' * 78
print '5. Operator buttons: start without the gates, then stop; no restart while the gates stay up'
w = World()
w.tank = False
w.wind('A', 50.0)
check('nothing while the tank is down', not w.rolls())
w.tags[H + 'prod_start'] = True
w.wind('A', 60.0)
check('Production start begins the leader', len(w.rolls()) == 1 and w.rolls()[0]['leader'] == 1 and not w.tags[H + 'prod_start'])
w.tank = True
w.wind('A', 30.0)
w.tags[H + 'prod_stop'] = True
w.wind('A', 10.0)
rs = w.rolls()
check('Production stop closes the roll as PARTIAL', rs[0]['status'] == 'PARTIAL' and 'operator' in rs[0]['reason'])
w.wind('A', 40.0)
check('no restart while the gates are still up', len(w.rolls()) == 1 and w.tags[H + 'state'] == 'IDLE')
w.tank = False
w.ticks(2.0)
w.tank = True
w.wind('A', 40.0)
check('after the gates drop and return it starts again', len(w.rolls()) == 2)

print '=' * 78
print '6. Short gate drop (30 s) does not end production; a long one (70 s) does'
w = World()
w.counting = True
w.wind('A', 200.0)
w.tank = False
w.stop(30.0)
w.tank = True
w.wind('A', 100.0)
check('still producing after a 30 s drop', w.tags[H + 'state'] in ('LEADER', 'PRODUCING') and len(w.rolls()) == 1 and w.rolls()[0]['status'] == 'OPEN')
w.rto = False
w.ticks(70.0)
check('ended after 70 s: roll PARTIAL, state IDLE', w.rolls()[0]['status'] == 'PARTIAL' and w.tags[H + 'state'] == 'IDLE')

print '=' * 78
print '7. Gateway restart in the middle of a roll: resumes the roll, flagged GAP'
w = World()
w.counting = True
w.wind('A', 300.0)
w.stop()
w.ft['B'] = 0.0
w.wind('B', 250.0)
w.GL.clear()                        # the gateway restarted: only Oracle remembers
w.wind('B', 100.0)
rs = w.rolls()
print '   rolls: ' + '; '.join('#%d %s %s %.0f ft %s' % (r['roll_no'], r['winder'], r['status'], r.get('length_ft') or 0, r['flags']) for r in rs)
check('still two rolls, the open one is roll 1 on B', len(rs) == 2 and rs[1]['roll_no'] == 1 and rs[1]['winder'] == 'B')
check('flagged GAP', 'GAP' in rs[1]['flags'])
w.stop()
w.ft['A'] = 0.0
w.wind('A', 200.0)
rs = w.rolls()
check('the next cut is numbered 2', len(rs) == 3 and rs[2]['roll_no'] == 2 and rs[1]['status'] == 'CLOSED')
check('roll 1 length about 350 ft', abs((rs[1].get('length_ft') or 0) - 350.0) < 3.0)

print '=' * 78
print '8. Bad tag quality or a database outage'
w = World()
w.counting = True
w.wind('A', 500.0)       # longer than the 200 ft of stored fabric, so the leader has snapshots
w.bad.add(P + 'p29r13_ai_wa_footage_ft')
w.ticks(5.0)
check('a bad counter changes nothing', len(w.rolls()) == 1 and w.rolls()[0]['status'] == 'OPEN')
w.bad.clear()
w.db.fail = True
w.wind('A', 100.0)
w.stop()
w.ft['B'] = 0.0
w.wind('B', 150.0)
print '   error lines logged during the outage: %d' % len(ERRORS)
check('the outage logged only a few error lines (throttled), not two per tick', len(ERRORS) < 12)
w.db.fail = False
w.wind('B', 50.0)
check('the state machine kept running while the database was down (cut counted in memory)', w.tags[H + 'roll_no'] == 1)
w.stop()
w.ft['A'] = 0.0
w.wind('A', 100.0)
rs = w.rolls()
print '   rows in Oracle after the outage: %s' % [(r['roll_no'], r['status']) for r in rs]
check('rolls opened during the outage are written once the database is back', any(r['roll_no'] == 1 for r in rs) and any(r['roll_no'] == 2 for r in rs))
w.ticks(15.0)
rs = w.rolls()
check('a roll closed during the outage is updated afterwards (not left OPEN), statistics redone', rs[0]['status'] == 'CLOSED' and 'NOSTATS' not in (rs[0]['flags'] or '') and stat(w, rs[0], '[cal1615]t_temp') is not None)

print '=' * 78
print '9. Stored-fabric offset not configured: roll flagged NOPATH'
w = World(path=0.0, cap=0.0)
w.counting = True
w.wind('A', 100.0)
check('NOPATH on the open roll', 'NOPATH' in w.rolls()[0]['flags'])

print '=' * 78
print '10. Setting gates_needed = 0: rolls are counted with the tank down and the RTO not ready'
w = World()
w.db.cfg['gates_needed'] = 0.0
w.tank, w.rto = False, False
w.counting = True
w.wind('A', 300.0)
check('production starts with the gates down (the line runs and a winder winds)', len(w.rolls()) == 1 and w.rolls()[0]['leader'] == 1 and w.tags[H + 'state'] in ('LEADER', 'PRODUCING'))
w.stop()
w.ft['B'] = 0.0
w.wind('B', 400.0)
check('the cut is counted: roll 1 on B open, the leader closed', len(w.rolls()) == 2 and w.rolls()[0]['status'] == 'CLOSED')
w.ticks(200.0)
check('production does not end because the gates are down (only the operator or a stopped line ends it)', w.tags[H + 'state'] != 'IDLE')
w.tags[H + 'prod_stop'] = True
w.wind('B', 20.0)
check('Production stop closes the roll and it does not restart while the line keeps running', w.rolls()[1]['status'] == 'PARTIAL' and w.tags[H + 'state'] == 'IDLE')
w.wind('B', 40.0)
check('still idle while the line runs', w.tags[H + 'state'] == 'IDLE')
w.stop(3.0)
w.wind('B', 40.0)
check('after the line stops and starts again a new production run begins', len(w.rolls()) == 3)

print '=' * 78
print 'RESULT: %d of %d checks passed' % (len([r for r in results if r]), len(results))
