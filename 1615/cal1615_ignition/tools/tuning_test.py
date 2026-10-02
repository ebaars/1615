# Test harness for the PID tuning engine (cal1615/tuning). Runs under Jython (the gateway's Python), no CPython needed:
#   docker cp .../tuning/code.py ignition8-3:/tmp/tuning_code.py ; docker cp tuning_test.py ignition8-3:/tmp/ ;
#   docker exec ignition8-3 java -cp /usr/local/bin/ignition/lib/core/common/jython-ia-2.7.4.0.jar org.python.util.jython /tmp/tuning_test.py
# It makes synthetic captures of a slow temperature loop and a fast tension loop (CV -50..+50 = 100 %), runs the engine
# and judges the suggested gains on the TRUE plant, not on the fitted model.
from __future__ import division
import math
execfile('/tmp/tuning_code.py')

class Rng:
	def __init__(self, seed):
		self.s = seed
	def uni(self):
		self.s = (self.s * 1103515245 + 12345) % 2147483648
		return self.s / 2147483648.0
	def gauss(self):
		return sum(self.uni() for i in range(12)) - 6.0

def make_capture(true, dt, T, kc, ki, kd, bumps, seg, y0_pct, u0, noise, seed, u_lo=0.0, u_hi=100.0):
	"""Closed-loop capture: SP = y0 + bumps[i] (% of span) in consecutive segments of 'seg' s. Returns sp%, pv%, cv%."""
	rng = Rng(seed)
	K, tau, th = true['K'], true['tau'], true['theta']
	a = math.exp(-dt / tau)
	d = th / dt
	x = y0_pct
	integ = u0
	prev = x
	ubuf = []
	sp, pv, cv = [], [], []
	for k in range(int(T / dt)):
		t = k * dt
		sp_dev = bumps[min(int(t / seg), len(bumps) - 1)]
		e = (y0_pct + sp_dev) - x
		deriv = -kd * (x - prev) / dt if kd else 0.0
		u = kc * e + integ + deriv
		sat = min(max(u, u_lo), u_hi)
		if not ((u > u_hi and e > 0) or (u < u_lo and e < 0)):
			integ += ki * e * dt
		prev = x
		ubuf.append(sat)
		ud = _delayed(ubuf, k, d, u0)
		x = a * x + (1.0 - a) * (y0_pct + K * (ud - u0))
		sp.append(y0_pct + sp_dev)
		pv.append(x + noise * rng.gauss())
		cv.append(sat)
	return sp, pv, cv

def judge(true, kc, ki, kd):
	m = evaluate(true, kc, ki, kd)
	return '%s  overshoot %5.1f %%  settle %7.1f s  iae %6.2f' % ('stable  ' if m['stable'] else 'UNSTABLE', m['overshoot_pct'], m['settle_s'], m['iae'])

def scenario(name, loop, true, dt, T, cur, bumps, seg, y0, u0, noise, seed=7):
	print '=' * 78
	print name
	sp, pv_pct, cv = make_capture(true, dt, T, cur[0], cur[1], cur[2], bumps, seg, y0, u0, noise, seed)
	pv = [loop['pv_min'] + v / 100.0 * (loop['pv_max'] - loop['pv_min']) for v in pv_pct]
	res = analyze(loop, dt, sp, pv, cv, current={'kp': cur[0], 'ki': cur[1], 'kd': cur[2]})
	m = res['model']
	print '  true  : K %.3f  tau %7.2f s  theta %6.2f s' % (true['K'], true['tau'], true['theta'])
	print '  fitted: K %.3f  tau %7.2f s  theta %6.2f s   R2 %.3f  (K %+.0f %%, tau %+.0f %%, theta %+.0f %%)' % (
		m['K'], m['tau'], m['theta'], m['r2'], 100 * (m['K'] / true['K'] - 1), 100 * (m['tau'] / true['tau'] - 1), 100 * (m['theta'] / true['theta'] - 1))
	for w in res['quality']['warnings']:
		print '  WARNING:', w
	s = res['suggested']
	print '  current  Kp %.3f Ki %.4f /s Kd %.3f s : %s' % (cur[0], cur[1], cur[2], judge(true, *cur))
	print '  suggested Kp %.3f Ki %.4f /s Kd %.3f s : %s' % (s['kp'], s['ki'], s['kd'], judge(true, s['kp'], s['ki'], s['kd']))
	# robustness on the true plant: gain, dead time and time constant off by +-30 %
	worst = 0.0
	bad = 0
	for kK, kt, kth in CORNERS:
		mm = evaluate(_scaled(true, kK, kt, kth), s['kp'], s['ki'], s['kd'])
		if not mm['stable']:
			bad += 1
		worst = max(worst, mm['overshoot_pct'])
	print '  suggested gains on off-nominal plants: %d of %d unstable, worst overshoot %.0f %%' % (bad, len(CORNERS), worst)
	return res

# ---- slow temperature loop: span 0..1000 F, 8 F bumps (0.8 %), captured every 1 s for 48 min
temp = {'kind': 'temperature', 'pv_min': 0.0, 'pv_max': 1000.0, 'cv_min': 0.0, 'cv_max': 100.0}
temp_true = {'K': 0.4, 'tau': 240.0, 'theta': 45.0}
scenario('A. Temperature zone: 1 s capture, 6 bump segments of 480 s', temp, temp_true, 1.0, 2880.0, (1.0, 0.02, 0.0),
	[0.0, 0.8, 0.0, -0.8, 0.0, 0.8], 480.0, 19.5, 18.0, 0.03)
scenario('A2. Temperature zone, short test (only one bump, 12 min)', temp, temp_true, 1.0, 720.0, (1.0, 0.02, 0.0),
	[0.0, 0.8], 360.0, 19.5, 18.0, 0.03)

# ---- fast tension loop: span 0..500 lb, 10 lb bumps (2 %); actuator -50..+50 = 100 % CV (the loop works in % of output)
tens = {'kind': 'tension', 'pv_min': 0.0, 'pv_max': 500.0, 'cv_min': 0.0, 'cv_max': 100.0, 'cv_eng': (-50.0, 50.0)}
tens_true = {'K': 0.8, 'tau': 0.8, 'theta': 0.15}
print 'tension actuator: CV 50 %% = %.0f eng, a 10 %% CV step = %.0f eng units' % (cv_to_eng(50.0, -50.0, 50.0), cv_to_eng(60.0, -50.0, 50.0) - cv_to_eng(50.0, -50.0, 50.0))
scenario('B. Tension loop: 0.05 s capture, 6 bump segments of 8 s', tens, tens_true, 0.05, 48.0, (0.8, 0.5, 0.0),
	[0.0, 2.0, 0.0, -2.0, 0.0, 2.0], 8.0, 30.0, 50.0, 0.15)
scenario('C. Same tension loop captured every 0.5 s (too slow for it)', tens, tens_true, 0.5, 48.0, (0.8, 0.5, 0.0),
	[0.0, 2.0, 0.0, -2.0, 0.0, 2.0], 8.0, 30.0, 50.0, 0.15)
