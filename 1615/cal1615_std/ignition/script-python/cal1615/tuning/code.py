# cal1615 PID tuning engine: identify the process from captured SP / PV / CV, then suggest gains.
# Pure Python 2.7 (Jython), no numpy. Gains are for the PLC's classic PID instruction with INDEPENDENT gains:
#   Kp unitless, Ki in 1/s, Kd in s   (PE bit of the PID control word = 0; checked on the cal1615 loops).
# Everything is worked out in percent of span (PV) and percent of output (CV), so a temperature loop
# (0..1000 F) and a tension loop (0..500 lb, output -50..+50 = 100 %) are handled by the same maths.
# The loops differ in speed and sample rate: see PROFILES.
from __future__ import division
import math

# ---- what each kind of loop needs
# sample_s      : capture interval to aim for
# max_sample_s  : slower than this and the fit is not trustworthy
# tau_lo/hi     : plausible process time constant range (s), used for warnings only
PROFILES = {
	'temperature': {'sample_s': 1.0, 'max_sample_s': 5.0, 'tau_lo': 20.0, 'tau_hi': 3600.0},
	'tension': {'sample_s': 0.1, 'max_sample_s': 0.25, 'tau_lo': 0.05, 'tau_hi': 30.0},
}

def mean(v):
	return sum(v) / len(v)

def pct(values, lo, hi):
	span = float(hi - lo)
	return [100.0 * (x - lo) / span for x in values]

def cv_to_eng(cv_pct, eng_lo, eng_hi):
	"""PID output % -> engineering units of the actuator range (e.g. -50..+50 for a tension drive)."""
	return eng_lo + cv_pct / 100.0 * (eng_hi - eng_lo)

def cv_from_eng(eng, eng_lo, eng_hi):
	return 100.0 * (eng - eng_lo) / (eng_hi - eng_lo)

def logix_scale(loop):
	"""Factor between % error gains and the PLC's gains. 1.0 when the PID works on % of span error;
	100 / span when it works on engineering-unit error (loop['error_pct'] = False)."""
	if loop.get('error_pct', True):
		return 1.0
	return 100.0 / float(loop['pv_max'] - loop['pv_min'])

# ---------------------------------------------------------------- numerics
def nelder_mead(f, x0, step, iters=200, tol=1e-10):
	n = len(x0)
	pts = [list(x0)]
	for i in range(n):
		p = list(x0)
		p[i] += step[i]
		pts.append(p)
	vals = [f(p) for p in pts]
	for it in range(iters):
		order = sorted(range(n + 1), key=lambda i: vals[i])
		pts = [pts[i] for i in order]
		vals = [vals[i] for i in order]
		if abs(vals[-1] - vals[0]) <= tol * (abs(vals[0]) + 1e-12):
			break
		cen = [sum(pts[i][j] for i in range(n)) / n for j in range(n)]
		def at(c):
			return [cen[j] + c * (pts[-1][j] - cen[j]) for j in range(n)]
		xr = at(-1.0)
		fr = f(xr)
		if fr < vals[0]:
			xe = at(-2.0)
			fe = f(xe)
			if fe < fr:
				pts[-1], vals[-1] = xe, fe
			else:
				pts[-1], vals[-1] = xr, fr
		elif fr < vals[-2]:
			pts[-1], vals[-1] = xr, fr
		else:
			if fr < vals[-1]:
				xc = at(-0.5)
				fc = f(xc)
				ok = fc <= fr
			else:
				xc = at(0.5)
				fc = f(xc)
				ok = fc < vals[-1]
			if ok:
				pts[-1], vals[-1] = xc, fc
			else:
				for i in range(1, n + 1):
					pts[i] = [pts[0][j] + 0.5 * (pts[i][j] - pts[0][j]) for j in range(n)]
					vals[i] = f(pts[i])
	best = min(range(n + 1), key=lambda i: vals[i])
	return pts[best], vals[best]

def _delayed(buf, k, d, default):
	"""buf[k - d] for a fractional delay of d samples (linear interpolation); before the start -> default."""
	i = int(math.floor(d))
	f = d - i
	ia = k - i
	ib = ia - 1
	a = buf[ia] if ia >= 0 else default
	b = buf[ib] if ib >= 0 else default
	return a * (1.0 - f) + b * f

# ---------------------------------------------------------------- identification
def simulate_fopdt(u, dt, K, tau, theta, y0, u0):
	"""First-order-plus-dead-time response of PV (%) to CV (%), for the measured CV sequence."""
	a = math.exp(-dt / tau)
	d = theta / dt
	x = y0
	out = []
	for k in range(len(u)):
		ud = _delayed(u, k, d, u0)
		x = a * x + (1.0 - a) * (y0 + K * (ud - u0))
		out.append(x)
	return out

def fit_fopdt(dt, u, y, u0=None, y0=None):
	"""Fit K (%PV per %CV), tau and theta (s) to captured CV (u) and PV (y), both in %. The loop may be closed:
	the measured CV is the process input, so no controller model is needed.
	u0 / y0: the operating point before the excitation (default: the first 4 % of the capture)."""
	n = len(u)
	m = max(5, n // 25)
	if u0 is None:
		u0 = mean(u[:m])
	if y0 is None:
		y0 = mean(y[:m])
	T = n * dt
	ybar = mean(y)
	sst = sum((v - ybar) ** 2 for v in y) or 1e-12
	suu = sum((v - u0) ** 2 for v in u)
	k0 = (sum((a - u0) * (b - y0) for a, b in zip(u, y)) / suu) if suu > 1e-12 else 1.0
	if abs(k0) < 1e-6:
		k0 = 1e-3
	def unpack(p):
		tau = min(max(math.exp(p[1]), 0.2 * dt), 2.0 * T)
		th = min(max(math.exp(p[2]), 0.05 * dt), T / 2.0)
		return p[0], tau, th
	def err(p):
		K, tau, th = unpack(p)
		sim = simulate_fopdt(u, dt, K, tau, th, y0, u0)
		return sum((s - v) ** 2 for s, v in zip(sim, y))
	best = None
	for tau0 in (T / 40.0, T / 12.0, T / 5.0):
		for th0 in (dt, T / 60.0, T / 20.0):
			p, e = nelder_mead(err, [k0 * 1.5, math.log(max(tau0, dt)), math.log(max(th0, dt * 0.5))],
				[abs(k0) * 0.5 + 1e-3, 0.6, 0.6], iters=140)
			if best is None or e < best[1]:
				best = (p, e)
	K, tau, th = unpack(best[0])
	sse = best[1]
	return {'K': K, 'tau': tau, 'theta': th, 'u0': u0, 'y0': y0, 'dt': dt,
		'r2': 1.0 - sse / sst, 'rmse': math.sqrt(sse / n)}

def noise_estimate(y):
	"""PV noise (std, %) from the point-to-point differences."""
	d = [y[i] - y[i - 1] for i in range(1, len(y))]
	if not d:
		return 0.0
	md = mean(d)
	return math.sqrt(sum((v - md) ** 2 for v in d) / len(d) / 2.0)

# ---------------------------------------------------------------- closed loop on the model
def step_response(model, kp, ki, kd, dt, T, delta=1.0, u_lo=-50.0, u_hi=50.0):
	"""SP step of 'delta' (% of span) on the model with an independent-gains PID (reverse acting).
	Kp, Ki (1/s), Kd (s) are in % / % terms. Derivative acts on PV. Output limited, integral anti-windup."""
	K = abs(model['K'])
	tau = model['tau']
	d = model['theta'] / dt
	a = math.exp(-dt / tau)
	n = int(T / dt) + 1
	x = 0.0
	integ = 0.0
	prev = 0.0
	ubuf = []
	ys = []
	us = []
	for k in range(n):
		e = delta - x
		deriv = -kd * (x - prev) / dt if kd else 0.0
		u = kp * e + integ + deriv
		sat = u
		if u > u_hi:
			sat = u_hi
		elif u < u_lo:
			sat = u_lo
		if not ((u > u_hi and e > 0) or (u < u_lo and e < 0)):
			integ += ki * e * dt
		prev = x
		ubuf.append(sat)
		ud = _delayed(ubuf, k, d, 0.0)
		x = a * x + (1.0 - a) * K * ud
		ys.append(x)
		us.append(sat)
		if abs(x) > 50.0 * abs(delta):
			break  # unstable
	return ys, us

def metrics(ys, us, dt, delta, K):
	n = len(ys)
	stable = n * dt > 0 and abs(ys[-1] - delta) < 0.5 * abs(delta) and max(abs(v) for v in ys) < 5.0 * abs(delta)
	iae = sum(abs(delta - v) for v in ys) * dt
	os_ = max(0.0, max(ys) - delta) / abs(delta)
	settle = n * dt
	for i in range(n - 1, -1, -1):
		if abs(ys[i] - delta) > 0.05 * abs(delta):
			settle = (i + 1) * dt
			break
	else:
		settle = 0.0
	tv = sum(abs(us[i] - us[i - 1]) for i in range(1, n))
	return {'stable': stable, 'iae': iae, 'overshoot_pct': 100.0 * os_, 'settle_s': settle,
		'tv': tv / (abs(delta) / K), 'final_err_pct': abs(ys[-1] - delta) / abs(delta) * 100.0}

def _sim_dt(model):
	return max(min(model['theta'] / 5.0, model['tau'] / 20.0), model['tau'] / 400.0)

def _horizon(model):
	return 10.0 * (model['tau'] + model['theta'])

def _scaled(model, kK=1.0, kt=1.0, kth=1.0):
	return {'K': model['K'] * kK, 'tau': model['tau'] * kt, 'theta': model['theta'] * kth}

def evaluate(model, kp, ki, kd, delta=1.0):
	dt = _sim_dt(model)
	T = _horizon(model)
	ys, us = step_response(model, kp, ki, kd, dt, T, delta)
	return metrics(ys, us, dt, delta, abs(model['K']))

CORNERS = [(kK, kt, kth) for kK in (0.7, 1.4) for kt in (0.7, 1.4) for kth in (0.7, 1.5)]

def _cost(m):
	if not m['stable']:
		return 1e6
	return (m['iae'] + 0.0) + 5.0 * max(0.0, m['overshoot_pct'] - 10.0) / 100.0 + 0.15 * max(0.0, m['tv'] - 1.2)

def robust_cost(model, kp, ki, kd, scale):
	"""Nominal cost plus the mean over models whose gain, time constant and dead time are off by 30-50 %."""
	delta = 1.0
	dt = _sim_dt(model)
	T = _horizon(model)
	norm = abs(delta) * (model['tau'] + model['theta'])
	def one(mod):
		ys, us = step_response(mod, kp, ki, kd, dt, T, delta)
		return metrics(ys, us, dt, delta, abs(mod['K']))
	nom = one(model)
	if not nom['stable']:
		return 1e6
	c = _cost(nom) / norm
	total = 0.0
	worst_os = 0.0
	for kK, kt, kth in CORNERS:
		m = one(_scaled(model, kK, kt, kth))
		if not m['stable']:
			return 1e6 - 1.0
		worst_os = max(worst_os, m['overshoot_pct'])
		total += _cost(m) / norm
	c += 0.5 * total / len(CORNERS)
	if worst_os > 40.0:
		c += (worst_os - 40.0) / 20.0
	return c

def tune(model, use_d=False, speed=1.0):
	"""Suggested gains in % / % terms: (Kc, Ti [s], Td [s]). speed > 1 asks for a faster loop than the IMC start."""
	K = abs(model['K'])
	tau = model['tau']
	th = model['theta']
	lam = max(tau / max(speed, 0.2) * 0.5, 2.0 * th)
	kc0 = tau / (K * (lam + th))
	ti0 = min(tau, 4.0 * (lam + th))
	td0 = 0.5 * th if use_d else 0.0
	def unpack(p):
		return math.exp(p[0]), math.exp(p[1]), (math.exp(p[2]) if use_d else 0.0)
	def f(p):
		kc, ti, td = unpack(p)
		return robust_cost(model, kc, kc / ti, kc * td, 1.0)
	x0 = [math.log(kc0), math.log(ti0)] + ([math.log(max(td0, 1e-3))] if use_d else [])
	p, c = nelder_mead(f, x0, [0.3] * len(x0), iters=120)
	kc, ti, td = unpack(p)
	return {'kc': kc, 'ti': ti, 'td': td, 'cost': c}

# ---------------------------------------------------------------- capture quality
def quality(loop, dt, u, y, fit):
	"""Warnings about a capture: sample rate, excitation, saturation, fit."""
	prof = PROFILES.get(loop.get('kind', 'temperature'), PROFILES['temperature'])
	w = []
	dt = max(dt, loop.get('dt_eff') or 0.0)   # the PV tag may update more slowly than the capture loop runs
	if dt > prof['max_sample_s']:
		w.append('The PV updates every %.2f s; this kind of loop needs %.2f s or faster (put its tags on a faster tag group).' % (dt, prof['max_sample_s']))
	if fit['tau'] < 4.0 * dt:
		w.append('Process time constant (%.2f s) is short compared with the sample time (%.2f s): sample faster.' % (fit['tau'], dt))
	noise = noise_estimate(y)
	swing = max(y) - min(y)
	snr = swing / noise if noise > 1e-9 else 1e9
	if snr < 15.0:
		w.append('PV moved only %.1f times the noise level: use a bigger SP bump or a longer test.' % snr)
	lo, hi = loop.get('cv_min', 0.0), loop.get('cv_max', 100.0)
	sat = sum(1 for v in u if v <= lo + 0.5 or v >= hi - 0.5) / len(u)
	if sat > 0.05:
		w.append('CV was at its limit %.0f %% of the time: the fit is not reliable.' % (100.0 * sat))
	if fit['r2'] < 0.8:
		w.append('The model explains only %.0f %% of the PV movement.' % (100.0 * fit['r2']))
	if fit['tau'] > 0 and fit['theta'] / fit['tau'] > 2.0:
		w.append('Dead time is more than twice the time constant: PI gains will be modest.')
	return {'snr': snr, 'noise_pct': noise, 'saturated_fraction': sat, 'warnings': w}

# ---------------------------------------------------------------- does the PLC's PID work on % of span or on engineering units?
def scale_check(cv, k_step, d_sp, kp_plc, span, noise_cv=0.2):
	"""Look at the CV jump just after an SP step of d_sp (engineering units) made at sample k_step.
	With error in engineering units the output jumps by Kp * d_sp; with error in % of span by Kp * d_sp * 100 / span.
	Returns {'error_pct': True / False / None (cannot tell), 'jump', 'ratio_eu', 'ratio_pct', 'why'}."""
	if k_step < 3 or k_step + 3 >= len(cv) or abs(d_sp) < 1e-9 or abs(kp_plc) < 1e-9:
		return {'error_pct': None, 'why': 'no usable SP step'}
	base = mean(cv[k_step - 3:k_step])
	jump = cv[k_step + 2] - base
	if base > 98.0 or base < 2.0 or cv[k_step + 2] >= 99.5 or cv[k_step + 2] <= 0.5:
		return {'error_pct': None, 'jump': jump, 'why': 'output at its limit'}
	if abs(jump) < 3.0 * noise_cv:
		return {'error_pct': None, 'jump': jump, 'why': 'CV barely moved (%.2f %%)' % jump}
	eff = abs(jump / d_sp)
	r_eu = eff / abs(kp_plc)
	r_pct = eff / (abs(kp_plc) * 100.0 / span)
	e_eu = abs(math.log10(r_eu))
	e_pct = abs(math.log10(r_pct))
	best = 'pct' if e_pct < e_eu else 'eu'
	err = min(e_eu, e_pct)
	out = {'jump': jump, 'ratio_eu': r_eu, 'ratio_pct': r_pct}
	if err > 0.3 or (jump > 0) != (d_sp > 0):
		out.update({'error_pct': None, 'why': 'jump of %.2f %% matches neither form (x%.2f / x%.2f)' % (jump, r_eu, r_pct)})
	else:
		out.update({'error_pct': best == 'pct', 'why': 'jump %.2f %% for %.2f engineering units' % (jump, d_sp)})
	return out

# ---------------------------------------------------------------- one call for the page / tests
def analyze(loop, dt, sp, pv, cv, current=None, use_d=False):
	"""loop : dict(kind, pv_min, pv_max, cv_min, cv_max, [error_pct]).  sp / pv in engineering units, cv in % (PID output).
	current: dict(kp, ki, kd) in the PLC's units, or None. Returns model, quality, suggested gains (PLC units), predicted metrics."""
	y = pct(pv, loop['pv_min'], loop['pv_max'])
	fit = fit_fopdt(dt, cv, y)
	q = quality(loop, dt, cv, y, fit)
	t = tune(fit, use_d)
	scale = logix_scale(loop)
	sug = {'kp': t['kc'] * scale, 'ki': t['kc'] / t['ti'] * scale, 'kd': t['kc'] * t['td'] * scale, 'ti': t['ti'], 'td': t['td']}
	res = {'model': fit, 'quality': q, 'suggested': sug,
		'suggested_metrics': evaluate(fit, t['kc'], t['kc'] / t['ti'], t['kc'] * t['td']),
		'gain_sign': 'direct acting needed (K < 0)' if fit['K'] < 0 else 'reverse acting (K > 0)'}
	if current:
		res['current_metrics'] = evaluate(fit, current['kp'] / scale, current['ki'] / scale, current['kd'] / scale)
	return res


# ---------------------------------------------------------------- heat-up from cold (Siemens pretuning style, passive capture)
def _window_slope(y, i, w, k, dt):
	"""Slope (units/s) of y over the window [i, i + w): mean of the last k points minus the mean of the first k, over the gap."""
	return (mean(y[i + w - k:i + w]) - mean(y[i:i + k])) / ((w - k) * dt)

def _median(v):
	s = sorted(v)
	n = len(s)
	return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])

def quality_heatup(loop, dt, y, u, fit, rise, rise_target, on_t):
	prof = PROFILES.get(loop.get('kind', 'temperature'), PROFILES['temperature'])
	w = []
	dt = max(dt, loop.get('dt_eff') or 0.0)
	if dt > prof['max_sample_s']:
		w.append('The PV updates every %.2f s; this kind of loop needs %.2f s or faster.' % (dt, prof['max_sample_s']))
	noise = noise_estimate(y[:max(10, int(on_t / max(dt, 1e-9)))])
	snr = rise / noise if noise > 1e-9 else 1e9
	if snr < 20.0:
		w.append('PV rose only %.0f times the noise level.' % snr)
	if rise < 3.0:
		w.append('PV rose only %.1f %% of span: a bigger heat-up gives a more reliable model.' % rise)
	if rise < 0.9 * rise_target:
		w.append('The capture ended when PV had covered %.0f %% of the way to SP; the model is extrapolated from the first part of the heat-up.' % (100.0 * rise / rise_target))
	if max(u) - min(u[:max(5, int(on_t / max(dt, 1e-9)))]) < 30.0:
		w.append('CV rose by less than 30 %: the heat-up was not a strong enough step.')
	if fit['r2'] < 0.9:
		w.append('The model explains only %.0f %% of the heat-up (it may be nonlinear over this temperature range).' % (100.0 * fit['r2']))
	return {'snr': snr, 'noise_pct': noise, 'saturated_fraction': 0.0, 'warnings': w}

def analyze_heatup(loop, dt, sp, pv, cv, current=None, use_d=False):
	"""Cold-start capture: PV rises from its starting value toward SP while the PLC's own PID drives CV (normally pinned at its limit
	at first). The measured CV is the process input, so the same model fit applies. Also finds the steepest rise and the apparent
	dead time (the tangent at the inflection point), as pretuning does. Returns the same keys as analyze() plus 'tangent' / 'coarse',
	or {'error': text} when the capture cannot be used."""
	y = pct(pv, loop['pv_min'], loop['pv_max'])
	spp = pct(sp, loop['pv_min'], loop['pv_max'])
	n = len(y)
	thr = 5.0
	on = None
	for i in range(n):
		if cv[i] >= thr:
			on = i
			break
	if on is None:
		return {'error': 'The valve output never rose above %.0f %%: the burner did not start.' % thr}
	i0 = max(0, on - int(90.0 / dt))
	base_n = on - i0
	if base_n * dt < 20.0:
		return {'error': 'Less than 20 s of data before the heat started; arm the capture before pressing Start Heat.'}
	y0 = mean(y[i0:on])
	u0 = mean(cv[i0:on])
	sp_final = _median(spp[on:])
	rise_target = sp_final - y0
	if rise_target < 1.5:
		return {'error': 'SP is only %.1f %% of span above the starting PV.' % rise_target}
	rise = max(y[on:]) - y0
	if rise < 1.5:
		return {'error': 'PV rose only %.1f %% of span: not enough for a model.' % rise}
	if (n - on) * dt < 120.0:
		return {'error': 'Less than 2 minutes of heating was captured.'}
	seg_y, seg_u = y[i0:], cv[i0:]
	fit = fit_fopdt(dt, seg_u, seg_y, u0=u0, y0=y0)
	# --- tangent at the steepest rise
	w = max(8, int(round(30.0 / dt)))
	k = max(2, w // 3)
	top = on
	for i in range(on, n):
		if y[i] >= y0 + 0.7 * rise:
			top = i
			break
	else:
		top = n - 1
	best, bi = 0.0, None
	for i in range(on, max(on + 1, top - w)):
		sl = _window_slope(y, i, w, k, dt)
		if sl > best:
			best, bi = sl, i
	tangent = None
	if bi is not None and best > 0.0:
		ti = (bi + w / 2.0) * dt
		yi = mean(y[bi:bi + w])
		tb = ti - (yi - y0) / best
		L = max(tb - on * dt, 0.5 * dt)
		j0 = min(n - 1, on + int(L / dt))
		du = mean(cv[j0:bi + w]) - u0 if bi + w > j0 else 0.0
		if du < 5.0:
			du = max(cv) - u0
		R = best / du
		tangent = {'slope_pct_per_s': best, 'dead_time': L, 'reaction_rate': R, 'cv_step': du, 'time': ti}
		tangent['coarse'] = {'kc': 0.45 / (R * L), 'ti': 3.33 * L}   # Ziegler-Nichols reaction curve (PI), gain halved
	q = quality_heatup(loop, dt, y, cv, fit, rise, rise_target, on * dt)
	if tangent:
		Rm = abs(fit['K']) / fit['tau']
		if tangent['reaction_rate'] > 0 and not (0.5 <= Rm / tangent['reaction_rate'] <= 2.0):
			q['warnings'].append('The steepest-rise estimate and the model fit disagree on the rise rate (x%.1f): the heat-up is not close to first order.' % (Rm / tangent['reaction_rate']))
		if not (0.4 <= max(fit['theta'], 1e-6) / tangent['dead_time'] <= 2.5):
			q['warnings'].append('The dead time from the model (%.0f s) and from the steepest-rise tangent (%.0f s) differ.' % (fit['theta'], tangent['dead_time']))
	t = tune(fit, use_d)
	scale = logix_scale(loop)
	sug = {'kp': t['kc'] * scale, 'ki': t['kc'] / t['ti'] * scale, 'kd': t['kc'] * t['td'] * scale, 'ti': t['ti'], 'td': t['td']}
	res = {'mode': 'heatup', 'model': fit, 'quality': q, 'suggested': sug, 'tangent': tangent,
		'suggested_metrics': evaluate(fit, t['kc'], t['kc'] / t['ti'], t['kc'] * t['td']),
		'gain_sign': 'direct acting needed (K < 0)' if fit['K'] < 0 else 'reverse acting (K > 0)',
		'heatup': {'start_s': on * dt, 'baseline_pct': y0, 'rise_pct': rise, 'rise_target_pct': rise_target, 'samples': n - i0}}
	if tangent:
		res['coarse'] = {'kp': tangent['coarse']['kc'] * scale, 'ki': tangent['coarse']['kc'] / tangent['coarse']['ti'] * scale}
	if current:
		res['current_metrics'] = evaluate(fit, current['kp'] / scale, current['ki'] / scale, current['kd'] / scale)
	return res
