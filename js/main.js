/* Mail address obfuscation */
$( document ).ready(function() {
    var emailEl =$("a.email");
    var address  = emailEl.text().replace( /[7,2]/g, '' );

    emailEl.text(address);
    emailEl.attr('href', 'mailto:'+address);
    emailEl.next().hide();

    textNode = emailEl.get(0).nextSibling;
    textNode.parentNode.removeChild(textNode);
    console.log( emailEl.next());
});
