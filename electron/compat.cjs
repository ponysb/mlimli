function installCompatibility() {
  if (typeof globalThis.structuredClone !== 'function') {
    const { MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
    globalThis.structuredClone = (value, options) => {
      const { port1, port2 } = new MessageChannel();
      try {
        port1.postMessage(value, options?.transfer);
        return receiveMessageOnPort(port2).message;
      } finally { port1.close(); port2.close(); }
    };
  }
  if (!Array.prototype.findLast) require('core-js/actual/array/find-last');
  if (!Array.prototype.findLastIndex) require('core-js/actual/array/find-last-index');
  if (typeof globalThis.fetch !== 'function') {
    const streams = require('node:stream/web');
    for (const name of ['ReadableStream', 'WritableStream', 'TransformStream']) {
      if (!globalThis[name]) globalThis[name] = streams[name];
    }
    if (!globalThis.DOMException) require('core-js/actual/dom-exception');
    const network = require('undici');
    for (const name of ['fetch', 'Headers', 'Request', 'Response', 'FormData']) globalThis[name] = network[name];
  }
}

module.exports = { installCompatibility };
