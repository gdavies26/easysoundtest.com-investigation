var request = require('request');

var mach = require('./mach');

var start = { lat: '51.4689587', lon: '-2.6112713' };
var end = { lat: '52.7689587', lon: '-2.6112713' };
var hq = { lat: '51.4631671574552', lon: '-2.59007157677629' };
var testTime = 60;
var workingDay = 9*60;
var date = 1;
var discount = 0;


mach.mapQuestGetTime(date,discount,start,end, function(body, stored_key,stored_discount) {

  mach.mapQuestFromHQ(hq, end, function(timeFromHq) {

      var seconds = body.route.time;
      var minutes = Math.ceil(body.route.time / 60);
      var hours = Math.ceil(body.route.time / (60 * 60));
      console.log('time: ' + seconds + 's, ' + minutes + 'm, ' + hours + 'h');
      var timeFromHq = Math.ceil(timeFromHq/60);
      var timeToHq = 60;
      var testingDay = ((timeFromHq*2)+minutes+(testTime*2))
      console.log(timeFromHq);
      console.log(testingDay);
      if (testingDay < workingDay) {console.log('yes');}
        
/*        calendar[stored_key].available = true;*/
        //calendar[stored_key].special = true;
        //calendar[stored_key].price = '£' + (settings.soundtest_pricesubsequent + stored_discount);
      //}
      //else {
        //// Not enough time, mark it as full
        //// calendar[stored_key] = {available: false, special: false, date: cellday.format('ddd Do MMMM'), price: '£' + 0};
        //// Updating existing item
        //calendar[stored_key].available = false;
        //calendar[stored_key].special = false;
        //calendar[stored_key].price = '£' + 0;
      /*}*/
  });
});
