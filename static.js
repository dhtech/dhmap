var objects = null;

$.getJSON('data.json', function(new_objects) {
  objects = new_objects
  dhmap.init(objects);
});

$(document).ready(function() {
  if (objects != null)
    dhmap.init(objects);
});
$(window).resize(function() {
  dhmap.init(objects);
});
