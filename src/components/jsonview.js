/**
 * @author Benjamin Hollis
 * 
 * This component provides a stream converter that can translate from JSON to HTML.
 * It is compatible with Firefox 3 and up, since it uses many components that are new
 * to Firefox 3.
 */

// Save some tedious typing
const Ci = Components.interfaces;
const Cc = Components.classes;

// Import XPCOMUtils to help set up our JSONView XPCOM component (new to FF3)
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

// Let us use FUEL
var Application = Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication);


/* 
 * The JSONFormatter helper object. This contains two major functions, jsonToHTML and errorPage, 
 * each of which returns an HTML document.
 */ 
function JSONFormatter() {
  var src = 'chrome://jsonview/locale/jsonview.properties';
  var localeService = Cc["@mozilla.org/intl/nslocaleservice;1"].getService(Ci.nsILocaleService);

  var appLocale = localeService.getApplicationLocale();
  var stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
  this.stringbundle = stringBundleService.createBundle(src, appLocale);
}
JSONFormatter.prototype = {
  htmlEncode: function (t) {
    if (t == null) return '';
    return t.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                       .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  jsString: function(s, noQuotes) {
    var has = { '\b': 'b' // return
              , '\f': 'f' // these
              , '\r': 'r' // to the
              , '\n': 'n' // short
              , '\t': 't' // form
              }, ws; // afterwards!
    for (ws in has)
      if (-1 === s.indexOf(ws))
        delete has[ws];

    s = JSON.stringify(s).slice(1, -1);

    for (ws in has) // undo damage of the over-\uXXXX-tastic JSON serializer
      s = s.replace(new RegExp('\\\\u000'+(ws.charCodeAt().toString(16)), 'ig'),
                    '\\' + has[ws]);

    s = this.htmlEncode(s);
    return noQuotes ? s : '"'+ s +'"';
  },
  
  decorateWithSpan: function (value, className) {
    return '<span class="' + className + '">' + this.htmlEncode(value) + '</span>';
  },
  
  // Convert JSON value (number, string, boolean, null, object, array)
  // into an HTML fragment
  valueToHTML: function(value, indent, nl) {
    var output;
    switch (typeof value) {
      case 'object':
        if (value === null) {
          output = this.decorateWithSpan('null', 'null');
      } else {
          indent = indent == null ? '' : indent + '&nbsp; ';
          if (value.constructor === Array) {
            output = this.arrayToHTML(value, indent, nl);
          } else {
            output = this.objectToHTML(value, indent, nl);
    }
    }
      break;
    
      case 'number':
        output = this.decorateWithSpan(value, 'num');
      break;
  
      case 'string':
        if (/^(\w+):\/\/[^\s]+$/i.test(value)) {
          output = '"<a href="'+ this.htmlEncode(value) +'">' +
                     this.jsString(value, 'noQuotes') + '</a>"';
        } else {
          output = '<span class="string">'+ this.jsString(value) + '</span>';
    }
      break;
    
      case 'boolean':
        output = this.decorateWithSpan(value, 'bool');
      break;
    }
    return output;
  },
  
  // Convert an array into an HTML fragment
  arrayToHTML: function(array, indent, nl) {
    for (var i = 0, output = ''; i < array.length; i++) {
      if (output) output += '<br\n/>' + indent +', ';
      output += this.valueToHTML(array[i], indent, '');
    }
    if (!output) return '[]';
    return '<span class="unfolded array"><span class="content">' +
             (nl ? nl + indent : '') + '[ ' + output + '<br\n/>' +
                              indent + ']</span></span>';
  },
    
  // Convert an object to an HTML fragment
  objectToHTML: function(obj, indent, nl) {
    var output = '';
    for (var key in obj) {
      if (output) output += '<br\n/>' + indent +', ';
      output += '<span class="prop">' + this.jsString(key) + '</span>: ' +
        this.valueToHTML(obj[key], indent, '<br\n/>');
    }
    if (!output) return '{}';
    return '<span class="unfolded obj"><span class="content">' +
             (nl ? nl + indent : '') + '{ ' + output + '<br\n/>' +
                              indent + '}</span></span>';
  },
  
  // Convert a whole JSON value / JSONP response into a formatted HTML document
  jsonToHTML: function(json, callback, uri) {
    var output = '<span id="json">' +
        this.valueToHTML(json, callback ? '' : null, callback && '<br\n/>') +
      '</span>';
    if (callback)
      output = '<span class="callback">' + callback + '(</span>' + output +
               '<span class="callback">)</span>';
    return this.toHTML(output, uri);
  },
  
  // Produce an error document for when parsing fails.
  errorPage: function(error, data, uri) {
    var output = '<div id="error">' + this.stringbundle.GetStringFromName('errorParsing') + '</div>';
    output += '<h1>' + this.stringbundle.GetStringFromName('docContents') + ':</h1>';
    output += '<span id="json">' + this.htmlEncode(data) + '</span>';
    return this.toHTML(output, uri + ' - Error');
  },
  
  // Wrap the HTML fragment in a full document. Used by jsonToHTML and errorPage.
  toHTML: function(content, title) {
    return '<!DOCTYPE html>\n' +
      '<html><head><title>' + this.htmlEncode(title) + '</title>\n' +
      '<link rel="stylesheet" type="text/css" href="chrome://jsonview/content/default.css">\n' +
      '<script type="text/javascript" src="chrome://jsonview/content/default.js"></script>\n' +
      '</head><body>\n' + content + '<br\n/></body></html>';
  }
};

// This component is an implementation of nsIStreamConverter that converts application/json to html
const JSONVIEW_CONVERSION =
    "?from=application/json&to=*/*";
const JSONVIEW_CONTRACT_ID =
    "@mozilla.org/streamconv;1" + JSONVIEW_CONVERSION;
const JSONVIEW_COMPONENT_ID = 
    Components.ID("{64890660-53c4-11dd-ae16-0800200c9a66}");
    
// JSONView class constructor. Not much to see here.
function JSONView() {  
  // Native JSON implementation, new to FF3
  this.nativeJSON = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
  this.jsonFormatter = new JSONFormatter();
};

// This defines an object that implements our converter, and is set up to be XPCOM-ified by XPCOMUtils
JSONView.prototype = {

  // properties required for XPCOM registration:
  classDescription: "JSONView XPCOM Component",
  classID:          JSONVIEW_COMPONENT_ID,
  contractID:       JSONVIEW_CONTRACT_ID,

  _xpcom_categories: [{
    category: "@mozilla.org/streamconv;1",
    entry: JSONVIEW_CONVERSION,
    value: "JSON to HTML stream converter"
  }],
  
  QueryInterface: XPCOMUtils.generateQI([
      Ci.nsISupports,
      Ci.nsIStreamConverter,
      Ci.nsIStreamListener,
      Ci.nsIRequestObserver
  ]),
  
  /*
   * This component works as such:
   * 1. asyncConvertData captures the listener
   * 2. onStartRequest fires, initializes stuff, modifies the listener to match our output type
   * 3. onDataAvailable transcodes the data into a UTF-8 string
   * 4. onStopRequest gets the collected data and converts it, spits it to the listener
   * 5. convert does nothing, it's just the synchronous version of asyncConvertData
   */
  
  // nsIStreamConverter::convert
  convert: function (aFromStream, aFromType, aToType, aCtxt) {
      return aFromStream;
  },
  
  // nsIStreamConverter::asyncConvertData
  asyncConvertData: function (aFromType, aToType, aListener, aCtxt) {
    // Store the listener passed to us
    this.listener = aListener;
  },
  
  // nsIStreamListener::onDataAvailable
  onDataAvailable: function (aRequest, aContext, aInputStream, aOffset, aCount) {
    // From https://developer.mozilla.org/en/Reading_textual_data
    var is = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
    is.init(aInputStream, this.charset, -1, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
  
    var str = {};
    
    // This used to read in a loop until readString returned 0, but it caused it to crash Firefox on OSX/Win32 (but not Win64)
    // It seems just reading once with -1 (default buffer size) gets the file done.
    // However, *not* reading in a loop seems to cause problems with Firebug
    // So I read in a loop, but do whatever I can to avoid infinite-looping.
    var totalBytesRead = 0;
    var bytesRead = 1; // Seed it with something positive
    
    while (totalBytesRead < aCount && bytesRead > 0) {
      bytesRead = is.readString(-1, str);
      totalBytesRead += bytesRead;
      this.data += str.value;
    }
    
  },
  
  // nsIRequestObserver::onStartRequest
  onStartRequest: function (aRequest, aContext) {
    this.data = '';
    this.uri = aRequest.QueryInterface(Ci.nsIChannel).URI.spec;

    // Sets the charset if it is available. (For documents loaded from the
    // filesystem, this is not set.)
    this.charset = aRequest.QueryInterface(Ci.nsIChannel).contentCharset || 'UTF-8';

    this.channel = aRequest;
    this.channel.contentType = "text/html";
    // All our data will be coerced to UTF-8
    this.channel.contentCharset = "UTF-8";

    this.listener.onStartRequest (this.channel, aContext);
  },
  
  // nsIRequestObserver::onStopRequest
  onStopRequest: function (aRequest, aContext, aStatusCode) {
    /*
     * This should go something like this:
     * 1. Make sure we have a unicode string.
     * 2. Convert it to a Javascript object.
     * 2.1 Removes the callback
     * 3. Convert that to HTML? Or XUL?
     * 4. Spit it back out at the listener
     */
    
    var converter = Components
        .classes["@mozilla.org/intl/scriptableunicodeconverter"]
        .createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = this.charset;
    var outputDoc = "";
    
    var cleanData = '',
        callback = '';

    // This regex attempts to match a JSONP structure:
    //    * Any amount of whitespace (including unicode nonbreaking spaces) between the start of the file and the callback name
    //    * Callback name (any valid JavaScript function name according to ECMA-262 Edition 3 spec)
    //    * Any amount of whitespace (including unicode nonbreaking spaces)
    //    * Open parentheses
    //    * Any amount of whitespace (including unicode nonbreaking spaces)
    //    * Either { or [, the only two valid characters to start a JSON string.
    //    * Any character, any number of times
    //    * Either } or ], the only two valid closing characters of a JSON string.
    //    * Any amount of whitespace (including unicode nonbreaking spaces)
    //    * A closing parenthesis, an optional semicolon, and any amount of whitespace (including unicode nonbreaking spaces) until the end of the file.
    // This will miss anything that has comments, or more than one callback, or requires modification before use.
    var callback_results = /^[\s\u200B\uFEFF]*([\w$\[\]\.]+)[\s\u200B\uFEFF]*\([\s\u200B\uFEFF]*([\[{][\s\S]*[\]}])[\s\u200B\uFEFF]*\);?[\s\u200B\uFEFF]*$/.exec(this.data);
    if( callback_results && callback_results.length == 3 ){
      callback = callback_results[1];
      cleanData = callback_results[2];
    }else{
      cleanData = this.data;
    }
    
    try {
      var jsonObj = this.nativeJSON.decode(cleanData);      
      outputDoc = this.jsonFormatter.jsonToHTML(jsonObj, callback, this.uri);      
    }
    catch(e) {
      outputDoc = this.jsonFormatter.errorPage(e, this.data, this.uri);
    }
    
    // I don't really understand this part, but basically it's a way to get our UTF-8 stuff
    // spit back out as a byte stream
    // See http://www.mail-archive.com/mozilla-xpcom@mozilla.org/msg04194.html
    var storage = Cc["@mozilla.org/storagestream;1"]
    .createInstance(Ci.nsIStorageStream);
    
    // I have no idea what to pick for the first parameter (segments)
    storage.init(4, 0xffffffff, null);
    var out = storage.getOutputStream(0);
    
    var binout = Cc["@mozilla.org/binaryoutputstream;1"]
    .createInstance(Ci.nsIBinaryOutputStream);
    binout.setOutputStream(out);
    binout.writeUtf8Z(outputDoc);
    binout.close();
    
    // I can't explain it, but we need to trim 4 bytes off the front or else it includes random crap
    var trunc = 4;
    var instream = storage.newInputStream(trunc);
    
    // Pass the data to the main content listener
    this.listener.onDataAvailable(this.channel, aContext, instream, 0, storage.length - trunc);

    this.listener.onStopRequest(this.channel, aContext, aStatusCode);
  }
};

// We only have one component to register
var components = [JSONView];

// The actual hook into XPCOM
if (XPCOMUtils.generateNSGetFactory) {
  // Gecko 2 (FF4) uses a different component registration strategy and registers categories in chrome.manifest
  var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
} else {
  // Older Firefox requires manually setting up category entries
  var NSGetModule = function NSGetModule(compMgr, fileSpec){
    function postRegister(){
      var catMgr = XPCOMUtils.categoryManager;
      catMgr.addCategoryEntry('ext-to-type-mapping', 'json', 'application/json', true, true);
    }
    
    
    function preUnregister(){
      var catMgr = XPCOMUtils.categoryManager;
      catMgr.addCategoryEntry('ext-to-type-mapping', 'json', true);
    }
    
    return XPCOMUtils.generateModule(components, postRegister, preUnregister);
  };
}