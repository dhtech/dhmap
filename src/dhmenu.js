

var dhmenu = {};
dhmenu.onclick = null;

dhmenu.init = function(objects, click_callback) {
  dhmenu.onclick = click_callback;
  dhmenu.write(objects);
}

// Write menu
dhmenu.write = function(objects){
  if($('#menu')){
    var div_menu = $('#menu');
    div_menu.empty();
    
    // Add ul - Halls
    var ul_halls = $('<ul id="menu_ul_halls" />');
    div_menu.append(ul_halls);
    
    // Add li - Halls
    $.each(objects,function(hallName,nodes) {
      var li_hall = $('<li />');
      li_hall.append('<a href="javascript:void(0);" id="menu_hall_'+hallName+'" onclick="dhmenu.expandFoldHall(this);">'+hallName+'</a>');
      ul_halls.append(li_hall);
      
      // Add ul - Switches
      var ul_switches = $('<ul id="menu_ul_switches" />');
      li_hall.append(ul_switches);
      
      // Add li - Switches
      $.each(nodes,function(i,node){        
        if(node.class == 'switch'){
          var switchName = node.name.substr(0, node.name.indexOf('.')).toUpperCase(); 
          //ul_switches.append('<li id="menu_switch_'+switchName+'"><a href="javascript:void(0);" onclick="">'+switchName+'</a></li>');
          var li_switch = $('<li id="menu_switch_'+switchName+'" />');
          var a_switch = $('<a href="javascript:void(0);" />');
          a_switch.text(switchName);
          a_switch.click(function() {
            dhmenu.onclick(node);
          });
          li_switch.append(a_switch);
          ul_switches.append(li_switch);
        }
      });
    });
  }
}

// Set colors in menu
dhmenu.updateStatuses = function(switchStatuses) {
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
    } else {
      var colour = colours[switchStatuses[switchName]];
      $("#menu_switch_"+shortSwitchName).css("background-color", colour);
    }
  }
}

// Filter menu
dhmenu.filterWarnings;
dhmenu.filter = function(searchFor = "", filterWarnings){
  if(searchFor){
    // Hide all switches
    $('#menu > ul > li > ul > li').hide();
    
    // Show switch
    searchFor = "menu_switch_"+searchFor;
    $('li[id^=' + searchFor + ']' ).show();
    
  }
  /*if(filterWarnings === undefined)
    filterWarnings = true;
  this.filterWarnings = filterWarnings;
  if($('#menu_hall_list')){
    
    // Unfold all halls
    $('#menu_hall_list > li > ul').show();
    
    // Unhide all switches
    $('#menu_hall_list > li > ul > li').show();
    
    // Hide all but searched for
    if(searchFor){
      $('#menu_hall_list > li > a').each(function(){
        // Fold hall
        if($(this).text() != searchFor.substr(0,1)){
          $(this).siblings().find('li').hide();
          hallsFoldedState[$(this).text()] = true;
        }
        else{
          hallsFoldedState[$(this).text()] = false;
          $(this).siblings().find('li').each(function(){
            // Fold switch
            if($(this).find('a').text().substr(0,searchFor.length) != searchFor){
              $(this).hide();
            }
          });
        }
      });
    }
    // Hide OK switches
    else if (filterWarnings){
      $('#menu_hall_list li[data-status="OK"]').hide();
    }
  }*/
}

  // Expand or fold hall
dhmenu.hallsFoldedState = {};
dhmenu.expandFoldHall = function(li_hall) { 
  var hallName = li_hall.innerText;
  if(!dhmenu.hallsFoldedState[hallName]){
    $(li_hall).siblings().hide();
    dhmenu.hallsFoldedState[hallName] = true;
  } else {
    $(li_hall).siblings().show();
    dhmenu.hallsFoldedState[hallName] = false;
  }
}