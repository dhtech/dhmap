

var dhmenu = {};
dhmenu.onclick = null;

dhmenu.init = function(objects, click_callback) {
  dhmenu.onclick = click_callback;
  dhmenu.write(objects);
}

dhmenu.hideShowMenu = function(){
  if($("#menu").is(":visible")){
    $("#menu").hide();
  } else {
    $("#menu").show();
  }
}

// Write menu
dhmenu.write = function(objects){
  
  // Move dist to end
  var dist = objects["Dist"];
  delete objects["Dist"];
  objects["Dist"] = dist;
  
  if($('#menu')){
    var div_menu = $('#menu');
    div_menu.empty();
    
    // Add ul - Halls
    var ul_halls = $('<ul id="menu_ul_halls" />');
    div_menu.append(ul_halls);
    
    // Add li - Halls
    $.each(objects,function(hallName,nodes) {
      var li_hall = $('<li id="menu_hall_'+hallName+'" />');
      li_hall.append('<a href="javascript:void(0);" onclick="dhmenu.expandFoldHall(this);">'+hallName+'</a>');
      ul_halls.append(li_hall);
      
      // Add ul - Switches
      var ul_switches = $('<ul id="menu_ul_switches" />');
      li_hall.append(ul_switches);
      
      // Add li - Switches
      $.each(nodes,function(i,node){        
        if(node.class == 'switch' || node.class == 'Dist'){
          var switchName = node.name.substr(0, node.name.indexOf('.')).toUpperCase(); 
          var tableName = switchName.substr(0, switchName.indexOf('-')); 
          var li_switch = $('<li id="menu_switch_'+switchName+'" />');
          //data-table="'+tableName+'"
          li_switch.attr("data-hall",hallName);
          li_switch.attr("data-table",tableName);
          var a_switch = $('<a href="javascript:void(0);" onclick="dhmap.filter(\''+switchName+'\');" />');
          a_switch.text(switchName);
          li_switch.append(a_switch);
          
          // Add information
          li_switch.append('<div class="switch_info"><div></div></div>');
          
          ul_switches.append(li_switch);
        }
      });
    });
  }
  
  // Test
  // dhmenu.testStatuses(objects);
  
  // Filter menu
  // dhmenu.filter();
}

// Set colors in menu
dhmenu.updateSwitches = function(switchStatuses) {
  for (var switchName in switchStatuses ) {
    // Get short name
    var shortSwitchName = switchName;
    if(switchName.indexOf('.') >= 0)
      shortSwitchName = switchName.substr(0, switchName.indexOf('.')).toUpperCase();
    
    // Store status on element
    $("#menu_switch_"+shortSwitchName).attr("data-status", switchStatuses[switchName]);
    
    // If the switch is unknown, render it as amber
    if ( switchStatuses[switchName] === undefined) {
      $("#menu_switch_"+shortSwitchName).css("background-color", "#ddd");
    } 
    // Else set status color
    else {
      var colour = dhmap.colour[switchStatuses[switchName]];
      $("#menu_switch_"+shortSwitchName).css("background-color", colour.replace(')',',0.7)'));
      $("#menu_switch_"+shortSwitchName).attr("title",errors_to_human[switchStatuses[switchName]]);
      $("#menu_switch_"+shortSwitchName).find('div > div').text(errors_to_human[switchStatuses[switchName]]);
      
      // Set color on hall
      var hallName = $("#menu_switch_"+shortSwitchName).attr("data-hall");
      if(hallName && $("#menu_hall_"+hallName)){
        var currentStatus = $("#menu_hall_"+hallName).attr("data-status");
        var newStatus = switchStatuses[switchName];
        
        if (newStatus == "CRITICAL" || currentStatus == "OK" || !currentStatus)
        {
          colour = dhmap.colour[newStatus];
          $("#menu_hall_"+hallName).css("background-color", colour.replace(')',',0.2)'));
          $("#menu_hall_"+hallName).attr("data-status", switchStatuses[switchName]);
        }
      }
    }
  }
  
  dhmenu.filter();
}

// Filter menu
dhmenu.filterWarnings;
dhmenu.filter = function(searchFor = "", filterWarnings){
  searchFor = searchFor.toUpperCase();
  
  if(filterWarnings === undefined)
    filterWarnings = true;
  dhmenu.filterWarnings = filterWarnings;
  
  if(searchFor){
    // Hide all switches
    $('#menu > ul > li > ul > li').hide();
    
    // Expand halls
    $('#menu > ul > li > ul').show();
    
    // Show searched switches
    $("#menu > ul > li > ul > li[id*='"+searchFor+"'").show();
  }
  // Hide OK switches
  else if (filterWarnings){
    $('#menu > ul > li > ul > li').show();
    $('#menu > ul > li > ul > li[data-status="OK"]').hide();
    
    // Expand halls
    $('#menu > ul > li > ul').show();
  }
  else{
    // Show all switches
    $('#menu > ul > li > ul > li').show();
    
    // Fold halls
    $('#menu > ul > li > ul').hide();
  }
}

// Expand or fold hall
dhmenu.expandFoldHall = function(li_hall, fold) {
  
  var hallName = li_hall.innerText;
  if(fold === undefined)
    fold = $(li_hall).siblings().is(":visible");
  
  if(fold){
    $(li_hall).siblings().hide();
  } else {
    $(li_hall).siblings().show();
  }
}

//Test
dhmenu.testStatuses = function(objects){
  var switchSatuses = {};
  $.each(objects,function(hallName,nodes){
    $.each(nodes,function(i,node){
      if(node.class == 'switch' || node.class == 'Dist'){
        switchSatuses[node.name] = "OK";
      }
    });
  });
  switchSatuses["d62-b.event.dreamhack.local"] = "CRITICAL";
  switchSatuses["a01-a.event.dreamhack.local"] = "SPEED";
  switchSatuses["a02-a.event.dreamhack.local"] = "WARNING";
  switchSatuses["a03-b.event.dreamhack.local"] = "STP";
  switchSatuses["d51-a.event.dreamhack.local"] = "ERRORS";
  
  switchSatuses["a-bridgeeast-sw.event.dreamhack.local"] = "CRITICAL";
  dhmap.updateSwitches(switchSatuses);
  dhmenu.updateSwitches(switchSatuses);
}
