/**
 * MACH Acoustics sound test booking system

 NOTE: This uses bundledDependancies so when deploying use:

 $ modulus deploy -m
 
 */

/*
TODO
- cleanup old records on cron
- testing123
*/

// Canonical URL
var live_url = 'www.easysoundtest.com';
var development_url = '127.0.0.1';
var devMode = process.env.NODE_ENV !== 'production';
var devEmail = 'support@machacoustics.com';
var errorEmail = 'support@machacoustics.com';
var current_url;

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
var postmark = require("postmark")("bc6f748f-1486-4ffb-a06f-a4ea22741273");
var mongoose = require('mongoose');
var moment = require('moment');

// values for SAGE Group checkboxes on booking form 
var sageGroupNames = {
    'sound': { name: 'Sound Testing', abbreviation: 'ST' },
    'soundbig': { name: 'Sound Testing Big (Fee Proposal)', abbreviation: 'STB' },
    'air': { name: 'Air Testing', abbreviation: 'AT' },
    'airbig': { name: 'Air Testing Big (Fee Proposal)', abbreviation: 'ATB' },
    'breaam': { name: 'BREAAM Testing', abbreviation: 'BT' },
    'noise': { name: 'Noise Assessment', abbreviation: 'NA' },
    'parte': { name: 'Part-E Design', abbreviation: 'PED' },
    'misc': { name: 'Miscellaneous', abbreviation: 'MIS' }
}
// names of staff members and whether they are selectable (ie currently working at company) in a dropdown 
var staffNames = {
    'Ze Nunes': { selectable: true },
    'Stefan Hannan': { selectable: true },
    'Andrew Rickard': { selectable: true },
    'Phil Jordan': { selectable: true },
    'Patrick Shuttleworth': { selectable: true },
    'Josh Childs': { selectable: true },
    'Max Reynolds': { selectable: true },
    'Chris Jones': { selectable: true },
    'Zoe Vernon': { selectable: true },
    'Yang Wang': { selectable: true },
    'Leonard Terry': { selectable: true },
    'Steffan Davies': { selectable: true },
    'Dean Thompson': { selectable: true },
    'Rory Peliza': { selectable: true },
    'Claire Bye': { selectable: true },
    'Lewis Wheatley': { selectable: true },
	'Jonny Maguire': { selectable: true },
    'Adam Bertenshaw': { selectable: true },
    'Tracy Toal': { selectable: false },
    'CANCELLED': { selectable: true },
    'POSTPONED': { selectable: true },
    'AWAITING CANCELATION': { selectable: true },
	'NOT INVOICED': { selectable: true },

};
var bookedByNames = _.extend({ 'EasySoundTest': { selectable: true } }, staffNames);
var engineerNames = _.extend({ '': { selectable: true } }, staffNames);

// var async = require('async');

// Log message
console.log(moment().format('YYYY-MM-DD hh:mm') + ' [init] MACH Acoustics sound test booking system');

// Custom modules
var mach = require('./mach');
var distance = require('./distance');
var postcheck = require('./postcode');

var SearchLog,
    Geocoding,
    Enquiry,
    Booking,
    Engineer,
    db,
    User,
    LoginToken;

// Init express
var app = express.createServer();

current_url = 'www.easysoundtest.com';
//current_url='127.0.0.1';
// Redirect to canonical URL
// app.use(function(req, res, next) { 
//   current_url = req.headers.host.split(':',1)[0];
//   if(current_url != canonical_url && current_url != development_url) { 
//     return res.redirect(301, 'https://'+canonical_url+req.url);
//   }
//   else if (current_url == canonical_url && req.headers["x-forwarded-proto"] != 'https') {
//     return res.redirect('https://'+canonical_url+req.url);
//   }
//   next();
// });

// Express middleware
//app.use(app.router);

// robots.txt file, shows disallow all for dev version


app.use(express.favicon(__dirname + '/public/favicon.ico'));
app.use(express.bodyParser());
app.use(express.static(__dirname + '/public'));

// app.use(require('less-middleware')({ src: __dirname + '/public' }))

//app.use(stylus.middleware({ src: __dirname + '/public' }));
// app.use(express.logger(...));
// app.use(express.bodyParser(...));
// app.use(express.cookieParser(...));

// Express settings
app.set('view engine', 'jade');
app.set('view options', {
    layout: false,
});


app.get('/robots.txt', function (req, res) {
    res.contentType('text');
    if (devMode) {
        res.send('User-agent: * \nDisallow: /');
    } else {
        res.send('');
    }
});



// Business logic/variables
var distance_cutoff = 20; // will trigger special offer if closer than this (km)
var time_cutoff = 60; // will trigger special offer if closer than this (minutes)
// var price_normal = settings.soundtestpricefirst;
// var price_special = settings.soundtestpricespecial;

var hq = {
    postcode: 'BS1 3RD',
    latLng: {
        lat: '51.4631671574552',
        lon: '-2.59007157677629'
    },
};

var app_error = null;

// MACH business logic/formula settings
// These are the defaults
var settings = {
    soundtest_time: 90,
    soundtest_pricefirst: 450,
    soundtest_discountlocal: -100,
    soundtest_pricesubsequent: 350,
    airtest_time: 60,
    airtest_pricefirst: 200,
    airtest_pricesubsequent: 60,
    hoursperday: 9,
    time_buffer: 60,
    local_travel: 30,
    stackdays: true,
    earliestleavetime: 540,
    latestreturntime: 1140,
    bookingemail: {
        subject: 'MACH sound test booking',
        from: 'info@machtesting.co.uk',
        to: 'john.w@machtesting.co.uk',
    },
    dataexportemail: {
        subject: 'Exported booking details',
        // from: 'derek@sharpshooter.org',
        from: 'info@machtesting.co.uk',
        to: 'john.w@Machacoustics.com',
    },
    dataexportattachmentname: 'booking{REF}.csv',
};
//console.log(settings);


// Define Mongo models
mach.defineModels(mongoose, engineerNames, bookedByNames, function () {
    app.SearchLog = SearchLog = mongoose.model('SearchLog');
    app.Geocoding = Geocoding = mongoose.model('Geocoding');
    app.Enquiry = Enquiry = mongoose.model('Enquiry');
    app.Booking = Booking = mongoose.model('Booking');
    app.Settings = Settings = mongoose.model('Settings');
    app.Holiday = Holiday = mongoose.model('Holiday');
    // app.Engineers = Engineers = mongoose.model('Engineers');
    // app.User = User = mongoose.model('User');
    // app.LoginToken = LoginToken = mongoose.model('LoginToken');

    // APPFOG db connection details
    // http://support.appfog.com/entries/21271312-binding-services-mysql-mongo-postgres-etc-with-node-js

    //     var env = JSON.parse(process.env.VCAP_SERVICES);
    //     var mongo = env['mongodb-2.4.7'][0]['credentials'];
    // //    var mongo_conn = 'mongodb://johnmach:susacoustics@ds053958.mongolab.com:53958/machsoundtest';
    //Switch between dev db and cloud
    if (!devMode) {
        mongoose.connect('mongodb://johnmach:susacoustics@ds053958.mongolab.com:53958/machsoundtest', function (err) {
            console.log('Using live db-1');
            if (err) {
                // throw err;
                app_error = "Can't connect to the data store";
            }
        });
    }
    else {
        mongoose.connect('mongodb://johnmach:susacoustics@ds053958.mongolab.com:53958/machsoundtest', function (err) {
            console.log('Using live db-2');
            if (err) {
                // throw err;
                app_error = "Can't connect to the data store";
            }
        });
    }
});

// Get live settings from the Mongo DB
function getSettings() {
    Settings.find().sort('-_id').limit(1).find(function (err, docs) {

        if (!_.isUndefined(docs) && docs.length > 0) {

            // Get the first document
            docs = docs[0];

            settings.soundtest_time = docs.soundtesttime;
            settings.soundtest_pricefirst = docs.soundtestpricefirst;
            settings.soundtest_discountlocal = docs.soundtestdiscountlocal;
            settings.soundtest_pricesubsequent = docs.soundtestpricesubsequent;
            settings.airtest_time = docs.airtesttime;
            settings.airtest_pricefirst = docs.airtestpricefirst;
            settings.airtest_pricesubsequent = docs.airtestpricesubsequent;
            settings.localtravel = docs.hoursperday;
            settings.stackdays = docs.stackdays;
            settings.bookingemail.to = docs.bookingemail;
            settings.time_buffer = docs.timebuffer;
            settings.local_travel = docs.localtravel;
            settings.noticelimit = docs.noticelimit;
            settings.shortnotice = docs.shortnotice;
            settings.longnotice = docs.longnotice;
            settings.shortdiscount = docs.shortdiscount;
            settings.longdiscount = docs.longdiscount;
            settings.earliestleavetime = docs.earliestleavetime;
            settings.latestreturntime = docs.latestreturntime;
            hq.postcode = docs.postcode;
            hq.latLng.lat = docs.lat;
            hq.latLng.lon = docs.lon;
        }

        //console.log('Using live settings');
        console.log('settings');
        //console.log(hq);
    });
}
getSettings();

// Authorisation
// Using connect's basic auth for now
// http://www.giantflyingsaucer.com/blog/?p=3530
// https://groups.google.com/forum/#!msg/express-js/ToqP9qTkYNA/VGI1qQY8E0wJ
// add this to a route:
// , express.basicAuth(authorize)
// eg. app.get('/admin', express.basicAuth(authorize), function(req, res){
function authorize(username, password) {
    // return true;
    return 'mach' === username & 'm4ch!' === password;
}


// - Home page
app.get('/', function (req, res) {

    if (!_.isNull(app_error)) {
        res.render('error.jade', {
            title: app_error,
            req: req,
        });
    }

    var title = '3 steps to a cheaper sound test&hellip;';

    res.render('home.jade', {
        title: title,
        postcode: '',
        houses: '',
        flats: '',
    });

});

// - Home page for iframe machtesting.co.uk
app.get('/home-iframe', function (req, res) {

    if (!_.isNull(app_error)) {
        res.render('error.jade', {
            title: app_error,
            req: req,
        });
    }

    var title = '3 steps to a cheaper sound test&hellip;';

    res.render('home-iframe.jade', {
        title: title,
        postcode: '',
        houses: '',
        flats: '',
        airtests: '',
    });

});

// - Location search
app.get('/search', function (req, res) {

    var title = '3 steps to a cheaper sound test&hellip;';

    res.render('search.jade', {
        title: title,
        postcode: '',
        houses: '',
        flats: '',
        airtests: '',
    });

});

// - Location search results
app.post('/search/results', function (req, res) {

    var title = '3 steps to a cheaper sound test&hellip;';

    // Get the number of properties to test
    var houses = parseInt(req.body.houses) || 0;
    var flats = parseInt(req.body.flats) || 0;

    var postcode = postcheck.checkPostCode(req.body.postcode);

    // Validate user input
    var error = null;
    if (!postcode || (houses === 0 && flats === 0)) {
        error = 'Please enter a valid postcode and the number of houses or flats you want to test.';
    }
    else if ((houses > 0 && houses < 2) || (flats > 0 && flats < 2)) {
        error = 'Please enter a minimum of 2 houses or 2 flats.';
    }
    else if ((houses + flats) > 100) {
        res.redirect('/booking/form/custom');
        return;
    }

    // If there are errors, stop now
    if (!_.isNull(error)) {
        // Render the page
        res.render('search-results.jade', {
            title: title,
            error: error,
            postcode: req.body.postcode,
            houses: req.body.houses,
            flats: req.body.flats,
            airtests: req.body.airtests,
            lat: null,
            lon: null,
            results: null,
            token: 'sr' + mach.randomNumber(100000, 999999),
            requirements: null,
        });
    }
    else {

        // Log the search query
        // var s = new SearchLog(req.body);
        // s.save();

        // Trim the postcode
        //var postcode = _.str.trim(postcode);

        // Lat/lon
        var lat = '';
        var lon = '';



        // STEP 1

        Geocoding.find({ postcode: postcode }, function (err, docs) {
            // Check for db errors
            if (!_.isNull(err)) {
                res.render('error.jade', {
                    title: 'Can\'t load this page',
                    req: req,
                });

            }

            else {

                // Is it in the cache?
                if (docs[0]) {
                 //   console.log('Yes, we can use existing details');
                    //console.log(postcode);
                    lat = docs[0].lat;
                    lon = docs[0].lon;

                    // Get calendar
                    console.log('calendar-notgot');
                    var calendar = getCalendar(lat, lon, function (calendar) {
                         console.log('calendar-got');
                        // Send the customer to the custom booking screen if they are too far away
                        for (var x in calendar) {
                            if (calendar[x].outbounds) {
                                res.redirect('/booking/form/custom');
                                return;
                            }
                        }
                        // Requirements
                        var requirements = getRequirements(houses, flats);

                        // Render the page
                        res.render('search-results.jade', {
                            title: title,
                            error: error,
                            postcode: postcode,
                            houses: req.body.houses,
                            flats: req.body.flats,
                            airtests: req.body.airtests,
                            lat: lat,
                            lon: lon,
                            results: calendar,
                            token: 'sr' + mach.randomNumber(100000, 999999),
                            requirements: requirements,
                        });

                    });

                }
                else {
                  //  console.log('No, let\'s look it up and add it');
                    //console.log(postcode);
                    // No, let's look it up and add it
                    // Use the free Nominatim geocoding service
                    mach.geocode(postcode, function (error, body) {
                        if (_.isEmpty(body)) {
                            error = 'Sorry, we can\'t find that location. Please try again with another postcode.';

                            // Render the page
                            res.render('search-results.jade', {
                                title: title,
                                error: error,
                                postcode: postcode,
                                houses: req.body.houses,
                                flats: req.body.flats,
                                airtests: req.body.airtests,
                                lat: null,
                                lon: null,
                                results: null,
                                token: 'sr' + mach.randomNumber(100000, 999999),
                                requirements: null,
                            });
                        }
                        else {
                            lat = body.results[0].geometry.location.lat;
                            lon = body.results[0].geometry.location.lng;
                            console.log('Latitude' + lat);
                            console.log('Longitude' + lon);

                            // Cache the response
                            var g = new Geocoding({
                                postcode: postcode,
                                lat: body.results[0].geometry.location.lat,
                                lon: body.results[0].geometry.location.lng
                            });
                            g.save();

                            // Get calendar
                            var calendar = getCalendar(lat, lon, function (calendar) {
                                // console.log('calendar');
                                // console.log(calendar);
                                // Send the customer to the custom booking screen if they are too far away
                                for (var x in calendar) {
                                    if (calendar[x].outbounds) {
                                        res.redirect('/booking/form/custom');
                                        return;
                                    }
                                }

                                // Requirements
                                var requirements = getRequirements(houses, flats);

                                // Render the page
                                res.render('search-results.jade', {
                                    title: title,
                                    error: error,
                                    postcode: postcode,
                                    houses: req.body.houses,
                                    flats: req.body.flats,
                                    airtests: req.body.airtests,
                                    lat: lat,
                                    lon: lon,
                                    results: calendar,
                                    token: 'sr' + mach.randomNumber(100000, 999999),
                                    requirements: requirements,
                                });

                            });

                        }
                    }, sendError);
                }
            }
        });



        // STEP 2

        // Get time/directions


    }

});

app.get('/booking/form/custom', function (req, res) {
    // Form fields
    var date = req.body.date;
    var postcode = req.body.postcode;
    var houses = req.body.houses;
    var flats = req.body.flats;
    var token = req.body.token;
    var name = req.body.name;
    var email = req.body.email;
    var phone = req.body.phone;
    var address = req.body.address;
    var comment = req.body.comment;

    // Booking model
    var b = new Enquiry({
        date: (date) ? Date.parse(date).toString('yyyy-MM-dd') : new Date().toString('yyyy-MM-dd'),
        name: (name) ? name : '',
        email: (email) ? email : '',
        phone: (phone) ? phone : '',
        address: (address) ? address : '',
        comment: (comment) ? comment : '',
        postcode: (postcode) ? postcode : '',
        houses: (houses) ? houses : 0,
        flats: (flats) ? flats : 0,
        lat: '',
        lon: '',
        // price: 0,
        // engineer: '0'
        // confirmed: false,
    });

    // Page fields
    var title = 'Book a sound test with us';
    var error = null;

    res.render('booking-form-custom.jade', {
        title: title,
        booking: b,
        // bookingid: bookingid,
        token: 'bfc' + mach.randomNumber(100000, 999999),
        error: error,
    });
});

// - Display the public booking form - what you see once you've searched and clicked on a date.
app.post('/booking/form', function (req, res) {
    // Form fields
    var date = req.body.date;
    var postcode = req.body.postcode;
    var houses = req.body.houses;
    var flats = req.body.flats;
    var price = req.body.price;
    var token = req.body.token;
    var name = req.body.name;
    var companyname = req.body.companyname;
    var email = req.body.email;
    var phone = req.body.phone;
    var address = req.body.address;
    var invoiceaddress = req.body.invoiceaddress;
    var comment = req.body.comment;
    //var starttime = calendar[key_cal].starttime;
    //var endtime = calendar[key_cal].endtime;

    var timefromhq = req.body.timefromhq;
    var testingday = req.body.testingday;
    var testingtime = settings.soundtest_time + settings.time_buffer;
    //var pairid = req.body.pairid;
    var stack = req.body.stack;
    var stackid = req.body.stack;
    var lat = req.body.lat;
    var lon = req.body.lon;
    var existingtestingday = req.body.existingtestingday;
    var newtestingday = req.body.newtestingday;
    // Page fields
    var title = 'Book a sound test with us';
    var error = null;


    // Booking model
    var b = new Enquiry({
        date: Date.parse(date).toString('yyyy-MM-dd'),
        name: (name) ? name : '',
        email: (email) ? email : '',
        phone: (phone) ? phone : '',
        address: (address) ? address : '',
        invoiceaddress: (invoiceaddress) ? invoiceaddress : '',
        companyname: (companyname) ? companyname : '',
        comment: (comment) ? comment : '',
        postcode: postcode,
        houses: (houses) ? houses : 0,
        flats: (flats) ? flats : 0,
        price: (price) ? price : 0,
        testingday: (testingday) ? testingday : 120,
        testingtime: (testingtime) ? testingtime : 60,
        timefromhq: (timefromhq) ? timefromhq : 60,
        //pairid: (pairid) ? pairid : '',
        stack: (stack) ? stack: false,
        stackid: (stackid) ? stackid: 1,
        lat: (lat) ? lat : '',
        lon: (lon) ? lon : '',
        existingtestingday: (existingtestingday) ? existingtestingday : 0,
        newtestingday: (newtestingday) ? newtestingday : existingtestingday + testingday,
        //starttime: (startime) ? startime: '',
        //endtime: (endtime) ? endtime: '',
        // price: 0,
        // engineer: '0'
        // confirmed: false,
    });

    // Validation
    // console.log(token);
    //console.log(_(token).startsWith('bf'));
    if (_.isEmpty(name) || _.isEmpty(email) || _.isEmpty(date) || _.isEmpty(postcode) || (_.isEmpty(houses) && _.isEmpty(flats))) {
        // if (_(token).startsWith('bf')) {
        error = 'Please enter your details.';
        // }
    }
    else if ((parseInt(req.body.houses) > 0 && parseInt(req.body.houses) < 2) || (parseInt(req.body.flats) > 0 && parseInt(req.body.flats) < 2)) {
        error = 'Please enter a minimum of 2 houses or flats.';
    }

    // Show errors...
    if (error !== null) {
        if (_(token).startsWith('bfc')) {
            res.render('booking-form-custom.jade', {
                title: title,
                booking: b,
                // bookingid: bookingid,
                token: 'bfc' + mach.randomNumber(100000, 999999),
                error: error,
            });
        }
        else {
            res.render('booking-form.jade', {
                title: title,
                booking: b,
                // bookingid: bookingid,
                token: 'bf' + mach.randomNumber(100000, 999999),
                error: error,
            });
        }
    }
    else {
        // Send emails and redirect to the thank-you page
        // Use postmark to send emails
        var messagebody = '';
        messagebody += 'New booking' + "\n";
        messagebody += 'Date    : ' + date.toString('yyyy-MM-dd') + "\n";
        messagebody += 'Postcode: ' + postcode + "\n";
        messagebody += 'Houses  : ' + houses + "\n";
        messagebody += 'Flats   : ' + flats + "\n";
        messagebody += 'Price   : ' + price + "\n";
        messagebody += "\n";
        messagebody += 'Name    : ' + name + "\n";
        messagebody += 'Invoice Name    : ' + companyname + "\n";
        messagebody += 'Email   : ' + email + "\n";
        messagebody += 'Phone   : ' + phone + "\n";
        messagebody += 'Address : ' + address.replace("\n", "\n          ") + "\n";
        messagebody += 'Invoice Address : ' + invoiceaddress.replace("\n", "\n          ") + "\n";
        messagebody += "\n";
        messagebody += 'Comment : ' + comment + "\n";
        messagebody += "\n";
        messagebody += '--------------------' + "\n";
        messagebody += 'Date: ' + new Date().toString() + "\n";
        messagebody += 'IP address: ' + req.connection.remoteAddress + "\n";
        var postmarkmessage = {
            "From": settings.bookingemail.from,
            "To": devMode ? devEmail : settings.bookingemail.to,
            "Subject": settings.bookingemail.subject,
            "TextBody": messagebody,
        };
        if (settings.bookingemail.bcc && !devMode) {
            postmarkmessage.Bcc = settings.bookingemail.bcc;
        }
        //console.log(postmarkmessage);
        //postmark.send(postmarkmessage);//////////////////////////////////////////

        //Save the booking as unconfirmed to ensure the day doesnt double book
        //--------------------
        var btemp = new Booking({
            date: date,
            //starttime: settings.earliestleavetime + (timefromhq * 1.2) ,
            endtime: endtime,
            address: address,
            invoiceaddress: invoiceaddress,
            postcode: postcode,
            name: name,
            companyname: companyname,
            phone: phone,
            email: email,
            comments: comment,
            amountquoted: price,
            houses: houses,
            flats: flats,

            bookedby: 'EasySoundTest',
            testtype1: true,
            soundtests: 1,
            testingtime: testingtime,
            timefromhq: timefromhq,
            testingday: testingday,
            //pairid: pairid,
            stack: stack,
            stackid: stackid,
            existingtestingday: existingtestingday,
            newtestingday: newtestingday,

            lat: lat,
            lon: lon,
            status: 'Unconfirmed',
            drawingsrequested: '',
            starttime: starttime //settings.earliestleavetime + timefromhq,
        });

        //Update the pair of this booking
        /*if (pairid) {
            Booking.findOne({ _id: pairid }, {}, {}, function (err, docs) {
                docs.testingday = testingday;
                docs.pairid = btemp._id;
                docs.save();
            });
        }*/
        btemp.save(function (err, docs) {

            // Redirect
            res.redirect('/booking/confirmed');
            console.log('btemp = ' + btemp);
            console.log('Unconfirmed booking saved');
        });
    }
});

// - Public booking form
app.get('/booking/confirmed', function (req, res) {

    var title = 'Thank you for booking a sound test with us';

    res.render('booking-confirmation.jade', {
        title: title,
        error: null,
    });

});

// - Generate dummy content
app.get('/devel/generate/booking', express.basicAuth(authorize), function (req, res) {
    // Create a dummy booking
    var b = new Booking({
        date: new Date('2013-12-' + mach.randomNumber(1, 28)),
        starttime: '09:00',
        endtime: '10:00',
        name: 'John',
        phone: mach.randomNumber(0, 9 * 10000000),
        jobnumber: mach.randomNumber(0, 10000000),
        companyname: 'John Acoustics',
        email: 'john.bloggs@gogo.com',
        soundtests: 1,
        testingtime: 90,
        invoicephone: mach.randomNumber(0, 9),
        testingday: 160,
        timefromhq: 10,

        // email: '',
        // phone: '',
        // address: '',
        postcode: 'BS7 8NT',
        houses: mach.randomNumber(0, 4),
        flats: mach.randomNumber(0, 8),
        lat: '51.4770208',
        lon: '-2.5902321',
        //engineer: 'engineer',
        confirmed: true,
    });
    b.save(function (err, docs) {
        res.redirect('/admin/booking/calendar');
        console.log('Dev booking created on ' + b.date);
    });
});

// - Admin dashboard
app.get('/admin', express.basicAuth(authorize), function (req, res) {
    // res.send('Admin dashboard');
    res.redirect('/admin/booking/calendar');
});

// - Admin settings
app.get('/admin/settings', express.basicAuth(authorize), function (req, res) {
    var error = null;
    Settings.find().sort('-_id').limit(1).find(function (err, docs) {

        if (!_.isUndefined(docs) && docs.length > 0) {

            console.log('Docs' + docs);
            // Get the first document
            docs = docs[0];

            res.render('admin-settings.jade', {
                title: 'Settings',
                settingsid: docs._id,
                docs: docs,
                error: null,
                req: req,
            });
        }
        else {

            var settings = new Settings({
                soundtesttime: 90,
                soundtestpricefirst: 450,
                soundtestpricesubsequent: 350,
                soundtestdiscountlocal: -100,
                airtesttime: 60,
                airtestpricefirst: 200,
                airtestpricesubsequent: 60,
                hoursperday: 9,
                timebuffer: 60,
                localtravel: 30,
                stackdays: true,
                earliestleavetime: 540,
                latestreturntime: 1140,

                noticelimit: 1,
                shortnotice: 2,
                longnotice: 10,
                shortdiscount: 50,
                longdiscount: -50,

                bookingemail: 'info@machtesting.co.uk',
                postcode: 'BS1 3RD',
                lat: '51.4631671574552',
                lon: '-2.59007157677629'
            });
            //console.log(settings);

            res.render('admin-settings.jade', {
                title: 'Settings',
                settingsid: '',
                docs: settings,
                error: null,
                req: req,
            });
        }
    });
});

// - Save admin settings
app.post('/admin/settings/save', express.basicAuth(authorize), function (req, res) {
    var error = null;

    // Settings
    var soundtesttime = req.body.soundtesttime; // Sound test time
    var soundtestpricefirst = req.body.soundtestpricefirst; // Sound test prices
    var soundtestpricesubsequent = req.body.soundtestpricesubsequent; // 
    var soundtestdiscountlocal = req.body.soundtestdiscountlocal; // 
    var airtesttime = req.body.airtesttime; // Air test time
    var airtestpricefirst = req.body.airtestpricefirst; // Air test prices
    var airtestpricesubsequent = req.body.airtestpricesubsequent; // 
    var hoursperday = req.body.hoursperday; // Tester details
    var timebuffer = req.body.timebuffer;
    var localtravel = req.body.localtravel;
    var stackdays = req.body.stackdays;
    var earliestleavetime = req.body.earliestleavetime;
    var latestreturntime = req.body.latestreturntime;
    var noticelimit = req.body.noticelimit;
    var shortnotice = req.body.shortnotice;
    var longnotice = req.body.longnotice;
    var shortdiscount = req.body.shortdiscount;
    var longdiscount = req.body.longdiscount;
    var bookingemail = req.body.bookingemail; // Booking details
    var postcode = postcheck.checkPostCode(req.body.postcode); // Contact number
    var lat = req.body.lat; // Contact number
    var lon = req.body.lon; // Contact number

    var settingsid = req.body.settingsid; // _id

    //Set checkbox toggle
    if (!stackdays) {
        stackdays = false;
    }

    Settings.findOne({
        _id: settingsid
    }, {}, {}, function (err, docs) {
        if (!_.isUndefined(docs)) {

            // It exists, let's update it

            docs.soundtesttime = soundtesttime;
            docs.soundtestpricefirst = soundtestpricefirst;
            docs.soundtestpricesubsequent = soundtestpricesubsequent;
            docs.soundtestdiscountlocal = soundtestdiscountlocal;
            docs.airtesttime = airtesttime;
            docs.airtestpricefirst = airtestpricefirst;
            docs.airtestpricesubsequent = airtestpricesubsequent;
            docs.hoursperday = hoursperday;
            docs.timebuffer = timebuffer;
            docs.localtravel = localtravel;
            docs.stackdays = stackdays;
            docs.earliestleavetime = earliestleavetime;
            docs.latestretutntime = latestreturntime;
            docs.noticelimit = noticelimit;
            docs.shortnotice = shortnotice;
            docs.longnotice = longnotice;
            docs.shortdiscount = shortdiscount;
            docs.longdiscount = longdiscount;
            docs.bookingemail = bookingemail;
            docs.postcode = postcode;
            docs.lat = lat;
            docs.lon = lon;

            docs.save(function (err, doc) {
                // console.log(err);
                // console.log(doc);
                if (_.isNull(err)) {

                    // Update the settings onject
                    settings.soundtest_time = docs.soundtesttime;
                    settings.soundtest_pricefirst = docs.soundtestpricefirst;
                    settings.soundtest_discountlocal = docs.soundtestdiscountlocal;
                    settings.soundtest_pricesubsequent = docs.soundtestpricesubsequent;
                    settings.airtest_time = docs.airtesttime;
                    settings.airtest_pricefirst = docs.airtestpricefirst;
                    settings.airtest_pricesubsequent = docs.airtestpricesubsequent;
                    settings.hoursperday = docs.hoursperday;
                    settings.time_buffer = docs.timebuffer;
                    settings.localtravel = docs.localtravel;
                    settings.stackdays = docs.stackdays;
                    settings.earliestleavetime = docs.earliestleavetime;
                    settings.latestreturntime = docs.latestreturntime;
                    settings.noticelimit = docs.noticelimit;
                    settings.shortnotice = docs.shortnotice;
                    settings.longnotice = docs.longnotice;
                    settings.shortdiscount = docs.shortdiscount;
                    settings.longdiscount = docs.longdiscount;
                    settings.bookingemail.to = docs.bookingemail;

                    hq.postcode = docs.postcode;
                    hq.latLng.lat = docs.lat;
                    hq.latLng.lon = docs.lon;

                    //res.redirect('/admin/settings');
                    res.redirect('/admin');
                }
                else {
                    // console.log(err);
                    res.render('admin-error.jade', {
                        title: 'Sorry, your settings were not saved.',
                        req: req,
                    });
                }
            });
        }
        else {
            var s = new Settings({
                soundtesttime: soundtesttime,
                soundtestpricefirst: soundtestpricefirst,
                soundtestpricesubsequent: soundtestpricesubsequent,
                soundtestdiscountlocal: soundtestdiscountlocal,
                airtesttime: airtesttime,
                airtestpricefirst: airtestpricefirst,
                airtestpricesubsequent: airtestpricesubsequent,
                hoursperday: hoursperday,
                timebuffer: timebuffer,
                localtravel: localtravel,
                stackdays: stackdays,
                earliestleavetime: earliestleavetime,
                latestreturntime: latestreturntime,
                noticelimit: noticelimit,
                shortnotice: shortnotice,
                longnotice: longnotice,
                shortdiscount: shortdiscount,
                longdiscount: longdiscount,
                bookingemail: bookingemail,
                postcode: postcode,
                lat: lat,
                lon: lon
            });

            s.save(function (err, doc) {
                // console.log(err);
                // console.log(doc);
                if (_.isNull(err)) {
                    //res.redirect('/admin/settings');
                    res.redirect('/admin');
                }
                else {
                    // console.log(err);
                    res.render('admin-error.jade', {
                        title: 'Sorry, your settings were not saved.',
                        req: req,
                    });
                }
            });
        }
    });
});

// - List all bookings
app.get('/admin/booking/all', express.basicAuth(authorize), function (req, res) {

    // NOTE - mongo always uses case sensitive sorting
    var sort = {};
    if (!_.isUndefined(req.query.sort) && req.query.sort != '' && !_.isUndefined(req.query.dir) && req.query.dir == 'desc') {
        sort[req.query.sort] = -1;
    }
    else if (!_.isUndefined(req.query.sort) && req.query.sort != '') {
        sort[req.query.sort] = 1;
    }
    else {
        sort['date'] = 1;
    }
    /*
    // Find all bookings (from today onwards)
    Booking.find({
      date: { $gte: new Date().toString('yyyy-MM-dd') }
    }, [], {sort:sort}, function (err, docs) {
      res.render('admin-booking-list.jade', {
        title: 'All bookings', 
        docs: docs,
        req: req ,
      });
    });
    */

    // Find all bookings
    Booking.find({}, {}, { sort: sort }, function (err, docs) {
        res.render('admin-booking-list.jade', {
            title: 'All bookings',
            docs: docs,
            req: req,
        });
    });
});

// - Export all bookings to CSV
app.get('/admin/booking/all/export', express.basicAuth(authorize), function (req, res) {

    // sendAllBookingsDataFile(null, function(){});
    downloadDataFile(null, res, function () { });

    // console.log('updated old');
    // res.redirect('/admin/booking/all');
});

// - Calendar view of bookings
app.get('/admin/booking/calendar', express.basicAuth(authorize), function (req, res) {

    var current = req.url;
    // Year and month
    var month = null;
    if (!_.isUndefined(req.query.month) && req.query.month !== '') {
        month = parseInt(req.query.month);
    }
    else {
        month = parseInt(moment().format('M'));
    }
    var year = null;
    if (!_.isUndefined(req.query.year) && req.query.year !== '') {
        year = parseInt(req.query.year);
    }
    else {
        year = parseInt(moment().format('YYYY'));
    }

    var engineer;

    if (!_.isUndefined(req.query.engineer) && req.query.engineer !== '') {
        engineer = (req.query.engineer);
    }
    // console.log('year ' + year);
    // console.log('month ' + month);
    // console.log(moment(year + '-' + month + '-05').format('MM-DD-YYYY d'));
    // Calendar pager
    var curr = '&year=' + parseInt(moment().format('YYYY')) + '&month=' + parseInt(moment().format('M'));
    var prev = '&year=' + year + '&month=' + (month - 1);
    if (month == 1) {
        prev = '&year=' + (year - 1) + '&month=' + 12;
    }
    var next = '&year=' + year + '&month=' + (month + 1);
    if (month == 12) {
        next = '&year=' + (year + 1) + '&month=' + 1;
    }
    var pager = {
        curr: curr,
        prev: prev,
        next: next,
    };
    // console.log(pager);

    // Moment.js weeks start on a Sunday
    var cal_pre = parseInt(moment(year + '-' + month + '-01').format('d')) - 1;
    if (cal_pre < 0) {
        cal_pre += 7;
    }
    var cal_post = 7 - parseInt(moment(year + '-01-31').add('months', month - 1).day());
    var cal_days = parseInt(moment(year + '-01-31').add('months', month - 1).format('D'));

    // This is the calendar object
    var days = [];

    // Find all bookings (for this month only)
    var date_gte = year + '-' + month + '-01';
    var date_lt = year + '-' + (month + 1) + '-01';
    if (month == 12) {
        date_lt = (year + 1) + '-01-01';
    }

    Holiday.find({
        holidayDate: { $gte: date_gte, $lt: date_lt, }
    }, {}, {}, function (err, holidaysArray) {
        var holidays = {};
        holidaysArray.forEach(function (hol) {
            holidays[moment(hol.holidayDate).format('YYYY-MM-D')] = true;
        });

        if (engineer) {
            Booking.find({
                date: { $gte: date_gte, $lt: date_lt, }, engineer: engineer
            }, {}, {}, function (err, docs) {

                // Stuff into the days array
                if (docs.length > 0) {
                    for (var i = 0; i < docs.length; i++) {
                        var datestamp = moment(docs[i].date).format('YYYY-MM-D');
                        if (days[datestamp]) {
                            days[datestamp][days[datestamp].length] = docs[i];
                        }
                        else {
                            days[datestamp] = [];
                            days[datestamp][0] = docs[i];
                        }
                    }
                }
                //console.log(days);

                // Now render the page
                res.render('admin-booking-calendar.jade', {
                    title: 'Bookings for ' + moment(year + '-' + month + '-01').format('MMMM YYYY'),
                    docs: docs,
                    days: days,
                    datestamp_prefix: moment(year + '-' + month + '-01').format('YYYY-MM-'),
                    cal_pre: cal_pre,
                    cal_post: cal_post,
                    cal_days: cal_days,
                    req: req,
                    pager: pager,
                    current: current,
                    engineer: engineer,
                    holidays: holidays,
                    engineerNames: engineerNames,
                    sageGroupNames: sageGroupNames
                });
            });
        }
        else {
            Booking.find({
                date: { $gte: date_gte, $lt: date_lt, }
            }, {}, {}, function (err, docs) {

                // Stuff into the days array
                if (docs.length > 0) {
                    for (var i = 0; i < docs.length; i++) {
                        var datestamp = moment(docs[i].date).format('YYYY-MM-D');
                        if (days[datestamp]) {
                            days[datestamp][days[datestamp].length] = docs[i];
                        }
                        else {
                            days[datestamp] = [];
                            days[datestamp][0] = docs[i];
                        }
                    }
                }
                //console.log(days);

                // Now render the page
                res.render('admin-booking-calendar.jade', {
                    title: 'Bookings for ' + moment(year + '-' + month + '-01').format('MMMM YYYY'),
                    docs: docs,
                    days: days,
                    datestamp_prefix: moment(year + '-' + month + '-01').format('YYYY-MM-'),
                    cal_pre: cal_pre,
                    cal_post: cal_post,
                    cal_days: cal_days,
                    req: req,
                    pager: pager,
                    current: current,
                    engineer: engineer,
                    holidays: holidays,
                    engineerNames: engineerNames,
                    sageGroupNames: sageGroupNames
                });
            });
        }
    });
});

app.post('/admin/booking/calendar', express.basicAuth(authorize), function (req, res) {
    var current = req.url;

    if (req.body.makeHoliday) {
        // make a holiday
        var d = new Date(req.body.makeHoliday);
        var hol = new Holiday({ holidayDate: d });
        hol.save(function (err, docs) {
            if (err) {
                console.error(err);
                res.send(err);
            } else {
                res.redirect(current);
            }
        });
    }

    if (req.body.removeHoliday) {
        // remove a holiday
        var d = new Date(req.body.removeHoliday);
        Holiday.find({ holidayDate: d }).remove(function (err, docs) {
            if (err) {
                console.error(err);
                res.send(err);
            } else {
                res.redirect(current);
            }
        });
    }


});

// - Calendar free bookings search
/*app.post('/admin/booking/calendar/search', express.basicAuth(authorize), function(req, res) {*/
//var postcode = postcode.checkPostCode(req.body.postcode);
//var soundtests = parseInt(req.body.soundtests) || 0;
//var airtests = parseInt(req.body.airtests) || 0;
//var lat = '';
//var lon = '';

//Geocoding.find({postcode:postcode}, function(err,docs) {
//if (!_isNull(err)) {
//res.render ('error.jade', {
//title: "Can't load this page",
//req: req,
//});
//}
//else {
//if (docs[0]) {
//console.log('Yes, we can use existing details');
//lat = docs[0].lat;
//lon = docs[0].lon;

//var calendar = getCalendar(lat, lon, function(calendar) {
//res.render('admin-search-results.jade', {
//title: title,
//error: error,
//postcode: postcode,
//soundtests: soundtests,
//airtests: airtests,
//lat: lat,
//lon: lon,
//results: calendar,
//});
//});
//});
//else {
//console.log('No, let\'s look it up and add it');
////console.log(postcode);
//// No, let's look it up and add it
//// Use the free Nominatim geocoding service
//mach.geocode(postcode, function(error, body){
//if (_.isEmpty(body)) {
//error = 'Sorry, we can\'t find that location. Please try again with another postcode.';

//// Render the page
//res.render('admin-search-results.jade', {
//title: title,
//error: error,
//postcode: postcode,
/*airtests: req.body.airtests,*/
//lat: null,
//lon: null,
//results: null,
//});
//}
//else {
//lat = body[0].lat;
//lon = body[0].lon;
//// console.log(lat);
//// console.log(lon);

//// Cache the response
//var g = new Geocoding({
//postcode: postcode,
//lat: body[0].lat,
//lon: body[0].lon});
//g.save();

//// Get calendar
//var calendar = getCalendar(lat, lon, function(calendar) {
//// console.log('calendar');
//// console.log(calendar);

//// Render the page
//res.render('admin-search-results.jade', {
//title: title,
//error: error,
//postcode: postcode,
//airtests: req.body.airtests,
//lat: lat,
//lon: lon,
//results: calendar,
//});

//});

//}
//});
//}
//}
//});

// - Edit a booking
app.get('/admin/booking/edit/:bookingid', express.basicAuth(authorize), function (req, res) {
    var bookingid = req.params.bookingid;
    Booking.findOne({
        _id: bookingid
    }, {}, {}, function (err, docs) {
        res.render('admin-booking-edit.jade', {
            title: 'Edit booking',
            bookingid: bookingid,
            docs: docs,
            error: null,
            exportbutton: true,
            hq: hq,
            deletebutton: true,
            sageGroupNames: sageGroupNames,
            engineerNames: engineerNames,
            bookedByNames: bookedByNames
        });
    });
});

// - Create a booking
app.get('/admin/booking/new/:date?', express.basicAuth(authorize), function (req, res) {
    var date = new Date();
    if (!_.isUndefined(req.params.date) && req.params.date !== '') {
        date = req.params.date;
    }
    //console.log(date);
    var bookingid = '';

    // Initialise the booking
    /*var docs = {
      name: '',
      email: '',
      postcode: '',
      phone: '',
      address: '',
      invoiceaddress: '',
      flats: 0,
      houses: 0,
      date: date,
    };*/
    var docs = {
        // Test details
        date: date, // Date
        engineer: '', //Who is testing
        starttime: '09:00', // Start time
        endtime: '10:00', // End time
        address: '', // Site address
        postcode: '', // Postcode
        name: '', // Contact name
        phone: '', // Contact number
        instructions: '', //Tester instructions

        // Invoice details
        jobnumber: '', // Job number
        companyname: '', // Company name
        invoiceaddress: '', // Invoice address
        email: '', // Invoice email
        invoicephone: '', // Phone number
        comments: '', // Invoice address
        amountquoted: 0, // Amount quoted
        additionalcosts: 0, // Additional costs

        // Booking info
        bookedby: '', // Booked by
        testtype1: false, // Sound Insulation Testing
        testtype2: false, // Air Pressure Testing
        testtype3: false, // Sound and Air Testing
        testtype4: false, // BS4142 Assessment
        testtype5: false, // Environmental Noise Assessment
        testtype6: false, // Noise Survey
        sagegroup: [],
        soundtests: 0, // Sound tests
        airtests: 0, // Air tests

        // Other info
        status: 'Unconfirmed', // Status
        drawingsrequested: '',
        paid: false,
        created: null, // Created
        lastupdated: null, // Last updated
        lat: '', // Latitude
        lon: '', // Longitude
    };

    res.render('admin-booking-edit.jade', {
        title: 'Create a booking',
        bookingid: bookingid,
        docs: docs,
        error: null,
        exportbutton: false,
        hq: hq,
        deletebutton: false,
        sageGroupNames: sageGroupNames,
        engineerNames: engineerNames,
        bookedByNames: bookedByNames
    });
});

// - Delete a booking
app.get('/admin/booking/delete/:bookingid', express.basicAuth(authorize), function (req, res) {
    var bookingid = req.params.bookingid;
    res.render('admin-booking-delete.jade', {
        title: 'Delete booking',
        bookingid: bookingid,
    });
});

// - Delete a booking
app.post('/admin/booking/delete', express.basicAuth(authorize), function (req, res) {
    var bookingid = req.body.bookingid;
    Booking.findOne({
        _id: bookingid
    }, {}, {}, function (err, docs) {
        //Also remove the pairing
       /* if (docs.pairid) {
            Booking.findOne({
                _id: docs.pairid
            }, {}, {}, function (err, pair) {
                pair.pairid = null;
                pair.testingday = pair.testingtime + (pair.timefromhq * 2);
                pair.save();
            });
        }*/
        console.log('docs' + docs);
        docs.remove();
        res.redirect('/admin/booking/calendar');
    });
});

// - Save a booking
app.post('/admin/booking/save', express.basicAuth(authorize), function (req, res) {
    var bookingid = req.body.bookingid;

    // Test details
    var date = req.body.date; // Date
    var engineer = req.body.engineer;
    var starttime = mach.mapQuestFromHQ; // Start time
    var endtime = req.body.endtime; // End time
    var address = req.body.address; // Site address
    var postcode = postcheck.checkPostCode(req.body.postcode); // Postcode
    var name = req.body.name; // Contact name
    var phone = req.body.phone; // Contact number
    var instructions = req.body.instructions

    // Invoice details
    var jobnumber = ''; // Job number
    var companyname = req.body.companyname; // Company name
    var invoiceaddress = req.body.invoiceaddress; // Invoice address
    var email = req.body.email; // Invoice email
    var invoicephone = req.body.invoicephone; // Phone number
    var comments = req.body.comments; // Invoice address
    var amountquoted = req.body.amountquoted; // Amount quoted
    var additionalcosts = req.body.additionalcosts; // Additional costs

    // Booking info
    var bookedby = req.body.bookedby; // Booked by
    var testtype1 = req.body.testtype1 == 'true'; // Sound Insulation Testing
    var testtype2 = req.body.testtype2 == 'true'; // Air Pressure Testing
    var testtype3 = req.body.testtype3 == 'true'; // Sound and Air Testing
    var testtype4 = req.body.testtype4 == 'true'; // BS4142 Assessment
    var testtype5 = req.body.testtype5 == 'true'; // Environmental Noise Assessment
    var testtype6 = req.body.testtype6 == 'true'; // Noise Survey
    var sagegroup = req.body.sagegroup;
    var soundtests = req.body.soundtests; // Sound tests
    var airtests = req.body.airtests; // Air tests
    var testingtime = (soundtests * settings.soundtest_time) + (airtests * settings.airtest_time) + settings.time_buffer; //Working out testing time here

    // Other info
    var status = req.body.status; // Status
    var drawingsrequested = req.body.drawingsrequested; // drawings request
    var paid = req.body.paid == 'true'; // Paid
    var created = new Date(); // Created
    var lastupdated = new Date(); // Last updated
    var lat = req.body.lat; // Latitude
    var lon = req.body.lon; // Longitude
    var latlonhq = { lat: hq.latLng.lat, lon: hq.latLng.lon };
    var latlonstart = { lat: lat, lon: lon };
    var TravelFromNewTestToHq;


     mach.mapQuestGetTime2(latlonstart, latlonhq, function (body) 
 {
    TravelFromNewTestToHq = Math.ceil(body.route.time / 60);
    console.log('Travel from HQ = ' + TravelFromNewTestToHq);
 });
    /*
    var date = req.body.date;
    var name = req.body.name;
    var email = req.body.email;
    var postcode = req.body.postcode;
    var phone = req.body.phone;
    var address = req.body.address;
    var invoiceaddress = req.body.invoiceaddress;
    var houses = req.body.houses;
    var flats = req.body.flats;
    var lat = req.body.lat;
    var lon = req.body.lon;
    var confirmed = true;
    */

    // Validation
    if (_.isEmpty(date) || !postcode || _.isEmpty(starttime) || starttime == '00:00' || _.isEmpty(endtime) || endtime == '00:00') {
        var docs = {
            // Test details
            date: date, // Date
            engineer: engineer,
            starttime: starttime, // Start time
            endtime: endtime, // End time
            address: address, // Site address
            postcode: postcode, // Postcode
            name: name, // Contact name
            phone: phone, // Contact number
            instructions: instructions,

            // Invoice details
            jobnumber: jobnumber, // Job number
            companyname: companyname, // Company name
            invoiceaddress: invoiceaddress, // Invoice address
            email: email, // Invoice email
            invoicephone: invoicephone, // Phone number
            comments: comments, // Invoice address
            amountquoted: amountquoted, // Amount quoted
            additionalcosts: additionalcosts, // Additional costs

            // Booking info
            bookedby: bookedby, // Booked by
            testtype1: testtype1, // Sound Insulation Testing
            testtype2: testtype2, // Air Pressure Testing
            testtype3: testtype3, // Sound and Air Testing
            testtype4: testtype4, // BS4142 Assessment
            testtype5: testtype5, // Environmental Noise Assessment
            testtype6: testtype6, // Noise Survey
            sagegroup: sagegroup,
            soundtests: soundtests, // Sound tests
            airtests: airtests, // Air tests

            // Other info
            status: status, // Status
            drawingsrequested: drawingsrequested, // drawings requested
            paid: paid, // Paid
            created: created, // Created
            lastupdated: lastupdated, // Last updated
            lat: lat, // Latitude
            lon: lon, // Longitude
        };
        var error = 'Please fill in the required fields.';
        res.render('admin-booking-edit.jade', {
            title: 'Create a booking',
            bookingid: bookingid,
            docs: docs,
            error: error,
            exportbutton: false,
            hq: hq,
            deletebutton: false,
            sageGroupNames: sageGroupNames,
            engineerNames: engineerNames,
            bookedByNames: bookedByNames
        });
    }
    else {

        // Has it already been geocoded?
        // console.log('postcode - ' + postcode);
        // console.log('lat - ' + lat);
        // console.log('lon - ' + lon);

        // Do this async?
        mach.geocode(postcode, function (error, body) {
            // console.log(body);
            if (_.isEmpty(body)) {
                // console.log('empty');
                var docs = {
                    // Test details
                    date: date, // Date
                    engineer: engineer,
                    starttime: starttime, // Start time
                    endtime: endtime, // End time
                    address: address, // Site address
                    postcode: postcode, // Postcode
                    name: name, // Contact name
                    phone: phone, // Contact number
                    instructions: instructions,

                    // Invoice details
                    jobnumber: jobnumber, // Job number
                    companyname: companyname, // Company name
                    invoiceaddress: invoiceaddress, // Invoice address
                    email: email, // Invoice email
                    invoicephone: invoicephone, // Phone number
                    comments: comments, // Invoice address
                    amountquoted: amountquoted, // Amount quoted
                    additionalcosts: additionalcosts, // Additional costs

                    // Booking info
                    bookedby: bookedby, // Booked by
                    testtype1: testtype1, // Sound Insulation Testing
                    testtype2: testtype2, // Air Pressure Testing
                    testtype3: testtype3, // Sound and Air Testing
                    testtype4: testtype4, // BS4142 Assessment
                    testtype5: testtype5, // Environmental Noise Assessment
                    testtype6: testtype6, // Noise Survey
                    sagegroup: sagegroup,
                    soundtests: soundtests, // Sound tests
                    airtests: airtests, // Air tests

                    // Other info
                    status: status, // Status
                    drawingsrequested: drawingsrequested, // drawings requested
                    paid: paid, // Paid
                    created: created, // Created
                    lastupdated: lastupdated, // Last updated
                    lat: lat, // Latitude
                    lon: lon, // Longitude
                };
                var error = 'Sorry, we can\'t find that location. Please try again with another postcode.';
                res.render('admin-booking-edit.jade', {
                    title: 'Create a booking',
                    bookingid: bookingid,
                    docs: docs,
                    error: error,
                    exportbutton: false,
                    hq: hq,
                    deletebutton: false,
                    sageGroupNames: sageGroupNames,
                    engineerNames: engineerNames,
                    bookedByNames: bookedByNames
                });
            }
            else {
                // console.log('not empty');
                lat = body.results[0].geometry.location.lat;
                lon = body.results[0].geometry.location.lng;
                var end = { lat: lat, lon: lon }; //Latitude array for look up

                mach.mapQuestFromHQ(latlonhq, end, function (timefromhq) {
                    timefromhq = Math.ceil(timefromhq / 60);
                    var testingday = (timefromhq * 2) + (testingtime);
                    // If item exists, update it
                    Booking.findOne({
                        _id: bookingid
                    }, {}, {}, function (err, docs) {
                        if (!_.isUndefined(docs)) {
                            // It exists, let's update it

                            /*
                            docs.date = date;
                            docs.name = name;
                            docs.email = email;
                            docs.postcode = postcode;
                            docs.phone = phone;
                            docs.address = address;
                            docs.invoiceaddress = invoiceaddress;
                            docs.houses = houses;
                            docs.flats = flats;
                            docs.lat = lat;
                            docs.lon = lon;
                            docs.confirmed = confirmed;
                            */

                            // Test details
                            docs.date = date; // Date
                            docs.engineer = engineer;
                            docs.starttime = starttime; // Start time
                            docs.endtime = endtime; // End time
                            docs.address = address; // Site address
                            docs.postcode = postcode; // Postcode
                            docs.name = name; // Contact name
                            docs.phone = phone; // Contact number
                            docs.instructions = instructions;

                            // Invoice details
                            docs.jobnumber = jobnumber; // Job number
                            docs.companyname = companyname; // Company name
                            docs.invoiceaddress = invoiceaddress; // Invoice address
                            docs.email = email; // Invoice email
                            docs.invoicephone = invoicephone; // Phone number
                            docs.comments = comments; // Invoice address
                            docs.amountquoted = amountquoted; // Amount quoted
                            docs.additionalcosts = additionalcosts; // Additional costs

                            // Booking info
                            docs.bookedby = bookedby; // Booked by
                            docs.sagegroup = sagegroup;
                            docs.soundtests = soundtests; // Sound tests
                            docs.airtests = airtests; // Air tests
                            docs.testingtime = testingtime;

                            // Other info
                            docs.status = status; // Status
                            docs.drawingsrequested = drawingsrequested;
                            docs.paid = paid; // Paid
                            //docs.created = created; // Created
                            docs.lastupdated = lastupdated; // Last updated
                            docs.lat = lat; // Latitude
                            docs.lon = lon; // Longitude
                            docs.timefromhq = timefromhq;
                            docs.testingday = testingday;

                            // Save it
                            docs.save(function (err, docs) {
                                console.log(testingday);
                                console.log(timefromhq);
                                // console.log(err);
                                // console.log(docs);
                                // console.log(docs._id);

                                if (_.isNull(err)) {
                                    //console.log(1);

                                    // Export to CSV?
                                    if (req.body.submit == 'Save and export') {
                                        sendDataFile(docs._id, function () {
                                            console.log('sent the email.');
                                        });
                                    }
                                    else if (req.body.submit == 'Download data') {
                                        downloadDataFile(docs._id, res, function () {
                                            console.log('generated data file.');
                                        });
                                    }
                                    else {
                                        // console.log('updated old');
                                        res.redirect('/admin/booking/calendar');
                                    }
                                }
                                else {
                                    console.log(2);
                                    console.log(err);
                                    res.render('admin-error.jade', {
                                        title: 'Sorry, your test was not saved.',
                                        req: req,
                                    });
                                }

                            });
                        }
                        else {
                            // Time to create a new item
                            var b = new Booking({
                                // Test details
                                date: date, // Date
                                engineer: engineer,
                                starttime: starttime, // Start time
                                endtime: endtime, // End time
                                address: address, // Site address
                                postcode: postcode, // Postcode
                                name: name, // Contact name
                                phone: phone, // Contact number
                                instructions: instructions,

                                // Invoice details
                                jobnumber: jobnumber, // Job number
                                companyname: companyname, // Company name
                                invoiceaddress: invoiceaddress, // Invoice address
                                email: email, // Invoice email
                                invoicephone: invoicephone, // Phone number
                                comments: comments, // Invoice address
                                amountquoted: amountquoted, // Amount quoted
                                additionalcosts: additionalcosts, // Additional costs

                                // Booking info
                                bookedby: bookedby, // Booked by
                                testtype1: testtype1, // Sound Insulation Testing
                                testtype2: testtype2, // Air Pressure Testing
                                testtype3: testtype3, // Sound and Air Testing
                                testtype4: testtype4, // BS4142 Assessment
                                testtype5: testtype5, // Environmental Noise Assessment
                                testtype6: testtype6, // Noise Survey
                                sagegroup: sagegroup,
                                soundtests: soundtests, // Sound tests
                                airtests: airtests, // Air tests
                                testingtime: testingtime,

                                // Other info
                                status: status, // Status
                                drawingsrequested: drawingsrequested,
                                paid: paid, // Paid
                                created: created, // Created
                                lastupdated: null, // Last updated
                                lat: lat, // Latitude
                                lon: lon, // Longitude
                                timefromhq: timefromhq,
                                testingday: testingday,
                            });
                            console.log('Testing Day (Line 1801)' + testingday);
                            console.log('Time from HQ (Line 1802)' + timefromhq);
                            b.save(function (err, docs) {
                                // console.log(err);
                                // console.log(docs);
                                // console.log('saved new');
                                res.redirect('/admin/booking/calendar');
                            });
                        }
                    });
                });
            } //End Else
        }); //End Geocode

    }
});

// - basic static file server
app.get('/docs/:doc', function (req, res) {
    var doc = req.params.doc;
    fs.readFile('./public/' + doc + '.html', function (err, data) {
        if (err) {
            res.status(404);
            res.render('404.jade', {
                title: 'Page not found',
                req: req,
            });
        }
        else {
            res.contentType('text/html');
            res.send(data);
        }
    });
});


// - 404
app.get('*', function (req, res) {
    res.status(404);
    res.render('404.jade', {
        title: 'Page not found',
        req: req,
    });
});

// Start express

app.listen(process.env.PORT || 8080);
console.log('MACH Acoustics sound test booking system [started]');


// ------------------------------------------------------------------

// Helper functions

// - Render the search calendar
function getCalendar(lat, lon, callback) {

    // Starting date
    var start = moment();
    // If Wednesday (day 3) or later, start with the following week
    if (start.day() > 3) {
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
        price,
        discount_local,
        discount,
        stack;

    discount_local = 0;
    // Get all bookings for next N work weeks
    var weeks_to_return = 4;
    var days_to_return = weeks_to_return * 7;
    var end = moment().add('days', days_to_return);// + 2

    var latlonstart = { lat: lat, lon: lon };
    var latlonhq = { lat: hq.latLng.lat, lon: hq.latLng.lon };
    var TravelFromNewTestToHq;


     mach.mapQuestGetTime2(latlonstart, latlonhq, function (body) 
 {
    TravelFromNewTestToHq = Math.ceil(body.route.time / 60);
    console.log('Travel from HQ (in brackets)= ' + TravelFromNewTestToHq);
 });

console.log('Travel from HQ (out of brackets)= ' + TravelFromNewTestToHq);
    // Loop controller
    var i = 20; // just want 20 weekdays, no weekends obv.
    // Find time from HQ and give local tests a discount **ASYNC**
    mach.mapQuestFromHQ(latlonhq, latlonstart, function (timefromhq) {
        timefromhq = Math.ceil(timefromhq / 60);
        //console.log('Time from HQ (Line 1936)' + timefromhq);
        if (timefromhq < settings.local_travel) {
            discount_local = discount_local + settings.soundtest_discountlocal;
        }
        Holiday.find({
            holidayDate: { $gte: new Date(start.format()), $lte: new Date(end.format()) }
        }, {}, {}, function (err, holidaysArray) {
            var holidays = {};
            holidaysArray.forEach(function (hol) {
                holidays[moment(hol.holidayDate).format('YYYY-MM-D')] = true;
            });
            //console.log('(Line 1947)');
            Booking.find({
                date: { $gte: new Date(start.format()), $lte: new Date(end.format()) }
            }, {}, {
                sort: { 'date': 1 }
            }, function (err, docs) {
                // Put the days into an associative array
                // So that I can ask for day['2012-07-03'] and get an object/null
                // var days = [];
                docs.forEach(function (item) {
                    // console.log();
                    //var key = moment(item.date).format('YYYY-MM-DD');
                    //if (days[key]) {
                    //days[key].houses += item.houses;
                    //days[key].flats += item.flats;
                    //days[key].timefromhq += item.timefromhq;
                    //days[key].testingtime += item.testingtime;
                    //days[key].testingday += item.testingday;
                    //days[key].tests = days[key].tests + 1;
                    //console.log(days[key].tests);
                    //}
                    var key = moment(item.date).format('YYYY-MM-DD');
                    if (days[key]) {
                        // When multiple tests on a day, add to date to signify multiday then store
                        var concurrent = key + days[key].tests;
                        days[concurrent] = {
                            lat: item.lat,
                            lon: item.lon,
                            houses: item.houses,
                            flats: item.flats,
                            timefromhq: item.timefromhq,
                            testingtime: item.testingtime,
                            testingday: item.testingday,
                            id: item._id,
                           // pairid: item.pairid,
                           stack: item.stack,
                           stackid: item.stackid,
                            starttime: item.starttime,
                            endtime: item.endtime,
                        };
                        days[key].tests++;
                    }
                    else {
                        days[key] = {
                            lat: item.lat,
                            lon: item.lon,
                            houses: item.houses,
                            flats: item.flats,
                            timefromhq: item.timefromhq,
                            testingtime: item.testingtime,
                            testingday: item.testingday,
                            id: item._id,
                            //pairid: item.pairid,
                            stack: item.stack,
                            stackid: item.stackid,
                            tests: 1,
                            starttime: item.starttime,
                            endtime: item.endtime,
                        };
                    }
                });
                // console.log(days);
                //console.log('(Line 2005)');

                // The fun starts here...
                for (var x = 0; x < days_to_return; x++) {
                    var cellday = start.add('days', 1);

                    if (cellday.day() > 0 && cellday.day() < 6) { // if weekday

                        var key = cellday.format('YYYY-MM-DD');
                        var key_cal = key; //Calendar ref for loop

                        /*
                         *Discounts
                         */
                        if (key <= moment().add('days', settings.shortnotice).format('YYYY-MM-DD')) {
                            discount = discount_local + settings.shortdiscount;
                        } else if (key > moment().add('days', settings.longnotice).format('YYYY-MM-DD')) {
                            discount = discount_local + settings.longdiscount;
                        } else { discount = discount_local; }

                        if (holidays[key] || key <= moment().add('days', settings.noticelimit).format('YYYY-MM-DD')) {
                            // If it's later than one day's notice, or its a holiday, mark it as unavailable
                            calendar[key] = { available: false, special: false, outbounds: false, date: cellday.format('ddd Do MMMM'), price: '£' + 0 };

                            i--;
                            // console.log(i);
                            if (i <= 0) {
                                calendar.sort();
                                callback(calendar);
                            }
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
                            console.log(distance_k60;
                            */
                            // Write a placeholder value to the calendar
                            // We'll overwrite it later
                            calendar[key] = { available: false, special: false, outbounds: false, date: cellday.format('ddd Do MMMM'), price: '£CHECKING' }; //bollocks

                           /* if (days[key].stack = true) {

                                window.alert("Hello! I am an alert box!!");

                                //stack = true;
                                //stackid = 2;

                                
                            }
                            else {

                                window.alert("Hello!");
                            }*/


 //var latlonhq = { lat: hq.latLng.lat, lon: hq.latLng.lon };
                            //First check if we can potentially do more tests on this day
if (days[key].tests < 3) 
{
                                //window.alert("Hello2222!");
                                var no_tests = days[key].tests;
                                console.log('Line 2006 - Number of Tests ' + no_tests);
                               

    console.log('Travel from HQ (inside calndar loop) = ' + TravelFromNewTestToHq);



                                if (no_tests == 0)
                                {
                                            var latlonhq = { lat: hq.latLng.lat, lon: hq.latLng.lon };
                                            var latlonnew = latlonstart;
                                    if (CheckCanBook (latlonhq, latlonhq, latlonnew, settings.earliestleavetime, settings.latestreturntime, timeatsitenew, false ,TravelFromNewTestToHq, latlonhq) == true) 
                                    {
                                                  console.log('checkcanbook1');   
                                    }                            
                                  

                                }

                                if (no_tests == 1)
                                {

                                            var key1 = key_cal + 0;
                                            var key2 = key_cal + 1;
                                            var keynew = key_cal + 2;

                                            var latlon1 = { lat: days[key_cal].lat, lon: days[key_cal].lon }; 
                                            var latlonhq = { lat: hq.latLng.lat, lon: hq.latLng.lon };
                                            var latlonnew = latlonstart;

                                            var timeatsite1 = days[key_cal].testingtime;
                                            // console.log(days[key_cal].testingtime);
                                            var timeatsitenew = settings.soundtest_time + settings.time_buffer;
                                            // console.log(days[key_cal].starttime);
                                            var starttime2 = days[key_cal].starttime;
                                            //console.log(days[key_cal].starttime);
                                            //console.log('Starttime Var ' + starttime2);
                                            var starttimeleft = (parseInt(starttime2.substring(0,2)) * 60);
                                            //console.log('startimeleft ' + starttimeleft);
                                            var starttimeright = (parseInt(starttime2.substring(3,5)));
                                            //console.log('Starttimeright ' + starttimeright);
                                            var starttime1mins = (parseInt(starttimeleft) + parseInt(starttimeright));
                                            //console.log('Starttime1mins ' + starttime1mins);
                                            var starttimenew;
                                            var endtimeleft = days[key_cal].endtime;
                                            var endtimeright = days[key_cal].endtime;
                                            var endtime1mins = parseInt((parseInt(endtimeleft.substring(0,2)) / 60) + (endtimeleft.substring(0,2)));
                                            //console.log('Endtime1mins ' + endtime1mins);
                                            var endtimenew;

                                            //var seconds;
                                            var travel1toNew_minutes;

                                            //var hours;

                                            //earliestleavetime: //{ type: Number, default: 540 }, //Earliest time someone can leave the office
                                            //  latestreturntime:


                                            // check between leave home time and 1st start time

                                            //mach.mapQuestGetTime(latlonstart, latlonend,
                                            //function (body) {

                                            if (CheckCanBook (latlonhq, latlon1, latlonnew, settings.earliestleavetime, starttime1mins, timeatsitenew, true, TravelFromNewTestToHq, latlonhq ) == true)
                                            {
                                                    console.log('checkcanbook1');
                                            }
                                            else if (CheckCanBook (latlon1, latlonhq, latlonnew, endtime1mins, settings.latestreturntime, timeatsitenew, true, TravelFromNewTestToHq, latlonhq ) == true)
                                            {
                                                    console.log('checkcanbook2');
                                            }
                                            else
                                            {
                                                // cant stack anything so check if a 2nd car is avaliable and charge full price
                                            if (settings.stackdays) 
                                                    {                          

                                                        if (CheckCanBook (latlonhq, latlonhq, latlonnew, settings.earliestleavetime, settings.latestreturntime, timeatsitenew, false, TravelFromNewTestToHq, latlonhq ) == true) 
                                                            {
                                                            console.log('checkcanbook3');
                                                            }                            
                                                            }
                                                                                                            

                                            }


                                }

                                else if (no_tests == 2)
                                {
                                            //console.log('key_cal ' + key_cal);
                                            var key1 = key_cal;
                                            var key2 = key_cal + 1;
                                            var keynew = key_cal + 2;
                                            //console.log('key1 ' + key1);
                                            //console.log('key2 ' + key2);
                                            var latlon1 = { lat: days[key1].lat, lon: days[key_cal].lon }; 
                                            var latlon2 = { lat: days[key2].lat, lon: days[key_cal].lon }; 
                                            var latlonhq = { lat: hq.latLng.lat, lon: hq.latLng.lon };
                                            var latlonnew = latlonstart;

                                            var timeatsite1 = days[key1].testingtime;
                                            var timeatsite2 = days[key2].testingtime;
                                            var timeatsitenew = settings.soundtest_time + settings.time_buffer;

                                            //console.log("2180")

                                            //var starttime1mins = Int((Int(Left(days[key1].starttime,2)) / 60) + (Right(days[key1].starttime,2)));

                                            var starttime1 = days[key1].starttime;
                                            var starttime1left = (parseInt(starttime1.substring(0,2)) * 60);
                                            var starttime1right = (parseInt(starttime1.substring(3,5)));
                                            var starttime1mins = (parseInt(starttime1left) + parseInt(starttime1right));
                                            //console.log('Starttime1mins ' + starttime1mins);
                                            var starttime2 = days[key2].starttime;
                                            var starttime2left = (parseInt(starttime2.substring(0,2)) * 60);
                                            var starttime2right = (parseInt(starttime2.substring(3,5)));
                                            var starttime2mins = (parseInt(starttime2left) + parseInt(starttime2right));
                                            //console.log('Starttime2mins ' + starttime2mins);
                                            var starttimenew;

                                            var endtime1left = days[key1].endtime;
                                            var endtime1right = days[key1].endtime;
                                            var endtime1mins = parseInt((parseInt(endtime1left.substring(0,2)) / 60) + (endtime1left.substring(0,2)));
                                            //console.log('Endtime1mins ' + endtime1mins);
                                            var endtime2left = days[key2].endtime;
                                            var endtime2right = days[key2].endtime;
                                            var endtime2mins = parseInt((parseInt(endtime2left.substring(0,2)) / 60) + (endtime2left.substring(0,2)));
                                            //console.log('Endtime2mins ' + endtime2mins);
                                            var endtimenew;

                                            //var seconds;
                                            var travel1toNew_minutes;
                                            var travelNewto2_minutes;

                                            //var hours;

                                            //earliestleavetime: //{ type: Number, default: 540 }, //Earliest time someone can leave the office
                                            //  latestreturntime:


                                            // check between leave home time and 1st start time

                                            //mach.mapQuestGetTime(latlonstart, latlonend,
                                            //function (body) {


                                            if (CheckCanBook (latlonhq, latlon1, latlonnew, settings.earliestleavetime, starttime1mins, timeatsitenew, true, TravelFromNewTestToHq, latlonhq ) == true)
                                            {
                                                    console.log('2 tests - checkcanbook1');
                                            }
                                            else if (CheckCanBook (latlon1, latlon2, latlonnew, endtime1mins, starttime2mins, timeatsitenew, true,TravelFromNewTestToHq, latlonhq ) == true)
                                            {
                                                    console.log('2 tests - checkcanbook2');
                                            }
                                            else if (CheckCanBook (latlon2, latlonhq, latlonnew, endtime2mins, settings.latestreturntime, timeatsitenew, true,TravelFromNewTestToHq, latlonhq ) == true)
                                            {
                                                    console.log('2 tests - checkcanbook3');
                                            }
                                            else
                                            {
                                                // cant stack anything so check if a 2nd car is avaliable and charge full price
                                            if (settings.stackdays) 
                                                    {                          

                                                        if (CheckCanBook (latlonhq, latlonhq, latlonnew, settings.earliestleavetime, settings.latestreturntime, timeatsitenew, false ,TravelFromNewTestToHq, latlonhq) == true) 
                                                            {
                                                                console.log('2 tests - checkcanbook4');
                                                            }                            
                                                            }
                                                                                                            

                                            }

                                                                            
                                }
                             else
                              {
                                //We can't do more than 4 tests
                                calendar[key].available = false;
                                calendar[key].special = false;
                                calendar[key].price = '£' + 0;
                                i--;
                                if (i <= 0) {
                                    calendar.sort();
                                    callback(calendar);
                                }
                            }
                        }

                        else {
                                   if (settings.stackdays) 
        {                          
                //console.log('Line 2230');
                
                var latlonhq = { lat: hq.latLng.lat, lon: hq.latLng.lon };
                                            var latlonnew = latlonstart;
                                            console.log(latlonhq.lat);
                console.log(latlonhq.lon);

            if (CheckCanBook (latlonhq, latlonhq, latlonnew, settings.earliestleavetime, settings.latestreturntime, timeatsitenew, false,TravelFromNewTestToHq, latlonhq ) == true) 
                {

                }                            
                   }
                        }

                            //
                            // No bookings for this day, so mark it as available
                            calendar[key] = { available: true, special: false, outbounds: false, date: cellday.format('ddd Do MMMM'), price: '£' + settings.soundtest_pricefirst };
                            if (discount < discount_local) {
                                calendar[key].advanced = true;
                            }
                            calendar[key].price = '£' + (settings.soundtest_pricefirst + discount);
                            calendar[key].timefromhq = timefromhq;
                            calendar[key].testingday = settings.soundtest_time + settings.time_buffer + (timefromhq * 2);
                            calendar[key].timefromtest = null;
                            //calendar[key].pairid = null;
                            calendar[key].stack = null;
                            calendar[key].stackid = null;
                            //Let's make sure it's not in outer hebridies...
                            if (calendar[key].timefromhq > ((settings.hoursperday * 60 / 2) - settings.soundtest_time)) {
                                calendar[key].outbounds = true;
                            }

                            i--;
                           // if (i <= 0) {
                                calendar.sort();
                                callback(calendar);
                       //     }
                        }
                    }
                }
            });
        });
    });
}

// Get requirements
function getRequirements(houses, flats) {
    var tests = 0;
    if (houses > 0) {
        tests++;
    }
    if (flats > 0) {
        tests++;
    }
    if (tests > 1) {
        return "Based on your requirements, we think you'll need " + tests + " sound tests.";
    }
    else {
        return "Based on your requirements, we think you'll need " + tests + " sound test.";
    }
}

// Export single booking to CSV
function exportToCSV(bookingid, callback) {
    Booking.findOne({
        _id: bookingid
    }, {}, {}, function (err, docs) {

        // Vars
        var created = (!docs.created) ? '' : docs.created.toString("yyyy-MM-dd HH:mm:ss");
        var lastupdated = (!docs.lastupdated) ? '' : docs.lastupdated.toString("yyyy-MM-dd HH:mm:ss");

        // Headers
        var csv = 'Id,Date,StartTime,EndTime,SiteAddress,Postcode,Name,PhoneNumber,CompanyName,InvoiceAddress,Email,ContactNumber,Comments,AmountQuoted,AdditionalCosts,BookedBy,SAGEGroup,SoundTests,AirTests,DrawingsRequested,Status,Paid,Created,LastUpdated' + "\n";

        // Data
        csv += docs._id + ',"' + docs.date.toString("yyyy-MM-dd") + '",' + docs.starttime + ',' + docs.endtime + ',"' + docs.address + '","' + docs.postcode + '","' + docs.name + '","' + docs.phone + '","' + docs.companyname + '","' + docs.invoiceaddress + '","' + docs.email + '","' + docs.invoicephone + '","' + docs.comments + '",' + docs.amountquoted + ',' + docs.additionalcosts + ',"' + docs.bookedby + '","' + (docs.sagegroup ? docs.sagegroup.map(function (key) { return sageGroupNames[key].name; }).join(', ') : '') + '",' + docs.soundtests + ',' + docs.airtests + ',' + docs.drawingsrequested + ',' + docs.status + ',' + docs.paid + ',"' + created + '","' + lastupdated + '"';

        callback(csv, docs.jobnumber);
    });
}

// Send an email with a data file
function sendDataFile(bookingid, callback) {
    exportToCSV(bookingid, function (csv, jobnumber) {
        var attachmentbody = new Buffer(csv).toString('base64');
        var attachmentname = settings.dataexportattachmentname.replace('{REF}', '');
        if (jobnumber != '') {
            attachmentname = settings.dataexportattachmentname.replace('{REF}', '_' + jobnumber);
        }

        // Use postmark to send emails
        var messagebody = '';
        messagebody += 'Booking details (see attached CSV file)' + "\n";
        messagebody += "\n";
        messagebody += '--------------------' + "\n";
        messagebody += 'Date: ' + new Date().toString() + "\n";
        // messagebody += 'IP address: ' + req.connection.remoteAddress + "\n"; // req doesn't exist here...
        var postmarkmessage = {
            "From": settings.dataexportemail.from,
            "To": devMode ? devEmail : settings.dataexportemail.to,
            "Subject": settings.dataexportemail.subject,
            "TextBody": messagebody,
            "Attachments": [
            {
                "Name": attachmentname,
                "Content": attachmentbody,
                "ContentType": "text/plain"
            }
            ],
        }
        if (!_.isNull(settings.dataexportemail.bcc) && !devMode) {
            postmarkmessage.Bcc = settings.dataexportemail.bcc;
        }
        // console.log(postmarkmessage);
        //postmark.send(postmarkmessage);

        callback();
    });
}

// Export all bookings to CSV
// Used by email send and download callbacks
function exportAllBookingsToCSV(bookingid, callback) {
    sort = { 'date': 1 };
    // var filter = null;
    // if (!_.isNull(bookingid)) {
    // filter = [bookingid];
    // }
    jobnumber = null;
    filter = {};
    if (!_.isNull(bookingid)) {
        filter = { _id: bookingid };
    }
    Booking.find(filter, {}, { sort: sort }, function (err, docs) {

        // Headers
        var csv = 'Id,Date,StartTime,EndTime,SiteAddress,Postcode,Name,PhoneNumber,CompanyName,InvoiceAddress,Email,ContactNumber,Comments,AmountQuoted,AdditionalCosts,BookedBy,SAGEGroup,SoundTests,AirTests,DrawingsRequested,Status,Paid,Created,LastUpdated' + "\n";

        // Data
        docs.forEach(function (item) {

            // Vars
            var created = (!item.created) ? '' : item.created.toString("yyyy-MM-dd HH:mm:ss");
            var lastupdated = (!item.lastupdated) ? '' : item.lastupdated.toString("yyyy-MM-dd HH:mm:ss");

            // Data
            var row = item._id + ',"' + item.date.toString("yyyy-MM-dd") + '",' + item.starttime + ',' + item.endtime + ',"' + item.address + '","' + item.postcode + '","' + item.name + '","' + item.phone + '","' + item.companyname + '","' + item.invoiceaddress + '","' + item.email + '","' + item.invoicephone + '","' + item.comments + '",' + item.amountquoted + ',' + item.additionalcosts + ',"' + item.bookedby + '","' + (item.sagegroup ? item.sagegroup.map(function (key) { return sageGroupNames[key].name; }).join(', ') : '') + '",' + item.soundtests + ',' + item.airtests + ',' + item.drawingsrequested + ',' + item.status + ',' + item.paid + ',"' + created + '","' + lastupdated + '"' + "\n";

            // Store jobnumber for later
            if (!_.isNull(bookingid)) {
                jobnumber = item.jobnumber;
            }

            // Append to data
            csv += row;
        });

        callback(csv, jobnumber);

    });
}

// Send an email with a data file
function sendAllBookingsDataFile(bookingid, callback) {
    exportAllBookingsToCSV(bookingid, function (csv, jobnumber) {
        var attachmentbody = new Buffer(csv).toString('base64');
        var attachmentname = settings.dataexportattachmentname.replace('{REF}', '_all');
        // if (jobnumber != '') {
        // attachmentname = settings.dataexportattachmentname.replace('{REF}', '_' + jobnumber);
        // }

        // Use postmark to send emails
        var messagebody = '';
        messagebody += 'All booking details (see attached CSV file)' + "\n";
        messagebody += "\n";
        messagebody += '--------------------' + "\n";
        messagebody += 'Date: ' + new Date().toString() + "\n";
        // messagebody += 'IP address: ' + req.connection.remoteAddress + "\n"; // req doesn't exist here...
        var postmarkmessage = {
            "From": settings.dataexportemail.from,
            "To": devMode ? devEmail : settings.dataexportemail.to,
            "Subject": settings.dataexportemail.subject + ' (all bookings)',
            "TextBody": messagebody,
            "Attachments": [
            {
                "Name": attachmentname,
                "Content": attachmentbody,
                "ContentType": "text/plain"
            }
            ],
        }
        if (!_.isNull(settings.dataexportemail.bcc) && !devMode) {
            postmarkmessage.Bcc = settings.dataexportemail.bcc;
        }
        // console.log(postmarkmessage);
        postmark.send(postmarkmessage);

        callback();
    });
}

// Download a CSV data file
function downloadDataFile(bookingid, res, callback) {
    exportAllBookingsToCSV(bookingid, function (csv, jobnumber) {
        // console.log(jobnumber);
        if (!_.isNull(jobnumber)) {
            attachmentname = settings.dataexportattachmentname.replace('{REF}', '_' + jobnumber);
        }
        else {
            var attachmentname = settings.dataexportattachmentname.replace('{REF}', '_all');
        }

        var filename = attachmentname;
        res.attachment(filename);
        res.end(csv, 'UTF-8');

        callback();
    });
}

function sendError(err, moreInfo, req) {
    var fullUrl = req ? (req.protocol + '://' + req.get('host') + req.originalUrl) : 'unknown';
    var messagebody = '';
    messagebody += 'An error has occured in easysoundtest' + fullUrl + "\n";

    messagebody += 'URL      : ' + fullUrl + "\n";
    messagebody += 'Error    : ' + err.name + "\n";
    messagebody += 'Message  : ' + err.message + "\n";
    messagebody += 'Info     : ' + moreInfo + "\n";
    messagebody += 'Stack    : ' + flats + "\n";
    messagebody += 'Date     : ' + new Date().toString() + "\n";
    var postmarkmessage = {
        "From": settings.bookingemail.from,
        "To": errorEmail,
        "Subject": 'Error in ' + (req ? req.get('host') : 'easysoundtest') + ': ' + err.name,
        "TextBody": messagebody,
    };

    console.log(messagebody);
    postmark.send(postmarkmessage);

}



// - List all bookings
app.get('/admin/booking/all', express.basicAuth(authorize), function (req, res) {

    // NOTE - mongo always uses case sensitive sorting
    var sort = {};
    if (!_.isUndefined(req.query.sort) && req.query.sort != '' && !_.isUndefined(req.query.dir) && req.query.dir == 'desc') {
        sort[req.query.sort] = -1;
    }
    else if (!_.isUndefined(req.query.sort) && req.query.sort != '') {
        sort[req.query.sort] = 1;
    }
    else {
        sort['date'] = 1;
    }
    /*
    // Find all bookings (from today onwards)
    Booking.find({
      date: { $gte: new Date().toString('yyyy-MM-dd') }
    }, [], {sort:sort}, function (err, docs) {
      res.render('admin-booking-list.jade', {
        title: 'All bookings', 
        docs: docs,
        req: req ,
      });
    });
    */

    // Find all bookings
    Booking.find({}, {}, { sort: sort }, function (err, docs) {
        res.render('admin-booking-list.jade', {
            title: 'All bookings',
            docs: docs,
            req: req,
        });
    });
});

// - Calendar view of bookings test adding new URL
app.get('/admin/booking/calendar', express.basicAuth(authorize), function (req, res) {

    var current = req.url;
    // Year and month
    var month = null;
    if (!_.isUndefined(req.query.month) && req.query.month !== '') {
        month = parseInt(req.query.month);
    }
    else {
        month = parseInt(moment().format('M'));
    }
    var year = null;
    if (!_.isUndefined(req.query.year) && req.query.year !== '') {
        year = parseInt(req.query.year);
    }
    else {
        year = parseInt(moment().format('YYYY'));
    }

    var engineer;

    if (!_.isUndefined(req.query.engineer) && req.query.engineer !== '') {
        engineer = (req.query.engineer);
    }
    // console.log('year ' + year);
    // console.log('month ' + month);
    // console.log(moment(year + '-' + month + '-05').format('MM-DD-YYYY d'));
    // Calendar pager
    var curr = '&year=' + parseInt(moment().format('YYYY')) + '&month=' + parseInt(moment().format('M'));
    var prev = '&year=' + year + '&month=' + (month - 1);
    if (month == 1) {
        prev = '&year=' + (year - 1) + '&month=' + 12;
    }
    var next = '&year=' + year + '&month=' + (month + 1);
    if (month == 12) {
        next = '&year=' + (year + 1) + '&month=' + 1;
    }
    var pager = {
        curr: curr,
        prev: prev,
        next: next,
    };
    // console.log(pager);

    // Moment.js weeks start on a Sunday
    var cal_pre = parseInt(moment(year + '-' + month + '-01').format('d')) - 1;
    if (cal_pre < 0) {
        cal_pre += 7;
    }
    var cal_post = 7 - parseInt(moment(year + '-01-31').add('months', month - 1).day());
    var cal_days = parseInt(moment(year + '-01-31').add('months', month - 1).format('D'));

    // This is the calendar object
    var days = [];

    // Find all bookings (for this month only)
    var date_gte = year + '-' + month + '-01';
    var date_lt = year + '-' + (month + 1) + '-01';
    if (month == 12) {
        date_lt = (year + 1) + '-01-01';
    }

    Holiday.find({
        holidayDate: { $gte: date_gte, $lt: date_lt, }
    }, {}, {}, function (err, holidaysArray) {
        var holidays = {};
        holidaysArray.forEach(function (hol) {
            holidays[moment(hol.holidayDate).format('YYYY-MM-D')] = true;
        });

        if (engineer) {
            Booking.find({
                date: { $gte: date_gte, $lt: date_lt, }, engineer: engineer
            }, {}, {}, function (err, docs) {

                // Stuff into the days array
                if (docs.length > 0) {
                    for (var i = 0; i < docs.length; i++) {
                        var datestamp = moment(docs[i].date).format('YYYY-MM-D');
                        if (days[datestamp]) {
                            days[datestamp][days[datestamp].length] = docs[i];
                        }
                        else {
                            days[datestamp] = [];
                            days[datestamp][0] = docs[i];
                        }
                    }
                }
                //console.log(days);

                // Now render the page
                res.render('admin-booking-calendar.jade', {
                    title: 'Bookings for ' + moment(year + '-' + month + '-01').format('MMMM YYYY'),
                    docs: docs,
                    days: days,
                    datestamp_prefix: moment(year + '-' + month + '-01').format('YYYY-MM-'),
                    cal_pre: cal_pre,
                    cal_post: cal_post,
                    cal_days: cal_days,
                    req: req,
                    pager: pager,
                    current: current,
                    engineer: engineer,
                    holidays: holidays,
                    engineerNames: engineerNames,
                    sageGroupNames: sageGroupNames
                });
            });
        }
        else {
            Booking.find({
                date: { $gte: date_gte, $lt: date_lt, }
            }, {}, {}, function (err, docs) {

                // Stuff into the days array
                if (docs.length > 0) {
                    for (var i = 0; i < docs.length; i++) {
                        var datestamp = moment(docs[i].date).format('YYYY-MM-D');
                        if (days[datestamp]) {
                            days[datestamp][days[datestamp].length] = docs[i];
                        }
                        else {
                            days[datestamp] = [];
                            days[datestamp][0] = docs[i];
                        }
                    }
                }
                //console.log(days);

                // Now render the page
                res.render('admin-booking-calendar.jade', {
                    title: 'Bookings for ' + moment(year + '-' + month + '-01').format('MMMM YYYY'),
                    docs: docs,
                    days: days,
                    datestamp_prefix: moment(year + '-' + month + '-01').format('YYYY-MM-'),
                    cal_pre: cal_pre,
                    cal_post: cal_post,
                    cal_days: cal_days,
                    req: req,
                    pager: pager,
                    current: current,
                    engineer: engineer,
                    holidays: holidays,
                    engineerNames: engineerNames,
                    sageGroupNames: sageGroupNames
                });
            });
        }
    });
});

function CheckCanBook (Test1latlon, Test2latlon, NewTestlatlon, Test1endtime, Test2starttime, NewTestTimeonsite, TryingToStack, TimeFromNewTestToHq, latlonhq)
{
    var canbook = false;

 //console.log(Test1latlon.lat);
   //             console.log(Test1latlon.lon);

var latlonstart;
var latlonend;
var travel1toNew_minutes;
var travelNewto2_minutes;

if (Test1latlon.lat == latlonhq.lat && Test1latlon.lon == latlonhq.lon)
{
    travel1toNew_minutes = TimeFromNewTestToHq;
}
else
{
latlonstart = Test1latlon;
latlonend = NewTestlatlon;
/* mach.mapQuestGetTime2(latlonstart, latlonend, function (body) 
 {
   travel1toNew_minutes = Math.ceil(body.route.time / 60);
 });  */
 travel1toNew_minutes = Math.ceil(mapQuestGetTime3(latlonstart, latlonend) / 60);

}
//console.log(latlonstart.lat);
  //              console.log(latlonstart.lon);
// mach.mapQuestGetTime2(latlonstart, latlonend, function (body) 
 //{
   // travel1toNew_minutes = Math.ceil(body.route.time / 60);
 //});

 
 if (Test2latlon.lat == latlonhq.lat && Test2latlon.lon == latlonhq.lon)
{
    travelNewto2_minutes = TimeFromNewTestToHq;
}
else
{
latlonstart = NewTestlatlon;
latlonend = Test2latlon;  


 /*mach.mapQuestGetTime2(latlonstart, latlonend, function (body) 
 {
    travelNewto2_minutes = Math.ceil(body.route.time / 60);
 }); */
  travelNewto2_minutes = Math.ceil(mapQuestGetTime3(latlonstart, latlonend) / 60);
}


console.log('TimeFromNewTestToHq' +TimeFromNewTestToHq);
console.log('travel1toNew_minutes' +travel1toNew_minutes);
console.log(' travelNewto2_minutes' + travelNewto2_minutes);



                                                   
                                                             var testingtimewindow = Test2starttime - Test1endtime;
                                                             var testingtime = travel1toNew_minutes + NewTestTimeonsite + travelNewto2_minutes;
console.log(' NewTestTimeonsite ' + NewTestTimeonsite );
console.log(' Test2starttime ' + Test2starttime );
console.log(' Test1endtime' + Test1endtime);

console.log(' testingtime' + testingtime);
console.log(' testingtimewindow' + testingtimewindow);
                                                             if (testingtime <= testingtimewindow)
                                                             {
                                                                 //success!
                                                                 canbook = true;

                                                                 //then find a start time
                                                                 //would need something on the client calendar, and admin calendar to suggest possible start times
                                                                 endtimenew = Test2starttime- travelNewto2_minutes; //+percentage travel buffer
                                                                 starttimenew = endtimenew - NewTestTimeonsite;

                                                                 //var stored_key = key_cal;
                                                                 if (TryingToStack == true)
                                                                 {

                                                                 calendar[key_cal].available = true;
                                                                 calendar[key_cal].special = true;
                                                                 calendar[key_cal].price = '£' + (settings.soundtest_pricesubsequent + stored_discount);
                                                                 calendar[key_cal].timefromhq = travel1toNew_minutes;
                                                                 calendar[key_cal].testingday = testingtime;//settings.soundtest_time + settings.time_buffer + (timefromhq * 2);
                                                                 calendar[key_cal].timefromtest = travelNewto2_minutes;
                                                                 calendar[key_cal].starttime = starttimenew;
                                                                calendar[key_cal].endtime = endtimenew;                                                                
                                                                }
                                                                else
                                                                {
                                                                 calendar[key_cal].available = true;
                                                                 calendar[key_cal].special = false;

                                                                 if (stored_discount < settings.soundtest_discountlocal) {
                                                                     calendar[key_cal].advanced = true;
                                                                 }

                                                                 calendar[key_cal].price = '£' + (settings.soundtest_pricefirst + stored_discount);
                                                                 calendar[key_cal].timefromhq = travel1toNew_minutes;
                                                                 calendar[key_cal].testingday = testingtime;//settings.soundtest_time + settings.time_buffer + (timefromhq * 2);
                                                                 calendar[key_cal].timefromtest = travelNewto2_minutes;   
                                                                 calendar[key_cal].starttime = starttimenew;
                                                                 calendar[key_cal].endtime = endtimenew;                                                                
                                                                }

                                                               // if (i <= 0) { // is this if there are no existing tests?
                                                                 calendar.sort();
                                                                 callback(calendar);
                                                             //}


    
}
return canbook;
}


function mapQuestGetTime3(start, end){
    //console.log(start);
    console.log('mach.js mapquestgetime2');
    //console.log('mach.js pairid' + pairid);
    //console.log(start.lat);
                //console.log(start.lon);
  var params = "&from="+start.lat+","+start.lon+"&to="+end.lat+","+end.lon;
  var apicall = "http://open.mapquestapi.com/directions/v1/route?key=Fmjtd%7Cluubn16z2g%2C8g%3Do5-90aauz&outFormat=json"+params;
  request(apicall, function (error, response, body)
  {
    //console.log(JSON.parse(body));
    return JSON.parse(body.route.time);
  });
};