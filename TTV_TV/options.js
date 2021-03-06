////////global variables//////////

var streamer_name_blacklist = [];
var twitchSwitchApp;
var ang_history_scope;

//////////////////////////////////

///////////prog init//////////////
init_angular();
document.addEventListener('DOMContentLoaded', init);
//////////////////////////////////

/**
 * Initializes all angular controls for the web page
 */
function init_angular() {
    $.get(chrome.extension.getURL('static/name_blacklist.txt'), function(data) {
        streamer_name_blacklist = data.split("\n");
        for(var i = 0; i < streamer_name_blacklist.length; i++){
            streamer_name_blacklist[i] = streamer_name_blacklist[i].trim();
        }
    });
    
    
	var twitchSwitchApp = angular.module('ttvTvApp', ['ui.sortable']);
	twitchSwitchApp.controller('streamerListController', function ($scope) {
		ang_history_scope = $scope;
        $scope.active_streamers = [];
        $scope.inactive_streamers = [];
        
        $scope.cleanup = function(){
            for(var i = 0; i < streamer_name_blacklist.length; i++){
                var temp_name = streamer_name_blacklist[i];
                $scope.remove_streamer(temp_name)
            }
            $scope.save_streamer_prefs();
        }
        
        $scope.remove_streamer_and_save = function(name){
            $scope.remove_streamer(name);
            $scope.save_streamer_prefs();
        }
        
        $scope.remove_streamer = function(name){
            function rm_helper(arr,name){
                var i = arr.length;
                while(i--){
                    if(arr[i].name == name){
                        arr.splice(i,1);
                    }
                }
            }
            rm_helper($scope.inactive_streamers, name);
            rm_helper($scope.active_streamers, name);
            $scope.check_show_gen();
        }
        
        $scope.check_show_gen = function(){
            // if(($scope.active_streamers.length + $scope.inactive_streamers.length) > 0){
                // $("#gen-history").css("display", "none");
                // console.log("hide");
            // } else {
                // $("#gen-history").css("display", "block");
                // console.log("show");
            // }
        }
        
        $scope.save_streamer_prefs = save_streamer_prefs;
        
        var add_streamer_field = document.getElementById("add_streamer_field");
		$scope.add_streamer_single = function (name, visited_count) {
            //make sure entered stream name isn't a blacklisted word
            for(var i = 0; i < streamer_name_blacklist.length; i++){
                if(streamer_name_blacklist[i] == name)
                    return;
            }
            //make sure entered stream name is a valid twitch name
            if(!streamer_exists($scope.active_streamers, name) &&
               !streamer_exists($scope.inactive_streamers, name))
            {
                var name_regex = new RegExp("^[a-zA-Z0-9_]{4,25}$");
                if(!name.match(name_regex))
                    return;
                $scope.inactive_streamers.push({
                    "name" : name,
                    "visited_count" : visited_count
                });
                add_streamer_field.value = "";
            }
		}

		// generate history of streamers watched
		$scope.get_history_permission = function () {
			// populate history
			chrome.permissions.contains({
				permissions : ["history"]
			}, history_callback);
		}
		$scope.set_active_arr = function (arr) {
			$scope.active_streamers = arr;
		}
		$scope.set_inactive_arr = function (arr) {
			$scope.inactive_streamers = arr;
		}

		$scope.sortableOptions = {
            connectWith: ".streamer_list",
			stop : function (e, ui) {
				$scope.save_streamer_prefs();
			}
		};
        function streamer_exists(arr, name){
            for(var i = 0; i < arr.length; i++){
                if(arr[i].name == name) return true;
            }
            return false;
        }
	});
}

/**
 * Called on program start
 */
function init() {
    document.getElementById("add_streamer_textbox").addEventListener("submit", function() {
            var streamer_name = $("#add_streamer_field").val().toLowerCase();
            // console.log(streamer_name);
            ang_history_scope.add_streamer_single(streamer_name, 0);
            save_streamer_prefs();
        });

	bglog("init()");
	load_streamer_prefs();
}

/**
 * Gets the currently online streamers and then
 * calls online_arr_result_callback on the result
 */
function check_online_streams(online_arr_result_callback) {
	chrome.runtime.sendMessage({
		"message" : "check_online_streams_msg",
		"streamer_array" : ang_history_scope.active_streamers
	},
    function (streamers) {
		online_arr_result_callback(streamers);
	});
}

/**
 * Called when chrome returns history.
 * Places all of the user"s watched twitch streams into an array,
 * and uses that array to populate the view preferences list.
 */
function history_callback(result) {
	bglog("history_callback(");
	if (result) {
		chrome.history.search({
			"text" : "https://www.twitch.tv*",
			"startTime" : 0,
			"endTime" : new Date().getTime()
		}, function (history_arr) {
			var potential_streamer_arr = [];
			//grab all twitch stream urls from history and add them to array
			for (var i = 0; i < history_arr.length; i++) {
				var url = history_arr[i].url;
				var regex = /^(https:\/\/www\.twitch\.tv\/\w+)$/g;
				//generate streamer array from urls
				if (url.match(regex)) {
					potential_streamer_arr.push({
						"name" : url.split("v/")[1],
						"visited_count" : history_arr[i].visitCount
					});
				}
			}
			get_valid_streams(potential_streamer_arr);
		});
	} else {
		chrome.permissions.request({
			permissions : ["history"]
		}, function (granted) {
			if (granted) {
				history_callback(true);
				$("#gen-history-warning").text("");
			} else {
				$("#gen-history-warning").text("You must allow the app to view your browser history to generate streamer preferences.");
			}
		});
	}
}

/**
 * Sorts list of streamers
 */
function sort_streamer_array(streamer_array) {
	streamer_array.sort(function (a, b) {
		if (a.visited_count <= b.visited_count)
			return 1;
		if (a.visited_count > b.visited_count)
			return -1;
		return 0;
	});
}

/**
 * Determines which streams are valid from a list
 * of potential usernames
 */
function get_valid_streams(potential_streamer_arr) {
	// bglog("get_valid_streams(");
	// bglog(potential_streamer_arr);
	chrome.runtime.sendMessage({
		"message" : "get_valid_streamers_msg",
		"potential_streamers" : potential_streamer_arr
	}, function (streamers) {
        // console.log(streamers)
		sort_streamer_array(streamers)
        //this is the last bit of code called when generate stream is pressed
        var all_streamers = ang_history_scope.inactive_streamers.concat(ang_history_scope.active_streamers)
        name_hm = {}
        // console.log("all_streamers")
        // console.log(all_streamers)
        for(var i = 0; i < all_streamers.length; i++){
            name_hm[all_streamers[i].name] = 1;
            // console.log("ignoring: " + streamers[i].name);
            // console.log(name_hm[streamers[i].name]);
            
        }
        // console.log(name_hm);
        for(var i = 0; i < streamers.length; i++){
            if(name_hm[streamers[i].name] != 1){
                ang_history_scope.add_streamer_single(streamers[i].name, streamers[i].visited_count);
            } else {
                // console.log("ignoring " + streamers[i].name)
            }
        }
        
		// ang_history_scope.set_inactive_arr(streamers);
		// ang_history_scope.set_active_arr([]);
        ang_history_scope.cleanup()
		save_streamer_prefs();
	});
}

/**
 * Passes streamer preference data to
 * background for saving
 */
function save_streamer_prefs(callback=function(){}) {
    // console.log("Saving streamers");
    // console.log(ang_history_scope.active_streamers);
    // bglog("Saving streamers")
	chrome.runtime.sendMessage({
		"message" : "save_streamer_prefs_msg",
		"inactive_streamers" : ang_history_scope.inactive_streamers,
		"active_streamers" : ang_history_scope.active_streamers
	}, function (streamers) {
		bglog("You so save!");
        ang_history_scope.$apply();
        callback();
        ang_history_scope.check_show_gen();
	});
}

/**
 * Loads streamer preference data from
 * background and updates the angular controls
 * based on the result.
 */
function load_streamer_prefs() {
	chrome.runtime.sendMessage({
		"message" : "load_streamer_prefs_msg"
	}, function (pref_obj) {
		// streamer_array = pref_obj.streamer_array;
        // console.log(pref_obj);
		ang_history_scope.set_inactive_arr(pref_obj.inactive_streamers);
		ang_history_scope.set_active_arr(pref_obj.active_streamers);
		ang_history_scope.$apply();
        ang_history_scope.check_show_gen();
	});
}

/**
 * log to background instead of options script
 */
function bglog(str) {
	chrome.runtime.sendMessage({
		"message" : "print_to_bg_msg",
		"printconts" : str
	});
}