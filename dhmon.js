var map = null;

$.getJSON('./data.json', function(objects) {
  dhmap.init(objects);

  function updateStatus() {
    $.getJSON('/analytics/switches.status', function(objects) {
      switch_status = {};
      for (var sw in objects) {
        switch_status[sw] = objects[sw] < 30;
      }
      dhmap.updateSwitches(switch_status);
    });
  }
  setInterval(updateStatus, 10000);
  updateStatus();
});
