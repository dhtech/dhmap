var map = null;

var ping = null;
var snmp = null;
var model = null;
var iface = null;


function checkIfaceSpeed(sw, model, ifaces) {
  if (model == undefined || ifaces == undefined)
    return true;

  var failed = false;
  for (var idx in ifaces) {
    var iface = ifaces[idx];
    var name = window.atob(iface.interface.split(':')[1]);
    if (iface.status == 'up') {
      if (iface.speed == '10') {
        failed = true;
      } else if (iface.speed == '100') {
        if (name.indexOf('GigabitEthernet') != -1) {
          failed = true;
        }
      }
    }
  }
  return !failed;
}

function computeStatus() {
  if (iface == null || model == null || snmp == null || ping == null)
    return;

  switch_status = {};

  for (var sw in ping) {
    if (ping[sw] > 30) {
      switch_status[sw] = false;
    } else if (!checkIfaceSpeed(sw, model[sw], iface[sw])) {
      switch_status[sw] = 'S';
    } else if (snmp[sw] == undefined || snmp[sw].since > 120) {
      switch_status[sw] = '!';
    } else {
      switch_status[sw] = ping[sw] < 30;
    }
  }
  dhmap.updateSwitches(switch_status);
}

$.getJSON('./data.json', function(objects) {
  dhmap.init(objects);

  function updateStatus() {
    ping = null;
    snmp = null;
    model = null;
    iface = null;

    $.getJSON('/analytics/ping.status', function(objects) {
      ping = objects;
      computeStatus();
    });
    $.getJSON('/analytics/snmp.saves', function(objects) {
      snmp = objects;
      computeStatus();
    });
    $.getJSON('/analytics/switch.model', function(objects) {
      model = objects;
      computeStatus();
    });
    $.getJSON('/analytics/switch.interfaces', function(objects) {
      iface = objects;
      computeStatus();
    });
  }
  setInterval(updateStatus, 10000);
  updateStatus();
});
