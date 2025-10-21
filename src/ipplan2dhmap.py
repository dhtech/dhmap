#!/usr/bin/env python3
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
    'SELECT name, horizontal, "table" AS class, hall, x1, y1, x2, y2, width, height FROM table_coordinates'
    
    ' UNION SELECT sc.name, 0 AS horizontal, "switch" AS class, tc.hall hall, sc.x + 5 AS x1, sc.y + 5 AS y1, sc.x + 5 AS x2,'
    ' sc.y + 5 AS y1, 5 AS width, 5 AS height '
    ' FROM switch_coordinates sc '
    ' INNER JOIN table_coordinates tc ON sc.table_name = tc.name'
    
    ' UNION SELECT h.name name, 0 horizontal, "switch" class, "Dist" hall, 0 x1, 0 y1, 0 x2, 0 y2, 0 height, 0 width'
    ' FROM host h INNER JOIN option o ON o.node_id = h.node_id WHERE o.name = "layer" AND o.value = "dist"'
    
    ' UNION SELECT h.name name, 0 horizontal, "switch" class, "Prod" hall, 0 x1, 0 y1, 0 x2, 0 y2, 0 height, 0 width'
    ' FROM host h INNER JOIN option o ON o.node_id = h.node_id'
    ' LEFT JOIN switch_coordinates sc ON sc.name = h.name'
    ' WHERE sc.name IS NULL AND o.name = "layer" AND o.value = "access" AND h.name LIKE "%prod%"'
    
    ' ORDER BY hall'
  )
  results = c.fetchall()
  switches = [{k: result[k] for k in result.keys()} for result in results]

  # Map to halls
  halls = collections.defaultdict(list)
  for switch in switches:
    #if (switch['class'] == 'table' or switch['class'] == 'switch') and re.match('([a-zA-Z]+)[0-9]+', switch['name']):
    if switch['hall'] is None:
      hall = re.search('([a-zA-Z]+)[0-9]+', switch['name']).group(1).upper()
      switch['hall'] = hall
      halls[hall].append(switch)
    else:
      halls[switch['hall']].append(switch)

  print(json.dumps(halls))
  conn.close()

