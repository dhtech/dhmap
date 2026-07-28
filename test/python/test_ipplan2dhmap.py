"""Characterization tests for src/ipplan2dhmap.py.

The generator is a script with no importable API, so it is driven the way
production drives it: as a subprocess against a database, asserting on the
JSON it prints. Fixtures are built into a temp directory and never committed.
"""
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                '..', 'fixtures'))
import build_ipplan                                        # noqa: E402
import topology                                            # noqa: E402

REPO_ROOT = topology.REPO_ROOT
GENERATOR = os.path.join(REPO_ROOT, 'src', 'ipplan2dhmap.py')


def generate(db_path):
  """Run the generator, returning parsed JSON. Raises on failure."""
  result = subprocess.run([sys.executable, GENERATOR, db_path],
                          capture_output=True, text=True)
  if result.returncode != 0:
    raise AssertionError('generator failed: %s' % result.stderr)
  return json.loads(result.stdout)


class RoundTripTest(unittest.TestCase):
  """topology -> database -> generator -> topology."""

  def test_round_trip_reproduces_the_topology(self):
    source = topology.basic()
    self.assertEqual(generate(build_ipplan.build(source)), source)

  def test_every_object_carries_the_expected_keys(self):
    result = generate(build_ipplan.build(topology.basic()))
    for hall, objects in result.items():
      for obj in objects:
        self.assertCountEqual(obj.keys(), topology.KEYS,
                              'unexpected keys in %s' % hall)

  def test_output_is_keyed_by_hall(self):
    result = generate(build_ipplan.build(topology.basic()))
    self.assertIn('Hall 1', result)
    for hall, objects in result.items():
      for obj in objects:
        self.assertEqual(obj['hall'], hall)


class BranchTest(unittest.TestCase):
  """Each arm of the generator's five-way UNION."""

  def setUp(self):
    self.result = generate(build_ipplan.build(topology.basic()))

  def test_tables_come_through_with_their_coordinates(self):
    tables = [o for o in self.result['Hall 1'] if o['class'] == 'table']
    self.assertEqual(sorted(t['name'] for t in tables), ['D73', 'D74'])

  def test_switch_coordinates_are_offset_by_five(self):
    switch = next(o for o in self.result['Hall 1']
                  if o['name'].startswith('d73-a'))
    # build_ipplan stored x=10,y=20; the generator adds 5 to each.
    self.assertEqual((switch['x1'], switch['y1']), (15, 25))
    self.assertEqual((switch['x2'], switch['y2']), (15, 25))
    self.assertEqual((switch['width'], switch['height']), (5, 5))

  def test_dist_switches_land_in_their_own_hall(self):
    self.assertEqual([o['name'] for o in self.result['Dist']],
                     ['dist-core.event.dreamhack.local'])

  def test_prod_only_covers_access_switches_without_coordinates(self):
    self.assertEqual([o['name'] for o in self.result['Prod']],
                     ['prod-sw1.event.dreamhack.se'])

  def test_grid_describes_hall_placement(self):
    grid = self.result['Grid']
    self.assertEqual([g['name'] for g in grid], ['Hall 1'])
    self.assertEqual(grid[0]['class'], 'hall')


class RealWorldQuirksTest(unittest.TestCase):
  """Behaviours only a production database reveals."""

  def test_duplicate_hall_positions_collapse_to_one(self):
    # Production holds several identical rows per hall. UNION (not UNION ALL)
    # dedupes them; switching to UNION ALL would draw overlapping halls.
    db = build_ipplan.build(topology.basic(), hall_position_duplicates=7)
    self.assertEqual(len(generate(db)['Grid']), 1)

  def test_hall_names_may_contain_spaces(self):
    result = generate(build_ipplan.build(topology.basic()))
    self.assertIn('Hall 1', result)

  def test_halls_without_a_name_are_derived_from_the_object_name(self):
    # A table with no hall falls back to the letters leading its name.
    db = build_ipplan.build(topology.basic())
    conn = sqlite3.connect(db)
    conn.execute('INSERT INTO table_coordinates VALUES '
                 '("F12", 0, NULL, 0, 0, 0, 0, 0, 0)')
    conn.commit()
    conn.close()
    self.assertIn('F', generate(db))

  def test_hall_less_name_without_digits_crashes(self):
    # KNOWN DEFECT (ipplan2dhmap.py:44): re.search(...).group(1) is called
    # without checking for a match, so a name like VIP raises AttributeError.
    db = build_ipplan.build(topology.basic())
    conn = sqlite3.connect(db)
    conn.execute('INSERT INTO table_coordinates VALUES '
                 '("VIP", 0, NULL, 0, 0, 0, 0, 0, 0)')
    conn.commit()
    conn.close()

    result = subprocess.run([sys.executable, GENERATOR, db],
                            capture_output=True, text=True)
    self.assertNotEqual(result.returncode, 0)
    self.assertIn('AttributeError', result.stderr)


class ExampleTest(unittest.TestCase):
  """src/examples/data.json is documentation, so it must stay accurate."""

  def setUp(self):
    with open(os.path.join(REPO_ROOT, 'src', 'examples', 'data.json')) as fp:
      self.example = json.load(fp)

  def test_example_is_keyed_by_hall_with_the_expected_keys(self):
    self.assertIsInstance(self.example, dict,
                          'the example must be hall-keyed, not a flat list')
    for hall, objects in self.example.items():
      for obj in objects:
        self.assertCountEqual(obj.keys(), topology.KEYS)

  def test_example_has_a_grid_so_dhmap_init_can_lay_it_out(self):
    self.assertIn('Grid', self.example)
    for marker in self.example['Grid']:
      self.assertIn(marker['name'], self.example,
                    'every hall in Grid needs objects, or dhmap.init throws')

  def test_example_round_trips_through_the_generator(self):
    self.assertEqual(generate(build_ipplan.build(self.example)), self.example)


def _real_database():
  """Resolve an optional real ipplan database, decompressing .xz if needed."""
  candidates = [os.environ.get('IPPLAN_DB'),
                os.path.join(REPO_ROOT, 'local', 'ipplan.db'),
                os.path.join(REPO_ROOT, 'local', 'ipplan.db.xz')]
  for path in candidates:
    if path and os.path.exists(path):
      if not path.endswith('.xz'):
        return path
      import lzma
      target = os.path.join(tempfile.mkdtemp(prefix='dhmap-real-'), 'ipplan.db')
      with lzma.open(path) as src, open(target, 'wb') as dst:
        dst.write(src.read())
      return target
  return None


@unittest.skipUnless(_real_database(),
                     'no real ipplan database - set IPPLAN_DB or drop one in '
                     'local/ (optional; CI never has one)')
class RealDataTest(unittest.TestCase):
  """Structural checks against a real database, when one is available.

  Deliberately asserts nothing about specific device names, so real event data
  never ends up encoded in test expectations.
  """

  @classmethod
  def setUpClass(cls):
    cls.result = generate(_real_database())

  def test_produces_halls_with_well_formed_objects(self):
    self.assertGreater(len(self.result), 0)
    for hall, objects in self.result.items():
      for obj in objects:
        self.assertCountEqual(obj.keys(), topology.KEYS)
        self.assertEqual(obj['hall'], hall)

  def test_every_grid_hall_has_objects(self):
    # dhmap.init looks up hallsizes[hall] for each Grid entry and would throw
    # on a hall that has none, so this catches a map-breaking ipplan edit.
    for marker in self.result.get('Grid', []):
      self.assertIn(marker['name'], self.result)

  def test_object_classes_are_ones_dhmap_can_draw(self):
    drawn = {'table', 'switch'}
    for hall, objects in self.result.items():
      if hall == 'Grid':
        continue
      for obj in objects:
        self.assertIn(obj['class'], drawn)


if __name__ == '__main__':
  unittest.main()
