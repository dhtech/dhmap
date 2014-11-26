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

  var COLOUR = {
    'OK':      'rgb(137,245,108)',
    'CRITICAL':'rgb(255,0,0)',
    'WARNING': 'rgb(255,191,0)',
    'SPEED':   'rgb(223,0,255)',
    'UNKNOWN': 'rgb(112,112,112)',
    'TABLE':   'rgb(242,242,242)'
  };

  // Draw a rectangle and save a reference to the object
  function renderRectangle(object, fillColor, isTable) {
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
            console.log(object);
            paper.ZPDPanTo(x1, y1);
        });
      }

      // Add rectangle to list of all drawn objects
      canvasObjects[object.name] = rectangle;
  }

  // Draw a network switch. Defaults to amber colour
  function renderSwitch(object) {
      switches[object.name] = object;
      renderRectangle(object, COLOUR.UNKNOWN, false);
  }

  // Draw a table
  function renderTable(object) {
      renderRectangle(object, COLOUR.TABLE, true);
  }

  // Update colour of previously drawn switch
  function setSwitchColor(name, color) {
      canvasObjects[name].animate(
        {"fill-opacity": 0.1},
        500,
        "linear"
      ).animate(
        {"fill": color},
        200
      ).animate(
        {"fill-opacity": 1.0},
        500);
  }

  // Update the status of all switches previously drawn on screen
  dhmap.updateSwitches = function(statuses) {
      // Save state
      lastStatuses = statuses;
      for ( var name in switches ) {
          // If the switch is unknown, render it as amber
          if ( statuses[name] === undefined ) {
              setSwitchColor(name, COLOUR.UNKNOWN);
          } else {
              // A confirmed healthy switch is green, failed ones are red
              if ( statuses[name] == true ) {
                  setSwitchColor(name, COLOUR.OK);
              } else if ( statuses[name] == 'S' ) {
                  setSwitchColor(name, COLOUR.SPEED);
              } else if ( statuses[name] == '!' ) {
                  setSwitchColor(name, COLOUR.WARNING);
              } else {
                  setSwitchColor(name, COLOUR.CRITICAL);
              }
          }
      }
  }

  // Which render method to use for each object type
  var renders= { 'switch': renderSwitch, 'table': renderTable };

  dhmap.init = function(objects) {
    var canvas = document.getElementById('canvas');
    var menu = document.getElementById('menu');
    var header = document.getElementById('header');
    canvas.innerHTML = '';
    canvas.style.marginLeft = menu.clientWidth;
    canvas.style.width = window.innerWidth - menu.clientWidth - 2;
    canvas.style.height = window.innerHeight - header.clientHeight - 2;
    menu.style.height = window.innerHeight - header.clientHeight;
    paper = Raphael(canvas);
    var zpd = new RaphaelZPD(paper, { zoom: true, pan: true, drag: false });

    switches = {};
    canvasObjects = {};
    offsetX = 0;
    offsetY = 0;

    for ( var hall in objects ) {

      // Calculate new bounding box for this hall
      boundingX = 0;
      boundingY = 0;

      for ( var i in objects[hall] ) {
        renders[objects[hall][i]['class']](objects[hall][i]);
      }

      offsetX += boundingX + 20;
    }
  }

})();
