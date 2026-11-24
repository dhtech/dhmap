/**
 * Characterization tests for src/dhmenu.js, the switch list beside the map.
 *
 * dhmenu is pure jQuery over a static DOM - no Raphael - so jsdom is enough.
 * The vendored jQuery is loaded rather than a stub, which makes this suite a
 * genuine check when the jQuery version is bumped.
 *
 * dhmenu cannot load standalone: it reads dhmap.colour and errors_to_human,
 * the latter defined in dhmon.js, so both are injected here.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const topo = require('../fixtures/topology.js');

const JQUERY = path.join(REPO_ROOT,
  'src/vendor/jquery-3.7.1/jquery-3.7.1.min.js');
const DHMENU = path.join(REPO_ROOT, 'src/dhmenu.js');
const DHMAP = path.join(REPO_ROOT, 'src/dhmap.js');
const DHMON = path.join(REPO_ROOT, 'dhmon.js');

/** Pull dhmap.colour and errors_to_human out of the sources, as dhmenu sees them. */
function crossFileGlobals() {
  const vm = require('node:vm');
  const context = { window: {}, document: undefined };
  context.window = context;
  vm.createContext(context);
  // dhmap.js is an IIFE that only needs a global object to attach to.
  vm.runInContext(fs.readFileSync(DHMAP, 'utf8').replace(
    /dhmap\.init\s*=[\s\S]*$/, '})();'), context, { filename: DHMAP });
  const errorsSource = fs.readFileSync(DHMON, 'utf8')
    .match(/var errors_to_human = \{[\s\S]*?\};/)[0];
  vm.runInContext(errorsSource, context);
  return { colour: context.dhmap.colour, errors: context.errors_to_human };
}

const GLOBALS = crossFileGlobals();

/** Build a DOM with jQuery and dhmenu loaded, and the menu written. */
function menu(topology = topo.basic()) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <div id="menu_container"><div id="menu_scroll"><div id="menu"></div></div></div>
     </body></html>`,
    { runScripts: 'dangerously' });

  const { window } = dom;
  window.eval(fs.readFileSync(JQUERY, 'utf8'));
  // Injected because dhmenu reads them from other files at call time.
  window.dhmap = { colour: GLOBALS.colour, filter() {} };
  window.errors_to_human = GLOBALS.errors;
  window.eval(fs.readFileSync(DHMENU, 'utf8'));

  window.dhmenu.init(topology, () => {});
  return window;
}

const $of = (window) => window.$;

/** basic(), with its hall renamed - used to isolate the space-in-id defect. */
function renamedHall(name) {
  const topology = topo.basic();
  topology[name] = topology['Hall 1'].map((o) => ({ ...o, hall: name }));
  delete topology['Hall 1'];
  topology['Grid'] = topology['Grid'].map((g) => ({ ...g, name }));
  return topology;
}

test('dhmenu.write', async (t) => {
  await t.test('lists every hall that has switches', () => {
    const window = menu();
    const halls = [...window.document.querySelectorAll('li[id^=menu_hall_]')]
      .map((li) => li.id);
    assert.ok(halls.includes('menu_hall_Hall 1'));
    assert.ok(halls.includes('menu_hall_Dist'));
    assert.ok(halls.includes('menu_hall_Prod'));
  });

  await t.test('lists switches by their short upper-case name', () => {
    const window = menu();
    const ids = [...window.document.querySelectorAll('li[id^=menu_switch_]')]
      .map((li) => li.id);
    assert.ok(ids.includes('menu_switch_D73-A'),
      'd73-a.event.dreamhack.local should become D73-A');
  });

  await t.test('tags each switch with its hall, table and status', () => {
    const window = menu();
    const li = window.document.getElementById('menu_switch_D73-A');
    assert.equal(li.getAttribute('data-hall'), 'Hall 1');
    assert.equal(li.getAttribute('data-table'), 'D73');
    assert.equal(li.getAttribute('data-status'), 'UNKNOWN');
  });

  await t.test('does not list tables, only switches', () => {
    const window = menu();
    assert.equal(window.document.getElementById('menu_switch_D73'), null);
  });

  await t.test('drops the Grid hall, which never holds switches', () => {
    const window = menu();
    assert.equal(window.document.getElementById('menu_hall_Grid'), null);
  });

  // dhmenu.write reorders and deletes keys on the object it is handed, so
  // dhmon.js:322-323 must call dhmap.init first. Reversing that order would
  // leave dhmap.init without Grid, which it dereferences at :284.
  await t.test('mutates the caller\'s objects, removing Grid', () => {
    const topology = topo.basic();
    assert.ok(topology['Grid'], 'Grid present before');
    menu(topology);
    assert.equal(topology['Grid'], undefined,
      'Grid is deleted, so dhmap.init must run first');
  });

  await t.test('moves Dist and Prod to the end of the list', () => {
    const window = menu();
    const halls = [...window.document.querySelectorAll('li[id^=menu_hall_]')]
      .map((li) => li.id);
    assert.deepEqual(halls.slice(-2), ['menu_hall_Dist', 'menu_hall_Prod']);
  });
});

test('dhmenu.updateSwitches', async (t) => {
  await t.test('records the status on the switch element', () => {
    const window = menu();
    window.dhmenu.updateSwitches(
      { 'd73-a.event.dreamhack.local': 'CRITICAL' });
    assert.equal(
      window.document.getElementById('menu_switch_D73-A')
        .getAttribute('data-status'), 'CRITICAL');
  });

  await t.test('accepts both fqdn and short names', () => {
    const window = menu();
    window.dhmenu.updateSwitches({ 'D73-A': 'OK' });
    assert.equal(
      window.document.getElementById('menu_switch_D73-A')
        .getAttribute('data-status'), 'OK');
  });

  await t.test('colours the switch with dhmap.colour plus alpha', () => {
    const window = menu();
    window.dhmenu.updateSwitches(
      { 'd73-a.event.dreamhack.local': 'CRITICAL' });
    const style = $of(window)('#menu_switch_D73-A').css('background-color');
    // rgb(255,0,0) -> rgb(255,0,0,0.7); this is why dhmap.colour must stay
    // in rgb() form rather than hex.
    assert.match(style.replace(/\s/g, ''), /255,0,0/);
  });

  await t.test('sets a human readable title from errors_to_human', () => {
    const window = menu();
    window.dhmenu.updateSwitches(
      { 'd73-a.event.dreamhack.local': 'CRITICAL' });
    assert.equal(
      window.document.getElementById('menu_switch_D73-A').getAttribute('title'),
      GLOBALS.errors.CRITICAL);
  });

  await t.test('defaults a switch with no status to UNKNOWN', () => {
    const window = menu();
    const statuses = { 'd73-a.event.dreamhack.local': undefined };
    window.dhmenu.updateSwitches(statuses);
    assert.equal(statuses['d73-a.event.dreamhack.local'], 'UNKNOWN',
      'the caller\'s object is filled in, not just the DOM');
  });

  await t.test('rolls a CRITICAL switch up to its hall', () => {
    const window = menu(renamedHall('HallA'));
    window.dhmenu.updateSwitches(
      { 'd73-a.event.dreamhack.local': 'CRITICAL' });
    assert.equal(
      window.document.getElementById('menu_hall_HallA')
        .getAttribute('data-status'), 'CRITICAL');
  });

  await t.test('does not downgrade a hall from CRITICAL to OK', () => {
    const window = menu(renamedHall('HallA'));
    window.dhmenu.updateSwitches({
      'd73-a.event.dreamhack.local': 'CRITICAL',
      'd74-a.event.dreamhack.local': 'OK',
    });
    assert.equal(
      window.document.getElementById('menu_hall_HallA')
        .getAttribute('data-status'), 'CRITICAL',
      'the worst status in a hall should win');
  });

  // KNOWN DEFECT (dhmenu.js:107-115): the hall element id is built by
  // concatenation, so a hall named "Hall 1" produces id="menu_hall_Hall 1".
  // jQuery parses "#menu_hall_Hall 1" as a descendant selector and matches
  // nothing, so the roll-up silently does nothing - and every production hall
  // is named this way. The switch itself still colours correctly.
  await t.test('never rolls up to a hall whose name has a space (known defect)',
    () => {
      const window = menu();          // basic() uses "Hall 1"
      window.dhmenu.updateSwitches(
        { 'd73-a.event.dreamhack.local': 'CRITICAL' });

      const hall = window.document.getElementById('menu_hall_Hall 1');
      assert.ok(hall, 'the element exists');
      assert.equal(hall.getAttribute('data-status'), null,
        'no status is ever recorded on a hall with a space in its name');
      assert.equal($of(window)('#menu_hall_Hall 1').length, 0,
        'because the selector matches nothing');
    });
});

test('dhmenu.filter', async (t) => {
  // filter() hides switches both directly and by folding the hall's <ul>, so
  // visibility has to account for ancestors.
  const shown = (element) => {
    for (let node = element; node && node.style; node = node.parentElement) {
      if (node.style.display === 'none') return false;
    }
    return true;
  };
  const visible = (window, selector) =>
    [...window.document.querySelectorAll(selector)].filter(shown);

  await t.test('shows every switch when the search is empty', () => {
    const window = menu();
    window.dhmenu.filter('');
    assert.ok(visible(window, 'li[id^=menu_switch_]').length >= 2);
  });

  await t.test('narrows the list to a matching switch', () => {
    const window = menu();
    window.dhmenu.filter('D73');
    const shown = visible(window, 'li[id^=menu_switch_]').map((li) => li.id);
    assert.ok(shown.includes('menu_switch_D73-A'));
    assert.ok(!shown.includes('menu_switch_D74-A'),
      'non-matching switches should be hidden');
  });

  await t.test('hides everything when nothing matches', () => {
    const window = menu();
    window.dhmenu.filter('nosuchswitch');
    assert.equal(visible(window, 'li[id^=menu_switch_]').length, 0);
  });
});

// dhmenu.hideShowMenu branches on jQuery's :visible, which needs layout that
// jsdom does not implement - it reports every element as hidden, so the toggle
// can only ever take one branch here. Covered in the browser tier instead.
