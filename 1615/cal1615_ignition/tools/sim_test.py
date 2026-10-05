# Runs the real tuning runner (cal1615/tunerun) against the real simulator script (tools/sim_tick.py), in fake time. Jython, no gateway:
#   node tuning_sim.js --registry <dir>/sim_registry.json
#   docker cp each of: sim_registry.json tuning/code.py (as tuning_code.py) tunerun/code.py (as tunerun_code.py) tunerun_test.py sim_tick.py sim_test.py  -> ignition8-3:/tmp/
#   docker exec ignition8-3 java -Dpython.import.site=false -Dpython.path=/usr/local/bin/ignition/user-lib/pylib \
#     -cp /usr/local/bin/ignition/lib/core/common/jython-ia-2.7.4.0.jar org.python.util.jython -S /tmp/sim_test.py
# Reuses the fake Ignition layer (clock, tags, database, logger) from tunerun_test.py: everything above its first scenario.
from __future__ import division
import json, random

head = open('/tmp/tunerun_test.py').read().split('results = []')[0]
exec head

REG = json.load(open('/tmp/sim_registry.json'))
Z = '[cal1615]Sim/Zone/'
T = '[cal1615]Sim/Tension/'

class SGlobals(object):
	pass

class SimPlc(Sim):
	"""The simulator as the 'PLC': the tag store is what the sim_tick.py script reads and writes; every step runs the script once."""
	step = 0.1
	def __init__(self):
		Sim.__init__(self)
		self.store, self.stamps, self.sg = {}, {}, {}
		for folder, prefix in (('Zone', Z), ('Tension', T)):
			for name, dt, v in REG['tags'][folder]:
				self.store[prefix + name] = v
		self.store['[cal1615]Sim/enable'] = True
		self.src = compile(open('/tmp/sim_tick.py').read(), 'sim_tick.py', 'exec')
		me = self
		class STag(object):
			def readBlocking(self, paths):
				return [R(me.store.get(p), Q(p in me.store), me.stamps.get(p, 0)) for p in paths]
			def writeBlocking(self, paths, values):
				for p, v in zip(paths, values):
					me.store[p] = v
					me.stamps[p] = int(me.t * 1000)
				return [Q() for p in paths]
		class SUtil(object):
			def getGlobals(self):
				return me.sg
		class SDate(object):
			def now(self):
				return Stamp(int(me.t * 1000) + 1000000)
		self.ns = {'system': NS()}
		self.ns['system'].tag, self.ns['system'].util, self.ns['system'].date = STag(), SUtil(), SDate()
		random.seed(11)
	def get(self, path):
		return self.store[path]
	def stamp(self, path):
		return self.stamps.get(path, 0)
	def put(self, path, value):     # a write by the runner (the HMI side)
		self.writes.append((round(self.t, 2), path, value))
		self.store[path] = value
		self.stamps[path] = int(self.t * 1000)
	def advance(self, dt):
		self.t += dt
		exec self.src in self.ns
	# convenience
	def press(self, tag):
		self.store[tag] = True
	def run_for(self, seconds):
		n = int(round(seconds / self.step))
		for i in range(n):
			self.advance(self.step)

def fresh_sim():
	global plc, time
	plc = SimPlc()
	time = FakeTime()
	G.clear()
	DB.clear()
	del APPLY[:]
	del timeline[:]
	registry.clear()
	registry.update(REG['loops'])
	return plc

def hot_zone():
	p = fresh_sim()
	p.advance(0.1)                 # first tick only sets the clock
	p.press(Z + 'pb_reset_hot')
	p.run_for(120.0)
	del p.writes[:]
	return p

def cold_zone():
	p = fresh_sim()
	p.advance(0.1)
	p.press(Z + 'pb_reset_cold')
	p.run_for(2.0)
	del p.writes[:]
	return p

def heat_up(p, start_at=45.0, extra=None):
	timeline.append((p.t + start_at, lambda: p.press(Z + 'pb_start_heat')))
	for t, f in (extra or []):
		timeline.append((p.t + t, f))
	timeline.sort(key=lambda x: x[0])
	return start('sim_zone', 0.0, 'tester', 'heatup')

def pv_trace(p, seconds):
	"""Run the sim for a while and return the PV samples (1 s)."""
	out = []
	for i in range(int(seconds)):
		p.run_for(1.0)
		out.append(p.store[Z + 'pv'])
	return out

results = []
SPW = Z + 'sp_w'

print '=' * 78
print '1. The simulator on its own: hot start holds SP, cold start reaches SP with the default gains'
p = hot_zone()
tr = pv_trace(p, 60)
print '   hot start: PV %.2f .. %.2f around SP 165' % (min(tr), max(tr))
results.append(check('hot start holds SP within 1 F', max(abs(v - 165.0) for v in tr) < 1.0))
p = cold_zone()
results.append(check('cold start: PV at ambient, status 2, no output', abs(p.store[Z + 'pv'] - 70.0) < 1.0 and p.store[Z + 'status'] == 2 and p.store[Z + 'cv'] == 0.0))
p.press(Z + 'pb_start_heat')
p.run_for(10.0)
results.append(check('start heat: status 3 and still no output during the burner delay', p.store[Z + 'status'] == 3 and p.store[Z + 'cv'] == 0.0))
tr = pv_trace(p, 400)
print '   cold start: peak %.1f F, final %.1f F, status %d' % (max(tr), tr[-1], p.store[Z + 'status'])
results.append(check('burner lit, PV reaches SP (the loose default gains overshoot) and status goes to 10', min(abs(v - 165.0) for v in tr) < 2.0 and p.store[Z + 'status'] == 10))
p.press(Z + 'pb_stop_heat')
p.run_for(5.0)
results.append(check('stop heat: output 0 and status 2', p.store[Z + 'cv'] == 0.0 and p.store[Z + 'status'] == 2))

print '=' * 78
print '2. Steady-state SP-bump test on the simulated oven (Auto PID)'
p = hot_zone()
ok, msg = start('sim_zone', 3.0, 'tester', 'steady')
row = DB[1]
d = row['data']
a = d['analysis']
m = a['model']
print '   started %s; run %s (%s); %.1f min, %d samples; gain set %s' % (ok, row['status'], row['message'], (time.now - 100000.0) / 60.0, len(d['t']), d['gain_set'])
print '   model: K %.3f %%/%% (true %.3f)  tau %.0f s (60)  theta %.1f s (8)  R2 %.3f' % (m['K'], 2.4 / 10.0, m['tau'], m['theta'], m['r2'])
results.append(check('DONE and SP restored', row['status'] == 'DONE' and abs(p.store[SPW] - 165.0) < 1e-9))
results.append(check('model within 25 % (K, tau) and 3 s (theta)', abs(m['K'] / 0.24 - 1) < 0.25 and abs(m['tau'] / 60.0 - 1) < 0.25 and abs(m['theta'] - 8.0) < 3.0))
sm = summary('sim_zone')
results.append(check('suggestion available and applicable', sm['can_apply']))
ok, msg = apply_suggested('sim_zone', 'tester')
p.run_for(1.0)
print '   apply: %s - %s; Auto Kp %.3f Ki %.4f (was 1.0 / 0.005)' % (ok, msg[:70], p.store[Z + 'kp'], p.store[Z + 'ki'])
results.append(check('applied to the Auto PID, the simulated PLC copied it, Fast PID untouched', ok and abs(p.store[Z + 'kp'] - float(sm['sug_kp'])) < 0.002 and abs(p.store[Z + 'kp1'] - 6.0) < 1e-9))
ok, msg = revert_applied('sim_zone', 'tester')
p.run_for(1.0)
results.append(check('reverted', ok and abs(p.store[Z + 'kp'] - 1.0) < 1e-9))

print '=' * 78
print '3. Heat-up capture from the cold simulated oven (Fast PID)'
p = cold_zone()
ok, msg = heat_up(p)
row = DB[1]
d = row['data']
print '   started %s; run %s (%s); capture %.1f min, %d samples; gain set %s' % (ok, row['status'], row['message'], d['t'][-1] / 60.0 if d else 0, len(d['t']) if d else 0, d['gain_set'] if d else None)
results.append(check('capture DONE, nothing written to the PLC by the runner', row['status'] == 'DONE' and not p.writes))
if d and 'analysis' in d:
	m = d['analysis']['model']
	print '   model: K %.3f (true 0.240)  tau %.0f s (60)  theta %.1f s (8)  R2 %.3f' % (m['K'], m['tau'], m['theta'], m['r2'])
	results.append(check('model within 30 %', abs(m['K'] / 0.24 - 1) < 0.3 and abs(m['tau'] / 60.0 - 1) < 0.3 and abs(m['theta'] - 8.0) < 4.0))
	results.append(check('tunes the Fast PID', d['gain_set'] == 'pid1'))
else:
	results.append(check('analysis present', False))

print '=' * 78
print '4. Recipe download (SP changes from the HMI side) during an SP-bump test: the runner stops and leaves the new SP alone'
p = hot_zone()
timeline.append((p.t + 150.0, lambda: p.press(Z + 'pb_recipe')))
ok, msg = start('sim_zone', 3.0, 'tester', 'steady')
print '   run %s: %s; SP now %.1f' % (DB[1]['status'], DB[1]['message'][:110], p.store[SPW])
results.append(check('ABORTED, SP not restored over the recipe', DB[1]['status'] == 'ABORTED' and p.store[SPW] > 170.0))

print '=' * 78
print '5. Zone fault during the test'
p = hot_zone()
def fault():
	p.store[Z + 'inject_fault'] = True
timeline.append((p.t + 150.0, fault))
ok, msg = start('sim_zone', 3.0, 'tester', 'steady')
print '   run %s: %s' % (DB[1]['status'], DB[1]['message'][:110])
results.append(check('ABORTED on the fault and SP restored', DB[1]['status'] == 'ABORTED' and abs(p.store[SPW] - 165.0) < 1e-9))

print '=' * 78
print '6. Heat-up arm refused on the hot simulated oven / the burner never starts'
p = hot_zone()
ok, msg = start('sim_zone', 0.0, 'tester', 'heatup')
print '   hot oven: %s - %s' % (ok, msg[:90])
results.append(check('hot oven refused, nothing written', not ok and not p.writes and not DB))
p = cold_zone()
ok, msg = start('sim_zone', 0.0, 'tester', 'heatup')
print '   no Start Heat: run %s: %s' % (DB[1]['status'], DB[1]['message'][:90])
results.append(check('ABORTED after the arm timeout', DB[1]['status'] == 'ABORTED' and 'did not start' in DB[1]['message']))

print '=' * 78
print '7. Tension loop: SP-bump test'
p = fresh_sim()
p.run_for(10.0)
ok, msg = start('sim_tension', 2.0, 'tester', 'steady')
row = DB[1]
d = row['data']
print '   started %s; run %s (%s)' % (ok, row['status'], row['message'][:100])
if d and 'analysis' in d:
	m = d['analysis']['model']
	print '   %.1f min, %d samples; model K %.3f %%/%% (true %.3f)  tau %.2f s (1.0)  theta %.2f s (0.2)  R2 %.3f' % (d['t'][-1] / 60.0, len(d['t']), m['K'], 0.5 / 5.0, m['tau'], m['theta'], m['r2'])
	results.append(check('DONE and SP restored', row['status'] == 'DONE' and abs(p.store[T + 'sp_w'] - 15.0) < 1e-9))
	results.append(check('model within 30 %', abs(m['K'] / 0.1 - 1) < 0.3 and abs(m['tau'] - 1.0) < 0.35 and abs(m['theta'] - 0.2) < 0.2))
	sm = summary('sim_tension')
	ok, msg = apply_suggested('sim_tension', 'tester')
	p.run_for(1.0)
	print '   apply: %s - %s; Kp %.3f Ki %.3f' % (ok, msg[:70], p.store[T + 'kp'], p.store[T + 'ki'])
	results.append(check('applied, copied into the simulated PID', ok and abs(p.store[T + 'kp'] - float(sm['sug_kp'])) < 0.002))
else:
	results.append(check('analysis present', False))

print '=' * 78
print '8. Tension loop readiness: line stopped / PID in manual refuse the start'
p = fresh_sim()
p.run_for(5.0)
p.store[T + 'line_running'] = False
ok, msg = start('sim_tension', 2.0, 'tester', 'steady')
print '   line stopped: %s - %s' % (ok, msg[:80])
results.append(check('refused with the line stopped', not ok and not DB))
p.store[T + 'line_running'] = True
p.store[T + 'swm'] = True
ok, msg = start('sim_tension', 2.0, 'tester', 'steady')
print '   PID in manual: %s - %s' % (ok, msg[:80])
results.append(check('refused with the PID in manual', not ok and not DB))

print '=' * 78
print 'RESULT: %d of %d checks passed' % (len([r for r in results if r]), len(results))
