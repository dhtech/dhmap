/**
 * Loads dhmap's browser scripts into a vm sandbox so they can be unit tested.
 *
 * None of the sources are modules - they are classic scripts that assign to
 * globals and, in dhmon.js's case, run side effects at load time ($.getJSON
 * for data.json, and a $.widget call to patch the jQuery UI dialog). So rather
 * than requiring them, we evaluate them in a prepared context whose $ and
 * document are inert stubs, then read the globals back off the sandbox.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** A chainable no-op standing in for jQuery at load time. */
function makeJqueryStub() {
  const $ = function () { return $; };
  const chain = () => $;
  Object.assign($, {
    getJSON: chain,
    when: chain,
    then: chain,
    done: chain,
    each: chain,
    append: chain,
    html: chain,
    css: chain,
    attr: chain,
    text: chain,
    hide: chain,
    show: chain,
    extend: Object.assign,
    widget: () => {},
    ui: { dialog: { prototype: {} } },
  });
  return $;
}

/**
 * Minimal document stub. dhmon.js reads #consumer_mode's checked state inside
 * checkIfaceErrors/checkIfaceStp, which is the only DOM dependency in the
 * logic we unit test; the returned object is mutable so tests can toggle it.
 */
function makeDocumentStub() {
  const consumerMode = { checked: false };
  const elements = { consumer_mode: consumerMode };
  return {
    consumerMode,
    document: {
      getElementById: (id) => elements[id] || null,
      body: { style: {}, classList: { add() {}, remove() {} } },
    },
  };
}

/**
 * Evaluate `files` (repo-relative) in a fresh sandbox and return it.
 *
 * The sandbox doubles as the global object, so `sandbox.computeStatus` is the
 * real function and `sandbox.ping = {...}` sets the global the function reads.
 */
function loadScripts(files, extras = {}) {
  const { consumerMode, document } = makeDocumentStub();
  const $ = makeJqueryStub();

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    parseInt,
    parseFloat,
    setTimeout: () => 0,
    setInterval: () => 0,
    clearInterval: () => {},
    $,
    jQuery: $,
    document,
    Raphael: undefined,
    ...extras,
  };
  sandbox.window = sandbox;
  // Exposed for convenience: tests flip this to enable consumer-port checks.
  sandbox.consumerMode = consumerMode;

  vm.createContext(sandbox);
  for (const file of files) {
    const full = path.resolve(REPO_ROOT, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
  }
  return sandbox;
}

/** Load dhmon.js with dhmap/dhmenu stubbed out as recording sinks. */
function loadDhmon(extras = {}) {
  const updates = { dhmap: [], dhmenu: [] };
  const sandbox = loadScripts(['dhmon.js'], {
    dhmap: {
      colour: {},
      updateSwitches: (s) => updates.dhmap.push(s),
    },
    dhmenu: { updateSwitches: (s) => updates.dhmenu.push(s) },
    ...extras,
  });
  sandbox.updates = updates;
  return sandbox;
}

/**
 * Load src/dhmap.js with Raphael stubbed, so dhmap.init can actually run.
 *
 * init() is the only thing that populates the closure-private canvasObjects
 * and switches registries, which filter() and updateSwitches() then read - so
 * letting it draw against a recording stub is what makes those testable.
 */
function loadDhmap(extras = {}) {
  const { makeRaphael, RaphaelZPD, makeDom } = require('./raphael-stub.js');
  const dom = makeDom();
  const Raphael = makeRaphael();

  const sandbox = loadScripts(['src/dhmap.js'], {
    Raphael,
    RaphaelZPD,
    document: dom.document,
    innerWidth: dom.innerWidth,
    innerHeight: dom.innerHeight,
    ...extras,
  });
  sandbox.dom = dom;
  // Shapes drawn by the most recent init(), in creation order.
  Object.defineProperty(sandbox, 'shapes', {
    get: () => (Raphael.lastPaper ? Raphael.lastPaper.shapes : []),
  });
  return sandbox;
}

module.exports = { loadScripts, loadDhmon, loadDhmap, REPO_ROOT };
