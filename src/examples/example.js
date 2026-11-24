// Minimal dhmap usage: load a map, draw it, then push switch statuses.
//
// The status values are the keys of dhmap.colour ('OK', 'CRITICAL',
// 'WARNING', 'SPEED', 'STP', 'ERRORS', 'ALERT'); anything unrecognised - or a
// switch you omit - renders as UNKNOWN.
$.getJSON('./data.json', function(objects) {
  dhmap.init(objects, function(object) {
    console.log('clicked', object.name);
  });

  // Statuses normally arrive from /analytics/; here we just fake one update.
  setTimeout(function() {
    dhmap.updateSwitches({
      'd73-a.event.dreamhack.local': 'OK',
      'd74-a.event.dreamhack.local': 'CRITICAL',
      'd75-a.event.dreamhack.local': 'WARNING'
    });
  }, 2000);
});
