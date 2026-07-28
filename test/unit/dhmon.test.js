/**
 * Characterization tests for dhmon.js - the status logic behind the map.
 *
 * These pin current behaviour, including known bugs, so they pass on a clean
 * checkout and fail when behaviour changes. Where a test documents a defect
 * rather than desired behaviour it says so explicitly.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadDhmon } = require('../helpers/load.js');

/** An interface entry as /analytics/switch.interfaces reports it. */
function iface(overrides = {}) {
  return {
    trunk: 1,
    status: 'up',
    admin: 'up',
    speed: '1000',
    errors_in: 0,
    errors_out: 0,
    stp: 'ok',
    lastoid: 1,
    rx_10min: 0,
    tx_10min: 0,
    ...overrides,
  };
}

test('checkIfaceSpeed', async (t) => {
  const { checkIfaceSpeed } = loadDhmon();

  await t.test('passes a healthy gigabit trunk', () => {
    assert.equal(checkIfaceSpeed(null, {}, { 'ge-0/0/1': iface() }), true);
  });

  await t.test('fails any trunk linked at 10M', () => {
    assert.equal(
      checkIfaceSpeed(null, {}, { 'ge-0/0/1': iface({ speed: '10' }) }), false);
  });

  await t.test('allows 100M on ge- and GigabitEthernet ports', () => {
    for (const name of ['ge-0/0/1', 'GigabitEthernet0/1']) {
      assert.equal(
        checkIfaceSpeed(null, {}, { [name]: iface({ speed: '100' }) }), true,
        `${name} at 100M should pass`);
    }
  });

  await t.test('fails 100M on ports expected to do more (xe-, fe-)', () => {
    for (const name of ['xe-0/0/1', 'fe-0/0/1']) {
      assert.equal(
        checkIfaceSpeed(null, {}, { [name]: iface({ speed: '100' }) }), false,
        `${name} at 100M should fail`);
    }
  });

  await t.test('ignores access ports - sleeping clients rarely link full', () => {
    assert.equal(
      checkIfaceSpeed(null, {}, { 'ge-0/0/1': iface({ trunk: 0, speed: '10' }) }),
      true);
  });

  await t.test('ignores non-ethernet interfaces', () => {
    assert.equal(
      checkIfaceSpeed(null, {}, { 'vlan.100': iface({ speed: '10' }) }), true);
  });

  await t.test('ignores ports that are down', () => {
    assert.equal(
      checkIfaceSpeed(null, {}, { 'ge-0/0/1': iface({ status: 'down', speed: '10' }) }),
      true);
  });

  await t.test('passes when the switch has no data yet', () => {
    assert.equal(checkIfaceSpeed(null, undefined, undefined), true);
    assert.equal(checkIfaceSpeed(null, {}, undefined), true);
  });

  // Speeds arrive from SNMP as strings and are compared with ==, not ===, so
  // a numeric speed compares equal too. Worth pinning: switching to === would
  // silently stop flagging any backend that reports speed as a number.
  await t.test('compares speed loosely, so 10 and "10" both match', () => {
    assert.equal(
      checkIfaceSpeed(null, {}, { 'ge-0/0/1': iface({ speed: 10 }) }), false);
    assert.equal(
      checkIfaceSpeed(null, {}, { 'ge-0/0/1': iface({ speed: '10' }) }), false);
  });
});

test('checkIfaceErrors', async (t) => {
  await t.test('fails an up trunk with input or output errors', () => {
    const { checkIfaceErrors } = loadDhmon();
    assert.equal(
      checkIfaceErrors(null, {}, { 'ge-0/0/1': iface({ errors_in: 5 }) }), false);
    assert.equal(
      checkIfaceErrors(null, {}, { 'ge-0/0/1': iface({ errors_out: 5 }) }), false);
  });

  await t.test('passes a clean trunk', () => {
    const { checkIfaceErrors } = loadDhmon();
    assert.equal(checkIfaceErrors(null, {}, { 'ge-0/0/1': iface() }), true);
  });

  await t.test('skips access ports until consumer mode is enabled', () => {
    const sandbox = loadDhmon();
    const ifaces = { 'ge-0/0/1': iface({ trunk: 0, errors_in: 5 }) };

    assert.equal(sandbox.checkIfaceErrors(null, {}, ifaces), true,
      'access port errors are hidden by default');

    sandbox.consumerMode.checked = true;
    assert.equal(sandbox.checkIfaceErrors(null, {}, ifaces), false,
      'consumer mode surfaces access port errors');
  });
});

test('checkIfaceStp', async (t) => {
  await t.test('fails an up trunk blocked by spanning tree', () => {
    const { checkIfaceStp } = loadDhmon();
    assert.equal(
      checkIfaceStp(null, {}, { 'ge-0/0/1': iface({ stp: 'error' }) }), false);
  });

  await t.test('passes when stp is healthy', () => {
    const { checkIfaceStp } = loadDhmon();
    assert.equal(checkIfaceStp(null, {}, { 'ge-0/0/1': iface() }), true);
  });

  await t.test('skips access ports until consumer mode is enabled', () => {
    const sandbox = loadDhmon();
    const ifaces = { 'ge-0/0/1': iface({ trunk: 0, stp: 'error' }) };

    assert.equal(sandbox.checkIfaceStp(null, {}, ifaces), true);
    sandbox.consumerMode.checked = true;
    assert.equal(sandbox.checkIfaceStp(null, {}, ifaces), false);
  });
});

test('interface name regexes', async (t) => {
  const { ifre, gere } = loadDhmon();

  await t.test('ifre matches ethernet interfaces dhmap cares about', () => {
    for (const name of ['ge-0/0/1', 'xe-1/2/3', 'fe-0/0/0',
                        'GigabitEthernet0/1', 'TenGigabitEthernet1/1']) {
      assert.ok(ifre.exec(name), `${name} should match ifre`);
    }
  });

  await t.test('ifre ignores logical and management interfaces', () => {
    for (const name of ['vlan.100', 'lo0', 'irb', 'me0']) {
      assert.equal(ifre.exec(name), null, `${name} should not match ifre`);
    }
  });

  await t.test('gere matches only gigabit-capable names', () => {
    assert.ok(gere.exec('ge-0/0/1'));
    assert.ok(gere.exec('GigabitEthernet0/1'));
    assert.equal(gere.exec('xe-0/0/1'), null);
    assert.equal(gere.exec('fe-0/0/1'), null);
  });
});

/** Drive computeStatus for a single switch under given conditions. */
function statusFor({ ping = 0, snmpSince = 0, snmpMissing = false,
                     ifaces = {}, alert = false } = {}) {
  const sw = 'sw.event.dreamhack.local';
  const sandbox = loadDhmon();
  sandbox.ping = { [sw]: ping };
  sandbox.snmp = snmpMissing ? {} : { [sw]: { since: snmpSince } };
  sandbox.model = { [sw]: {} };
  sandbox.iface = { [sw]: ifaces };
  sandbox.alert_hosts = alert ? { [sw]: true } : {};
  sandbox.start_fetch = new Date();
  sandbox.computeStatus();
  return { status: sandbox.switch_status[sw], sandbox };
}

test('computeStatus', async (t) => {
  await t.test('reports OK for a healthy switch', () => {
    assert.equal(statusFor({ ifaces: { 'ge-0/0/1': iface() } }).status, 'OK');
  });

  await t.test('reports CRITICAL when ICMP has been silent 60s', () => {
    assert.equal(statusFor({ ping: 60 }).status, 'CRITICAL');
    assert.equal(statusFor({ ping: 59 }).status, 'OK', '59s is still not critical');
  });

  await t.test('reports STP, SPEED and ERRORS from the iface checks', () => {
    assert.equal(
      statusFor({ ifaces: { 'ge-0/0/1': iface({ stp: 'error' }) } }).status, 'STP');
    assert.equal(
      statusFor({ ifaces: { 'ge-0/0/1': iface({ speed: '10' }) } }).status, 'SPEED');
    assert.equal(
      statusFor({ ifaces: { 'ge-0/0/1': iface({ errors_in: 1 }) } }).status, 'ERRORS');
  });

  await t.test('reports WARNING when snmp data is missing or stale', () => {
    assert.equal(statusFor({ snmpMissing: true }).status, 'WARNING');
    assert.equal(statusFor({ snmpSince: 361 }).status, 'WARNING');
    assert.equal(statusFor({ snmpSince: 360 }).status, 'OK', '360 is the boundary');
  });

  await t.test('reports ALERT when the host has a monitoring alert', () => {
    assert.equal(statusFor({ alert: true }).status, 'ALERT');
  });

  await t.test('applies branches in priority order', () => {
    // A switch failing everything at once reports only the highest priority.
    const everything = iface({ speed: '10', stp: 'error', errors_in: 5 });
    assert.equal(statusFor({ ping: 60, ifaces: { 'ge-0/0/1': everything } }).status,
      'CRITICAL', 'ping outranks all iface checks');
    assert.equal(statusFor({ ifaces: { 'ge-0/0/1': everything } }).status,
      'STP', 'stp outranks speed and errors');

    const speedAndErrors = iface({ speed: '10', errors_in: 5 });
    assert.equal(statusFor({ ifaces: { 'ge-0/0/1': speedAndErrors } }).status,
      'SPEED', 'speed outranks errors');

    assert.equal(statusFor({ snmpMissing: true, alert: true }).status,
      'WARNING', 'stale snmp outranks alerts');
  });

  await t.test('does nothing until every data source has loaded', () => {
    const sandbox = loadDhmon();
    sandbox.ping = { 'sw': 0 };
    sandbox.snmp = null;   // still in flight
    sandbox.model = {};
    sandbox.iface = {};
    sandbox.computeStatus();
    assert.deepEqual(sandbox.switch_status, {},
      'partial data must not produce statuses');
  });

  await t.test('pushes results to both the map and the menu', () => {
    const { sandbox } = statusFor({ ifaces: { 'ge-0/0/1': iface() } });
    assert.equal(sandbox.updates.dhmap.length, 1);
    assert.equal(sandbox.updates.dhmenu.length, 1);
    assert.deepEqual(sandbox.updates.dhmap[0], sandbox.switch_status);
  });

  // KNOWN DEFECT (dhmon.js:137): alert_hosts is dereferenced but, unlike
  // iface/model/snmp/ping, is not covered by the guard at :116. If the
  // alerts.hosts fetch is slow or fails, computeStatus throws. Pinned here so
  // the fix is a deliberate change rather than an accident.
  await t.test('throws when alert_hosts has not loaded (known defect)', () => {
    const sandbox = loadDhmon();
    const sw = 'sw.event.dreamhack.local';
    sandbox.ping = { [sw]: 0 };
    sandbox.snmp = { [sw]: { since: 0 } };
    sandbox.model = { [sw]: {} };
    sandbox.iface = { [sw]: {} };
    sandbox.alert_hosts = null;   // fetch still in flight
    sandbox.start_fetch = new Date();
    // Matched by name rather than constructor: the error originates inside the
    // vm realm, whose TypeError is a different object to this one.
    assert.throws(() => sandbox.computeStatus(), (err) => {
      assert.equal(err.name, 'TypeError');
      assert.match(err.message, /null/);
      return true;
    });
  });
});
