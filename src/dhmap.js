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

  var COLOUR = {
    'GREEN':  'rgb(137,245,108)',
    'RED':    'rgb(255,0,0)',
    'AMBER':  'rgb(255,191,0)',
    'GRAY':   'rgb(212,212,212)'
  };

  // Draw a rectangle and save a reference to the object
  function renderRectangle(object, fillColor, keepLabel) {
      // Whether the object is horizontal or not, determines whether to swap
      // width/height to conform with RaphaelJS drawing
      var width = object.horizontal == 1 ? object.width : object.height;
      var height = object.horizontal == 1 ? object.height : object.width;

      // Scale according to the scaling factor defined at the top
      width = width * scaling;
      height = height * scaling;
      var x1 = object.x1 * scaling;
      var y1 = object.y1 * scaling;

      // Create the rectangle and fill it
      var rectangle = paper.rect(x1, y1, width, height);
      rectangle.attr({fill: fillColor});

      // Add a label
      var labelOffset = 12;
      rectangle.label = paper.text(rectangle.attr('x') + labelOffset, rectangle.attr('y') + labelOffset, object.name);

      // For some objects it might be desirable to hide the label.
      // For those objects we add a mouse over to display it.
      if ( ! keepLabel ) {
        rectangle.label.hide();
        rectangle.mouseover(function() {
            this.animate({"fill-opacity": 0.8}, 500);
            this.label.show();
        });
        rectangle.mouseout(function() {
            this.label.hide();
        });
      }

      // Add rectangle to list of all drawn objects
      canvasObjects[object.name] = rectangle;
  }

  // Draw a network switch. Defaults to amber colour
  function renderSwitch(object) {
      switches[object.name] = object;
      renderRectangle(object, COLOUR.AMBER, false);
  }

  // Draw a table
  function renderTable(object) {
      renderRectangle(object, COLOUR.GRAY, true);
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
              setSwitchColor(name, COLOUR.AMBER);
          } else {
              // A confirmed healthy switch is green, failed ones are red
              if ( statuses[name] ) {
                  setSwitchColor(name, COLOUR.GREEN);
              } else {
                  setSwitchColor(name, COLOUR.RED);
              }
          }
      }
  }

  // Which render method to use for each object type
  var renders= { 'switch': renderSwitch, 'table': renderTable };

  dhmap.init = function(objects) {
    paper = Raphael(0, 0, window.innerWidth, 2048);
    for ( var i in objects ) {
      renders[objects[i]['class']](objects[i]);
    }
  }

})();
