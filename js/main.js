// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Extends AudioWorkletNode to simplify the cross-thread message posting.

const BUFFER_SIZE = 4096;

class MessengerWorkletNode extends AudioWorkletNode {

  constructor(context) {
    super(context, 'messenger-processor', {
      numberOfInputs: 1
    });
    this.wc = new WebSocket('ws://localhost:8080/websocket');
    this.wc.onopen = () => {
      this.recording = true;
    }
    this.channels = context.destination.channelCount;
    this.counter_ = 0;
    this.port.onmessage = this.handleMessage_.bind(this);
    this.recBuffers = [];
    this.recLength = 0;
    this.initBuffers();
  }
  initBuffers() {
    for (var channel = 0; channel < this.channels; channel++) {
      this.recBuffers[channel] = [];
    }
    this.recLength = 0;
  }

  stop() {
    this.recording = false;
    this.packBlock();
    close(this.ws);
    // const b = packBlock(this.recBuffers, this.channels, this.recLength)
    // console.log("b:", b)
    // this.wc.send(b);
    // createDownloadLink(this.exportWAV());
  }

  exportWAV() {
    return exportWAV('audio/wav', this.recBuffers, this.recLength, this.channels, this.context.sampleRate);
  }

  record(inputBuffer) {
    if (!this.recording) {
      return;
    }

    for (var channel = 0; channel < this.channels; channel++) {
      this.recBuffers[channel].push(inputBuffer[channel]);
    }

    this.recLength += inputBuffer[0].length;
    if (this.recLength >= BUFFER_SIZE) {
      this.packBlock();
    }
  }
  packBlock() {
    const b = packBlock(this.recBuffers, this.channels, this.recLength)
    this.wc.send(b);
    this.initBuffers();
  }

  handleMessage_(event) {
    switch (event.data.type) {
      case "record": {
        this.record(event.data.buffer)
        break;
      }
      case "console": {
        this.consoleLog(event.data.message);
        break;
      }
    }
  }

  consoleLog(message) {
    console.log(message)
  }

}

const audioContext = new AudioContext();

const startAudio = async (context, microphone) => {
  await context.audioWorklet.addModule('/js/messenger-processor.js');

  // This worklet node does not need a connection to function. The
  // AudioWorkletNode is automatically processed after construction.
  // eslint-disable-next-line no-unused-vars
  const messengerWorkletNode = new MessengerWorkletNode(context);
  microphone.connect(messengerWorkletNode);
  return () => {
    messengerWorkletNode.stop();
  }
};

// A simplem onLoad handler. It also handles user gesture to unlock the audio
// playback.
window.addEventListener('load', async () => {
  navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
    let microphone = audioContext.createMediaStreamSource(stream)
    const buttonEl = document.getElementById('button-start');
    buttonEl.disabled = false;
    buttonEl.addEventListener('click', async () => {
      const stopCallback = await startAudio(audioContext, microphone);
      audioContext.resume();
      buttonEl.disabled = true;
      buttonEl.textContent = 'Playing...';
      const buttonStop = document.getElementById('button-stop');
      buttonStop.addEventListener('click', stopCallback, false);
    }, false);

  })
});

function mergeBuffers(recBuffers, recLength) {
  var result = new Float32Array(recLength);
  var offset = 0;
  for (var i = 0; i < recBuffers.length; i++) {
    result.set(recBuffers[i], offset);
    offset += recBuffers[i].length;
  }
  return result;
}

function interleave(inputL, inputR) {
  var length = inputL.length + inputR.length;
  var result = new Float32Array(length);

  var index = 0,
    inputIndex = 0;

  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function floatTo16BitPCM(output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string) {
  for (var i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(samples, sampleRate, numChannels) {
  var buffer = new ArrayBuffer(44 + samples.length * 2);
  var view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 4, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numChannels * 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);
  return view;
}

function packBlock(recBuffers, numChannels, recLength) {
  var buffers = [];
  for (var channel = 0; channel < numChannels; channel++) {
    buffers.push(mergeBuffers(recBuffers[channel], recLength));
  }
  var interleaved = undefined;
  if (numChannels === 2) {
    interleaved = interleave(buffers[0], buffers[1]);
  } else {
    interleaved = buffers[0];
  }
  var buffer = new ArrayBuffer(interleaved.length * 2);
  var view = new DataView(buffer);
  floatTo16BitPCM(view, 0, interleaved);
  return buffer;
}

function exportWAV(type, recBuffers, recLength, numChannels, sampleRate) {
  var buffers = [];
  for (var channel = 0; channel < numChannels; channel++) {
    buffers.push(mergeBuffers(recBuffers[channel], recLength));
  }
  var interleaved = undefined;
  if (numChannels === 2) {
    interleaved = interleave(buffers[0], buffers[1]);
  } else {
    interleaved = buffers[0];
  }
  var dataview = encodeWAV(interleaved, sampleRate, numChannels);
  var audioBlob = new Blob([dataview], { type: type });
  return audioBlob;
}


function createDownloadLink(blob) {
  var downloadDiv = document.getElementById("download");
  console.log(blob);
  var url = URL.createObjectURL(blob);
  var au = document.createElement('audio');
  var li = document.createElement('li');
  var link = document.createElement('a');

  //name of .wav file to use during upload and download (without extendion)
  var filename = new Date().toISOString();

  //add controls to the <audio> element
  au.controls = true;
  au.src = url;

  //save to disk link
  link.href = url;
  link.download = filename + ".wav"; //download forces the browser to donwload the file using the  filename
  link.innerHTML = "Save to disk";

  //add the new audio element to li
  li.appendChild(au);

  //add the filename to the li
  li.appendChild(document.createTextNode(filename + ".wav "))

  //add the save to disk link to li
  li.appendChild(link);

  //upload link
  var upload = document.createElement('a');
  upload.href = "#";
  upload.innerHTML = "Upload";
  upload.addEventListener("click", function (event) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function (e) {
      if (this.readyState === 4) {
        console.log("Server returned: ", e.target.responseText);
      }
    };
    var fd = new FormData();
    fd.append("audio_data", blob, filename);
    xhr.open("POST", "upload.php", true);
    xhr.send(fd);
  })
  li.appendChild(document.createTextNode(" "))//add a space in between
  li.appendChild(upload)//add the upload link to li

  //add the li element to the ol
  downloadDiv.appendChild(li);
}