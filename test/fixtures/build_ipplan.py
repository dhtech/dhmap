"""Build a throwaway ipplan SQLite database from a topology.

This inverts what src/ipplan2dhmap.py does, so a topology can be turned into a
database, fed back through the generator, and compared with the original. The
database is always written to a temp directory - never into the repository.

Only the five tables the generator reads are created; a real ipplan has many
more, but none of them affect the map.
"""
import os
import sqlite3
import tempfile

SWITCH_OFFSET = 5

SCHEMA = """
CREATE TABLE table_coordinates (
  name TEXT, horizontal INT, hall TEXT,
  x1 INT, y1 INT, x2 INT, y2 INT, width INT, height INT);
CREATE TABLE switch_coordinates (name TEXT, table_name TEXT, x INT, y INT);
CREATE TABLE host (node_id INT, name TEXT);
CREATE TABLE option (node_id INT, name TEXT, value TEXT);
CREATE TABLE hall_positions (name TEXT, x INT, y INT);
"""


def table_for_switch(switch_name):
  """d73-a.event.dreamhack.local -> D73, matching how the map pairs them."""
  short = switch_name.split('.')[0]
  return short.split('-')[0].upper()


def build(topology, path=None, hall_position_duplicates=1):
  """Write `topology` to a SQLite database and return its path.

  hall_position_duplicates reproduces a real-world quirk: the production
  database holds several identical rows per hall, which the generator's UNION
  collapses back to one.
  """
  if path is None:
    path = os.path.join(tempfile.mkdtemp(prefix='dhmap-fixture-'), 'ipplan.db')

  conn = sqlite3.connect(path)
  conn.executescript(SCHEMA)
  node_id = 0

  for hall, objects in topology.items():
    for obj in objects:
      if obj['class'] == 'table':
        conn.execute(
            'INSERT INTO table_coordinates VALUES (?,?,?,?,?,?,?,?,?)',
            (obj['name'], obj['horizontal'], obj['hall'], obj['x1'],
             obj['y1'], obj['x2'], obj['y2'], obj['width'], obj['height']))

      elif obj['class'] == 'hall':
        for _ in range(hall_position_duplicates):
          conn.execute('INSERT INTO hall_positions VALUES (?,?,?)',
                       (obj['name'], obj['x1'], obj['y1']))

      elif obj['class'] == 'switch':
        node_id += 1
        if hall == 'Dist':
          conn.execute('INSERT INTO host VALUES (?,?)', (node_id, obj['name']))
          conn.execute('INSERT INTO option VALUES (?,?,?)',
                       (node_id, 'layer', 'dist'))
        elif hall == 'Prod':
          # Deliberately no switch_coordinates row: the generator's Prod branch
          # selects exactly those access switches that have no coordinates.
          conn.execute('INSERT INTO host VALUES (?,?)', (node_id, obj['name']))
          conn.execute('INSERT INTO option VALUES (?,?,?)',
                       (node_id, 'layer', 'access'))
        else:
          conn.execute(
              'INSERT INTO switch_coordinates VALUES (?,?,?,?)',
              (obj['name'], table_for_switch(obj['name']),
               obj['x1'] - SWITCH_OFFSET, obj['y1'] - SWITCH_OFFSET))

  conn.commit()
  conn.close()
  return path
