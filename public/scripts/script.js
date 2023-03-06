$(document).ready(function(){
  /*
  // PROTO
  $('#results').hide();
  $('#go-book').click(function(){
    setTimeout(function(){
      $('#results').show();
    }, 1000);
    return false;
  });
  // END PROTO
  */
  
  // LINKIFY BOXES
  $('.cell').click(function(){
    // var $links = $(this).find('a');
    // if ($links.length) {
      // var href = $($links.get(0)).attr('href');
      // location.href = href;
    // }
    var $forms = $(this).find('form');
    if ($forms.length) {
      var form = $forms.get(0);
      form.submit();
    }
    return false;
  });
  // END LINKIFY BOXES
});