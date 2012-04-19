/*global $ window document google io console autobusSocket navigator MapIconMaker*/

var objCallback = function (obj, func) {
    return function () {
        obj[func].apply(obj, arguments);
    };
};

var autobus = {

    map: null,
    
    routes: {},
    
    routePaths: {},
    
    markers: {},
    
    currentPositionMarker: null,
    
    onPositionUpdate: function (position) {
        var point = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        if (!this.currentPositionMarker) {
        
            this.currentPositionMarker = new google.maps.Marker({
                position: point,
                map: this.map,
                title: "You Are Here"
            });
        } else {
            this.currentPositionMarker.setPosition(point);
        }
    },
    
    initialize: function () {
        // Initialize the map
        var myOptions = {
            zoom: 12,
            center: new google.maps.LatLng(35.6660, -105.9632),
            mapTypeId: google.maps.MapTypeId.TERRAIN
        };
        this.map = new google.maps.Map(document.getElementById("map_canvas"), myOptions);
        
        // Set the socket
        // TODO:  need to use acequia for this.  This will need node to node communications.
        autobusSocket.init("http://localhost:3000");
        
        // Set up to get position updates
        navigator.geolocation.getCurrentPosition(objCallback(this, "onPositionUpdate"));
    },
    
    onRoutes: function (data) {
        var i, rt,
        routes = JSON.parse(data);
        
        for (i = 0; i < routes.length; i += 1) {
            rt = routes[i];
            this.routes[rt.route_id] = rt;
            $("<div></div>")
                .attr("id", "route_" + rt.route_id)
                .css("background", "#" + rt.route_color)
                .html(rt.route_id + ": " + rt.route_desc)
                .click(objCallback(this, "onclickRoute"))
                .addClass("autobus_list_item ui-corner-all")
                .css("opacity", "0.5")
                .appendTo("#autobus_route_list");
        }
    },
    
    onclickRoute: function (evt) {
        var route_id = evt.target.id;
        route_id = route_id.substring(route_id.indexOf("_") + 1);
        if (this.routePaths[route_id]) {
            this.toggleRoute(route_id);
        } else {
            autobusSocket.emit("get route", {route_id: route_id});
        }
    },
    
    toggleRoute: function (route_id) {
        var i;
        if (this.routePaths[route_id].getMap() === null) {
            this.setMapForPath(route_id, this.map);
            $("#route_" + route_id).css("opacity", "1.0");
        } else {
            this.setMapForPath(route_id, null);
            $("#route_" + route_id).css("opacity", "0.5");
        }
    },
    
    setMapForMarkers: function (route_id, map) {
        var i;
        for (i = 0; i < this.markers[route_id].length; i += 1) {
            this.markers[route_id][i].setMap(map);
        }
    },
    
    setMapForPath: function (route_id, map) {
        this.routePaths[route_id].setMap(map);
        this.setMapForMarkers(route_id, map);
    },
    
    dateFromTimeString: function (timeString) {
        var ret,
        dd = timeString.split(":");

        ret = new Date();
        ret.setHours(parseInt(dd[0], 10));
        ret.setMinutes(parseInt(dd[1], 10));
        ret.setSeconds(parseInt(dd[2], 10));

        return ret;
    },
    
    getNextArrivalsForStop: function (route_id, stop_id, time) {
        var i, j, trips = [], stop_time, ret = [], arrival_time, service_id;

        if (typeof(time) === "undefined") {
            time = new Date();
        }

        if (time.getDay() === 0) {
            service_id = "SU";
        } else if (time.getDay() === 6) {
            service_id = "SA";
        } else {
            service_id = "WD";
        }

        trips = this.routes[route_id].trips;

        for (i = 0; i < trips.length; i += 1) {
            if (service_id !== trips[i].service_id) {
                continue;
            }
            for (j = 0; j < trips[i].stop_times.length; j += 1) {
                stop_time = trips[i].stop_times[j];
                if (stop_time.stop_id === stop_id) {
                    arrival_time = this.dateFromTimeString(stop_time.arrival_time);
                    if (arrival_time > time) {
                        ret.push(stop_time.arrival_time);
                    }
                }
            }
        }

        return ret;
    },

    onRoute: function (data) {
        var i, route = JSON.parse(data), routePath, stop, point, marker, infowindow,
        routeCoordinates = [], color,
        
        onclick = function (i, m) {
            return function () {
                var times, content, j;
                times = autobus.getNextArrivalsForStop(m.route_id, m.stop_id);
                content = "<div style='height:100px;overflow:hidden;'>";
                content += "<div style='font-weight:bold'>" + m.title + "</div>";
                content += "<div style='height:90px;overflow:auto;'>";
                for (j = 0; j < times.length; j += 1) {
                    content += "<div>" + times[j] + "</div>";
                }
                content += "</div></div>";
                i.content = content;
                i.open(this.map, m);
            };
        };
        
        color = "#" + this.routes[route.route_id].route_color;
        
        this.markers[route.route_id] = [];
        
        infowindow = new google.maps.InfoWindow({
            content: "blah"
        });

        for (i = 0; i < route.stop_times.length; i += 1) {
            stop = route.stop_times[i].stop;
            point = new google.maps.LatLng(parseFloat(stop.stop_lat), parseFloat(stop.stop_lon));
            routeCoordinates.push(point);
            
            marker = new google.maps.Marker({
                position: point,
                map: this.map,
                title: stop.stop_name,
                icon: MapIconMaker.createMarkerIcon({width: 20, height: 34, primaryColor: color}),
                stop_id: stop.stop_id,
                route_id: route.route_id
            });
            
            this.markers[route.route_id].push(marker);
            
            google.maps.event.addListener(marker, 'click', onclick(infowindow, marker));
        }
            
        routePath = new google.maps.Polyline({
            path: routeCoordinates,
            strokeColor: color,
            strokeOpacity: 1.0,
            strokeWeight: 2
        });
          
        routePath.setMap(this.map);
        $("#route_" + route.route_id).css("opacity", "1.0");
        
        this.routePaths[route.route_id] = routePath;
    }
};

var autobusSocket = {
    
    socket: null,
        
    init: function (uri) {
        
        this.socket = io.connect(uri);
        this.socket.on('routes', function (data) {
            autobus.onRoutes(data);
        });

        this.socket.on('route', function (data) {
            autobus.onRoute(data);
        });
        
        this.socket.emit("get routes", {});
    },
    
    emit: function (msgName, data) {
        if (typeof(data) === "undefined") {
            data = {};
        }
        this.socket.emit(msgName, data);
    }
};
