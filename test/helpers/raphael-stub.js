/**
 * A minimal stand-in for Raphael and RaphaelZPD.
 *
 * dhmap.js keeps canvasObjects and switches in closure scope, so the only way
 * to observe what init() actually drew is to let it draw. This records every
 * shape instead of producing SVG, which is enough to assert on geometry,
 * fills and the object registry without a browser.
 */
'use strict';

/** One drawn shape. Mirrors just enough of a Raphael element. */
function makeShape(type, attrs, paper) {
  const shape = {
    type,
    // Raphael exposes the raw attribute bag as .attrs; setSwitchColor reads it
    // directly rather than going through .attr(), so it must stay in sync.
    attrs: { ...attrs },
    visible: true,
    handlers: {},
    rotation: 0,
  };

  shape.attr = function (nameOrObject) {
    if (typeof nameOrObject === 'string') {
      return shape.attrs[nameOrObject];
    }
    Object.assign(shape.attrs, nameOrObject);
    return shape;
  };
  shape.rotate = (deg) => { shape.rotation = deg; return shape; };
  shape.hide = () => { shape.visible = false; return shape; };
  shape.show = () => { shape.visible = true; return shape; };
  shape.toFront = () => shape;
  for (const event of ['mouseover', 'mouseout', 'click']) {
    shape[event] = (fn) => { shape.handlers[event] = fn; return shape; };
  }

  paper.shapes.push(shape);
  return shape;
}

/** Raphael(canvas) -> paper. Called without `new` in dhmap.js. */
function makeRaphael() {
  function Raphael() {
    const paper = { shapes: [] };
    paper.rect = (x, y, width, height) =>
      makeShape('rect', { x, y, width, height }, paper);
    paper.text = (x, y, text) =>
      makeShape('text', { x, y, text }, paper);
    Raphael.lastPaper = paper;
    return paper;
  }
  return Raphael;
}

/** RaphaelZPD(paper, opts) - only its gelem transform is touched. */
function RaphaelZPD() {
  this.gelem = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

/**
 * DOM stub providing the three elements dhmap.init looks up, plus the
 * window dimensions it reads.
 */
function makeDom() {
  const element = (extra = {}) => ({
    innerHTML: '',
    style: {},
    clientWidth: 0,
    clientHeight: 0,
    ...extra,
  });
  const elements = {
    canvas: element(),
    menu_container: element({ clientWidth: 100 }),
    header: element({ clientHeight: 36 }),
    consumer_mode: { checked: false },
  };
  return {
    elements,
    document: {
      getElementById: (id) => elements[id] || null,
      body: { style: {}, classList: { add() {}, remove() {} } },
    },
    innerWidth: 1920,
    innerHeight: 1080,
  };
}

module.exports = { makeRaphael, RaphaelZPD, makeDom, makeShape };
