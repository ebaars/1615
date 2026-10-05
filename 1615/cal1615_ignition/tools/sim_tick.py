# cal1615 tuning simulator. Runs every time [cal1615]Sim/tick changes (an expression tag, now(100)) and advances two simulated
# plants by the real time since the last run: an oven zone (Sim/Zone/*) and a tension loop (Sim/Tension/*). The simulated PLC
# (PID with Fast / Auto gain sets, status codes, HMI-input -> parameter copy) and the plants are plain memory tags, so the PID Tuning
# page and cal1615.tunerun treat them like real loops. The zone plant is about 10x faster than a real oven so a test takes minutes.
# Source of the tag script (tools/tuning_sim.js indents it into the tag) and of the test (tools/sim_test.py).
import math, random

P = '[cal1615]Sim/'
BURNER_DELAY_S = 20.0       # Start Heat -> burner lit
GL = system.util.getGlobals()
st = GL.get('cal1615_sim')
if st is None:
	st = {'t': None, 'busy': False}
	GL['cal1615_sim'] = st


def clamp(v, lo, hi):
	return max(lo, min(hi, v))


def rd(prefix, names):
	"""Read Sim/<prefix><name> for every name; a missing or bad tag reads as None."""
	vals = system.tag.readBlocking([P + prefix + n for n in names])
	return dict((n, (v.value if v.quality.isGood() else None)) for n, v in zip(names, vals))


def wr(prefix, w):
	if w:
		names = list(w.keys())
		system.tag.writeBlocking([P + prefix + n for n in names], [w[n] for n in names])


def delayed(s, theta, u, u0):
	"""Dead time: the plant sees the output from 'theta' seconds ago (a time-stamped buffer, so uneven steps are fine)."""
	buf = s['buf']
	buf.append((s['t'], u))
	cut = s['t'] - theta
	i = 0
	while i + 1 < len(buf) and buf[i + 1][0] <= cut:
		i += 1
	if buf[i][0] <= cut:
		ud = buf[i][1]
		del buf[:i]
		return ud
	return u0


ZONE = ['pv', 'sp', 'sp_w', 'cv', 'status', 'faults_ok', 'auto', 'soak_to_fast', 'kp', 'ki', 'kd', 'kp_w', 'ki_w', 'kd_w',
	'kp1', 'ki1', 'kd1', 'kp1_w', 'ki1_w', 'kd1_w', 'pb_start_heat', 'pb_stop_heat', 'pb_reset_cold', 'pb_reset_hot', 'pb_recipe',
	'inject_fault', 'plant_k', 'plant_tau', 'plant_theta', 'plant_noise', 'ambient']


def zone(dt):
	x = rd('Zone/', ZONE)
	if None in (x['sp_w'], x['pv'], x['plant_k'], x['plant_tau'], x['plant_theta'], x['ambient'], x['status']):
		return
	z = st.get('zone')
	if z is None:
		z = {'t': 0.0, 'pv_state': x['pv'], 'integ': 0.0, 'heat_on': x['status'] >= 9, 'burner': None, 'buf': [], 'u0': 0.0, 'fault': False}
		st['zone'] = z
	w = {}
	k, tau, theta, amb = x['plant_k'], max(x['plant_tau'], 0.5), max(x['plant_theta'], 0.0), x['ambient']
	status = x['status']
	z['t'] += dt
	if x['pb_recipe']:                       # a recipe download changes the setpoint from the HMI side
		x['sp_w'] += 10.0
		w['sp_w'] = x['sp_w']
		w['pb_recipe'] = False
	sp = x['sp_w']
	if x['pb_reset_cold']:                   # cold, empty oven
		z.update(pv_state=amb, integ=0.0, heat_on=False, burner=None, buf=[], u0=0.0)
		status = 2
		w['pb_reset_cold'] = False
	if x['pb_reset_hot']:                    # oven already at SP, controlling
		uop = clamp((sp - amb) / k, 0.0, 100.0)
		z.update(pv_state=sp, integ=uop, heat_on=True, burner=None, buf=[], u0=uop)
		status = 10
		w['pb_reset_hot'] = False
	if x['pb_stop_heat']:
		z.update(heat_on=False, burner=None, integ=0.0)
		status = 2
		w['pb_stop_heat'] = False
	if x['pb_start_heat']:
		if not z['heat_on'] and z['burner'] is None:
			z['burner'] = 0.0
			status = 3
		w['pb_start_heat'] = False
	if z['burner'] is not None:
		z['burner'] += dt
		if z['burner'] >= BURNER_DELAY_S:
			z.update(heat_on=True, burner=None)
			status = 9
	faults_ok = not x['inject_fault']
	if not faults_ok and z['heat_on']:       # a zone fault trips the burner
		z.update(heat_on=False, integ=0.0)
		status = 2
	pv = z['pv_state'] + random.gauss(0.0, max(x['plant_noise'] or 0.0, 0.0))
	e = sp - pv
	if z['heat_on'] and x['auto'] is not False:
		if abs(e) > (x['soak_to_fast'] if x['soak_to_fast'] is not None else 8.0):
			kp, ki = x['kp1_w'] if x['kp1_w'] is not None else 0.0, x['ki1_w'] if x['ki1_w'] is not None else 0.0
		else:
			kp, ki = x['kp_w'] if x['kp_w'] is not None else 0.0, x['ki_w'] if x['ki_w'] is not None else 0.0
		u = kp * e + z['integ']
		cv = clamp(u, 0.0, 100.0)
		if not ((u > 100.0 and e > 0) or (u < 0.0 and e < 0)):
			z['integ'] = clamp(z['integ'] + ki * e * dt, -50.0, 150.0)
		if status == 9 and abs(e) <= 3.0:
			status = 10
	else:
		cv = 0.0
		z['integ'] = 0.0
	ud = delayed(z, theta, cv, z['u0'])
	a = math.exp(-dt / tau)
	z['pv_state'] = a * z['pv_state'] + (1.0 - a) * (amb + k * ud)
	# what the PLC does with the HMI inputs: copy the gains and the setpoint into the running PID
	for n in ('kp', 'ki', 'kd', 'kp1', 'ki1', 'kd1'):
		if x[n + '_w'] is not None and x[n] != x[n + '_w']:
			w[n] = x[n + '_w']
	if x['status'] != status:
		w['status'] = status
	if x['faults_ok'] != faults_ok:
		w['faults_ok'] = faults_ok
	w['pv'], w['sp'], w['cv'] = pv, sp, cv
	wr('Zone/', w)


TENSION = ['pv', 'sp', 'sp_w', 'cv', 'active', 'line_running', 'swm', 'kp', 'ki', 'kd', 'kp_w', 'ki_w', 'kd_w', 'pb_recipe',
	'plant_k', 'plant_tau', 'plant_theta', 'plant_noise']
TENSION_BASE = 15.0      # lb at the neutral output (50 %)


def tension(dt):
	x = rd('Tension/', TENSION)
	if None in (x['sp_w'], x['pv'], x['plant_k'], x['plant_tau'], x['plant_theta'], x['cv']):
		return
	s = st.get('tension')
	if s is None:
		s = {'t': 0.0, 'pv_state': x['pv'], 'integ': 50.0, 'buf': [], 'cv': 50.0}
		st['tension'] = s
	w = {}
	k, tau, theta = x['plant_k'], max(x['plant_tau'], 0.05), max(x['plant_theta'], 0.0)
	s['t'] += dt
	if x['pb_recipe']:
		x['sp_w'] += 5.0
		w['sp_w'] = x['sp_w']
		w['pb_recipe'] = False
	sp = x['sp_w']
	pv = s['pv_state'] + random.gauss(0.0, max(x['plant_noise'] or 0.0, 0.0))
	e = sp - pv
	if x['swm']:                             # PID in manual: the output stays where it is
		cv = s['cv']
		s['integ'] = cv
	elif x['active'] and x['line_running']:
		kp = x['kp_w'] if x['kp_w'] is not None else 0.0
		ki = x['ki_w'] if x['ki_w'] is not None else 0.0
		u = kp * e + s['integ']
		cv = clamp(u, 0.0, 100.0)
		if not ((u > 100.0 and e > 0) or (u < 0.0 and e < 0)):
			s['integ'] = clamp(s['integ'] + ki * e * dt, 0.0, 100.0)
	else:                                    # not running: neutral output
		cv = 50.0
		s['integ'] = 50.0
	s['cv'] = cv
	ud = delayed(s, theta, cv, 50.0)
	a = math.exp(-dt / tau)
	s['pv_state'] = a * s['pv_state'] + (1.0 - a) * (TENSION_BASE + k * (ud - 50.0))
	for n in ('kp', 'ki', 'kd'):
		if x[n + '_w'] is not None and x[n] != x[n + '_w']:
			w[n] = x[n + '_w']
	w['pv'], w['sp'], w['cv'] = pv, sp, cv
	wr('Tension/', w)


def run():
	now = system.date.now().getTime()
	last = st['t']
	st['t'] = now
	if last is None:
		return
	dt = (now - last) / 1000.0
	if dt <= 0.0:
		return
	dt = min(dt, 0.5)                        # after a stall, do not take one huge step
	on = system.tag.readBlocking([P + 'enable'])[0]
	if not (on.quality.isGood() and on.value):
		return
	zone(dt)
	tension(dt)


if not st['busy']:                           # two overlapping runs would double-step the plants
	st['busy'] = True
	try:
		run()
	finally:
		st['busy'] = False
