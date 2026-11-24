"""Scenario builders: SNMP-level truth about a set of devices.

A scenario is the single source both faces of the fake backend render from -
the Prometheus metrics and the dhmon analytics endpoints are two views of the
same data, so they cannot disagree.

Committed scenarios live in test/fixtures/scenarios/*.json. These builders
produce the same shape for a device set discovered at runtime, which is what
local mode uses when it reads real device names out of an ipplan database.
"""

# Ports slower than this on a trunk are what dhmon flags as SPEED.
GIGABIT = 1000


def interface(name='ge-0/0/1', layer='dist', speed=GIGABIT, rx=0, tx=0,
              errors_in=0, errors_out=0, stp='ok', status='up', admin='up',
              lastoid=1):
  """One interface as SNMP reports it. rx/tx are octets over 10 minutes."""
  return {
      'name': name, 'layer': layer, 'speed': speed,
      'rx': rx, 'tx': tx,
      'errors_in': errors_in, 'errors_out': errors_out,
      'stp': stp, 'status': status, 'admin': admin, 'lastoid': lastoid,
  }


def device(ping=0, snmp_since=0, model='ex2200', alert=False, interfaces=None):
  """One device. ping is seconds since the last ICMP reply."""
  return {
      'ping': ping, 'snmp_since': snmp_since, 'model': model,
      'alert': alert,
      'interfaces': list(interfaces if interfaces is not None
                         else [interface()]),
  }


def healthy(devices):
  """Everything up, nothing wrong: every switch should render OK."""
  return {name: device() for name in devices}


def degraded(devices):
  """One device per failure mode, cycling if there are more devices.

  Gives an E2E run at least one switch of each colour without needing a
  hand-written scenario per device set.
  """
  modes = [
      ('ok', device()),
      ('critical', device(ping=90)),
      ('stp', device(interfaces=[interface(stp='error')])),
      ('speed', device(interfaces=[interface(name='xe-0/0/1', speed=100)])),
      ('errors', device(interfaces=[interface(errors_in=42)])),
      ('warning', device(snmp_since=900)),
      ('alert', device(alert=True)),
  ]
  return {name: modes[index % len(modes)][1]
          for index, name in enumerate(sorted(devices))}


def saturated(devices):
  """Links carrying more than 95% of their rated speed.

  dhmon draws these as SPEED via tx_full/rx_full; Prometheus alerts on the
  same ratio at 90%. Both read these octet counters.
  """
  # 95% of a gigabit over 10 minutes, in octets.
  octets = int(GIGABIT * 1000 * 1000 / 8 * 0.96)
  return {name: device(interfaces=[interface(rx=octets, tx=octets)])
          for name in devices}
