"""Tests for the fake monitoring backend.

The point of the fake is that its two faces cannot disagree, because both are
rendered from one scenario. These tests hold it to that, and to the contracts
its consumers rely on: the endpoint set dhmon.js fetches, and the metric names
the real Prometheus rules in scripts/prometheus use.
"""
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request

TEST_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(TEST_DIR, 'fake'))
sys.path.insert(0, os.path.join(TEST_DIR, 'fixtures'))
import backend                                             # noqa: E402
import scenarios                                           # noqa: E402
import topology                                            # noqa: E402

# Metric names used by scripts/prometheus/{alerts,precompute}.prom. If the
# fake stops emitting these it stops resembling the real thing.
REAL_METRICS = ['ifHCInOctets', 'ifHCOutOctets', 'ifHighSpeed', 'ifInErrors']


class ScenarioFixtureTest(unittest.TestCase):
  """The committed scenarios stay loadable and well formed."""

  def test_every_committed_scenario_loads(self):
    for name in ['healthy', 'degraded', 'saturated']:
      scenario = backend.load_scenario(name)
      self.assertGreater(len(scenario), 0, name)
      for device, values in scenario.items():
        self.assertCountEqual(
            values.keys(),
            ['ping', 'snmp_since', 'model', 'alert', 'interfaces'])

  def test_scenarios_cover_the_devices_in_the_topology(self):
    expected = topology.switch_names(topology.basic())
    self.assertCountEqual(backend.load_scenario('healthy').keys(), expected)

  def test_degraded_covers_several_failure_modes(self):
    scenario = backend.load_scenario('degraded')
    self.assertGreater(len({json.dumps(v, sort_keys=True)
                            for v in scenario.values()}), 1,
                       'degraded should not be uniform')


class AnalyticsFaceTest(unittest.TestCase):

  def setUp(self):
    self.scenario = backend.load_scenario('degraded')
    self.backend = backend.Backend(self.scenario)

  def test_serves_every_endpoint_dhmon_fetches(self):
    for endpoint in backend.ANALYTICS_ENDPOINTS:
      self.assertIsInstance(self.backend.analytics(endpoint), dict, endpoint)

  def test_ping_and_snmp_match_the_scenario(self):
    for name, values in self.scenario.items():
      self.assertEqual(self.backend.ping_status()[name], values['ping'])
      self.assertEqual(self.backend.snmp_saves()[name]['since'],
                       values['snmp_since'])

  def test_interfaces_carry_the_fields_dhmon_reads(self):
    required = ['trunk', 'status', 'admin', 'speed', 'errors_in',
                'errors_out', 'stp', 'lastoid', 'rx_10min', 'tx_10min']
    for interfaces in self.backend.switch_interfaces().values():
      for values in interfaces.values():
        for field in required:
          self.assertIn(field, values)

  def test_speed_is_a_string_because_dhmon_compares_it_to_one(self):
    for interfaces in self.backend.switch_interfaces().values():
      for values in interfaces.values():
        self.assertIsInstance(values['speed'], str)

  def test_access_ports_are_not_trunks(self):
    scenario = {'sw': scenarios.device(
        interfaces=[scenarios.interface(layer='access')])}
    interfaces = backend.Backend(scenario).switch_interfaces()['sw']
    self.assertFalse(list(interfaces.values())[0]['trunk'])

  def test_alerts_only_lists_devices_with_an_alert(self):
    scenario = {'quiet': scenarios.device(),
                'noisy': scenarios.device(alert=True)}
    alerts = backend.Backend(scenario).alerts_hosts()
    self.assertEqual(list(alerts), ['noisy'])


class PrometheusFaceTest(unittest.TestCase):

  def setUp(self):
    self.backend = backend.Backend(backend.load_scenario('degraded'))

  def test_emits_the_metric_names_the_real_rules_use(self):
    emitted = {name for name, _, _ in self.backend.samples()}
    for metric in REAL_METRICS:
      self.assertIn(metric, emitted)

  def test_labels_match_the_real_rules(self):
    for _, labels, _ in self.backend.samples():
      self.assertCountEqual(labels.keys(),
                            ['device', 'interface', 'alias', 'layer'])

  def test_query_returns_an_instant_vector(self):
    response = self.backend.query('ifHighSpeed')
    self.assertEqual(response['status'], 'success')
    self.assertEqual(response['data']['resultType'], 'vector')
    for sample in response['data']['result']:
      self.assertEqual(sample['metric']['__name__'], 'ifHighSpeed')
      # Prometheus renders sample values as strings.
      self.assertIsInstance(sample['value'][1], str)

  def test_query_for_an_unknown_metric_is_empty_not_an_error(self):
    response = self.backend.query('nosuchmetric')
    self.assertEqual(response['data']['result'], [])

  def test_exposition_format_is_parseable(self):
    for line in self.backend.metrics().strip().splitlines():
      name, _, rest = line.partition('{')
      self.assertIn(name, REAL_METRICS)
      self.assertIn('} ', rest)


class FacesAgreeTest(unittest.TestCase):
  """Both faces are views of one scenario, so they must not diverge."""

  def setUp(self):
    self.scenario = backend.load_scenario('degraded')
    self.backend = backend.Backend(self.scenario)

  def test_speed_agrees_between_the_two_faces(self):
    prometheus = {
        (labels['device'], labels['interface']): value
        for name, labels, value in self.backend.samples()
        if name == 'ifHighSpeed'
    }
    for device, interfaces in self.backend.switch_interfaces().items():
      for interface, values in interfaces.items():
        self.assertEqual(str(prometheus[(device, interface)]),
                         values['speed'])

  def test_octet_counters_agree_between_the_two_faces(self):
    incoming = {
        (labels['device'], labels['interface']): value
        for name, labels, value in self.backend.samples()
        if name == 'ifHCInOctets'
    }
    for device, interfaces in self.backend.switch_interfaces().items():
      for interface, values in interfaces.items():
        self.assertEqual(incoming[(device, interface)], values['rx_10min'])


class SaturationTest(unittest.TestCase):
  """The saturated scenario must actually trip both saturation rules.

  dhmon.js:254 flags a link when octets*8/1000/1000 / speed > 0.95; the
  Prometheus rules InterfaceIn/OutAlmostFull use the same expression at 90%.
  If this fixture stopped crossing both thresholds the E2E SPEED assertions
  would pass vacuously.
  """

  def ratio(self, values):
    return (values['rx_10min'] * 8 / 1000 / 1000) / float(values['speed'])

  def test_saturated_links_cross_both_thresholds(self):
    interfaces = backend.Backend(
        backend.load_scenario('saturated')).switch_interfaces()
    for device, ports in interfaces.items():
      for name, values in ports.items():
        ratio = self.ratio(values)
        self.assertGreater(ratio, 0.95, '%s %s below dhmap threshold'
                           % (device, name))
        self.assertGreater(ratio * 100, 90, '%s %s below prometheus threshold'
                           % (device, name))

  def test_healthy_links_trip_neither(self):
    interfaces = backend.Backend(
        backend.load_scenario('healthy')).switch_interfaces()
    for ports in interfaces.values():
      for values in ports.values():
        self.assertLess(self.ratio(values), 0.95)


class HttpTest(unittest.TestCase):
  """The server itself, over the wire."""

  @classmethod
  def setUpClass(cls):
    cls.httpd = backend.serve(backend.load_scenario('healthy'), port=0)
    cls.port = cls.httpd.server_address[1]
    threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

  @classmethod
  def tearDownClass(cls):
    cls.httpd.shutdown()
    cls.httpd.server_close()

  def get(self, path):
    return urllib.request.urlopen(
        'http://127.0.0.1:%d%s' % (self.port, path)).read().decode()

  def test_analytics_endpoints_return_json(self):
    for endpoint in backend.ANALYTICS_ENDPOINTS:
      self.assertIsInstance(json.loads(self.get('/' + endpoint)), dict)

  def test_endpoints_also_answer_under_the_analytics_prefix(self):
    # localserver redirects /analytics/x to this server's /x, but accepting
    # both means the fake also works if pointed at directly.
    self.assertEqual(json.loads(self.get('/analytics/ping.status')),
                     json.loads(self.get('/ping.status')))

  def test_health_and_metrics_endpoints(self):
    self.assertEqual(self.get('/-/healthy').strip(), 'ok')
    self.assertIn('ifHighSpeed', self.get('/metrics'))

  def test_prometheus_query_over_http(self):
    response = json.loads(self.get('/api/v1/query?query=ifHCInOctets'))
    self.assertEqual(response['status'], 'success')

  def test_unknown_path_is_a_404(self):
    with self.assertRaises(urllib.error.HTTPError) as caught:
      self.get('/nope')
    self.assertEqual(caught.exception.code, 404)
    caught.exception.close()


if __name__ == '__main__':
  unittest.main()
