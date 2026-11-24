"""Map topologies in the shape ipplan2dhmap.py emits and dhmap.init consumes.

Loaded from topology.json, the same fixture the JavaScript tier uses, so both
languages test against identical data.
"""
import copy
import json
import os

FIXTURE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(FIXTURE_DIR))

# Every key ipplan2dhmap.py puts on an object.
KEYS = ['name', 'horizontal', 'class', 'hall',
        'x1', 'y1', 'x2', 'y2', 'width', 'height']

# The generator offsets switch coordinates by this much; build_ipplan reverses
# it so a round trip lands back on the original values.
SWITCH_OFFSET = 5


def basic():
  """One hall with two tables and switches, plus Dist, Prod and Grid."""
  with open(os.path.join(FIXTURE_DIR, 'topology.json')) as fp:
    return json.load(fp)


def with_hall(topology, name, x, y, objects=None):
  """Add a hall, its Grid placement, and optionally its objects."""
  topology = copy.deepcopy(topology)
  topology.setdefault(name, list(objects or []))
  topology['Grid'].append({
      'name': name, 'horizontal': 0, 'class': 'hall', 'hall': 'Grid',
      'x1': x, 'y1': y, 'x2': 0, 'y2': 0, 'width': 0, 'height': 0,
  })
  return topology


def table(name, hall, x1, y1):
  return {'name': name, 'horizontal': 0, 'class': 'table', 'hall': hall,
          'x1': x1, 'y1': y1, 'x2': x1 - 8, 'y2': y1 + 37,
          'width': 38, 'height': 8}


def access_switch(name, hall, x1, y1):
  """A switch as the generator emits it, coordinates already offset."""
  return {'name': name, 'horizontal': 0, 'class': 'switch', 'hall': hall,
          'x1': x1 + SWITCH_OFFSET, 'y1': y1 + SWITCH_OFFSET,
          'x2': x1 + SWITCH_OFFSET, 'y2': y1 + SWITCH_OFFSET,
          'width': SWITCH_OFFSET, 'height': SWITCH_OFFSET}


def switch_names(topology):
  """Every switch name in a topology."""
  return [o['name'] for objects in topology.values() for o in objects
          if o['class'] == 'switch']
