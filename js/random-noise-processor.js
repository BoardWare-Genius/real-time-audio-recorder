class RandomNoiseProcessor extends AudioWorkletProcessor {
  constructor(props) {
    super();
  }
  process(inputs, outputs, parameters) {
    print("random");
    const output = outputs[0];
    output.forEach((channel) => {
      for (let i = 0; i < channel.length; i++) {
        channel[i] = Math.random() * 2 - 1;
      }
    });
    return true;
  }
}

registerProcessor("random-noise-processor", RandomNoiseProcessor);
