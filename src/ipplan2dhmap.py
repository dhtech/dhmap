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
    ' FROM table_coordinates'
    ' UNION SELECT name, 0 AS'
    ' horizontal, "switch" AS class, x + 5 AS x1, y + 5 AS y1, x + 5 AS x2,'
    ' y + 5 AS y1, 5 AS width, 5 AS height FROM switch_coordinates'
    ' UNION SELECT h.name name, 0 horizontal, "Dist" AS class, 0 x1, 0 y1, 0 x2, 0 y2, 0 height, 0 width'
    ' FROM host h INNER JOIN option o ON o.node_id = h.node_id WHERE o.name = "layer" AND o.value = "dist"'
  )
  results = c.fetchall()
  switches = [{k: result[k] for k in result.keys()} for result in results]

  # Map to halls
  halls = collections.defaultdict(list)
  for switch in switches:
    if re.match('([a-zA-Z]+)[0-9]+', switch['name']) is not None:
      hall = re.search('([a-zA-Z]+)[0-9]+', switch['name']).group(1).upper()
      halls[hall].append(switch)
    else:
      halls["dist"].append(switch)

  print json.dumps(halls)
  conn.close()

