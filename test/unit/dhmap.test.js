/**
 * Characterization tests for src/dhmap.js - the rendering library.
 *
 * Raphael is stubbed (test/helpers/raphael-stub.js) so init() genuinely runs
 * and populates its private registries; filter() and updateSwitches() are only
 * observable once it has.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadDhmap } = require('../helpers/load.js');
const topo = require('../fixtures/topology.js');

/** Load dhmap and draw a topology, returning the sandbox. */
function drawn(topology = topo.basic(), onclick = () => {}) {
  const sandbox = loadDhmap();
  sandbox.dhmap.init(topology, onclick);
  return sandbox;
}

test('dhmap.colour', async (t) => {
  const { dhmap } = loadDhmap();

  await t.test('defines a colour for every status computeStatus emits', () => {
    for (const status of ['OK', 'CRITICAL', 'WARNING', 'SPEED', 'STP',
                          'ERRORS', 'ALERT', 'UNKNOWN']) {
      assert.ok(dhmap.colour[status], `missing colour for ${status}`);
    }
  });

  // dhmenu.js injects alpha with colour.replace(')', ',0.7)'), so these must
  // stay in rgb()/rgba() form - a hex value there would produce nonsense.
  await t.test('uses rgb()/rgba() form, which dhmenu depends on', () => {
    for (const [status, colour] of Object.entries(dhmap.colour)) {
      assert.match(colour, /^rgba?\(/, `${status} must be rgb()/rgba()`);
    }
  });

  await t.test('alpha injection produces a usable colour', () => {
    assert.equal(dhmap.colour.OK.replace(')', ',0.7)'), 'rgb(137,245,108,0.7)');
  });
});

test('dhmap.init', async (t) => {
  await t.test('draws a rectangle per table and switch, plus hall boxes', () => {
    const sandbox = drawn();
    const rects = sandbox.shapes.filter((s) => s.type === 'rect');
    // 2 tables + 2 switches + 2 switch label boxes + 1 hall box
    assert.equal(rects.length, 7);
    assert.ok(sandbox.shapes.some((s) => s.attrs.text === 'Hall 1'),
      'hall label should be drawn');
  });

  await t.test('fills tables and switches with their status colours', () => {
    const sandbox = drawn();
    const fills = sandbox.shapes.map((s) => s.attrs.fill);
    assert.ok(fills.includes(sandbox.dhmap.colour.TABLE), 'tables use TABLE');
    assert.ok(fills.includes(sandbox.dhmap.colour.UNKNOWN),
      'switches start UNKNOWN until statuses arrive');
  });

  await t.test('skips Dist, Prod and Grid when sizing halls', () => {
    // Those halls have no coordinates; only Hall 1 gets a bounding box drawn.
    const sandbox = drawn();
    const hallBoxes = sandbox.shapes.filter(
      (s) => typeof s.attrs.fill === 'string' && s.attrs.fill.startsWith('hsla('));
    assert.equal(hallBoxes.length, 1);
  });

  await t.test('lays two halls out side by side', () => {
    const sandbox = drawn(topo.twoHalls());
    const labels = sandbox.shapes
      .filter((s) => s.type === 'text' && /^Hall /.test(s.attrs.text))
      .map((s) => s.attrs.text);
    assert.deepEqual(labels.sort(), ['Hall 1', 'Hall 2']);
  });

  await t.test('wires the click callback through to switches', () => {
    const clicked = [];
    const sandbox = drawn(topo.basic(), (object) => clicked.push(object.name));
    const withClick = sandbox.shapes.find((s) => s.handlers.click);
    assert.ok(withClick, 'switches should have a click handler');
    withClick.handlers.click();
    assert.equal(clicked.length, 1);
  });

  // KNOWN DEFECT (dhmap.js:269 and :398): init renders every object twice, a
  // dry pass to measure and a wet pass to draw, but renderSwitch mutates the
  // object it is given. So the centering offsets are applied twice: width goes
  // 5 -> 6.7 -> 8.4 rather than stopping at 6.7.
  await t.test('applies switch centering offsets twice (known defect)', () => {
    const topology = topo.basic();
    const target = topology['Hall 1'].find((o) => o.class === 'switch');
    assert.deepEqual(
      { x1: target.x1, y1: target.y1, width: target.width },
      { x1: 15, y1: 25, width: 5 });

    loadDhmap().dhmap.init(topology, () => {});

    assert.equal(target.width, 8.4, '1.7 added twice, not once');
    assert.equal(target.height, 8.4);
    assert.equal(target.y1, 16.05);
  });

  // KNOWN DEFECT (dhmap.js:358): halls are sized only from halls that have
  // objects, but the third phase looks up every hall named in Grid. Adding a
  // hall to hall_positions before its tables exist takes the map down.
  await t.test('throws for a Grid hall with no objects (known defect)', () => {
    const topology = topo.basic();
    topology['Grid'].push(topo.hallMarker('Hall 9', 1, 0));
    assert.throws(() => loadDhmap().dhmap.init(topology, () => {}), (err) => {
      assert.equal(err.name, 'TypeError');
      return true;
    });
  });
});

test('dhmap.updateSwitches', async (t) => {
  const switchName = 'd73-a.event.dreamhack.local';

  /** The rectangle drawn for a switch (its label box is drawn separately). */
  function switchRect(sandbox) {
    return sandbox.shapes.find(
      (s) => s.type === 'rect' && s.handlers.click);
  }

  await t.test('paints each switch with the colour for its status', () => {
    const sandbox = drawn();
    sandbox.dhmap.updateSwitches({ [switchName]: 'CRITICAL' });
    assert.equal(switchRect(sandbox).attrs.fill, sandbox.dhmap.colour.CRITICAL);
  });

  await t.test('falls back to UNKNOWN for a switch with no status', () => {
    const sandbox = drawn();
    sandbox.dhmap.updateSwitches({});
    assert.equal(switchRect(sandbox).attrs.fill, sandbox.dhmap.colour.UNKNOWN);
  });

  await t.test('repaints when the status changes', () => {
    const sandbox = drawn();
    sandbox.dhmap.updateSwitches({ [switchName]: 'CRITICAL' });
    sandbox.dhmap.updateSwitches({ [switchName]: 'OK' });
    assert.equal(switchRect(sandbox).attrs.fill, sandbox.dhmap.colour.OK);
  });

  await t.test('leaves a search-highlighted switch alone', () => {
    const sandbox = drawn();
    sandbox.dhmap.filter('d73-a');
    assert.equal(switchRect(sandbox).attrs.fill, '#0000ff');

    sandbox.dhmap.updateSwitches({ [switchName]: 'CRITICAL' });
    assert.equal(switchRect(sandbox).attrs.fill, '#0000ff',
      'status updates must not clobber the highlight');
  });
});

test('dhmap.filter', async (t) => {
  await t.test('highlights a table by name, case insensitively', () => {
    const sandbox = drawn();
    sandbox.dhmap.filter('d73');
    assert.equal(sandbox.dhmap.oldTableObject.attrs.fill, '#0000ff');
  });

  await t.test('highlights a switch and its table together', () => {
    const sandbox = drawn();
    sandbox.dhmap.filter('d73-a');
    assert.equal(sandbox.dhmap.oldSwitchObject.attrs.fill, '#0000ff');
    assert.equal(sandbox.dhmap.oldTableObject.attrs.fill, '#0000ff',
      'the switch\'s table is highlighted too');
  });

  await t.test('restores the previous colour on the next search', () => {
    const sandbox = drawn();
    sandbox.dhmap.filter('d73');
    sandbox.dhmap.filter('d74');
    const d73 = sandbox.shapes.find((s) => s.attrs.text === 'D73');
    assert.ok(d73, 'D73 label should exist');
    assert.equal(sandbox.dhmap.oldTableObject.attrs.fill, '#0000ff');
  });

  await t.test('clears the highlight for an unknown name', () => {
    const sandbox = drawn();
    sandbox.dhmap.filter('d73');
    sandbox.dhmap.filter('nosuchtable');
    assert.equal(sandbox.dhmap.oldTableObject, undefined);
    assert.equal(sandbox.dhmap.oldSwitchObject, undefined);
  });

  // A switch name with no '-' makes indexOf return -1, and substr(0, -1)
  // yields '', so the table lookup silently misses instead of erroring.
  await t.test('finds no table for a switch name without a dash', () => {
    const topology = topo.basic();
    topology['Hall 1'].push(
      topo.accessSwitch('lonely.event.dreamhack.local', 'Hall 1', 30, 30));
    const sandbox = drawn(topology);

    sandbox.dhmap.filter('lonely');
    assert.ok(sandbox.dhmap.oldSwitchObject, 'the switch itself is found');
    assert.equal(sandbox.dhmap.oldTableObject, undefined,
      'substr(0, -1) gives an empty name, so no table matches');
  });
});
