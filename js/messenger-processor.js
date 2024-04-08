// Copyright (c) 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* global currentTime */

/**
 * A simple MessagePort tester.
 *
 * @class MessengerProcessor
 * @extends AudioWorkletProcessor
 */
class MessengerProcessor extends AudioWorkletProcessor {
  constructor(props) {
    super();
    this._lastUpdate = currentTime;
    this.port.onmessage = this.handleMessage_.bind(this);
    this.port.postMessage({
      type: "console",
      message: props,
    });
    this._lastUpdate = currentTime;
  }

  handleMessage_(event) {
    // console.log('[Processor:Received] ' + event.data.message +
    //   ' (' + event.data.contextTimestamp + ')');
  }

  process(inputs, outputs, parameters) {
    this.port.postMessage({
      type: "record",
      buffer: inputs[0],
    });
    return true;
  }
}

registerProcessor('messenger-processor', MessengerProcessor);