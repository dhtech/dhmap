/**
 * Generates the data.json dhmon.html fetches, before the servers start.
 *
 * Pinned to the example rather than the resolution order `make serve` uses:
 * these tests assert on specific switch names, so a real ipplan database in
 * local/ must not change what they see.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const output = execFileSync('python3', [
    path.join('test', 'data_source.py'), '--source', 'example',
  ], { cwd: repoRoot, encoding: 'utf8' });
  process.stdout.write(output);
};
