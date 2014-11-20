var map = null;

$.getJSON('./data.json', function(objects) {
  dhmap.init(objects);

  setTimeout(function() {
    $.getJSON('/analytics/switches.status', function(objects) {
      console.log(objects);
      switch_status = {};
      for (var sw in objects) {
        switch_status[sw] = objects[sw] < 30;
      }
      dhmap.updateSwitches(switch_status);
    });
  }, 2000);
});
