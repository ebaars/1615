# Roll logging: read side for the Rolls page (Maintenance/Rolls, route /rolls). The rolls are cut and logged by the gateway tag script
# [cal1615]HMI/roll_tick (tools/roll_tick.py), which also creates the tables (ROLL, ROLL_STAT, ROLL_LOG, ROLL_EVENT, ROLL_CFG, ...) in myOracle.
# Everything here tolerates a missing table (nothing has been logged yet) and returns an empty result.
DB = 'myOracle'

# setting key -> (label, units, default). The tag script reads them from ROLL_CFG once a minute.
SETTINGS = [
	('path_len_ft', 'Fabric path, coater to winder', 'ft', 0.0),
	('acc_cap_ft', 'Accumulator capacity (full = 100 %)', 'ft', 0.0),
	('cut_max_ft', 'Winder counter below this = new roll', 'ft', 5.0),
	('min_roll_ft', 'Shorter than this is flagged SHORT', 'ft', 100.0),
	('snap_s', 'Snapshot interval', 's', 10.0),
	('prod_off_s', 'Tank down / RTO not ready this long ends production', 's', 60.0),
]

def _num(v, nd=1):
	return None if v is None else round(float(v), nd)

def list_rolls(limit=80):
	"""Latest rolls first."""
	try:
		ds = system.db.runPrepQuery("SELECT id AS \"id\", roll_no AS \"roll_no\", leader AS \"leader\", winder AS \"winder\", status AS \"status\", reason AS \"reason\", "
			"TO_CHAR(start_ts, 'MM-DD HH24:MI') AS \"start\", TO_CHAR(end_ts, 'HH24:MI') AS \"end\", length_ft AS \"length_ft\", recipe AS \"recipe\", "
			"shop_order AS \"shop\", flags AS \"flags\", rows_n AS \"rows_n\" FROM ROLL ORDER BY id DESC FETCH FIRST " + str(int(limit)) + " ROWS ONLY", [], DB)
	except:
		return []
	out = []
	for r in ds:
		out.append({'id': int(r['id']), 'roll': ('Leader' if r['leader'] else '#%d' % int(r['roll_no'])), 'winder': r['winder'], 'status': r['status'],
			'start': r['start'], 'end': r['end'] or '', 'length': _num(r['length_ft'], 0), 'recipe': r['recipe'] or '', 'shop': r['shop'] or '',
			'flags': r['flags'] or '', 'rows': None if r['rows_n'] is None else int(r['rows_n'])})
	return out

def roll_info(roll_id):
	"""One line about a roll for the detail header."""
	if not roll_id:
		return 'Select a roll.'
	try:
		ds = system.db.runPrepQuery("SELECT roll_no AS \"roll_no\", leader AS \"leader\", winder AS \"winder\", status AS \"status\", reason AS \"reason\", length_ft AS \"length_ft\", "
			"w_start AS \"w_start\", w_end AS \"w_end\", path_len_ft AS \"path\", acc_cap_ft AS \"acc\", rows_n AS \"rows_n\", covered_ft AS \"covered\", flags AS \"flags\" FROM ROLL WHERE id = ?", [int(roll_id)], DB)
	except:
		return ''
	if ds.getRowCount() == 0:
		return 'Roll not found.'
	r = ds[0]
	txt = '%s on winder %s, %s%s. %s ft; wound footage %s to %s; %s snapshots covering %s ft.' % (
		'Leader roll' if r['leader'] else 'Roll %d' % int(r['roll_no']), r['winder'], r['status'], (' (' + r['reason'] + ')') if r['reason'] else '',
		_num(r['length_ft'], 0), _num(r['w_start'], 0), _num(r['w_end'], 0), r['rows_n'] if r['rows_n'] is not None else '-', _num(r['covered'], 0))
	if (r['path'] or 0) <= 0:
		txt += ' The fabric path is not set, so these values are not shifted back to the coater.'
	if r['flags']:
		txt += ' Flags: ' + r['flags'] + '.'
	return txt

def roll_stats(roll_id):
	"""Per-tag statistics of a roll, over the fabric that was at the coater while it was wound onto the roll."""
	if not roll_id:
		return []
	try:
		ds = system.db.runPrepQuery("SELECT tag AS \"tag\", n AS \"n\", avg_v AS \"avg\", min_v AS \"min\", max_v AS \"max\", sd_v AS \"sd\" FROM ROLL_STAT WHERE roll_id = ? ORDER BY tag", [int(roll_id)], DB)
	except:
		return []
	out = []
	for r in ds:
		out.append({'tag': r['tag'].replace('[cal1615]', ''), 'avg': _num(r['avg'], 2), 'min': _num(r['min'], 2), 'max': _num(r['max'], 2), 'sd': _num(r['sd'], 3), 'n': int(r['n'])})
	return out

def get_cfg():
	"""The settings as a dict (defaults for anything not stored yet)."""
	out = dict((k, d) for k, label, u, d in SETTINGS)
	try:
		for r in system.db.runPrepQuery('SELECT k AS "k", v AS "v" FROM ROLL_CFG', [], DB):
			if r['k'] in out and r['v'] is not None:
				out[r['k']] = float(r['v'])
	except:
		pass
	return out

def set_cfg(key, value, user=''):
	"""Store one setting. The gateway script picks it up within a minute."""
	if key not in [k for k, label, u, d in SETTINGS]:
		return False, 'Unknown setting.'
	try:
		system.db.runPrepUpdate('MERGE INTO ROLL_CFG c USING (SELECT ? AS k, ? AS v FROM DUAL) s ON (c.k = s.k) WHEN MATCHED THEN UPDATE SET c.v = s.v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (s.k, s.v)',
			[key, float(value)], DB)
	except:
		return False, 'Could not save: the roll tables do not exist yet (they are created when the roll logging script first runs).'
	system.util.getLogger('cal1615.rolls').info('%s set %s = %s' % (user, key, value))
	return True, 'Saved. The roll logging picks it up within a minute.'
