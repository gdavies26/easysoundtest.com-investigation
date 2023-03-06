/**
 * MACH Acoustics sound test booking system
 */
 
/*
TODO
- cleanup old records on cron
- 
*/ 

console.log('\n\nTHIS IS THE TEST APP.\n\n');

// Core modules
var fs = require('fs');
var http = require('http');

// Contrib modules
var datejs = require('datejs');
var express = require('express');
var request = require('request');
var _ = require('underscore');
    _.str = require('underscore.string');
    _.mixin(_.str.exports());
var postmark = require("postmark")("YOU-NEED-YOUR-OWN-POSTMARK-API-KEY");
var mongoose = require('mongoose');
var moment = require('moment');
var async = require('async');

// Custom modules
var mach = require('./mach');
var distance = require('./distance');

var SearchLog,
    Geocoding,
    Booking,
    Engineer,
    db,
    User,
    LoginToken;

// Business logic/variables
var distance_cutoff = 20; // will trigger special offer if closer than this (km)
var time_cutoff = 60; // will trigger special offer if closer than this (minutes)
var price_normal = 450;
var price_special = 300;

// Init express
var app = express.createServer();


// Express middleware
//app.use(app.router);
app.use(express.favicon(__dirname + '/public/favicon.ico'));
app.use(express.bodyParser());
app.use(express.static(__dirname + '/public'));
//app.use(stylus.middleware({ src: __dirname + '/public' }));
// app.use(express.logger(...));
// app.use(express.bodyParser(...));
// app.use(express.cookieParser(...));

// Express settings
app.set('view engine', 'jade');
app.set('view options', {
  layout: false
});


// Define Mongo models
mach.defineModels(mongoose, function() {
  app.SearchLog = SearchLog = mongoose.model('SearchLog');
  app.Geocoding = Geocoding = mongoose.model('Geocoding');
  app.Booking = Booking = mongoose.model('Booking');
  // app.Engineers = Engineers = mongoose.model('Engineers');
  // app.User = User = mongoose.model('User');
  // app.LoginToken = LoginToken = mongoose.model('LoginToken');
  
  // APPFOG db connection details
  // http://support.appfog.com/entries/21271312-binding-services-mysql-mongo-postgres-etc-with-node-js
  if (process.env.VCAP_SERVICES) {
    var env = JSON.parse(process.env.VCAP_SERVICES);
    var mongo = env['mongodb-1.8'][0]['credentials'];
    var mongo_conn = "mongodb://" + mongo.username + ":" + mongo.password + "@" + mongo.hostname + ":" + mongo.port + "/" + mongo.db;
    db = mongoose.connect(mongo_conn);
  }
  else {
    db = mongoose.connect('mongodb://localhost/machsoundtest');
  }
})

// Authorisation
// Using connect's basic auth for now
// http://www.giantflyingsaucer.com/blog/?p=3530
// https://groups.google.com/forum/#!msg/express-js/ToqP9qTkYNA/VGI1qQY8E0wJ
// add this to a route:
// , express.basicAuth(authorize)
function authorize(username, password) {
  return true;
  // return 'mach' === username & 'm4ch!' === password;
}

// Define routes

// - Home page
app.get('/', function(req, res){

  var title = 'Tests';
  
  res.render('tests.jade', {
    title: title,
    postcode: '',
    houses: '',
    flats: '',
  });
  
});

// - Geolocation tests - get time between locations
app.get('/tests/geo/time', function(req, res){

  var title = 'Geolocation tests - get time between locations';
  
  // Validate user input
  var error = null;
  // NOPE!
  
  // NOPE!
  
    // Log the search query
    // var s = new SearchLog(req.body);
    // s.save();
    
    // Trim the postcode
    var postcode = 'bs7 9jd';
    
    // Lat/lon
    var lat = '';
    var lon = '';
    
    
    
    // STEP 1
    
    Geocoding.find({postcode: postcode}, function (err, docs) {
      // Check for db errors
      if (!_.isNull(err)) {
        res.render('error.jade', {
          title: 'Can\'t load this page', 
          req: req 
        });
      }
      else {
        // Is it in the cache?
        if (docs[0]) {
          // console.log('Yes, we can use existing details');
          // Yes, we can use existing details
          lat = docs[0].lat;
          lon = docs[0].lon;
              
          // Get calendar
          var calendar = getCalendar(lat, lon, function(calendar) {
            // console.log('calendar');
            // console.log(calendar);
            
            // Render the page
            res.render('search-results.jade', {
              title: title,
              error: error,
              postcode: req.body.postcode,
              houses: req.body.houses,
              flats: req.body.flats,
              results: calendar,
              token: 'sr' + mach.randomNumber(100000, 999999)
            });
            
          });
          
        }
        else {
          // console.log('No, let\'s look it up and add it');
          // No, let's look it up and add it
          // Use the free Nominatim geocoding service
          mach.geocode(postcode, function(error, body){
            if (_.isEmpty(body)) {
              error = 'Sorry, we can\'t find that location. Please try again with another postcode.';
    
              // Render the page
              res.render('search-results.jade', {
                title: title,
                error: error,
                postcode: req.body.postcode,
                houses: req.body.houses,
                flats: reqzz.body.flats,
                results: null,
                token: 'sr' + mach.randomNumber(100000, 999999)
              });
            }
            else {
              lat = body[0].lat;
              lon = body[0].lon;
              // console.log(lat);
              // console.log(lon);
          
              // Cache the response
              var g = new Geocoding({
                postcode: postcode,
                lat: body[0].lat,
                lon: body[0].lon});
              g.save();
              
              // Get calendar
              //console.log(1);
              getCalendar(lat, lon, function(calendar) {
                //var calendar = calendar;
                console.log(2);
                // console.log('calendar');
                console.log('HERE\'S THE THING...');
                console.log(calendar);
                
                // Render the page
                res.render('search-results.jade', {
                  title: title,
                  error: error,
                  postcode: req.body.postcode,
                  houses: req.body.houses,
                  flats: req.body.flats,
                  results: calendar,
                  token: 'sr' + mach.randomNumber(100000, 999999)
                });
              
              });
              //console.log(3);
              
            }
          });
        }
      }
    });
    
    
    
    // STEP 2
    
    // Get time/directions
    
    
  
});

// - 404
app.get('*', function(req, res){
	res.render('404.jade', {
    title: 'Page not found', 
    req: req 
  });
});

// Start express
app.listen(process.env.VMC_APP_PORT || 1337);


// ------------------------------------------------------------------

// Helper functions

// - Render 
function getCalendar(lat, lon, callback) {
  
  // Starting date
  var start = moment();
  // If Wednesday or later, start with the following week
  if (start.day() > 4) {
    start = start.add('days', 7).day(0);
  }
  else {
    start = start.day(0);
  }
  // start = start.day(0);
  
  var calendar = [];
  var days = [];
  var available,
      special,
      price;
      
  // Get all bookings for next N work weeks
  var weeks_to_return = 4;
  var days_to_return = weeks_to_return * 7;
  var end = moment().add('days', days_to_return);// + 2
  
  // Loop controller
  var i = 20; // just want 20 weekdays, no weekends obv.
  
  Booking.find({
    date: { $gte: new Date(start.format()), $lte: new Date(end.format()) }
  }, [], {
    sort: [['date',1]]
  }, function (err, docs) {
    
    // Put the days into an associative array
    // So that I can ask for day['2012-07-03'] and get an object/null
    // var days = [];
    docs.forEach(function(item) {
      // console.log();
      var key = moment(item.date).format('YYYY-MM-DD');
      if (days[key]) {
        days[key].houses += item.houses;
        days[key].flats += item.flats;
      }
      else {
        days[key] = {lat:item.lat, lon:item.lon, houses:item.houses, flats:item.flats}
      }
    });
    console.log(days);
    
    // The fun starts here...
    for (var x = 0; x < days_to_return; x ++) {
      var cellday = start.add('days', 1);
      
      if (cellday.day() > 0 && cellday.day() < 6) {
      
        var key = cellday.format('YYYY-MM-DD');
        
        if (key <= moment().format('YYYY-MM-DD')) {
          i--;
          console.log(i);
          if (i <= 0)
          {
            //console.log(calendar);
            // calendar.sort();
            callback(calendar);
          }
          
          // It's in the past (or today), so mark it as unavailable
          calendar[key] = {available: false, special: false, date: cellday.format('ddd Do MMMM'), price: '£' + 950};
        }
        else if (days[key]) {
          // There are bookings, so here's where we need to do some location stuff to get the distance (or time)
          /*
          // USE THE HAVERSINE / BIG CIRCLE STUFF TO GET DISTANCE
          // WITHOUT USING A WEB SERVICE
          // using https://gist.github.com/1604972
          var start_latlon = {latitude: lat, longitude: lon};
          var end_latlon = {latitude: days[key].lat, longitude: days[key].lon};
          var distance_km = distance.getDistance(start_latlon, end_latlon);
          consot/e.log(distance_km);
          */
          
          // temp
          calendar[key] = {available: false, special: false, date: 'CHECKING', price: '£CHECKING'};
          
          var latlonstart = {lat: '51.4631671574552', lon: '-2.59007157677629'};
          var latlonend = { lat: days[key].lat, lon: days[key].lon };
          console.log('test.js Line 353');
          mapQuestGetTime(key, latlonstart, latlonend, function(body, stored_key){
             console.log(body.route);
            var seconds = body.route.time;
            var minutes = Math.ceil(body.route.time / 60);
            var hours = Math.ceil(body.route.time / (60 * 60));
            console.log(seconds + ', ' + minutes + ', ' + hours);
            if (minutes < time_cutoff) {
              // Still some time, let's go!
               console.log('// Still some time, let\'s go!');
              console.log(stored_key + ' s');
              calendar[stored_key] = {available: true, special: true, date: cellday.format('ddd Do MMMM'), price: '£' + price_special};
            }
            else {
              // Not enough time, mark it as full
               console.log('// Not enough time, mark it as full');
              console.log(stored_key + ' f');
              calendar[stored_key] = {available: false, special: false, date: cellday.format('ddd Do MMMM'), price: '£' + 0};
            }
            
            i--;
            console.log(i);
            if (i <= 0)
            {
              //console.log(calendar);
              // calendar.sort();
              callback(calendar);
            }
          });
        }
        else
        {
          // No bookings for this day, so mark it as available
          // console.log('// No bookings for this day, so mark it as available');
          calendar[key] = {available: true, special: false, date: cellday.format('ddd Do MMMM'), price: '£' + price_normal};
          
          i--;
          console.log(i);
          if (i <= 0)
          {
            //console.log(calendar);
            // calendar.sort();
            callback(calendar);
          }
        }
      }
      
      
            
        // i--;
        // // console.log(i);
        // if (i <= 0)
        // {
          // //console.log(calendar);
          // calendar.sort();
          // callback(calendar);
        // }
        
    }

      
    
    //callback(calendar);
  });
  
  //callback(calendar);
}

function mapQuestGetTime(x, start, end, callback){
   // console.log(start);
    console.log('test.js Line 423');
  var params = "&from="+start.lat+","+start.lon+"&to="+end.lat+","+end.lon;
  // params += "&callback=?";
  var apicall = "http://open.mapquestapi.com/directions/v1/route?outFormat=json"+params;
  request(apicall, function (error, response, body){
    // return callback(error, JSON.parse(body));
    // console.log(error);
    // console.log(response);
     console.log('test.js mapquestgetime');
    //callback(body);
    callback(JSON.parse(body), x);
  });
}
