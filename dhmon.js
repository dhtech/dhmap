var map = null;

$.getJSON('./data.json', function(objects) {
  dhmap.init(objects);

  function updateStatus() {
    $.getJSON('/analytics/ping.status', function(ping) {
      $.getJSON('/analytics/snmp.saves', function(snmp) {
        switch_status = {};
        for (var sw in ping) {
          switch_status[sw] = ping[sw] < 30;
          if (snmp[sw] == undefined || snmp[sw].since > 120) {
            switch_status[sw] = '!';
          }
        }
        dhmap.updateSwitches(switch_status);
      });
    });
  }
  setInterval(updateStatus, 10000);
  updateStatus();
});
