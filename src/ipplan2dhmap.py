#!/usr/bin/env python2
"""Generate json to use for dhmap given a SQLite3 version of ipplan."""
import collections
import json
import re
import sqlite3
import sys

if __name__ == '__main__':
  ipplan_db = sys.argv[1]
  conn = sqlite3.connect(ipplan_db)
  conn.row_factory = sqlite3.Row
  c = conn.cursor()

  c.execute(
    'SELECT name, horizontal, "table" AS class, x1, y1, x2, y2, width, height '
    'FROM table_coordinates UNION SELECT name, 0 AS '
    'horizontal, "switch" AS class, x + 5 AS x1, y + 5 AS y1, x + 5 AS x2, '
    'y + 5 AS y1, 5 AS width, 5 AS height FROM switch_coordinates')
  results = c.fetchall()
  switches = [{k: result[k] for k in result.keys()} for result in results]

  # Map to halls
  halls = collections.defaultdict(list)
  for switch in switches:
    hall = re.search('([a-zA-Z]+)[0-9]+', switch['name']).group(1).upper()
    halls[hall].append(switch)

  print json.dumps(halls)
  conn.close()

