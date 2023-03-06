/**
 * MACH! - helper functions for the sound test site
 */
 
console.log('                 [load] MACH! - helper functions for the sound test site')

// Modules
var request = require('request');
//var db = require('mongous').Mongous;
var mongoose = require('mongoose');
//mongoose.connect('mongodb://localhost/machsoundtest');


/**
 * Mongoose data models
 */

function defineModels(mongoose, engineerNames, bookedByNames, callback) {
  var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;
    
  searchLogSchema = new Schema({
    postcode: { type: String, trim: true },
    houses: { type: Number, default: 0 },
    flats: { type: Number, default: 0 },
  });
    
  geocodingSchema = new Schema({
    postcode: { type: String, trim: true },
    lat: { type: String, default: '' },
    lon: { type: String, default: '' },
  });
  
  enquirySchema = new Schema({
    date: Date,
    name: { type: String, trim: true },
    companyname: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    invoiceaddress: { type: String, trim: true },
    comment: { type: String, trim: true },
    postcode: { type: String, trim: true },
    timefromhq: { type: Number, default: 0 }, // Air tests
    testingday: { type: Number, default: 0 }, // Air tests
    //pairid: { type: String, trim: true },
    stack: { type: String, trim: true },
    stackid: { type: Number, default: 1},
    houses: { type: Number },
    flats: { type: Number },
    price: { type: String, trim: true }, // Amount quoted
    lat: { type: String, trim: true },
    lon: { type: String, trim: true },
  });
    
  bookingSchema = new Schema({
    // Test details
    date: Date, // Date
    engineer: { type: String, enum: 
      Object.keys(engineerNames)
    },
    starttime: { type: String, trim: true, default: '09:00' }, // Start time
    endtime: { type: String, trim: true, default: '10:00' }, // End time
    address: { type: String, trim: true, default: '' }, // Site address
    postcode: { type: String, trim: true, default: '' }, // Postcode
    name: { type: String, trim: true }, // Contact name
    phone: { type: String, trim: true, default: '' }, // Contact number
    
    // Invoice details
    jobnumber: { type: String, trim: true, default: '' }, // Job number
    companyname: { type: String, trim: true, default: '' }, // Company name
    invoiceaddress: { type: String, trim: true, default: '' }, // Invoice address
    email: { type: String, trim: true, lowercase: true }, // Invoice email
    invoicephone: { type: String, trim: true, default: '' }, // Phone number
    comments: { type: String, trim: true, default: '' }, // Invoice address
    instructions: { type: String, trim: true, default: '' }, // Invoice address
    // amountquoted: { type: Number, default: 0 }, // Amount quoted
    // additionalcosts: { type: Number, default: 0 }, // Additional costs
    amountquoted: { type: String, trim: true, default: '0' }, // Amount quoted
    additionalcosts: { type: String, trim: true, default: '0' }, // Additional costs

    // Booking info
    bookedby: { type: String, enum: 
		Object.keys(bookedByNames) }, // Booked by
    testtype1: { type: Boolean, default: false }, // Sound Insulation Testing
    testtype2: { type: Boolean, default: false }, // Air Pressure Testing
    testtype3: { type: Boolean, default: false }, // Sound and Air Testing
    testtype4: { type: Boolean, default: false }, // BS4142 Assessment
    testtype5: { type: Boolean, default: false }, // Environmental Noise Assessment
    testtype6: { type: Boolean, default: false }, // Noise Survey
    sagegroup: { type: Array, default: []}, // SAGE group options
    soundtests: { type: Number, default: 0 }, // Sound tests
    airtests: { type: Number, default: 0 }, // Air tests
    testingtime: { type: Number, default: 0 }, // Air tests
    existingtestingtime: { type: Number, defualt: 0 }, // Existing testing time on that day
    newtestingtime: { type: Number, default: 0 }, //New testing time (existingtestingtime + testingtime)
    
    // Other info
    status: { type: String, enum: [
      'Unconfirmed', 
      'Confirmed', 
      'Completed', 
    ] }, // Status
    drawingsrequested: { type: String, enum: [
      '', 
      'Yes', 
      'No', 
    ], default: ''},
    paid: { type: Boolean, default: false }, // Paid
    created: { type: Date, default: Date.now }, // Created
    lastupdated: { type: Date, default: Date.now }, // Last updated
    lat: { type: String, trim: true, default: '' },
    lon: { type: String, trim: true, default: '' },
    timefromhq: { type: Number, default: 0 }, // Air tests
    testingday: { type: Number, default: 0 }, // Air tests
    //pairid: { type: String, trim: true }, // Paired with test id
    stack: { type: String, trim: true, default: false },
    stackid: { type: Number, deafult: 1},
    // Unused fields
    // houses: { type: Number, default: 0 },
    // flats: { type: Number, default: 0 },
  });
    
  settingsSchema = new Schema({
    soundtesttime: { type: Number, default: 90 }, // minutes
    soundtestpricefirst: { type: Number, default: 450 }, // first test, gbp
    soundtestpricesubsequent: { type: Number, default: 350 }, // subsequent tests, gbp
    soundtestdiscountlocal: { type: Number, default: -100 }, // local discount, gbp
    airtesttime: { type: Number, default: 60 }, // minutes
    airtestpricefirst: { type: Number, default: 200 }, // first test, gbp
    airtestpricesubsequent: { type: Number, default: 60 }, // subsequent tests, gbp
    //Working day
    hoursperday: { type: Number, default: 9 }, 
    timebuffer: { type: Number, default: 60 }, 
    localtravel: { type: Number, default: 30 }, 
    stackdays: { type: Boolean, default: true }, 
    earliestleavetime: { type: Number, default: 540 }, //Earliest time someone can leave the office
    latestreturntime: { type: Number, default: 1140 }, //Latest someone should be back at the office
    //Discount
    noticelimit: { type: Number, default: 1 }, 
    shortnotice: { type: Number, default: 2 }, 
    longnotice: { type: Number, default: 10 }, 
    shortdiscount: { type: Number, default: 50 }, 
    longdiscount: { type: Number, default: -50 }, 
    //App settings
    bookingemail: { type: String, trim: true, lowercase: true }, // Booking email
    postcode: { type: String, trim: true },
    lat: { type: String, default: '' },
    lon: { type: String, default: '' },
  });
  
  holidaySchema = new Schema({
    holidayDate: Date
  });

  mongoose.model('SearchLog', searchLogSchema);
  mongoose.model('Geocoding', geocodingSchema);
  mongoose.model('Enquiry', enquirySchema);
  mongoose.model('Booking', bookingSchema);
  mongoose.model('Settings', settingsSchema);
  mongoose.model('Holiday', holidaySchema);
  
  callback();
}
exports.defineModels = defineModels; 


/**
 * Geocode an address
 */
exports.geocode = function (postcode, callback, onError) {
  //var apicall = 'http://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(postcode) + ',UK&format=json&polygon=0&addressdetails=0&limit=1&callback=?';
  var apicall = "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(postcode) + "&key=AIzaSyAqgpx4UjyYH1GL_KHnja01kJyifie0h-Y";
  console.log('geocoded: ' + apicall);
  request(apicall, function (error, response, body){
    return callback(error, JSON.parse(body));
  });
};

/**
 * Get route information for 2 points
 */
exports.mapQuestGetTime = function mapQuestGetTime(date, discount, timehq, timet, id, /*pairid,*/stack, stackid, start, end, callback){
    //console.log(start);
    console.log('mach.js mapquestgetime');
    //console.log('mach.js pairid' + pairid);
    console.log('stack id: ' + stackid);
  var params = "&from="+start.lat+","+start.lon+"&to="+end.lat+","+end.lon;
  var apicall = "http://open.mapquestapi.com/directions/v1/route?key=Fmjtd%7Cluubn16z2g%2C8g%3Do5-90aauz&outFormat=json"+params;
  request(apicall, function (error, response, body){
    //console.log(JSON.parse(body));
    callback(JSON.parse(body), date, discount, timehq, timet, id, stack, stackid/*, pairid*/);
  });
};

exports.mapQuestGetTime2 = function mapQuestGetTime2(start, end, callback){
    //console.log(start);
    console.log('mach.js mapquestgetime');
    //console.log('mach.js pairid' + pairid);
    
  var params = "&from="+start.lat+","+start.lon+"&to="+end.lat+","+end.lon;
  var apicall = "http://open.mapquestapi.com/directions/v1/route?key=Fmjtd%7Cluubn16z2g%2C8g%3Do5-90aauz&outFormat=json"+params;
  request(apicall, function (error, response, body){
    //console.log(JSON.parse(body));
    callback(JSON.parse(body));
  });
};
/**
 * Get route information for a point following this point
 */
exports.mapQuestGetafterpoint = function mapQuestGetaftrpoint(date, discount, timehq, timet, id, /*pairid,*/ stack, stackid, start, end, callback){
    //console.log(start);
    console.log('mach.js mapquestgetime');
    //console.log('mach.js pairid' + pairid);
  var params = "&from="+start.lat+","+start.lon+"&to="+end.lat+","+end.lon;
  var apicall = "http://open.mapquestapi.com/directions/v1/route?key=Fmjtd%7Cluubn16z2g%2C8g%3Do5-90aauz&outFormat=json"+params;
  request(apicall, function (error, response, body){
    //console.log(JSON.parse(body));
    callback(JSON.parse(body), date, discount, timehq, timet, id, stack, stackid/*,pairid*/);
  });
};
/*
 *Get travel time from HQ
 */
exports.mapQuestFromHQ = function mapQuestFromHQ(start, end, callback){
  //console.log(start);
  var params = "&from="+start.lat+","+start.lon+"&to="+end.lat+","+end.lon;
  var apicall = "http://open.mapquestapi.com/directions/v1/route?key=Fmjtd%7Cluubn16z2g%2C8g%3Do5-90aauz&outFormat=json"+params;  
  console.log(apicall);
  request(apicall, 
    function (error, response, body){
    	try {
    		var result = JSON.parse(body).route.time;
    	} catch (err) {
    		console.log('Cannot get route.time from response: ' + body);
    		throw (err);
    	}
      	callback(JSON.parse(body).route.time);
  });
};
/*
 *Get testing day
 */
exports.testingDay = function testingDay(date, start, end, hq){
  //console.log(start);
  var params = "&from="+start.lat+","+start.lon+"&to="+end.lat+","+end.lon;
  var apicall = "http://open.mapquestapi.com/directions/v1/route?outFormat=json"+params;
  request(apicall, function (error, response, body){
    //console.log(JSON.parse(body));
    callback(JSON.parse(body), date);

  });
};
/**
 * Log a search query
 */
// exports.logsearch = function (query, callback) {
  // var s = new SearchLog(query);
  // s.save(function() {
    // return callback();
  // });
// };

/**
 * Create a random string
 */
// http://stackoverflow.com/questions/5815349/how-do-i-use-this-function-in-node-js
exports.randomString = function (min, max) {
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
  var string_length = min + Math.round(Math.random() * (max - min));
  var str = '';
  for (var i=0; i<string_length; i++) {
    var rnum = Math.floor(Math.random() * chars.length);
    str += chars.substring(rnum,rnum+1);
  }
  // console.log('str - ' + str);
  return str;
}

/**
 * Create a random number
 */
exports.randomNumber = function (min, max) {
  var num = min + Math.round(Math.random() * (max - min));
  // console.log('min - ' + min + ', max - ' + max + ', num - ' + num);
  return num;
}

