#!/usr/bin/env python3
"""A stand-in for the monitoring backend dhmap talks to.

Presents two faces over one scenario, so the SNMP values are authored once:

  Prometheus  /api/v1/query, /api/v1/query_range, /metrics, /-/healthy
              using the metric names the real rules in scripts/prometheus
              use - ifHCInOctets, ifHCOutOctets, ifHighSpeed, ifInErrors.

  analytics   /ping.status, /snmp.saves, /switch.model, /switch.interfaces,
              /dhcp.status, /switch.vlans, /alerts.hosts - the seven endpoints
              dhmon.js fetches.

Binds loopback on port 5000 by default, which is where localserver.py's
/analytics/ redirect already points, so `make serve` gives a populated map
with no real monitoring system present.

Standard library only, so it runs anywhere python3 does.
"""
import argparse
import http.server
import json
import os
import socketserver
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scenarios                                           # noqa: E402

FIXTURE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'fixtures', 'scenarios')

# The analytics endpoints dhmon.js fetches, without their /analytics/ prefix.
ANALYTICS_ENDPOINTS = [
    'ping.status', 'snmp.saves', 'switch.model', 'switch.interfaces',
    'dhcp.status', 'switch.vlans', 'alerts.hosts',
]


def load_scenario(name):
  """Load a committed scenario by name, or build one for a device set."""
  path = os.path.join(FIXTURE_DIR, '%s.json' % name)
  with open(path) as fp:
    return json.load(fp)


def build_scenario(name, devices):
  """Build a scenario over `devices` using one of the builders."""
  builder = getattr(scenarios, name, None)
  if builder is None:
    raise ValueError('no scenario builder named %r' % name)
  return builder(devices)


class Backend(object):
  """Renders a scenario into both the analytics and Prometheus shapes."""

  def __init__(self, scenario):
    self.scenario = scenario

  # -- analytics face ------------------------------------------------------

  def ping_status(self):
    return {name: d['ping'] for name, d in self.scenario.items()}

  def snmp_saves(self):
    return {name: {'since': d['snmp_since']}
            for name, d in self.scenario.items()}

  def switch_model(self):
    return {name: d['model'] for name, d in self.scenario.items()}

  def alerts_hosts(self):
    return {name: True for name, d in self.scenario.items() if d['alert']}

  def switch_interfaces(self):
    result = {}
    for name, d in self.scenario.items():
      result[name] = {
          i['name']: {
              # dhmon treats anything that is not an access port as a trunk.
              'trunk': i['layer'] != 'access',
              'status': i['status'],
              'admin': i['admin'],
              'speed': str(i['speed']),
              'errors_in': i['errors_in'],
              'errors_out': i['errors_out'],
              'stp': i['stp'],
              'lastoid': i['lastoid'],
              'rx_10min': i['rx'],
              'tx_10min': i['tx'],
          }
          for i in d['interfaces']
      }
    return result

  def switch_vlans(self):
    return {name: {'100': 'clients'} for name in self.scenario}

  def dhcp_status(self):
    return {'clients': {'vlan': '100', 'usage': 120, 'max': 250}}

  def analytics(self, endpoint):
    return {
        'ping.status': self.ping_status,
        'snmp.saves': self.snmp_saves,
        'switch.model': self.switch_model,
        'switch.interfaces': self.switch_interfaces,
        'switch.vlans': self.switch_vlans,
        'dhcp.status': self.dhcp_status,
        'alerts.hosts': self.alerts_hosts,
    }[endpoint]()

  # -- prometheus face -----------------------------------------------------

  def samples(self):
    """(metric, labels, value) for every interface in the scenario."""
    for name, d in self.scenario.items():
      for i in d['interfaces']:
        labels = {'device': name, 'interface': i['name'],
                  'alias': i['name'], 'layer': i['layer']}
        yield 'ifHighSpeed', labels, i['speed']
        yield 'ifHCInOctets', labels, i['rx']
        yield 'ifHCOutOctets', labels, i['tx']
        yield 'ifInErrors', labels, i['errors_in']

  def query(self, metric):
    """An instant-vector response in the Prometheus HTTP API shape."""
    now = time.time()
    result = [
        {'metric': dict(labels, __name__=name), 'value': [now, str(value)]}
        for name, labels, value in self.samples() if name == metric
    ]
    return {'status': 'success',
            'data': {'resultType': 'vector', 'result': result}}

  def metrics(self):
    """Text exposition format."""
    lines = []
    for name, labels, value in self.samples():
      rendered = ','.join('%s="%s"' % (k, v) for k, v in sorted(labels.items()))
      lines.append('%s{%s} %s' % (name, rendered, value))
    return '\n'.join(lines) + '\n'


class Handler(http.server.BaseHTTPRequestHandler):
  backend = None

  def log_message(self, *args):
    pass          # quiet by default; tests capture nothing useful from this

  def _cors_headers(self):
    # Not needed when reached through localserver.py, which reverse-proxies
    # /analytics the way production apache does, so the browser sees one
    # origin. Kept so the backend also works when a page is pointed straight
    # at it on port 5000.
    self.send_header('Access-Control-Allow-Origin', '*')
    self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    self.send_header('Access-Control-Allow-Headers', '*')

  def _send(self, body, content_type='application/json'):
    encoded = body.encode('utf-8')
    self.send_response(200)
    self.send_header('Content-Type', content_type)
    self.send_header('Content-Length', str(len(encoded)))
    self._cors_headers()
    self.end_headers()
    self.wfile.write(encoded)

  def do_OPTIONS(self):
    self.send_response(204)
    self._cors_headers()
    self.send_header('Content-Length', '0')
    self.end_headers()

  def do_GET(self):
    path = self.path.split('?')[0].lstrip('/')
    query = {}
    if '?' in self.path:
      from urllib.parse import parse_qs
      query = parse_qs(self.path.split('?', 1)[1])

    if path == '-/healthy':
      return self._send('ok', 'text/plain')

    # Swap the live scenario, so a browser test can drive the map from one
    # state to another and watch it repaint.
    if path == 'control/scenario':
      name = (query.get('name') or ['healthy'])[0]
      devices = list(self.backend.scenario)
      try:
        self.backend.scenario = load_scenario(name)
      except FileNotFoundError:
        self.backend.scenario = build_scenario(name, devices)
      return self._send(json.dumps({'scenario': name,
                                    'devices': len(self.backend.scenario)}))

    if path == 'metrics':
      return self._send(self.backend.metrics(), 'text/plain')

    if path in ('api/v1/query', 'api/v1/query_range'):
      metric = (query.get('query') or [''])[0]
      return self._send(json.dumps(self.backend.query(metric)))

    # Accept both /ping.status and /analytics/ping.status, so the fake works
    # whether it is reached directly or through localserver's redirect.
    endpoint = path[len('analytics/'):] if path.startswith('analytics/') \
        else path
    if endpoint in ANALYTICS_ENDPOINTS:
      return self._send(json.dumps(self.backend.analytics(endpoint)))

    self.send_error(404, 'no such endpoint: %s' % path)


def serve(scenario, port=5000):
  """Create a server for `scenario`. Pass port=0 to bind a free port."""
  handler = type('BoundHandler', (Handler,), {'backend': Backend(scenario)})
  socketserver.TCPServer.allow_reuse_address = True
  return socketserver.TCPServer(('127.0.0.1', port), handler)


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--port', type=int, default=5000)
  parser.add_argument('--scenario', default='healthy',
                      help='committed scenario name, or a builder when '
                           '--devices is given (default: %(default)s)')
  parser.add_argument('--devices', nargs='*',
                      help='build the scenario over these device names')
  args = parser.parse_args()

  if args.devices:
    scenario = build_scenario(args.scenario, args.devices)
  else:
    scenario = load_scenario(args.scenario)

  httpd = serve(scenario, args.port)
  print('fake backend on port %d serving %d devices (%s)'
        % (args.port, len(scenario), args.scenario))
  try:
    httpd.serve_forever()
  except KeyboardInterrupt:
    httpd.shutdown()


if __name__ == '__main__':
  main()
