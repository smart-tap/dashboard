'use strict';

/* Controllers */

var sirenEntityController = angular.module('sirenEntityController', []);

sirenEntityController.controller('EntityCtrl', [
  '$scope'
  , '$sce'
  , '$state'
  , '$http'
  , '$location'
  , 'navigator'
  , 'getStreams'
  , function($scope, $sce, $state, $http, $location, navigator, getStreams) {
	
  $scope.init = function() {
    var params = $state.params;
    var rootUrl = params.url;

    follow(rootUrl);
    $scope.stateLogs = [];
    //TODO: have to figure out how to autodiscover this URL. 
    console.log("params: ", params);
    $scope.logger("ws://localhost:3000/events");
  };

  $scope.go = function(url) {
    $state.transitionTo('entity', { url: url });
  };
	
  $scope.execute = function(action) {

    //this can't be true for entities being viewed from the app root
    if (action.class && action.class.indexOf('event-subscription') !== -1) {
      var ws = new WebSocket(action.href);
		
      //when there's a stream message	
      ws.onmessage = function(event) {
        //Add data to model w/ timestamp here
        var d = JSON.parse(event.data);
        console.log(d);

        var update = {
          target: d.destination.replace(/\//g, '_'),
          data: d.data
        }  

        $scope.main.streams[update.target].data.push([new Date(), update.data]);	  

        if($scope.main.streams[update.target].data.length > 75){
          $scope.main.streams[update.target].data.shift();
        }
        $scope.$apply();
      }

      var command = { cmd: action.method };
      action.fields.forEach(function(field) {
        command[field.name] = field.value;
      });

      ws.onopen = function(event) {
        ws.send(JSON.stringify(command));
      };

      return;
    }

    navigator.execute(action).then(function(result) {
      if (result.noop) {
        return;
      }
		
      var data = result.data;
      var config = result.config;

      $scope.main.class = null;
      $scope.main.actions = [];
      $scope.main.entities = [];
      $scope.main.links = [];
      
      $scope.formattedDiff = "";
      $scope.main.breadcrumbs = [];

      $scope.url = config.url;
      $state.params.url = config.url;

      showData(data);
    });
    /*var fd = new FormData();
    angular.forEach(action.fields,function(val){
      fd.append(val.name,(val.file || val.value) );
    });

    $http.post(action.href, fd, {
      headers: {'Content-Type': undefined },
      transformRequest: angular.identity
    }).then(onFinished);

    function onFinished(result) {
      if (result.noop) {
        return;
      }
		
      var data = result.data;
      var config = result.config;

      $scope.main.class = null;
      $scope.main.actions = [];
      $scope.main.entities = [];
      $scope.main.links = [];
      
      $scope.formattedDiff = "";
      $scope.main.breadcrumbs = [];

      $scope.url = config.url;
      $state.params.url = config.url;

      showData(data);
    }*/

  };
	
  $scope.logger = function(url){
    
    var ws = new WebSocket(url);
    
    //when there's a stream message	
    ws.onmessage = function(event) {
      //Add data to model w/ timestamp here
      var d = JSON.parse(event.data);
      var dt = new Date(d.data.time);
      var etime = 0;
      if($scope.stateLogs.length){
        etime = d.data.unixtime -  $scope.stateLogs[$scope.stateLogs.length -1].time.unixtime;
      }
      
      $scope.stateLogs.push({
        transition: d.data.transition,
        state: d.data.properties.state,
        msg: d.data.msg,
        time: {
          time: d.data.time,
          unixtime: d.data.unixtime,
          localTime: dt.toLocaleString(),
          elapsed: etime
        }
      });
      //console.log("log: ", $scope.stateLogs);
      if($scope.stateLogs.length > 500){ $scope.stateLogs.shift() } //keep things civil
    }

    var command = { cmd: "subscribe", name: "_logs" };
    
    ws.onopen = function(event) {
      ws.send(JSON.stringify(command));
    };
  };
  
  var showData = function(data) {
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
	 
    //sort the data! This should be done on the api or UNDONE in jsondiff formatters.js
    //This is all for displaying the properties array in the json diff object
	  var tosort = []
	  angular.forEach(data.properties, function(prop, i){ tosort.push(i); });
	  tosort.sort();
	  
	  data.abc_properties = {};
	  angular.forEach(tosort, function(key){
	  	data.abc_properties[key] = data.properties[key];
	  });
	  
	  //console.log(data.abc_properties);
	  
	     console.log("Properties at the top of showdata: ",$scope.main.properties);
 
    $scope.main.properties.old = $scope.main.properties.raw;
    $scope.main.properties.text = "<pre>" + JSON.stringify(data.abc_properties, null, 2).replace(/\"([^(\")"]+)\":/g,"$1:") + "</pre>"; //regex to remove quotes (") from stringify
    $scope.main.properties.raw = data.properties;
    $scope.main.properties.diff = { raw: null, html: null };

    $scope.formattedDiff = $sce.trustAsHtml($scope.main.properties.text);
	  
    $scope.main.class = JSON.stringify(data.class);
    $scope.main.actions = data.actions;
    $scope.main.stateClass = 'label-info';
	  
    var oldState = $scope.main.state;
	
    if (data.properties && data.properties.state) {
      $scope.main.state = data.properties.state;
    }
  
	if(!$scope.main.streams){  
		console.log("initialize data streams");
		$scope.main.streams = {};
		$scope.main.totalStreams = 0;
		angular.forEach($scope.main.properties.raw.streams, function(stream){
			stream = stream.replace(/\//g, '_');
			
			$scope.main.streams[stream] = {
				name: stream,
				data: [],
				xFunction: function(){ return function(d){ return d[0]; } },
				yFunction: function(){ return function(d){ return d[1]; } },
                xTickFunction: function(d3) { return d3.time.format('%H:%M:%S'); }
			}
            
            $scope.main.totalStreams++;
		});
	}
	  
    if (oldState !== undefined && oldState !== $scope.main.state) {
//	  	var index = $scope.main.streams["_state"].data.length -1;
//		var current = $scope.main.streams["_state"].data[index]
		var update;
		
//		if(current !== undefined){ current = current[1]; }
//		
//		if(current == 20){ 
//			update = 0; 
//		}else{
//			update = 20;
//		}
		
		
//		$scope.main.streams["_state"].data.push([new Date(), update]);
//		
//		if($scope.main.streams["_state"].data.length > 75){
//			$scope.main.streams["_state"].data.shift();
//		}
		
      $scope.main.stateClass = 'label-warning';
      setTimeout(function() {
        $scope.$apply(function() {
          $scope.main.stateClass = 'label-info';
        });
      }, 800);
    
	  $scope.main.properties.diff.raw = jsondiffpatch.diff(
      $scope.main.properties.old, $scope.main.properties.raw);

      $scope.main.properties.diff.html = jsondiffpatch.formatters.html.format(
      $scope.main.properties.diff.raw, $scope.main.properties.raw);

      $scope.formattedDiff = $sce.trustAsHtml($scope.main.properties.diff.html);

      clearTimeout($scope.main.properties.clearHighlight);

      $scope.main.properties.clearHighlight = setTimeout(function(){
        $scope.$apply(function(){
          $scope.formattedDiff = $sce.trustAsHtml($scope.main.properties.text);
        });
      }, 1500);
    }
	  
	  
	
	  
    if (data.entities) {
      angular.forEach(data.entities, function(entity) {
		entity.raw = entity.properties;
        entity.logs = [];
        entity.properties = JSON.stringify(entity.properties, null, 2);
        var heading = [];
		
		if(entity.raw.name && entity.raw.name.length > 0){
			entity.heading = entity.raw.name;
		}else{
			if (entity.class) {
			  heading.push('class: ' + JSON.stringify(entity.class));
			}

			if (entity.rel) {
			  heading.push('rel: ' + JSON.stringify(entity.rel));
			}

			entity.heading = heading.join(', ') || '[unknown class]';
		
		}

        if (entity.links) {
          var links = [];
          angular.forEach(entity.links, function(link) {
            angular.forEach(link.rel, function(rel) {
			  if(rel == "self"){ entity.selfLink = { rel: rel, href: link.href }; }
              links.push({ rel: rel, href: link.href });
            });
          });

          entity.links = links;
		  entity.manyLinks = entity.links.length > 1;
        }

        $scope.main.entities.push(entity);
      });
    }

    if (data.links) {
      angular.forEach(data.links, function(link) {
        angular.forEach(link.rel, function(rel) {
          $scope.main.links.push({ rel: rel, href: link.href });
        });
      });
    }

    if($scope.url){		  
      var protocol = $scope.url.split("//");
      var _crumbs = protocol[1].split("/");

      $scope.main.breadcrumbs = [];

      for(var i = 1; i < _crumbs.length; i++){
        var url = protocol[0] + "//";
        for(var a = 0; a < i; a++){
          url += _crumbs[a] + "/";
        }

        $scope.main.breadcrumbs.push({
          "text": _crumbs[i],
          "href": url + _crumbs[i]
        });
      }
    }
  };

  var follow = function(rootUrl) {
    var url = rootUrl;

    $scope.main = {
      properties: [],
      entities: [],
      links: []
    };

    $scope.isOneAtATime = true;
    $scope.url = url;

    $state.params.url = url;

    navigator.redirectOrFetch(url, $state.params).then(function(data) {
      showData(data);
    });
  };
}


]); //.controller closure

