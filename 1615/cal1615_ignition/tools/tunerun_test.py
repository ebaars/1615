# Test harness for the tuning runner (cal1615/tunerun) against simulated plants, in fake time. Jython, no PLC needed:
#   cd .../cal1615_std/ignition/script-python/cal1615 ; docker cp tuning/code.py ignition8-3:/tmp/tuning_code.py ;
#   docker cp tunerun/code.py ignition8-3:/tmp/tunerun_code.py ; docker cp <tools>/tunerun_test.py ignition8-3:/tmp/ ;
#   docker cp <file made by: node tune_watchdog.js --extract <file>> ignition8-3:/tmp/watchdog_body.py
#   docker exec ignition8-3 java -Dpython.import.site=false -Dpython.path=/usr/local/bin/ignition/user-lib/pylib \
#     -cp /usr/local/bin/ignition/lib/core/common/jython-ia-2.7.4.0.jar org.python.util.jython -S /tmp/tunerun_test.py
# Plants: an oven zone (cold start, burner start delay, Fast / Auto PID) and a fast tension loop (0.05 s simulation steps,
# tag update interval adjustable to imitate the slow Default tag group).
from __future__ import division
import math, json

class NS(object):
	pass

class Rng:
	def __init__(self, seed):
		self.s = seed
	def gauss(self):
		t = 0.0
		for i in range(12):
			self.s = (self.s * 1103515245 + 12345) % 2147483648
			t += self.s / 2147483648.0
		return t - 6.0

# ------------------------------------------------------------------ registry (what the project script cal1615.pid.LOOPS holds)
def zone_reg(heat_set):
	return {'label': 'Zone 1 Temperature', 'units': 'F', 'set1': 'Fast PID (heat-up)', 'set2': 'Auto PID (control)',
		'gains': {'pid1_kp': 'Z/kp1', 'pid1_ki': 'Z/ki1', 'pid1_kd': 'Z/kd1', 'pid1_kp_w': 'Z/kp1_w', 'pid1_ki_w': 'Z/ki1_w',
			'pid2_kp': 'Z/kp', 'pid2_ki': 'Z/ki', 'pid2_kd': 'Z/kd', 'pid2_kp_w': 'Z/kp_w', 'pid2_ki_w': 'Z/ki_w'},
		'test': {'kind': 'temperature', 'modes': ['heatup', 'steady'], 'heat_set': heat_set, 'pv_min': 0.0, 'pv_max': 1000.0, 'cv_min': 0.0, 'cv_max': 100.0,
			'error_pct': False, 'pv': 'Z/pv', 'sp': 'Z/sp', 'sp_w': 'Z/sp_w', 'cv': 'Z/cv', 'status': 'Z/status', 'status_ok': 10, 'faults_ok': 'Z/faults',
			'auto': 'Z/auto', 'hl': 'Z/hl', 'dev': 'Z/dev', 'soak_to_fast': 'Z/s2f', 'sample_s': 1.0, 'bump_default': 3.0, 'bump_min': 1.0, 'bump_max': 8.0,
			'steady_band': 3.0, 'band_min': 0.4, 'base_min_s': 120.0, 'base_max_s': 600.0, 'seg_min_s': 240.0, 'seg_max_s': 900.0, 'ret_min_s': 120.0,
			'ret_max_s': 300.0, 'hold_s': 60.0, 'sat_abort_s': 30.0, 'max_total_s': 7200.0, 'cold_margin': 40.0, 'arm_timeout_s': 1800.0,
			'reach_band': 2.0, 'reach_hold_s': 180.0, 'max_heat_s': 7200.0}}

def tension_reg():
	return {'label': 'Let-Off Tension', 'units': 'LBS', 'set1': '', 'set2': 'Gains',
		'gains': {'pid2_kp': 'L/kp', 'pid2_ki': 'L/ki', 'pid2_kd': 'L/kd', 'pid2_kp_w': 'L/kp_w', 'pid2_ki_w': 'L/ki_w'},
		'test': {'kind': 'tension', 'modes': ['steady'], 'pv_min': 0.0, 'pv_max': 500.0, 'cv_min': 0.0, 'cv_max': 100.0, 'error_pct': False,
			'pv': 'L/pv', 'sp': 'L/sp', 'sp_w': 'L/sp_w', 'cv': 'L/cv', 'active': 'L/active', 'line_running': 'L/line', 'swm': 'L/swm',
			'sample_s': 0.1, 'bump_default': 2.0, 'bump_min': 0.5, 'bump_max': 5.0, 'steady_band': 3.0, 'band_min': 0.4,
			'base_min_s': 15.0, 'base_max_s': 60.0, 'seg_min_s': 20.0, 'seg_max_s': 60.0, 'ret_min_s': 15.0, 'ret_max_s': 60.0, 'hold_s': 5.0,
			'sat_abort_s': 5.0, 'max_total_s': 900.0, 'must_be_off': [['L/idx', 'The winder is not indexing']]}}

# ------------------------------------------------------------------ simulated plants
class Sim(object):
	step = 0.25
	def __init__(self):
		self.writes = []
		self.t = 0.0
		self.good = True
		self.rng = Rng(3)
	def get(self, path):
		return self.tags()[path]
	def stamp(self, path):
		return int(self.t * 1000)
	def put(self, path, value):
		self.writes.append((round(self.t, 2), path, value))
		self.apply_write(path, value)

class ZoneSim(Sim):
	"""Oven zone: FOPDT plant in engineering units + PID with independent gains (error in degrees). Fast gains above the switch error, Auto gains below it."""
	def __init__(self, kp, ki, K_eu=2.4, tau=600.0, theta=60.0, sp0=165.0, ambient=70.0, cold=False, kp_fast=3.0, ki_fast=0.005, only_auto=False):
		Sim.__init__(self)
		self.kp, self.ki, self.kd = kp, ki, 0.0
		self.kp1, self.ki1, self.kd1 = kp_fast, ki_fast, 0.0
		self.kp_w, self.ki_w, self.kp1_w, self.ki1_w = kp, ki, kp_fast, ki_fast
		self.accept = True
		self.only_auto = only_auto
		self.K_eu, self.tau, self.theta, self.amb = K_eu, tau, theta, ambient
		self.sp_w = self.sp = sp0
		self.hot = not cold
		self.pv_state = self.pv = (sp0 if self.hot else ambient)
		self.u_op = (sp0 - ambient) / K_eu     # steady output at SP
		self.integ = self.u_op if self.hot else 0.0
		self.cv = self.u_op if self.hot else 0.0
		self.heat_on = self.hot
		self.ubuf = []
		self.status, self.faults_ok, self.auto, self.hl, self.dev, self.s2f = (10 if self.hot else 2), True, True, 250.0, 10.0, 8.0
		self.noise = 0.05
		self.gain_mult = 1.0
	def start_heat(self):
		self.status = 3
	def burner_lit(self):
		self.heat_on = True
		self.status = 9
	def tags(self):
		return {'Z/pv': self.pv, 'Z/sp': self.sp, 'Z/sp_w': self.sp_w, 'Z/cv': self.cv, 'Z/status': self.status, 'Z/faults': self.faults_ok, 'Z/auto': self.auto,
			'Z/hl': self.hl, 'Z/dev': self.dev, 'Z/s2f': self.s2f, 'Z/kp': self.kp, 'Z/ki': self.ki, 'Z/kd': self.kd, 'Z/kp1': self.kp1, 'Z/ki1': self.ki1, 'Z/kd1': self.kd1}
	def apply_write(self, path, value):
		attr = {'Z/sp_w': 'sp_w', 'Z/kp_w': 'kp_w', 'Z/ki_w': 'ki_w', 'Z/kp1_w': 'kp1_w', 'Z/ki1_w': 'ki1_w'}[path]
		setattr(self, attr, value)
	def advance(self, dt):
		self.t += dt
		self.sp = self.sp_w
		if self.accept:
			self.kp, self.ki, self.kp1, self.ki1 = self.kp_w, self.ki_w, self.kp1_w, self.ki1_w
		pv = self.pv_state + self.noise * self.rng.gauss()
		e = self.sp - pv
		if not self.heat_on:
			u = 0.0
			sat = 0.0
			self.integ = 0.0
		else:
			fast = (not self.only_auto) and abs(e) > self.s2f
			kp, ki = (self.kp1, self.ki1) if fast else (self.kp, self.ki)
			u = kp * e + self.integ
			sat = min(max(u, 0.0), 100.0)
			if not ((u > 100.0 and e > 0) or (u < 0.0 and e < 0)):
				self.integ += ki * e * dt
			if self.status == 9 and abs(e) <= 3.0:
				self.status = 10
		self.cv = sat
		self.ubuf.append(sat)
		d = int(round(self.theta / dt))
		ud = self.ubuf[-1 - d] if len(self.ubuf) > d else (self.u_op if self.hot else 0.0)
		a = math.exp(-dt / self.tau)
		self.pv_state = a * self.pv_state + (1 - a) * (self.amb + self.gain_mult * self.K_eu * ud)
		self.pv = pv

class TensionSim(Sim):
	"""Fast tension loop: PV in lb, output 0..100 % (50 = neutral). Updates its PV tag only every 'update_s' seconds (slow tag group)."""
	step = 0.05
	def __init__(self, kp=1.0, ki=0.5, K_eu=0.5, tau=1.0, theta=0.2, sp0=15.0, update_s=0.05):
		Sim.__init__(self)
		self.kp, self.ki, self.kd = kp, ki, 0.0
		self.kp_w, self.ki_w, self.accept = kp, ki, True
		self.K_eu, self.tau, self.theta = K_eu, tau, theta
		self.sp_w = self.sp = sp0
		self.u_op = 50.0
		self.integ = 50.0
		self.cv = 50.0
		self.pv_state = self.pv = sp0
		self.ubuf = []
		self.active, self.line, self.swm, self.idx = True, True, False, False
		self.noise = 0.04
		self.update_s = update_s
		self.pv_seen, self.pv_stamp = sp0, 0
		self.sp0 = sp0
	def tags(self):
		return {'L/pv': self.pv_seen, 'L/sp': self.sp, 'L/sp_w': self.sp_w, 'L/cv': self.cv, 'L/active': self.active, 'L/line': self.line, 'L/swm': self.swm, 'L/idx': self.idx,
			'L/kp': self.kp, 'L/ki': self.ki, 'L/kd': self.kd}
	def stamp(self, path):
		return self.pv_stamp if path == 'L/pv' else int(self.t * 1000)
	def apply_write(self, path, value):
		setattr(self, {'L/sp_w': 'sp_w', 'L/kp_w': 'kp_w', 'L/ki_w': 'ki_w'}[path], value)
	def advance(self, dt):
		self.t += dt
		self.sp = self.sp_w
		if self.accept:
			self.kp, self.ki = self.kp_w, self.ki_w
		pv = self.pv_state + self.noise * self.rng.gauss()
		e = self.sp - pv
		u = self.kp * e + self.integ
		sat = min(max(u, 0.0), 100.0)
		if not ((u > 100.0 and e > 0) or (u < 0.0 and e < 0)):
			self.integ += self.ki * e * dt
		self.cv = sat
		self.ubuf.append(sat)
		d = int(round(self.theta / dt))
		ud = self.ubuf[-1 - d] if len(self.ubuf) > d else self.u_op
		a = math.exp(-dt / self.tau)
		self.pv_state = a * self.pv_state + (1 - a) * (self.sp0 + self.K_eu * (ud - self.u_op))
		self.pv = pv
		if self.t - self.pv_stamp / 1000.0 >= self.update_s - 1e-9:
			self.pv_seen, self.pv_stamp = pv, int(self.t * 1000)

# ------------------------------------------------------------------ fake Ignition
plc = None
registry = {}
timeline = []   # [(fake time, function)]

class FakeTime(object):
	def __init__(self):
		self.now = 100000.0
	def time(self):
		return self.now
	def sleep(self, s):
		left = s
		while left > 1e-9:
			step = min(plc.step, left)
			plc.advance(step)
			self.now += step
			left -= step
			while timeline and plc.t >= timeline[0][0]:
				timeline.pop(0)[1]()

class Q(object):
	def __init__(self, good=True):
		self.good = good
	def isGood(self):
		return self.good
	def __str__(self):
		return 'Good' if self.good else 'Bad'

class Stamp(object):
	def __init__(self, ms):
		self.ms = ms
	def getTime(self):
		return self.ms

class R(object):
	def __init__(self, v, q, ts):
		self.value, self.quality, self.timestamp = v, q, Stamp(ts)

class Tag(object):
	def readBlocking(self, paths):
		return [R(plc.get(p), Q(plc.good), plc.stamp(p)) for p in paths]
	def writeBlocking(self, paths, values):
		for p, v in zip(paths, values):
			plc.put(p, v)
		return [Q() for p in paths]

class Log(object):
	def info(self, m, *a):
		pass
	def warn(self, m, *a):
		print '     [warn]', m
	def error(self, m, *a):
		print '     [error]', m, a

G = {}
class Util(object):
	def getGlobals(self):
		return G
	def getLogger(self, n):
		return Log()
	def invokeAsynchronous(self, fn, args):
		fn(*args)   # synchronous: the fake clock only moves inside sleep()
	def jsonEncode(self, o):
		return json.dumps(o)
	def jsonDecode(self, s):
		return json.loads(s)

class Date(object):
	def now(self):
		return 0
	def format(self, d, f):
		return '--:--:--'

system = NS()
system.tag, system.util, system.date = Tag(), Util(), Date()

tun = {}
execfile('/tmp/tuning_code.py', tun)
cal1615 = NS()
cal1615.tuning = NS()
for k in ('analyze', 'analyze_heatup', 'scale_check', 'PROFILES'):
	setattr(cal1615.tuning, k, tun[k])
cal1615.pid = NS()
cal1615.pid.LOOPS = registry
execfile('/tmp/tunerun_code.py')
time = FakeTime()

DB = {}
APPLY = []
def _db_ready():
	pass
def _db_insert(loop_id, user, orig_sp, sp_tag, bump, mode):
	i = len(DB) + 1
	DB[i] = {'id': i, 'loop_id': loop_id, 'status': 'RUNNING', 'orig_sp': orig_sp, 'last_cmd': orig_sp, 'sp_tag': sp_tag, 'message': '', 'data': None, 'hb': time.now, 'mode': mode}
	return i
def _db_heartbeat(run_id, last_cmd=None):
	DB[run_id]['hb'] = time.now
	if last_cmd is not None:
		DB[run_id]['last_cmd'] = last_cmd
def _db_finish(run_id, status, message, data):
	DB[run_id].update({'status': status, 'message': message, 'data': json.loads(json.dumps(data)) if data is not None else None})
def _db_running():
	return [dict(r, age=time.now - r['hb']) for r in DB.values() if r['status'] == 'RUNNING']
def _db_last(loop_id):
	rows = [r for r in DB.values() if r['loop_id'] == loop_id and r['status'] in ('DONE', 'ABORTED', 'ERROR', 'RECOVERED')]
	if not rows:
		return None
	r = max(rows, key=lambda x: x['id'])
	return {'id': r['id'], 'status': r['status'], 'message': r['message'], 'data': r['data']}
def _db_last_apply(loop_id):
	rows = [a for a in APPLY if a['loop_id'] == loop_id and not a['reverted']]
	return dict(rows[-1]) if rows else None
def _db_insert_apply(run_id, loop_id, user, gain_set, old_kp, old_ki, new_kp, new_ki):
	APPLY.append({'id': len(APPLY) + 1, 'run_id': run_id, 'loop_id': loop_id, 'user': user, 'gain_set': gain_set, 'old_kp': old_kp, 'old_ki': old_ki, 'new_kp': new_kp, 'new_ki': new_ki, 'reverted': False})
def _db_mark_reverted(apply_id, user):
	APPLY[apply_id - 1]['reverted'] = True

def fresh(sim, loops=('zone1',)):
	global plc, time
	plc = sim
	time = FakeTime()
	G.clear()
	DB.clear()
	del APPLY[:]
	del timeline[:]
	registry.clear()
	for l in loops:
		registry[l] = tension_reg() if l == 'letoff' else zone_reg('pid2' if l == 'zone3' else 'pid1')

def check(name, ok, detail=''):
	print '   %s  %s %s' % ('PASS' if ok else 'FAIL', name, detail)
	return ok

def kill():
	raise KeyboardInterrupt()   # not an Exception: nothing in the runner can catch it, like a dead thread

results = []

# =====================================================================================================================
# STEADY-STATE ZONE TESTS
# =====================================================================================================================
print '=' * 78
print '1. Steady-state zone test, PID works in degrees (as the PLC data says)'
fresh(ZoneSim(0.4, 0.004))
ok, msg = start('zone1', 3.0, 'tester')
row = DB[1]
d = row['data']
if 'analysis' not in d:
	print '   NO ANALYSIS: started %s (%s); run %s: %s; keys %s' % (ok, msg, row['status'], row['message'], d.keys())
a = d['analysis']
m = a['model']
print '   started: %s   status: %s (%s)   %.0f min, %d samples; gain set %s' % (ok, row['status'], row['message'], (time.now - 100000.0) / 60.0, len(d['t']), d['gain_set'])
print '   model: K %.3f (true 0.240 %%/%%)  tau %.0f s (600)  theta %.0f s (60)  R2 %.3f' % (m['K'], m['tau'], m['theta'], m['r2'])
print '   scale check: %s' % d['scale_check']['why']
results.append(check('finished DONE and SP restored', row['status'] == 'DONE' and abs(plc.sp_w - 165.0) < 1e-9))
results.append(check('model within 15 %', abs(m['tau'] / 600.0 - 1) < 0.15 and abs(m['theta'] / 60.0 - 1) < 0.25))
results.append(check('PID error form confirmed as degrees', d['scale_check']['error_pct'] is False and not d.get('convention_mismatch')))

print '=' * 78
print '2. Same test, but the configured PID error form does not match the PLC: flagged, apply blocked'
fresh(ZoneSim(0.4, 0.004))
registry['zone1']['test']['error_pct'] = True    # configured as "% of span" while the simulated PLC works in degrees
start('zone1', 3.0, 'tester')
d = DB[1]['data']
sm = summary('zone1')
print '   mismatch flag: %s; warnings: %s' % (d.get('convention_mismatch'), ' '.join(d['analysis']['quality']['warnings'])[:150])
print '   can_apply %s; blockers: %s' % (sm['can_apply'], sm['blockers'][:90])
results.append(check('mismatch detected, apply blocked', d.get('convention_mismatch') and not sm['can_apply']))

print '=' * 78
print '3. Operator Abort during the first bump'
fresh(ZoneSim(0.4, 0.004))
timeline.append((300.0, lambda: abort('tester')))
start('zone1', 3.0, 'tester')
print '   status: %s (%s)' % (DB[1]['status'], DB[1]['message'])
results.append(check('ABORTED and SP restored', DB[1]['status'] == 'ABORTED' and abs(plc.sp_w - 165.0) < 1e-9))

print '=' * 78
print '4. Runaway: process gain jumps 8x'
fresh(ZoneSim(0.4, 0.004))
def boom():
	plc.gain_mult = 8.0
timeline.append((700.0, boom))
start('zone1', 3.0, 'tester')
print '   status: %s (%s)' % (DB[1]['status'], DB[1]['message'])
results.append(check('ABORTED by the guard and SP restored', DB[1]['status'] == 'ABORTED' and abs(plc.sp_w - 165.0) < 1e-9))

print '=' * 78
print '5. Start refused: zone heating (status 9) / bump too big'
fresh(ZoneSim(0.4, 0.004))
plc.status = 9
ok, msg = start('zone1', 3.0, 'tester')
print '   %s: %s' % (ok, msg)
results.append(check('refused, nothing written, nothing stored', (not ok) and not plc.writes and not DB and not G['cal1615_tunerun']['running']))
fresh(ZoneSim(0.4, 0.004))
ok, msg = start('zone1', 7.5, 'tester')
print '   bump 7.5: %s: %s' % (ok, msg)
results.append(check('big bump refused', not ok and not plc.writes))

print '=' * 78
print '6. Test thread killed mid-test; recover() afterwards'
fresh(ZoneSim(0.4, 0.004))
timeline.append((300.0, kill))
try:
	start('zone1', 3.0, 'tester')
except KeyboardInterrupt:
	pass
print '   after the crash: SP in PLC %.1f (original 165.0)' % plc.sp_w
results.append(check('SP left bumped by the crash', abs(plc.sp_w - 165.0) > 1.0))
time.now += 120.0
msg = recover()
print '   recover(): %s' % msg
results.append(check('SP restored, run RECOVERED, flag cleared', abs(plc.sp_w - 165.0) < 1e-9 and DB[1]['status'] == 'RECOVERED' and not G['cal1615_tunerun']['running']))

print '=' * 78
print '7. Tag quality goes bad for 6 s'
fresh(ZoneSim(0.4, 0.004))
timeline.append((700.0, lambda: setattr(plc, 'good', False)))
timeline.append((706.0, lambda: setattr(plc, 'good', True)))
start('zone1', 3.0, 'tester')
print '   status: %s (%s)' % (DB[1]['status'], DB[1]['message'])
results.append(check('ABORTED on bad quality and SP restored', DB[1]['status'] == 'ABORTED' and abs(plc.sp_w - 165.0) < 1e-9))

print '=' * 78
print '8. recover() while a test is running (watchdog tick) leaves it alone'
fresh(ZoneSim(0.4, 0.004))
seen = []
timeline.append((900.0, lambda: seen.append(recover())))
timeline.append((1000.0, lambda: seen.append(recover())))
start('zone1', 3.0, 'tester')
results.append(check('live test left alone and finished', seen == ['', ''] and DB[1]['status'] == 'DONE'))

print '=' * 78
print '9. Someone downloads a recipe (writes the SP input) in the middle of a test'
fresh(ZoneSim(0.4, 0.004))
timeline.append((900.0, lambda: plc.put('Z/sp_w', 180.0)))
start('zone1', 3.0, 'tester')
print '   status: %s (%s)' % (DB[1]['status'], DB[1]['message'][:110])
print '   SP input now %.1f (the recipe value 180.0; the test must not put 165.0 back)' % plc.sp_w
results.append(check('stopped, recipe value kept, not restored over it', DB[1]['status'] == 'ABORTED' and abs(plc.sp_w - 180.0) < 1e-9 and 'someone else' in DB[1]['message']))

print '=' * 78
print '10. Crash, then someone changes the SP before recovery'
fresh(ZoneSim(0.4, 0.004))
timeline.append((300.0, kill))
try:
	start('zone1', 3.0, 'tester')
except KeyboardInterrupt:
	pass
plc.put('Z/sp_w', 175.0)
time.now += 120.0
msg = recover()
print '   recover(): %s' % msg
results.append(check('SP left alone', abs(plc.sp_w - 175.0) < 1e-9 and 'Someone else' in msg))

# =====================================================================================================================
# APPLY / REVERT
# =====================================================================================================================
print '=' * 78
print '11. Apply and revert (steady-state test, Auto PID)'
fresh(ZoneSim(0.4, 0.004))
start('zone1', 3.0, 'tester')
sm = summary('zone1')
print '   summary: tuned the %s; Kp %s -> %s, Ki %s -> %s; can_apply %s' % (sm['gain_set'], sm['cur_kp'], sm['sug_kp'], sm['cur_ki'], sm['sug_ki'], sm['can_apply'])
results.append(check('summary: can apply, Auto PID', sm['can_apply'] and sm['gain_set'] == 'pid2'))
ok, msg = apply_suggested('zone1', '')
results.append(check('apply refused without a user', not ok and abs(plc.kp - 0.4) < 1e-12))
ok, msg = apply_suggested('zone1', 'tester')
print '   apply: %s - %s' % (ok, msg)
results.append(check('applied to the Auto PID', ok and abs(plc.kp - float(sm['sug_kp'])) < 0.002 and abs(plc.kp1 - 3.0) < 1e-12 and len(APPLY) == 1))
sm2 = summary('zone1')
results.append(check('second apply blocked, revert offered', (not sm2['can_apply']) and sm2['can_revert']))
ok, msg = revert_applied('zone1', 'tester')
print '   revert: %s - %s' % (ok, msg)
results.append(check('reverted', ok and abs(plc.kp - 0.4) < 1e-12 and abs(plc.ki - 0.004) < 1e-12 and APPLY[0]['reverted']))
results.append(check('second revert finds nothing', not revert_applied('zone1', 'tester')[0]))

print '=' * 78
print '12. The PLC ignores new gains'
fresh(ZoneSim(0.4, 0.004))
start('zone1', 3.0, 'tester')
plc.accept = False
ok, msg = apply_suggested('zone1', 'tester')
print '   %s - %s' % (ok, msg)
results.append(check('old gains written back, nothing logged', (not ok) and abs(plc.kp_w - 0.4) < 1e-12 and not APPLY))

print '=' * 78
print '13. Apply blockers'
fresh(ZoneSim(0.4, 0.004))
start('zone1', 3.0, 'tester')
DB[1]['data']['analysis']['model']['r2'] = 0.5
sm = summary('zone1')
print '   poor fit: %s' % sm['blockers']
results.append(check('poor fit blocks apply', not sm['can_apply'] and not apply_suggested('zone1', 'tester')[0]))
fresh(ZoneSim(0.4, 0.004))
start('zone1', 3.0, 'tester')
DB[1]['data']['analysis']['suggested']['kp'] = 4.0
ok, msg = apply_suggested('zone1', 'tester')
print '   10x Kp: %s' % msg
results.append(check('suggestion 10x away refused', not ok and abs(plc.kp_w - 0.4) < 1e-12))

# =====================================================================================================================
# HEAT-UP FROM COLD (passive)
# =====================================================================================================================
def run_heatup(sim, loop='zone1', burner_delay=480.0, extra=None):
	fresh(sim, (loop,))
	timeline.append((300.0, plc.start_heat))
	timeline.append((burner_delay, plc.burner_lit))
	for t, f in (extra or []):
		timeline.append((t, f))
	timeline.sort(key=lambda x: x[0])
	return start(loop, 0.0, 'tester', 'heatup')

print '=' * 78
print '14. Cold oven, heat-up capture (zone 1, Fast PID)'
ok, msg = run_heatup(ZoneSim(0.4, 0.004, cold=True))
row = DB[1]
d = row['data']
a = d['analysis']
m, h = a['model'], a['heatup']
print '   started: %s; run %s (%s); capture %.0f min, %d samples; heating from %.0f s; rise %.1f -> %.1f F' % (ok, row['status'], row['message'], d['t'][-1] / 60.0, len(d['t']), h['start_s'], 10.0 * h['baseline_pct'], 10.0 * (h['baseline_pct'] + h['rise_pct']))
print '   model: K %.3f (true %.3f)  tau %.0f s (600)  theta %.0f s (60)  R2 %.3f' % (m['K'], 0.24, m['tau'], m['theta'], m['r2'])
print '   tangent: dead time %.0f s, rise %.2f %%/min; coarse Kp %.3f; suggested Kp %.3f Ki %.4f; gain set %s' % (float(a['tangent']['dead_time']), float(a['tangent']['slope_pct_per_s']) * 60.0, float(a['coarse']['kp']), float(a['suggested']['kp']), float(a['suggested']['ki']), str(d['gain_set']))
results.append(check('capture DONE, nothing written to the PLC', row['status'] == 'DONE' and not plc.writes))
results.append(check('model within 20 %', abs(m['tau'] / 600.0 - 1) < 0.2 and abs(m['theta'] / 60.0 - 1) < 0.3 and abs(m['K'] / 0.24 - 1) < 0.15))
results.append(check('tunes the Fast PID', d['gain_set'] == 'pid1' and 'Fast' in summary('zone1')['text']))
sm = summary('zone1')
print '   summary: %s | %s' % (sm['text'], sm['extra'][:100])
results.append(check('can apply', sm['can_apply']))
ok, msg = apply_suggested('zone1', 'tester')
print '   apply: %s - %s' % (ok, msg)
results.append(check('applied to the Fast PID, Auto PID untouched', ok and abs(plc.kp1 - float(sm['sug_kp'])) < 0.002 and abs(plc.kp - 0.4) < 1e-12 and APPLY[0]['gain_set'] == 'pid1'))
ok, msg = revert_applied('zone1', 'tester')
results.append(check('reverted the Fast PID', ok and abs(plc.kp1 - 3.0) < 1e-12))

print '=' * 78
print '15. Zone 3 (only the Auto PID): heat-up tunes pid2'
ok, msg = run_heatup(ZoneSim(0.4, 0.004, cold=True, only_auto=True), 'zone3')
d = DB[1]['data']
sm = summary('zone3')
print '   run %s; gain set %s; can_apply %s (%s)' % (DB[1]['status'], d['gain_set'], sm['can_apply'], sm['blockers'][:80])
results.append(check('tunes the Auto PID of zone 3', DB[1]['status'] == 'DONE' and d['gain_set'] == 'pid2'))

print '=' * 78
print '16. Heat-up arm refused: hot oven / already heating'
fresh(ZoneSim(0.4, 0.004))
ok, msg = start('zone1', 0.0, 'tester', 'heatup')
print '   hot oven: %s - %s' % (ok, msg)
results.append(check('hot oven refused', not ok and not DB))
fresh(ZoneSim(0.4, 0.004, cold=True))
plc.status = 9
ok, msg = start('zone1', 0.0, 'tester', 'heatup')
print '   already heating: %s - %s' % (ok, msg[:100])
results.append(check('already heating refused', not ok and not DB))

print '=' * 78
print '17. The heat never starts (30 minute arm timeout)'
fresh(ZoneSim(0.4, 0.004, cold=True), ('zone1',))
ok, msg = start('zone1', 0.0, 'tester', 'heatup')
print '   run %s: %s (fake %.0f min)' % (DB[1]['status'], DB[1]['message'], (time.now - 100000.0) / 60.0)
results.append(check('ABORTED after 30 minutes, nothing written', DB[1]['status'] == 'ABORTED' and 'did not start' in DB[1]['message'] and not plc.writes))

print '=' * 78
print '18. Operator Abort / Finish now during heat-up'
run_heatup(ZoneSim(0.4, 0.004, cold=True), extra=[(900.0, lambda: abort('tester'))])
print '   Abort: %s (%s)' % (DB[1]['status'], DB[1]['message'])
results.append(check('Abort discards (no analysis)', DB[1]['status'] == 'ABORTED' and not DB[1]['data'].get('analysis')))
run_heatup(ZoneSim(0.4, 0.004, cold=True), extra=[(1000.0, lambda: finish('tester'))])
print '   Finish now after %.0f s of heating: %s (%s)' % (1000.0 - 480.0, DB[1]['status'], DB[1]['message'][:90])
results.append(check('Finish now analyses what was captured', DB[1]['status'] == 'DONE' and DB[1]['data'].get('analysis') is not None))
run_heatup(ZoneSim(0.4, 0.004, cold=True), extra=[(530.0, lambda: finish('tester'))])
print '   Finish now after 50 s of heating: %s (%s)' % (DB[1]['status'], DB[1]['message'][:90])
results.append(check('too little heating is rejected with a reason', DB[1]['status'] == 'ABORTED'))

print '=' * 78
print '19. Zone fault half way up'
run_heatup(ZoneSim(0.4, 0.004, cold=True), extra=[(1000.0, lambda: setattr(plc, 'faults_ok', False))])
print '   run %s (%s)' % (DB[1]['status'], DB[1]['message'][:100])
a = DB[1]['data'].get('analysis')
print '   partial analysis: %s' % ('yes, warnings: ' + ' '.join(a['quality']['warnings'])[:120] if a else 'no')
results.append(check('capture ended at the fault; partial data analysed or rejected, nothing written', DB[1]['status'] in ('DONE', 'ABORTED') and not plc.writes))

print '=' * 78
print '20. Gateway crash during a heat-up capture'
fresh(ZoneSim(0.4, 0.004, cold=True), ('zone1',))
timeline.append((300.0, plc.start_heat))
timeline.append((480.0, plc.burner_lit))
timeline.append((1000.0, kill))
try:
	start('zone1', 0.0, 'tester', 'heatup')
except KeyboardInterrupt:
	pass
time.now += 120.0
msg = recover()
print '   recover(): %s' % msg
results.append(check('capture marked lost, no SP write', DB[1]['status'] == 'ABORTED' and not plc.writes and 'capture was lost' in msg))

# =====================================================================================================================
# TENSION LOOP (Let-Off)
# =====================================================================================================================
print '=' * 78
print '21. Tension loop (Let-Off) steady-state test, fast tags (0.05 s)'
fresh(TensionSim(1.5, 1.0), ('letoff',))
ok, msg = start('letoff', 2.0, 'tester')
row = DB[1]
d = row['data']
a = d['analysis']
m = a['model']
true_K = 0.5 / 500.0 * 100.0
print '   %s: %s; %.1f min, %d samples, PV updates every %.2f s' % (ok, row['status'], d['t'][-1] / 60.0, len(d['t']), d['dt_eff'])
print '   model: K %.3f (true %.3f %%span/%%CV)  tau %.2f s (1.0)  theta %.2f s (0.2)  R2 %.3f' % (m['K'], true_K, m['tau'], m['theta'], m['r2'])
print '   current Kp 1.5 Ki 1.0 -> suggested Kp %.3f Ki %.3f; predicted overshoot now %.0f %%, suggested %.0f %%' % (a['suggested']['kp'], a['suggested']['ki'], a['current_metrics']['overshoot_pct'], a['suggested_metrics']['overshoot_pct'])
for w in a['quality']['warnings']:
	print '   WARNING:', w
results.append(check('finished DONE and SP restored', row['status'] == 'DONE' and abs(plc.sp_w - 15.0) < 1e-9))
results.append(check('model within 25 %', abs(m['tau'] / 1.0 - 1) < 0.25 and abs(m['K'] / true_K - 1) < 0.2))
sm = summary('letoff')
results.append(check('summary offers the gains of the tension loop', sm['can_apply'] and sm['gain_set'] == 'pid2'))
ok, msg = apply_suggested('letoff', 'tester')
print '   apply: %s - %s' % (ok, msg)
results.append(check('applied to the tension loop gains', ok and abs(plc.kp - float(sm['sug_kp'])) < 0.002))

print '=' * 78
print '22. Tension loop on the slow 1 s tag group'
fresh(TensionSim(1.5, 1.0, update_s=1.0), ('letoff',))
ok, msg = start('letoff', 2.0, 'tester')
print '   %s: %s - %s' % (ok, DB[1]['status'], DB[1]['message'][:120])
sp_writes = [w for w in plc.writes if w[1] == 'L/sp_w']
results.append(check('refused before any SP write', DB[1]['status'] == 'ABORTED' and 'faster tag group' in DB[1]['message'] and not sp_writes))

print '=' * 78
print '23. Tension guards: line stops / PID to manual / refusals'
fresh(TensionSim(1.5, 1.0), ('letoff',))
timeline.append((40.0, lambda: setattr(plc, 'line', False)))
start('letoff', 2.0, 'tester')
print '   line stops: %s (%s); SP %.1f' % (DB[1]['status'], DB[1]['message'], plc.sp_w)
results.append(check('ABORTED and SP restored', DB[1]['status'] == 'ABORTED' and abs(plc.sp_w - 15.0) < 1e-9))
fresh(TensionSim(1.5, 1.0), ('letoff',))
plc.line = False
ok, msg = start('letoff', 2.0, 'tester')
print '   line not running: %s - %s' % (ok, msg)
results.append(check('refused when the line is stopped', not ok and not plc.writes))
fresh(TensionSim(1.5, 1.0), ('letoff',))
plc.swm = True
ok, msg = start('letoff', 2.0, 'tester')
results.append(check('refused when the PID is in manual', not ok))

print '=' * 78
print '24. Heat-up is not offered for a tension loop'
fresh(TensionSim(1.5, 1.0), ('letoff',))
ok, msg = start('letoff', 0.0, 'tester', 'heatup')
print '   %s - %s' % (ok, msg)
results.append(check('heat-up refused for tension', not ok))

print '=' * 78
print '24b. A must-be-off condition (the winder indexing overrides the PID gains)'
fresh(TensionSim(1.5, 1.0), ('letoff',))
plc.idx = True
ok, msg = start('letoff', 2.0, 'tester')
print '   indexing at start: %s - %s' % (ok, msg)
results.append(check('refused while indexing, nothing written', (not ok) and not plc.writes and 'indexing' in msg))
fresh(TensionSim(1.5, 1.0), ('letoff',))
timeline.append((40.0, lambda: setattr(plc, 'idx', True)))
start('letoff', 2.0, 'tester')
print '   indexing starts mid-test: %s (%s); SP %.1f' % (DB[1]['status'], DB[1]['message'], plc.sp_w)
results.append(check('ABORTED and SP restored', DB[1]['status'] == 'ABORTED' and abs(plc.sp_w - 15.0) < 1e-9 and 'indexing' in DB[1]['message']))

# =====================================================================================================================
# READINESS CHECKLIST
# =====================================================================================================================
print '=' * 78
print '25. Readiness checklist'
fresh(ZoneSim(0.4, 0.004, cold=True))
r = readiness('zone1', 'heatup', 3.0)
print '   cold oven, heat-up:'
for i in r:
	print '     %s  %s' % ({True: 'OK ', False: 'NO ', None: '?  '}[i['ok']], i['text'][:92])
results.append(check('cold oven ready for heat-up (all True/None)', all(i['ok'] is not False for i in r)))
r = readiness('zone1', 'steady', 3.0)
bad = [i['text'][:60] for i in r if i['ok'] is False]
print '   same cold oven, steady test not ready: %s' % bad
results.append(check('cold oven is not ready for a steady-state test', len(bad) >= 2))
fresh(ZoneSim(0.4, 0.004))
r = readiness('zone1', 'steady', 3.0)
results.append(check('hot steady oven ready for a steady-state test', all(i['ok'] is not False for i in r)))
r = readiness('zone1', 'heatup', 3.0)
results.append(check('hot oven not ready for heat-up', any(i['ok'] is False for i in r)))
fresh(TensionSim(1.5, 1.0), ('letoff',))
r = readiness('letoff', 'steady', 2.0)
print '   tension loop:'
for i in r:
	print '     %s  %s' % ({True: 'OK ', False: 'NO ', None: '?  '}[i['ok']], i['text'][:92])
results.append(check('tension loop ready', all(i['ok'] is not False for i in r)))

# =====================================================================================================================
# WATCHDOG TAG SCRIPT (taken from the tag export)
# =====================================================================================================================
print '=' * 78
print '26. Gateway watchdog script after a crash (no page, no project script library)'
class FakeDb(object):
	def runPrepQuery(self, sql, args, db):
		assert db == 'myOracle'
		return [{'id': r['id'], 'mode': r['mode'], 'orig_sp': r['orig_sp'], 'last_cmd': r['last_cmd'], 'sp_tag': r['sp_tag'], 'age': time.now - r['hb']} for r in DB.values() if r['status'] == 'RUNNING']
	def runPrepUpdate(self, sql, args, db):
		assert 'status = ?' in sql and db == 'myOracle'
		DB[args[2]].update({'status': args[0], 'message': args[1]})
system.db = FakeDb()
body = open('/tmp/watchdog_body.py').read()
src = 'def watchdog(tagPath=None, previousValue=None, currentValue=None, initialChange=False, missedEvents=False):\n'
for line in body.split('\n'):
	src += '\t' + line + '\n'
ns = {'system': system}
exec src in ns

def crash_steady():
	fresh(ZoneSim(0.4, 0.004))
	timeline.append((300.0, kill))
	try:
		start('zone1', 3.0, 'tester')
	except KeyboardInterrupt:
		pass
crash_steady()
bumped = plc.sp_w
time.now += 20.0
ns['watchdog']()
results.append(check('left alone while the heartbeat is 20 s old', abs(plc.sp_w - bumped) < 1e-9 and DB[1]['status'] == 'RUNNING'))
time.now += 100.0
ns['watchdog']()
print '   SP now %.1f (original 165.0); run: %s' % (plc.sp_w, DB[1]['status'])
results.append(check('SP put back, run RECOVERED', abs(plc.sp_w - 165.0) < 1e-9 and DB[1]['status'] == 'RECOVERED'))
n = len(plc.writes)
ns['watchdog']()
results.append(check('nothing to do the second time', len(plc.writes) == n))
crash_steady()
plc.put('Z/sp_w', 175.0)
time.now += 120.0
ns['watchdog']()
print '   someone changed the SP to 175: watchdog left it at %.1f; run: %s - %s' % (plc.sp_w, DB[1]['status'], DB[1]['message'][:80])
results.append(check('watchdog does not overwrite someone else\'s SP', abs(plc.sp_w - 175.0) < 1e-9 and 'someone else' in DB[1]['message'].lower()))
fresh(ZoneSim(0.4, 0.004, cold=True), ('zone1',))
timeline.append((300.0, plc.start_heat))
timeline.append((480.0, plc.burner_lit))
timeline.append((1000.0, kill))
try:
	start('zone1', 0.0, 'tester', 'heatup')
except KeyboardInterrupt:
	pass
time.now += 120.0
ns['watchdog']()
results.append(check('watchdog marks a heat-up capture lost without writing', DB[1]['status'] == 'ABORTED' and not plc.writes))

print '=' * 78
print '%d of %d checks passed' % (sum(1 for r in results if r), len(results))
