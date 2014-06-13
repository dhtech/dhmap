var map = null;

$.getJSON('./data.json', function(objects) {
  dhmap.init(objects);
});

setTimeout(function() {
  dhmap.updateSwitches({
    "d73-a.event.dreamhack.local": true,
    "d74-a.event.dreamhack.local": false,
    "d75-a.event.dreamhack.local": true
  });
}, 2000);
