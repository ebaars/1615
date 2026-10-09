# MQTT link to AWS IoT Core: read side for the MQTT page (Maintenance/MQTT, route /mqtt). The connection itself is the gateway tag script
# [cal1615]HMI/mqtt_tick (tools/mqtt_tick.py), which also creates MQTT_CFG in myOracle. The last messages are kept in the gateway globals.
DB = 'myOracle'

# setting key -> (label, default). The tag script reads them from MQTT_CFG every 15 seconds.
SETTINGS = [
	('enabled', 'MQTT on (1 = on, 0 = off)', '0'),
	('format', 'Format: sparkplug (MachineIQ) or json (one plain topic)', 'sparkplug'),
	('endpoint', 'AWS IoT endpoint (xxxx-ats.iot.<region>.amazonaws.com)', ''),
	('port', 'Port', '8883'),
	('group_id', 'Sparkplug group = customer', 'CUST03'),
	('edge_node_id', 'Sparkplug edge node = machine', 'MACH00'),
	('device_id', 'Sparkplug device = location', 'LOC00'),
	('topic', 'Topic (json format only)', 'CUST03/LOC00/MACH00'),
	('client_id', 'Client id (must be allowed by the AWS IoT policy)', 'cal1615-MACH00'),
	('publish_s', 'Check for changes every (seconds)', '5'),
	('float_tol', 'A float is sent only when it moved more than', '0.2'),
	('critical_s', 'Critical metrics are re-sent every (seconds)', '300'),
	('qos', 'QoS (0 or 1)', '1'),
	('write_tags', 'Metrics / tags that incoming commands may write (comma list, empty = none)', ''),
	('publish_tags', 'Tags to publish (json format only; empty = all logged process values)', ''),
]


def get_cfg():
	"""The settings as a dict (defaults for anything not stored yet)."""
	out = dict((k, d) for k, label, d in SETTINGS)
	try:
		for r in system.db.runPrepQuery('SELECT k AS "k", v AS "v" FROM MQTT_CFG', [], DB):
			if r['k'] in out and r['v'] is not None:
				out[r['k']] = r['v']
	except:
		pass
	return out


def set_cfg(key, value, user=''):
	"""Store one setting. The gateway script picks it up within 15 seconds."""
	if key not in [k for k, label, d in SETTINGS]:
		return False, 'Unknown setting.'
	value = '' if value is None else str(value).strip()
	if key == 'enabled' and value not in ('0', '1'):
		return False, 'MQTT on must be 1 or 0.'
	try:
		system.db.runPrepUpdate('MERGE INTO MQTT_CFG c USING (SELECT ? AS k, ? AS v FROM DUAL) s ON (c.k = s.k) WHEN MATCHED THEN UPDATE SET c.v = s.v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (s.k, s.v)',
			[key, value], DB)
	except:
		return False, 'Could not save: the MQTT table does not exist yet (it is created when the MQTT script first runs).'
	system.util.getLogger('cal1615.mqtt').info('%s set %s = %s' % (user, key, value))
	return True, 'Saved. The MQTT link picks it up within 15 seconds.'


def recent(limit=60):
	"""The last messages, newest first, for the page table."""
	st = system.util.getGlobals().get('cal1615_mqtt')
	if not st:
		return []
	rows = []
	for e in reversed(st['log'][-int(limit):]):
		rows.append({'time': system.date.format(system.date.fromMillis(e['t']), 'MM-dd HH:mm:ss'), 'kind': e['kind'], 'text': e['text']})
	return rows
