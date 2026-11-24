#!/usr/bin/env python3
"""Generate json to use for dhmap given a SQLite3 version of ipplan.

Two modes, chosen by what the plan holds:

  * with a seat map (table_coordinates has rows): halls, tables and the
    access switches on them where the seat map puts them, the dist
    switches under "Dist", the hall layout from hall_positions ("Grid").
  * without one: the switches grouped by AREA - one box per access
    management network (<AREA>-ACCESS-MGMT), the area's dist switch
    first, then its access switches as tiles in rows, the boxes laid out
    side by side ("Grid"). Each tile is a labelled box with the switch on
    it, so the names can be read without hovering.
"""
import collections
import json
import re
import sqlite3
import sys

# mode without a seat map: the tiles' size and how they are placed
TILE_W, TILE_H = 110, 12       # a tile, in the map's units: room for 21 characters
TILE_GAP_X, TILE_GAP_Y = 5, 4
TILES_PER_ROW = 4
AREAS_PER_ROW = 3
ACCESS_SUFFIX = '-ACCESS-MGMT'
# hall names the page keeps for itself (compared without case there)
RESERVED = ('dist', 'prod', 'grid')


def seatmap_mode(c):
  c.execute(
    'SELECT name, horizontal, "table" AS class, hall, x1, y1, x2, y2, width, height FROM table_coordinates'
    ' UNION SELECT sc.name, tc.horizontal AS horizontal, "switch" AS class, tc.hall hall, sc.x + 5 AS x1, sc.y + 5 AS y1, sc.x + 5 AS x2,'
    ' sc.y + 5 AS y1, 5 AS width, 5 AS height '
    ' FROM switch_coordinates sc '
    ' INNER JOIN table_coordinates tc ON sc.table_name = tc.name'
    ' UNION SELECT h.name name, 0 horizontal, "switch" class, "Dist" hall, 0 x1, 0 y1, 0 x2, 0 y2, 0 height, 0 width'
    ' FROM host h INNER JOIN option o ON o.node_id = h.node_id WHERE o.name = "layer" AND o.value = "dist"'
    ' UNION SELECT h.name name, 0 horizontal, "switch" class, "Prod" hall, 0 x1, 0 y1, 0 x2, 0 y2, 0 height, 0 width'
    ' FROM host h INNER JOIN option o ON o.node_id = h.node_id'
    ' LEFT JOIN switch_coordinates sc ON sc.name = h.name'
    ' WHERE sc.name IS NULL AND o.name = "layer" AND o.value = "access" AND h.name LIKE "%prod%"'
    ' UNION SELECT hp.name name, 0 horizontal, "hall" class, "Grid" hall, hp.x x1, hp.y y1, 0 x2, 0 y2, 0 height, 0 width'
    ' FROM hall_positions hp'
    ' ORDER BY hall'
  )
  results = c.fetchall()
  switches = [{k: result[k] for k in result.keys()} for result in results]
  # Map to halls
  halls = collections.defaultdict(list)
  for switch in switches:
    if switch['hall'] is None:
      hall = re.search('([a-zA-Z]+)[0-9]+', switch['name']).group(1).upper()
      switch['hall'] = hall
      halls[hall].append(switch)
    else:
      halls[switch['hall']].append(switch)
  return halls


def short(name):
  return name.split('.')[0]


def tile(name, hall, col, row):
  """A labelled box with the switch on its right end."""
  x = col * (TILE_W + TILE_GAP_X)
  y = row * (TILE_H + TILE_GAP_Y)
  box = {'name': short(name).upper(), 'label': short(name), 'class': 'table',
         'hall': hall, 'horizontal': 1, 'x1': x, 'y1': y, 'x2': x + TILE_W,
         'y2': y + TILE_H, 'width': TILE_W, 'height': TILE_H}
  sw = {'name': name, 'class': 'switch', 'hall': hall, 'horizontal': 1,
        'x1': x + TILE_W - 7, 'y1': y + 3.5, 'x2': x + TILE_W - 7,
        'y2': y + 3.5, 'width': 5, 'height': 5}
  return [box, sw]


def area_mode(c):
  """No seat map: one box per access management network."""
  layer = lambda value: c.execute(
      'SELECT h.name, n.name FROM host h JOIN network n ON n.node_id = h.network_id'
      ' JOIN option o ON o.node_id = h.node_id WHERE o.name = "layer" AND o.value = ?'
      ' ORDER BY h.name', (value,)).fetchall()
  areas = collections.OrderedDict()
  for host, net in layer('access'):
    net = net.split('@', 1)[-1]
    if not net.endswith(ACCESS_SUFFIX):
      continue
    areas.setdefault(net[:-len(ACCESS_SUFFIX)], {'dist': [], 'access': []})['access'].append(host)
  for host, _ in layer('dist'):
    # north-dsw goes with NORTH-ACCESS-MGMT - the LONGEST area
    # that is a prefix wins (h1-north-vip-dsw: H1-NORTH-VIP, not H1-NORTH)
    matches = [a for a in areas if short(host).upper().startswith(a + '-')]
    area = max(matches, key=len) if matches else None
    if area is None:
      area = short(host).upper().rsplit('-', 1)[0]
      areas.setdefault(area, {'dist': [], 'access': []})
    areas[area]['dist'].append(host)
  halls = collections.OrderedDict()
  names = []
  for area in sorted(areas):
    # an area may not take a name the page keeps for itself
    name = area + ' AREA' if area.lower() in RESERVED else area
    names.append(name)
    members = areas[area]['dist'] + areas[area]['access']
    halls[name] = []
    for i, host in enumerate(members):
      halls[name] += tile(host, name, i % TILES_PER_ROW, i // TILES_PER_ROW)
  halls['Grid'] = [{'name': name, 'class': 'hall', 'hall': 'Grid', 'horizontal': 0,
                    'x1': i % AREAS_PER_ROW, 'y1': i // AREAS_PER_ROW, 'x2': 0, 'y2': 0,
                    'width': 0, 'height': 0}
                   for i, name in enumerate(names)]
  return halls


def generate(ipplan_db):
  conn = sqlite3.connect(ipplan_db)
  conn.row_factory = sqlite3.Row
  c = conn.cursor()
  try:
    seated = c.execute('SELECT COUNT(*) FROM table_coordinates').fetchone()[0]
    return seatmap_mode(c) if seated else area_mode(c)
  finally:
    conn.close()


if __name__ == '__main__':
  print(json.dumps(generate(sys.argv[1])))
