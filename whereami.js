var map = null;

$.getJSON('./data.json', function(objects) {
  dhmap.init(objects);

  function updateStatus() {
    $.getJSON('https://whereami.event.dreamhack.se/analytics/switch.status', function(objects) {
      dhmap.updateSwitches(objects);
    });
  }
  setInterval(updateStatus, 10000);
  updateStatus();
});
