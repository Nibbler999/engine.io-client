/**
 * Module dependencies.
 */

var Transport = require('../transport');
var parser = require('engine.io-parser');
var parseqs = require('parseqs');
var inherit = require('component-inherit');
var yeast = require('yeast');
var debug = require('debug')('engine.io-client:tcp');

var Client = require('http-tcp-packets').Client;

/**
 * Module exports.
 */

module.exports = Tcp;

/**
 * Tcp transport constructor.
 *
 * @api {Object} connection options
 * @api public
 */

function Tcp(opts){
  var forceBase64 = (opts && opts.forceBase64);
  if (forceBase64) {
    this.supportsBinary = false;
  }
  this.binaryType = opts.binaryType;

  Transport.call(this, opts);

  this.draincb = this.drain.bind(this);
  this.encodePacketcb = this.encodePacket.bind(this);
}

/**
 * Inherits from Transport.
 */

inherit(Tcp, Transport);

/**
 * Transport name.
 *
 * @api public
 */

Tcp.prototype.name = 'tcp';

/*
 * Tcp support binary
 */

Tcp.prototype.supportsBinary = true;

/**
 * Opens socket.
 *
 * @api private
 */

Tcp.prototype.doOpen = function(){

  var self = this;

  var opts = this.connOpts();

  var client = new Client();

  client.connect(opts, function (err, conn) {

    if (err) {
        return self.onError(err);
    }

    self.conn = conn;

    conn.on('data', self.handleData.bind(self));
    conn.on('error', self.onError.bind(self));
    conn.on('end', self.onClose.bind(self));

    self.onOpen();
 });
};

Tcp.prototype.connOpts = function () {

  var query = this.query || {};
  var schema = this.secure ? 'https:' : 'http:';

  // append timestamp to URI
  if (this.timestampRequests) {
    query[this.timestampParam] = yeast();
  }

  // communicate binary support capabilities
  if (!this.supportsBinary) {
    query.b64 = 1;
  }

  query = parseqs.encode(query);

  // prepend ? to query
  if (query.length) {
    query = '?' + query;
  }

  var opts = {
    protocol: schema,
    hostname: this.hostname,
    port: this.port,
    path: this.path + query,
    agent: this.agent,
    headers: {},
    binaryType: this.binaryType
  };

  // SSL options for Node.js client
  opts.pfx = this.pfx;
  opts.key = this.key;
  opts.passphrase = this.passphrase;
  opts.cert = this.cert;
  opts.ca = this.ca;
  opts.ciphers = this.ciphers;
  opts.rejectUnauthorized = this.rejectUnauthorized;

  if (this.extraHeaders) {
    for (var h in this.extraHeaders) {
        if (this.extraHeaders.hasOwnProperty(h)) {
            opts.headers[h] = this.extraHeaders[h];
        }
    }
  }

  return opts;
};

/**
 * Writes data to socket.
 *
 * @param {Array} array of packets.
 * @api private
 */

Tcp.prototype.write = function(packets){
  this.writable = false;
  packets.forEach(this.writePacket, this);
};

Tcp.prototype.writePacket = function (packet) {
  parser.encodePacket(packet, this.supportsBinary, this.encodePacketcb);
};

Tcp.prototype.encodePacket = function (data) {

  debug('writing "%o"', data);

  if (typeof data === 'string') {
    this.conn.write(data, this.draincb);
  } else {
    this.conn.writev(data, this.draincb);
  }
};

Tcp.prototype.drain = function () {
  this.writable = true;
  this.emit('drain');
};

Tcp.prototype.handleData = function (data) {
  this.onData(data);
};

/**
 * Closes socket.
 *
 * @api private
 */

Tcp.prototype.doClose = function(){
  if (typeof this.conn !== 'undefined') {
    this.conn.end();
  }
};

