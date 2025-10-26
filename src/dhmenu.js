

var dhmenu = {};
dhmenu.onclick = null;

dhmenu.init = function(objects, click_callback) {
  dhmenu.onclick = click_callback;
  dhmenu.write(objects);
}

dhmenu.hideShowMenu = function(){
  if($("#menu_container").is(":visible")){
    $("#menu_container").hide();
  } else {
    $("#menu_container").show();
  }
}

// Write menu
dhmenu.write = function(objects){
  
  // Move dist and prod to end
  if(objects["Dist"]){
    var dist = objects["Dist"];
    delete objects["Dist"];
    objects["Dist"] = dist;
  }
  if(objects["Prod"]){
    var prod = objects["Prod"];
    delete objects["Prod"];
    objects["Prod"] = prod;
  }

  //Skip grid as it will never contain switches.
  if(objects["Grid"]){
    var prod = objects["Grid"];
    delete objects["Grid"];
  }
  
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
        if(node.class == 'switch'){
          var switchName = node.name.substr(0, node.name.indexOf('.')).toUpperCase(); 
          var tableName = switchName.substr(0, switchName.indexOf('-')); 
          var li_switch = $('<li id="menu_switch_'+switchName+'" />');
          li_switch.attr("data-hall",hallName);
          li_switch.attr("data-table",tableName);
          li_switch.attr("data-status","UNKNOWN");
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
}

// Set colors in menu
dhmenu.updateSwitches = function(switchStatuses) {
  
  // Reset hall colors
  $("li[id^='menu_hall_']").css("background-color", "#fff");
  
  for (var switchName in switchStatuses ) {
    // Get short name
    var shortSwitchName = switchName;
    if(switchName.indexOf('.') >= 0)
      shortSwitchName = switchName.substr(0, switchName.indexOf('.')).toUpperCase();
    
    // Store status on element
    $("#menu_switch_"+shortSwitchName).attr("data-status", switchStatuses[switchName]);
    
    // Set switch as unknown if missing
    if(!switchStatuses[switchName])
      switchStatuses[switchName] = "UNKNOWN";
    
    // Set color on switch
    var colour = dhmap.colour[switchStatuses[switchName]];
    $("#menu_switch_"+shortSwitchName).css("background-color", colour.replace(')',',0.7)'));
    if(errors_to_human[switchStatuses[switchName]])
      $("#menu_switch_"+shortSwitchName).attr("title",errors_to_human[switchStatuses[switchName]]);
    
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
  
  dhmenu.filter();
}

// Filter menu
dhmenu.filter_SearchFor;
dhmenu.filter_Warnings = true;
dhmenu.filter = function(filter_SearchFor, filter_Warnings){
  
  if(filter_Warnings === undefined)
    filter_Warnings = dhmenu.filter_Warnings;
  if(filter_SearchFor === undefined)
    filter_SearchFor = dhmenu.filter_SearchFor;
  
  // Hide OK switches
  if (filter_Warnings){
    $('#menu > ul > li > ul > li').show();
    $('#menu > ul > li > ul > li[data-status="OK"]').hide();
    
    // Expand halls if changed filter_Warnings
    if(dhmenu.filter_Warnings != filter_Warnings)
      $('#menu > ul > li > ul').show();
  }
  else{
    // Show all switches
    $('#menu > ul > li > ul > li').show();
    
    // Fold halls if changed filter_Warnings
    if(dhmenu.filter_Warnings != filter_Warnings)
      $('#menu > ul > li > ul').hide();
  }
  
  // Search
  if(filter_SearchFor){
    filter_SearchFor = filter_SearchFor.toUpperCase();
    
    // Fold all halls if changed filter_SearchFor
    if(dhmenu.filter_SearchFor != filter_SearchFor)
      $('#menu > ul > li > ul').hide();
    
    // Expand searched halls
    $("#menu > ul > li > ul > li[id^='menu_switch_"+filter_SearchFor+"']").parent().show();
    $("#menu > ul > li > ul > li[id*='"+filter_SearchFor+"'][data-hall='Dist']").parent().show();
    $("#menu > ul > li > ul > li[id*='"+filter_SearchFor+"'][data-hall='Prod']").parent().show();
    
    // Hide searched halls children
    $("#menu > ul > li > ul > li[id^='menu_switch_"+filter_SearchFor+"']").parent().children().hide();
    $("#menu > ul > li > ul > li[id*='"+filter_SearchFor+"'][data-hall='Dist']").parent().children().hide();
    $("#menu > ul > li > ul > li[id*='"+filter_SearchFor+"'][data-hall='Prod']").parent().children().hide();
    
    // Show searched switches
    $("#menu > ul > li > ul > li[id^='menu_switch_"+filter_SearchFor+"']").show();
    $("#menu > ul > li > ul > li[id*='"+filter_SearchFor+"'][data-hall='Dist']").show();
    $("#menu > ul > li > ul > li[id*='"+filter_SearchFor+"'][data-hall='Prod']").show();
  }
  
  dhmenu.filter_Warnings = filter_Warnings;
  dhmenu.filter_SearchFor = filter_SearchFor;
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
dhmenu.testStatuses = function(){  
  var switchSatuses = {};
  switchSatuses["c01-a.event.dreamhack.local"] = "OK";
  switchSatuses["a01-a.event.dreamhack.local"] = "SPEED";
  switchSatuses["a02-a.event.dreamhack.local"] = "WARNING";
  switchSatuses["a03-b.event.dreamhack.local"] = "STP";
  switchSatuses["d60-a.event.dreamhack.local"] = "ERRORS";
  
  switchSatuses["a-bridgeeast-sw.event.dreamhack.local"] = "CRITICAL";
  dhmap.updateSwitches(switchSatuses);
  dhmenu.updateSwitches(switchSatuses);
}
