$(document).ready(function(){
  
  // OPEN NEW WINDOWS
  $('a[rel=external]').click(function(){
    window.open(this.href);
    return false;
  });
  // Select all elements with data-toggle="tooltips" in the document
	$('[data-toggle="tooltip"]').tooltip(); 
});