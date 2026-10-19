# Text helpers for the Overview panels (Components/Main/Line State and Job Panel). Called from view bindings with runScript(..., 1000, ...),
# so the elapsed times tick every second.

def _ms(d):
	"""Epoch milliseconds of a date a binding hands over: a java.util.Date, a java.time.Instant, or a number."""
	if hasattr(d, 'toEpochMilli'):
		return d.toEpochMilli()
	if hasattr(d, 'getTime'):
		return d.getTime()
	return long(d)

def _elapsed(since):
	return (system.date.now().getTime() - _ms(since)) / 1000.0

def _span(s):
	"""Whole seconds -> '45 s' / '12 min 05 s' / '2 h 15 min'."""
	s = max(0, int(s))
	if s < 60:
		return '%d s' % s
	if s < 3600:
		return '%d min %02d s' % (s // 60, s % 60)
	return '%d h %02d min' % (s // 3600, (s // 60) % 60)

def age(since, prefix=''):
	"""How long ago a DateTime tag value was ('' when it is not set)."""
	if since is None:
		return ''
	return prefix + _span(_elapsed(since))

def job_header(state, session_start):
	"""Header of the job panel: no production, or how long the job has been running."""
	if state in (None, 'IDLE'):
		return 'Job   (no production)'
	if session_start is None:
		return 'Job   running'
	return 'Job   running ' + _span(_elapsed(session_start))


def last_rolls(n, state, plc_count):
	"""The n lines of the Last rolls list of the job panel: the latest logged rolls, or, when none are logged yet, what the panel is waiting for."""
	n = int(n)
	lines = []
	for r in cal1615.rolls.list_rolls(n)[:n]:
		flags = (r['flags'] or '').replace('PARTIAL', 'PART').replace('NOCLEAR', 'NOCLR')
		lines.append('%-7s %s %6s ft %s' % (r['roll'], r['winder'], format(r['length'] or 0, ',.0f'), flags))
	if not lines:
		lines = ['No rolls logged yet',
			'Waiting for production' if state in (None, 'IDLE') else 'The first roll is the leader',
			'PLC roll count ' + ('---' if plc_count is None else '%d' % plc_count)]
	return lines + [''] * (n - len(lines))
