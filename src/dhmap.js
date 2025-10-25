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
    'ALERT':   'rgb(255,200,0)',
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

      var shortName = object.name.split('.')[0].toUpperCase();
	  
      // Table
      if (isTable) {
        // Add a label
        if(object.horizontal == 0){
          var labelOffsetX = 11;
          var labelOffsetY = 23;
        }
        else {
          var labelOffsetX = 23;
          var labelOffsetY = 13;
        }
        rectangle.label = paper.text(rectangle.attr('x') + labelOffsetX, rectangle.attr('y') + labelOffsetY, shortName);
        rectangle.label.attr({"font-size": 22});
        if(object.horizontal == 0 && isTable) {
          rectangle.label.rotate(90);
        }
      }
      
      // Device
      else {
        // Add a label
        var labelOffsetX = 5;
        var labelOffsetY = -37;
        rectangle.labelbox = paper.rect(
          rectangle.attr('x') + labelOffsetX, 
          rectangle.attr('y') + labelOffsetY,
          width+50,
          width+10);
        rectangle.labelbox.attr({fill: "#fff"});
        rectangle.labelbox.label = paper.text(
          rectangle.attr('x') + labelOffsetX + 38, 
          rectangle.attr('y') + labelOffsetY + 20, 
          shortName);
        rectangle.labelbox.label.attr({"font-size": 22});
      }

      // For some objects it might be desirable to hide the label.
      // For those objects we add a mouse over to display it.
      if ( ! isTable ) {
        rectangle.labelbox.hide();
        rectangle.labelbox.label.hide();
        rectangle.mouseover(function() {
            this.labelbox.show();
            this.labelbox.label.show();
			this.labelbox.toFront();
			this.labelbox.label.toFront();
			this.attr({"cursor": "pointer"});
        });
        rectangle.mouseout(function() {
            this.labelbox.hide();
            this.labelbox.label.hide();
			this.attr({"cursor": "default"});
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
		object.width = object.width + 1.7;
		object.height = object.height + 1.7;
		object.x1 = object.x1 - 1;
		object.y1 = object.y1 - 0.7;
		switches[object.name] = object;
		renderRectangle(object, dhmap.colour.UNKNOWN, false, dry);
	}
  
  // Draw a table
  function renderTable(object, dry) {
      renderRectangle(object, dhmap.colour.TABLE, true, dry);
  }

  // Update colour of previously drawn switch
  function setSwitchColor(name, color) {
      if (canvasObjects[name].attrs.fill != color && canvasObjects[name].attrs.fill != "#0000ff") {
          canvasObjects[name].attr({"fill": color})
      }
  }
  
  dhmap.oldTableObject;
  dhmap.oldTableColor;
  dhmap.oldSwitchObject;
  dhmap.oldSwitchColor;
  dhmap.filter = function(searchFor) {
    
    // Reset previously marked
    if(dhmap.oldTableObject){
      dhmap.oldTableObject.attr({"fill": dhmap.oldTableColor});
    }
    if(dhmap.oldSwitchObject){
      dhmap.oldSwitchObject.attr({"fill": dhmap.oldSwitchColor});
    }
    
    // Mark object if not already marked
    if(searchFor){
      
      // Table
      if(canvasObjects[searchFor.toUpperCase()]
        && canvasObjects[searchFor.toUpperCase()] != dhmap.oldTableObject){
        dhmap.oldSwitchObject = undefined;
        dhmap.oldTableObject = canvasObjects[searchFor.toUpperCase()];
      }
      // Switch
      else if (canvasObjects[searchFor.toLowerCase()+'.event.dreamhack.local']
        && canvasObjects[searchFor.toLowerCase()+'.event.dreamhack.local'] != dhmap.oldSwitchObject){
        dhmap.oldSwitchObject = canvasObjects[searchFor.toLowerCase()+'.event.dreamhack.local'];
        dhmap.oldTableObject = canvasObjects[searchFor.toUpperCase().substr(0, searchFor.indexOf('-'))];
      }
      else{
        dhmap.oldSwitchObject = undefined;
        dhmap.oldTableObject = undefined;
        return;
      }
      
      if(dhmap.oldTableObject){
        dhmap.oldTableColor = dhmap.oldTableObject.attr("fill");
        dhmap.oldTableObject.attr({"fill": "#0000ff"});
      }
      if(dhmap.oldSwitchObject){
        dhmap.oldSwitchColor = dhmap.oldSwitchObject.attr("fill");
        dhmap.oldSwitchObject.attr({"fill": "#0000ff"});
      }
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
    var menu = document.getElementById('menu_container');
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

      if (hall.toLowerCase() == "dist" || hall.toLowerCase() == "prod" || hall.toLowerCase() == "grid")
        continue;
    
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
    // Generate 2D array from the halls position objects
    // Find grid size
    const maxrows = Math.max(...objects['Grid'].map(p => p.y1));
    const maxcols = Math.max(...objects['Grid'].map(p => p.x1));
    const nbrows = maxrows+1;
    const nbcols = maxcols+1;

    var hallgrid = Array.from({ length: nbcols }, () =>
      Array.from({ length: nbrows }, () => ({'x': null, 'y': null, 'hall':null}))
    );

    objects["Grid"].forEach(h => {
      hallgrid[h.x1][h.y1]['hall'] = h.name      
    });

    var padY = 100;
    var padX = 100;
    const colswidths = Array.from({length: nbcols}, () => padX)
    const rowsheights = Array.from({length: nbrows}, () => padY)

    /* [
        ["normal", "20plus"]
       ]
             x=0:   x=1: 
       y=0: [normal][20plus]
    */
    for (let y = 0; y < nbrows; y++) {
      var maxHeight = 0;
      for (let x = 0; x < nbcols; x++) {
        const hallName = hallgrid[x][y].hall;
        if(hallName===null)
          continue
        const hall = hallsizes[hallName];

        if (hall && hall.h > maxHeight) {
          maxHeight = hall.h;
        }
      }

      rowsheights[y] = maxHeight;
    }

    for (let x = 0; x < nbcols; x++) {
      var maxWidth = 0;
      for (let y = 0; y < nbrows; y++) {
        const hallName = hallgrid[x][y].hall;
        if(hallName===null)
          continue
        const hall = hallsizes[hallName];

        if (hall && hall.w > maxWidth) {
          maxWidth = hall.w;
        }
      }

      colswidths[x] = maxWidth;
    }

    // Calculate top left corner of each grid cell
    var curcol_offset = 0
    for (let x = 0; x < nbcols; x++) {
      var currow_offset = 0
      for (let y = 0 ; y < nbrows; y++) {
        hallgrid[x][y].x = curcol_offset;
        hallgrid[x][y].y = currow_offset;
        currow_offset += rowsheights[y] + 45 + 45; // Account for hall box padding + label
      }
      curcol_offset += colswidths[x] + 45; // Account for hall box padding
    }

    // Fourth phase: draw bounding boxes of halls.
    var halls = Object.keys(objects).length;
    var hallidx = 0;
    for (let x = 0; x < nbcols; x++) {
      for (let y = 0 ; y < nbrows; y++) {
        var hall = hallgrid[x][y].hall;
        if(hall===null){
          continue
        }
        var hue = (hallidx/halls) * 360;
        var size = hallsizes[hall];

        var gridOffsetX = hallgrid[x][y].x;
        var gridOffsetY = hallgrid[x][y].y;

        var hallRect = paper.rect(
            (gridOffsetX + size.x - 15) * scaling,
            (gridOffsetY + size.y - 15) * scaling,
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
    }

    // Fifth phase: draw objects.
    for (let x = 0; x < nbcols; x++) {
      for (let y = 0 ; y < nbrows; y++) {
        var hall = hallgrid[x][y].hall;
        if(hall===null){
          continue
        }

        var gridOffsetX = hallgrid[x][y].x;
        var gridOffsetY = hallgrid[x][y].y;

        offsetX = hallsizes[hall].x + gridOffsetX ;
        offsetY = hallsizes[hall].y + gridOffsetY;

        // Re-do with real paint this time
        boundingX = 0;
        boundingY = 0;
        for ( var i in objects[hall] ) {
          renders[objects[hall][i]['class']](objects[hall][i], false);
        }
      }
    }
  }

})();
