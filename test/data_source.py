#!/usr/bin/env python3
"""Produce the data.json that dhmon.html fetches.

Resolution order, used consistently by `make serve` and the browser tier:

  1. $IPPLAN_DB
  2. local/ipplan.db
  3. local/ipplan.db.xz  (decompressed to a temp directory)
  4. src/examples/data.json  (the default, and what CI uses)

The first three run the real generator, so local mode renders the real event
map. data.json is a build output: gitignored, and removed by `make clean`.
"""
import argparse
import json
import lzma
import os
import shutil
import subprocess
import sys
import tempfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GENERATOR = os.path.join(REPO_ROOT, 'src', 'ipplan2dhmap.py')
EXAMPLE = os.path.join(REPO_ROOT, 'src', 'examples', 'data.json')


def find_database(allow_real=True):
  """Return a usable ipplan database path, or None."""
  if not allow_real:
    return None
  candidates = [
      os.environ.get('IPPLAN_DB'),
      os.path.join(REPO_ROOT, 'local', 'ipplan.db'),
      os.path.join(REPO_ROOT, 'local', 'ipplan.db.xz'),
  ]
  for path in candidates:
    if not path or not os.path.exists(path):
      continue
    if not path.endswith('.xz'):
      return path
    target = os.path.join(tempfile.mkdtemp(prefix='dhmap-ipplan-'),
                          'ipplan.db')
    with lzma.open(path) as src, open(target, 'wb') as dst:
      shutil.copyfileobj(src, dst)
    return target
  return None


def build(output, allow_real=True):
  """Write data.json to `output`. Returns a description of the source used."""
  database = find_database(allow_real)
  if database:
    result = subprocess.run([sys.executable, GENERATOR, database],
                            capture_output=True, text=True)
    if result.returncode != 0:
      raise SystemExit('generator failed:\n%s' % result.stderr)
    with open(output, 'w') as fp:
      fp.write(result.stdout)
    return 'real ipplan database'

  shutil.copyfile(EXAMPLE, output)
  return 'src/examples/data.json'


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--output', default=os.path.join(REPO_ROOT, 'data.json'))
  parser.add_argument('--devices', action='store_true',
                      help='print the switch names instead of writing a file')
  parser.add_argument('--source', choices=['auto', 'example'], default='auto',
                      help='auto uses a real database when one is present; '
                           'example always uses src/examples/data.json, which '
                           'is what the browser tier needs so its assertions '
                           'stay deterministic (default: %(default)s)')
  args = parser.parse_args()
  allow_real = args.source == 'auto'

  if args.devices:
    database = find_database(allow_real)
    if database:
      result = subprocess.run([sys.executable, GENERATOR, database],
                              capture_output=True, text=True)
      objects = json.loads(result.stdout)
    else:
      with open(EXAMPLE) as fp:
        objects = json.load(fp)
    for hall in objects.values():
      for obj in hall:
        if obj['class'] == 'switch':
          print(obj['name'])
    return

  source = build(args.output, allow_real)
  print('wrote %s from %s'
        % (os.path.relpath(args.output, REPO_ROOT), source))


if __name__ == '__main__':
  main()
