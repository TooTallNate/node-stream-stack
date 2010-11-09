var Stream = require('stream').Stream;

/**
 * StreamStack
 * -----------
 * Turns low-level `Stream` objects into stackable stream, meant
 * to fill out your desired protocol stack. But also allow for
 * the protocol to be implemented independent of the underlying
 * transport.
 *   An example overall stack could look like:
 *     - net.Stream                           <- TCP Layer
 *     - HttpRequestStack                     <- HTTP Layer
 *       - `write()`s an HTTP request upstream
 *       - Response comes back with 'gzip' transfer-encoding
 *     - GzipDecoderStack                     <- Decoding Layer
 *     - `.pipe()` into a 'fs.WriteStream'    <- Save to a File
 */
function StreamStack(stream) {
  if (!(stream instanceof Stream)) {
    throw new Error("StreamStack expects an instance of 'Stream' as an argument!");
  }
  if (!(this instanceof StreamStack)) {
    return new StreamStack(stream);
  }

  var self = this;
  Stream.call(self);
  this.stream = stream;

  // Monkey-patch the parent stream's 'emit' function, to proxy any
  // events from the parent stream, and emit them downstream instance,
  // IFF there aren't any listeners on the parent stream for
  // that event already.
  //   I.E. If you DON'T attach a 'data' listener in your StreamStack subclass'
  //        constructor, then the event will be proxied, untouched, to the
  //        child stream. If you DO attach a 'data' listener, then you are
  //        responsible for emitting 'data' events on this child stream, usually
  //        having first gone through some kind of filter based on what this
  //        StreamStack is actually implementing.
  var origEmit = stream.emit;
  stream.emit = function() {
    var args = arguments;
    if (origEmit.apply(stream, args)) {
      return true;
    } else {
      return self.emit.apply(self, args);
    }
  }

  // Attach a listener for the defined standard ReadStream and WriteStream
  // events that get emitted. The handler that gets attached manually counts
  // the number of attached listeners for the given event, and proxies the
  // event to the child stream, so long as there's no other listeners attached.
  //   Ideally this wouldn't be necessay, but Node has some internal
  //   optimizations that prevent events from being emitted if there aren't
  //   any listeners attached for that event.
  proxyEvent('data',  stream, this);
  proxyEvent('end',   stream, this);
  proxyEvent('error', stream, this);
  proxyEvent('close', stream, this);
  proxyEvent('fd',    stream, this);
  proxyEvent('drain', stream, this);

}
require('util').inherits(StreamStack, Stream);
exports.StreamStack = StreamStack;

// By default, just proxy all the standard ReadStream and WriteStream
// functions upstream. If the StreamStack implementation needs to overwrite
// or augment any of the behavior, then simply overwrite that function.
//   The most common is to augment the 'write()' function, such that the
//   passed data goes through some kind of filter before being passed to
//   the parent stream.
StreamStack.prototype.write = function(buf, type) {
  this.stream.write(buf, type);
}
StreamStack.prototype.end = function(buf, type) {
  if (buf) {
    this.write(buf, type);
  }
  this.stream.end();
}
StreamStack.prototype.pause = function() {
  this.stream.pause();
}
StreamStack.prototype.resume = function() {
  this.stream.resume();
}
StreamStack.prototype.destroy = function(error) {
  this.stream.destory(error);
}

// By default, the 'readable' and 'writable' property lookups get proxied
// to the parent stream. You can set the variables if needed, and to relinquish
// control of the variable back upstream, set it to `undefined`.
Object.defineProperty(StreamStack.prototype, "readable", {
  get: function() {
    if (this._readable != undefined) {
      return this._readable;
    }
    return this.stream.readable;
  },
  set: function(value) {
    this._readable = value;
  },
  enumerable: true
});
Object.defineProperty(StreamStack.prototype, "writable", {
  get: function() {
    if (this._writable != undefined) {
      return this._writable;
    }
    return this.stream.writable;
  },
  set: function(value) {
    this._writable = value;
  },
  enumerable: true
});

// Stupid workaround. Attach a listener for the given 'eventName'.
// The callback returns and does nothing if there are no other
// listeners attached for that event, otherwise it proxies the event
// downstream to the child StreamStack.
function proxyEvent(eventName, stream, streamStack) {
  var callback = function() {
    var listeners = stream._events[eventName];
    if (Array.isArray(listeners) && listeners.length > 1) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(eventName);
    streamStack.emit.apply(streamStack, args);
  }
  stream.on(eventName, callback);
}

