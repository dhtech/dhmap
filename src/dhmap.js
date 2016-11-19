// ┌────────────────────────────────────────────────────────────────────┐ \\
// │ dhmap - HTML5/JS network layouts                                   │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\
// │ Copyright © 2014 Dreamhack Tech                                    │ \\
// │ Copyright © 2014 Niklas Lindblad <niklas@lindblad.info>            │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\
// │ Licensed under the MIT license.                                    │ \\
// └────────────────────────────────────────────────────────────────────┘ \\

var dhmap = {};

(function () {
  var scaling = 3;
  var switches = {};
  var paper = null;
  var canvasObjects = {};
  var offsetX = 0;
  var offsetY = 0;
  var boundingX = 0;
  var boundingY = 0;
  var onclick = null;

  var defaultMatrix = 'matrix(0.40473940968513483,0,0,0.40473940968513483,77.97065002983072,118.90358368190753)';

  dhmap.colour = {
    'OK':      'rgb(137,245,108)',
    'CRITICAL':'rgb(255,0,0)',
    'WARNING': 'rgb(255,191,0)',
    'SPEED':   'rgb(223,0,255)',
    'STP':     'rgb(0,102,153)',
    'ERRORS':  'rgb(0,255,255)',
    'UNKNOWN': 'rgb(112,112,112)',
    'TABLE':   'rgba(242,242,242, 0.5)'
  };

  // Draw a rectangle and save a reference to the object
  function renderRectangle(object, fillColor, isTable, dry) {
      // Whether the object is horizontal or not, determines whether to swap
      // width/height to conform with RaphaelJS drawing
      var width = object.horizontal == 1 ? object.width : object.height;
      var height = object.horizontal == 1 ? object.height : object.width;

      // See if this will increase the bounding box
      boundingX = Math.max(object.x1 + width, boundingX);
      boundingY = Math.max(object.y1 + height, boundingY);

      // Scale according to the scaling factor defined at the top
      width = width * scaling;
      height = height * scaling;
      var x1 = (offsetX + object.x1) * scaling;
      var y1 = (offsetY + object.y1) * scaling;

      if (dry) {
        return;
      }

      // Create the rectangle and fill it
      var rectangle = paper.rect(x1, y1, width, height);
      rectangle.attr({fill: fillColor});

      // Add a label
      if (isTable) {
        var labelOffsetX = 12;
        var labelOffsetY = 12;
      } else {
        var labelOffsetX = 12;
        var labelOffsetY = 40;
      }

      var shortName = object.name.split('.')[0].toUpperCase();
      rectangle.label = paper.text(rectangle.attr('x') + labelOffsetX, rectangle.attr('y') + labelOffsetY, shortName);
      if (!isTable) {
        rectangle.label.attr({"font-size": 16});
      }

      // For some objects it might be desirable to hide the label.
      // For those objects we add a mouse over to display it.
      if ( ! isTable ) {
        rectangle.label.hide();
        rectangle.mouseover(function() {
            this.animate({"fill-opacity": 0.8}, 500);
            this.label.show();
        });
        rectangle.mouseout(function() {
            this.label.hide();
        });
        rectangle.click(function() {
          onclick(object);
        });
      }

      // Add rectangle to list of all drawn objects
      canvasObjects[object.name] = rectangle;
  }

  // Draw a network switch. Defaults to amber colour
  function renderSwitch(object, dry) {
      switches[object.name] = object;
      renderRectangle(object, dhmap.colour.UNKNOWN, false, dry);
  }

  // Draw a table
  function renderTable(object, dry) {
      renderRectangle(object, dhmap.colour.TABLE, true, dry);
  }

  // Update colour of previously drawn switch
  function setSwitchColor(name, color) {
      if (canvasObjects[name].attrs.fill != color) {
          canvasObjects[name].attr({"fill": color})
      }
  }

  // Update the status of all switches previously drawn on screen
  dhmap.updateSwitches = function(statuses) {
      // Save state
      lastStatuses = statuses;
      for ( var name in switches ) {
          // If the switch is unknown, render it as amber
          if ( statuses[name] === undefined ) {
              setSwitchColor(name, dhmap.colour.UNKNOWN);
          } else {
              // A confirmed healthy switch is green, failed ones are red
              setSwitchColor(name, dhmap.colour[statuses[name]]);
          }
      }
  }

  // Which render method to use for each object type
  var renders = { 'switch': renderSwitch, 'table': renderTable };

  dhmap.init = function(objects, click_callback) {
    var canvas = document.getElementById('canvas');
    var menu = document.getElementById('menu');
    var header = document.getElementById('header');
    canvas.innerHTML = '';
    canvas.style.marginLeft = menu.clientWidth;

    // TODO(bluecmd): Calculate these automatically
    var width = window.innerWidth - menu.clientWidth - 2;
    var height = window.innerHeight - header.clientHeight - 2;

    if (width < 2000) {
      width = 2000;
    }
    if (height < 800) {
      height = 800;
    }

    canvas.style.width = width;
    canvas.style.height = height;

    menu.style.height = window.innerHeight - header.clientHeight;
    paper = Raphael(canvas);
    var zpd = new RaphaelZPD(paper, { zoom: true, pan: true, drag: false });
    zpd.gelem.setAttribute('transform', defaultMatrix);

    onclick = click_callback;
    switches = {};
    canvasObjects = {};

    offsetX = 0;
    offsetY = 0;

    // First pass: Calculate hall sizes.
    // This is to have a simple heuristic to group small halls together.

    var hallsizes = {};
    var hallsizelist = [];
    for ( var hall in objects ) {

      // Calculate new bounding box for this hall
      // First run is a dry run for just calculating the bounding boxes
      boundingX = 0;
      boundingY = 0;

      for ( var i in objects[hall] ) {
        renders[objects[hall][i]['class']](objects[hall][i], true);
      }

      hallsizes[hall] = {
        'x': offsetX,
        'y': offsetY,
        'w': boundingX,
        'h': boundingY,
      };

      hallsizelist.push([boundingY * boundingX, hall]);
    }

    // Second phase: Figure out hall order.
    hallsizelist.sort(function(a, b) { return a[0] - b[0]; });
    hallsizelist.reverse();

    var hallorder = [];
    for ( var i in hallsizelist ) {
      hallorder.push(hallsizelist[i][1]);
    }

    // Third pass: Order halls in size order.
    // Try to compact halls if possible.
    var maxHallHeight = hallsizes[hallorder[0]].h;
    var maxX = 0;
    var padY = 100;
    var padX = 100;
    for ( var j in hallorder ) {
      var hall = hallorder[j];

      boundingX = 0;
      boundingY = 0;

      for ( var i in objects[hall] ) {
        renders[objects[hall][i]['class']](objects[hall][i], true);
      }

      hallsizes[hall] = {
        'x': offsetX,
        'y': offsetY,
        'w': boundingX,
        'h': boundingY,
      };

      if (maxX < offsetX + boundingX + padX) {
        maxX = offsetX + boundingX + padX;
      }

      // Look ahead and see where if we can squeeze the hall in below this one.
      var nj = parseInt(j) + 1;
      if (nj < hallorder.length) {
        var nextHall = hallorder[nj];
        if ((hallsizes[hall].y + hallsizes[hall].h + padY + hallsizes[nextHall].h) < maxHallHeight) {
          offsetY += boundingY + padY;
        } else {
          offsetY = 0;
          offsetX = maxX;
        }
      }
    }

    // Fourth phase: draw bounding boxes of halls.
    var halls = Object.keys(objects).length;
    var hallidx = 0;
    for ( var i in hallorder ) {
      var hall = hallorder[i];
      var hue = (hallidx/halls) * 360;

      var size = hallsizes[hall];

      var hallRect = paper.rect(
          (size.x - 15) * scaling,
          (size.y - 15) * scaling,
          (size.w + 30) * scaling,
          (size.h + 30) * scaling);
      var labelOffsetX = (size.w + 30) * scaling / 2;
      var labelOffsetY = -100;
      hallRect.attr({fill: 'hsla(' + hue + ',100%,50%,0.3)'});
      hallRect.label = paper.text(hallRect.attr('x') + labelOffsetX, hallRect.attr('y') + labelOffsetY, hall);
      hallRect.label.attr({'font-size': 144});
      hallRect.label.attr({'border': '1px solid red'});
      hallRect.label.attr({'fill': 'rgba(200, 200, 200, 0.7)'});

      hallidx++;
    }

    // Fifth phase: draw objects.
    for ( var i in hallorder ) {
      var hall = hallorder[i];
      offsetX = hallsizes[hall].x;
      offsetY = hallsizes[hall].y;

      // Re-do with real paint this time
      boundingX = 0;
      boundingY = 0;
      for ( var i in objects[hall] ) {
        renders[objects[hall][i]['class']](objects[hall][i], false);
      }
    }
  }

})();
