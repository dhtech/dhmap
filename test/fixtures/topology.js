/**
 * Builds map topologies in the shape ipplan2dhmap.py emits and dhmap.init
 * consumes: an object keyed by hall name, plus the synthetic Dist, Prod and
 * Grid halls.
 *
 * Built rather than stored so tests can ask for the specific shape they need
 * (an empty hall, a name without digits, a second hall) without a fixture file
 * per case.
 */
'use strict';

const KEYS = ['name', 'horizontal', 'class', 'hall',
              'x1', 'y1', 'x2', 'y2', 'width', 'height'];

function object(overrides) {
  return {
    name: '', horizontal: 0, class: 'table', hall: '',
    x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0,
    ...overrides,
  };
}

function table(name, hall, x1, y1, overrides = {}) {
  return object({
    name, hall, class: 'table', x1, y1,
    x2: x1 - 8, y2: y1 + 37, width: 38, height: 8,
    ...overrides,
  });
}

/** A switch as the generator emits it: coordinates already offset by +5. */
function accessSwitch(name, hall, x1, y1, overrides = {}) {
  return object({
    name, hall, class: 'switch',
    x1: x1 + 5, y1: y1 + 5, x2: x1 + 5, y2: y1 + 5,
    width: 5, height: 5,
    ...overrides,
  });
}

function hallMarker(name, x1, y1) {
  return object({ name, hall: 'Grid', class: 'hall', x1, y1 });
}

/**
 * A small but complete topology: one hall with two tables and their switches,
 * one dist switch, one prod switch, and the Grid placement.
 *
 * Loaded from topology.json so the Python tier builds its SQLite fixture from
 * exactly the same data. Returned as a fresh deep copy every call, because
 * dhmap.init mutates the objects it is handed.
 */
function basic() {
  return structuredClone(require('./topology.json'));
}

/** Two halls side by side, to exercise the grid layout maths. */
function twoHalls() {
  const topology = basic();
  topology['Hall 2'] = [
    table('E10', 'Hall 2', 20, 0),
    accessSwitch('e10-a.event.dreamhack.local', 'Hall 2', 5, 5),
  ];
  topology['Grid'].push(hallMarker('Hall 2', 1, 0));
  return topology;
}

/** Every switch name in a topology, in the order dhmap would draw them. */
function switchNames(topology) {
  const names = [];
  for (const hall of Object.keys(topology)) {
    for (const object of topology[hall]) {
      if (object.class === 'switch') names.push(object.name);
    }
  }
  return names;
}

module.exports = {
  KEYS, object, table, accessSwitch, hallMarker,
  basic, twoHalls, switchNames,
};
