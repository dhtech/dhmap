var switch_status = {};
var map = null;

var ping = null;
var snmp = null;
var model = null;
var iface = null;
var switch_vlans = null;
var dhcp_status = null;
var start_fetch = null;
var alert_hosts = null;

var ifre =/(^[gxf]e-[0-9\/]+$)|(Ethernet)/;
var gere =/(^ge-[0-9\/]+$)|(GigabitEthernet)/;

var errors_to_human = {
  'OK': 'Everything working as expected',
  'SPEED': 'At least one link is running at non-ideal speed or link is full',
  'STP': 'At least one port is blocked by Spanning Tree',
  'ERRORS': 'At least one port is dropping packets due to corruption',
  'WARNING': 'The switch is not replying to SNMP requests',
  'CRITICAL': 'The switch has not replied to ICMP for 30 seconds or more',
  'ALERT': 'The switch has at least one alert present in the monitoring system'
};

var openDialog;
var openDialogName;

// TODO(bluecmd): Yeah, event mode makes you write the best code.
// Refactor later (TM).
function checkIfaceSpeed(sw, model, ifaces) {
  if (model == undefined || ifaces == undefined)
    return true;

  var failed = false;
  for (var name in ifaces) {
    var iface = ifaces[name];
    /* skip access ports, sleeping computers rarely link max speed */
    if (!iface.trunk)
      continue;

    if (ifre.exec(name) == null) {
       continue;
    }

    if (iface.status == 'up') {
      if (iface.speed == '10') {
        failed = true;
      } else if (iface.speed == '100') {
        if (gere.exec(name) == null) {
          failed = true;
        }
      }
    }
  }
  return !failed;
}

function checkIfaceErrors(sw, model, ifaces) {
  if (model == undefined || ifaces == undefined)
    return true;

  var failed = false;
  var show_consumer_ifaces =
    document.getElementById('hilight_consumer_issues').checked;
  for (var name in ifaces) {
    var iface = ifaces[name];

    /* skip access ports if we don't want to show consumer ifaces */
    if (!iface.trunk && !show_consumer_ifaces)
      continue;

    if (ifre.exec(name) == null) {
       continue;
    }

    if (iface.status == 'up') {
      if (iface.errors_in > 0 || iface.errors_out > 0) {
        failed = true;
      }
    }
  }
  return !failed;
}

function checkIfaceStp(sw, model, ifaces) {
  if (model == undefined || ifaces == undefined)
    return true;

  var failed = false;
  var show_consumer_ifaces =
    document.getElementById('hilight_consumer_issues').checked;

  for (var name in ifaces) {
    var iface = ifaces[name];
    /* skip access ports if we don't want to show consumer ifaces */
    if (!iface.trunk && !show_consumer_ifaces)
      continue;

    /* TODO(bluecmd): Maybe not set 'error' on non-ethernet
     * interfaces that don't speak STP */
    if (ifre.exec(name) == null) {
       continue;
    }

    if (iface.status == 'up') {
      if (iface.stp == 'error') {
        failed = true;
      }
    }
  }
  return !failed;
}

function computeStatus() {
  if (iface == null || model == null || snmp == null || ping == null)
    return;

  var now = new Date();
  var latency = now - start_fetch;
  console.log(
      '[' + now.toLocaleString() + '] Loaded new data in ' + latency + 'ms');

  switch_status = {};

  for (var sw in ping) {
    if (ping[sw] >= 60) {
      switch_status[sw] = 'CRITICAL';
    } else if (!checkIfaceStp(sw, model[sw], iface[sw])) {
      switch_status[sw] = 'STP';
    } else if (!checkIfaceSpeed(sw, model[sw], iface[sw])) {
      switch_status[sw] = 'SPEED';
    } else if (!checkIfaceErrors(sw, model[sw], iface[sw])) {
      switch_status[sw] = 'ERRORS';
    } else if (snmp[sw] == undefined || snmp[sw].since > 360) {
      switch_status[sw] = 'WARNING';
    } else if (alert_hosts[sw] != undefined) {
      switch_status[sw] = 'ALERT';
    } else {
      switch_status[sw] = 'OK';
    }
    var swname = sw.split('.')[0];
    
    if(openDialogName == swname)
      updateSwitchDialog(swname, sw);
  }
  dhmap.updateSwitches(switch_status);
  dhmenu.updateSwitches(switch_status);
}

function click(sw) {
  
  // Close open dialog
  if(openDialog){
      openDialog.dialog('destroy').remove()
      openDialog = undefined;
      openDialogName = undefined;
  }

  var title = '';
  var swname = sw.name.split('.')[0];
  title += '<div class="status" id="switch-' + swname + '" ></div>';
  title += swname.toUpperCase();
  var dialog = $('<div class="switchdialog">').attr({'title': title});
  dialog.append($('<span>').attr({'id': 'info-' + swname}));
  dialog.append($('<div>').attr({'id': 'dhcpinfo-' + swname}));
  dialog.append($('<div>').attr({'id': 'ports-' + swname}));
  dialog.append($('<br/>'));
  dialog.append($('<div>').attr({'id': 'portinfo-' + swname}));
  dialog.dialog({width: 500, height: 390, resizable: false,
    close: function() {
      $(this).dialog('destroy').remove()
      openDialog = undefined;
      openDialogName = undefined;
    }});

  openDialog = dialog;
  openDialogName = swname;
  updateSwitchDialog(swname, sw.name);
}

function updateSwitchDialog(sw, fqdn) {
  var div = $('#switch-' + sw);
  if (div == undefined || !iface || iface[fqdn] == undefined)
    return
  div.css({'background-color': dhmap.colour[switch_status[fqdn]]});

  var info = $('#info-' + sw);
  info.html('<p>Status: ' + errors_to_human[switch_status[fqdn]] + '</p>');

  var dhcpinfo = $('#dhcpinfo-' + sw);
  dhcpinfo.html('');
  var dhcptable = $('<table width="300px">');
  if (switch_vlans[fqdn] != undefined) {
    dhcptable.append(
        '<tr><th>Network</th><th>Clients</th><th>Max</th><th>DHCP Pool Usage</th>');
    for (var vlan in switch_vlans[fqdn]) {
      // Grab the first network with the same VLAN
      for (var network in dhcp_status) {
        var ds = dhcp_status[network];
        if (ds.vlan == vlan) {
          dhcptable.append(
              $('<tr>')
              .append($('<td>').text(network))
              .append($('<td>').text(ds.usage))
              .append($('<td>').text(ds.max))
              .append($('<td>').text(Math.ceil(ds.usage / ds.max * 100) + '%')))
        }
      }
    }
    dhcpinfo.append(dhcptable);
  } else {
    dhcpinfo.append('<i>No DHCP pool data available because VLAN information unavailable for switch model</i>');
  }

  var ports = $('#ports-' + sw);
  ports.html('<hr/>');

  var portsdiv = $('<div>');

  var order = {};
  for (var idx in iface[fqdn]) {
    order[parseInt(iface[fqdn][idx].lastoid)] = idx;
  }

  function sortNum(a, b) {
    return a - b;
  }

  var count = 0;
  var key_order = Object.keys(order).sort(sortNum);
  for (var kidx in key_order) {
    var idx = order[key_order[kidx]];
    var entry = iface[fqdn][idx];
    var ifacename = idx;

    /* Skip special interfaces */
    if (ifre.exec(ifacename) == null) {
       continue;
    }

    count++;
    if (count % 24 == 1 && count > 1)
      portsdiv.append('<br />');

    var portdiv = $('<div class="port">').attr({
      'id': 'port-' + sw + ':' + entry.lastoid});

    tx_full = false;
    rx_full = false;
    speed_fail = false;
    if (entry.status == 'up') {
      portdiv.css({'background-color': dhmap.colour.OK});
      tx_full = ((entry.tx_10min * 8 / 1000 / 1000) / entry.speed > 0.95);
      rx_full = ((entry.rx_10min * 8 / 1000 / 1000) / entry.speed > 0.95);
      speed_fail = (entry.trunk && parseInt(entry.speed) < 1000) ||
                    (!entry.trunk && parseInt(entry.speed) < 100);
      if (parseFloat(entry.errors_in) > 0)
        portdiv.css({'background-color': dhmap.colour.ERRORS});
      if (parseFloat(entry.errors_out) > 0)
        portdiv.css({'background-color': dhmap.colour.ERRORS});
      if (tx_full || rx_full || speed_fail)
        portdiv.css({'background-color': dhmap.colour.SPEED});
      if (!entry.trunk && parseInt(entry.speed) < 1000 &&
          gere.exec(ifacename) != null)
        portdiv.css({'background-color': dhmap.colour.SPEED});
      if (entry.stp == 'error')
        portdiv.css({'background-color': dhmap.colour.STP});
    }
    if (entry.admin != 'up')
      portdiv.css({'background-color': dhmap.colour.WARNING});

    portdiv.hover(function(entry, ifacename, sw, tx_full, rx_full, speed_fail) {
      var portinfo = $('#portinfo-' + sw);
      portinfo.html('');

      var table = $('<table width="90%">');
      table.append(
        $('<tr>').append('<td style="width: 150px">Interface:</td><td>'
          + ifacename + '</td>'));
      table.append(
        $('<tr>').append('<td>Status:</td><td>' + entry.status + '</td>'));
      if (entry.admin != 'up') {
        table.append($('<tr>').append(
          '<td colspan="2"><b>Administratively Disabled</b></td>'));
      }
      if (entry.status == 'up') {
        table.append(
          $('<tr>').append('<td>Spanning Tree:</td><td>' + entry.stp + '</td>'));
        sb = speed_fail ? 'font-weight: bold; animation: blinker 1s linear infinite;' : '';
        table.append(
          $('<tr>').append('<td>Speed:</td><td><span style="' + sb + '">' + entry.speed + ' Mbit/s</span></td>'));
        tb = tx_full ? 'font-weight: bold; animation: blinker 1s linear infinite;' : '';
        rb = rx_full ? 'font-weight: bold; animation: blinker 1s linear infinite;' : '';
        table.append(
          $('<tr>').append('<td>Traffic (10 min avg.):</td><td>' + 
                  'TX: <span style="' + tb + '">' + Math.ceil(entry.tx_10min*8/1000/1000) + ' Mbit/s</span>, ' +
                  'RX: <span style="' + rb + '">' + Math.ceil(entry.rx_10min*8/1000/1000) + ' Mbit/s</span> </td>'));
        table.append(
          $('<tr>').append('<td>Traffic (instant):</td><td>' + 
                  'TX: ' + Math.ceil(entry.tx*8/1000/1000) + ' Mbit/s, ' +
                  'RX: ' + Math.ceil(entry.rx*8/1000/1000) + ' Mbit/s </td>'));
        table.append(
          $('<tr>').append(
            '<td>Errors:</td><td>In: ' + Math.ceil(entry.errors_in*100)/100 +
            ', Out: ' + Math.ceil(entry.errors_out*100)/100 + '</td>'));
      }

      portinfo.append(table);
      $(this).css({'border-color': 'red'});
    }.bind(portdiv, entry, ifacename, sw, tx_full, rx_full, speed_fail), function() {
      $(this).css({'border-color': 'black'});
    }.bind(portdiv));
    portsdiv.append(portdiv);
  }

  ports.append(portsdiv);
}


$.getJSON('./data.json', function(objects) {
  dhmap.init(objects, click);
  dhmenu.init(objects, click);

  function updateStatus() {
    start_fetch = new Date();
    $.when(
      $.getJSON('/analytics/ping.status', function(objects) {
        ping = objects;
      }),
      $.getJSON('/analytics/snmp.saves', function(objects) {
        snmp = objects;
      }),
      $.getJSON('/analytics/switch.model', function(objects) {
        model = objects;
      }),
      $.getJSON('/analytics/switch.interfaces', function(objects) {
        iface = objects;
      }),
      $.getJSON('/analytics/dhcp.status', function(objects) {
        dhcp_status = objects;
      }),
      $.getJSON('/analytics/switch.vlans', function(objects) {
        switch_vlans = objects;
      }),
      $.getJSON('/analytics/alerts.hosts', function(objects) {
        alert_hosts = objects;
      })
    ).then(function() {
      computeStatus();
    });
  }
  setInterval(updateStatus, 10000);
  updateStatus();
});


// Allow HTML in the dialog title
$.widget("ui.dialog", $.extend({}, $.ui.dialog.prototype, {
    _title: function(title) {
        if (!this.options.title ) {
            title.html("&#160;");
        } else {
            title.html(this.options.title);
        }
    }
}));

function darkmode(mode) {
  document.body.style.backgroundColor = mode ? '#111' : '#fff';
}
