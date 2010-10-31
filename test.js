var StreamStack = require('./stream-stack').StreamStack;

function HttpRequestStack(stream) {
  StreamStack.call(this, stream);
}
require("util").inherits(HttpRequestStack, StreamStack);

HttpRequestStack.prototype.request = function(method, path, headers) {
  this.stream.write(method.toUpperCase() + " " + path + " HTTP/1.1\r\n");
  if (headers) {
    headers.forEach(function(line) {
      this.stream.write(line + "\r\n");
    }, this);
  }
  this.stream.write("\r\n");
}
HttpRequestStack.prototype.get = function(path, headers) {
  this.request("get", path, headers);
}
HttpRequestStack.prototype.end = function() {
  
}


var conn = require('net').createConnection(80, 'www.google.com');

conn.on("connect", function() {
  console.error("connect event!");

  var req = new HttpRequestStack(conn);
  req.get("/", ["Connection: close"]);
  req.end();


  req.on("end", function() {
    console.error("req end event!");
  });

  req.pipe(require('fs').createWriteStream(__dirname + "/tmp.txt"));
});

