import { scaleFrequency, type RiverTone } from "./mapping";

type EventCallback = (energy: number, note: number) => void;

const createImpulse = (context: AudioContext) => {
  const length = context.sampleRate * 2.6;
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    }
  }
  return buffer;
};

export class RiverSynth {
  private context?: AudioContext;
  private master?: GainNode;
  private delay?: DelayNode;
  private feedback?: GainNode;
  private reverb?: ConvolverNode;
  private timer?: number;
  private step = 0;
  private tone: RiverTone;
  private readonly onEvent: EventCallback;
  private randomState: number;
  private droneStarted = false;

  constructor(tone: RiverTone, onEvent: EventCallback) {
    this.tone = tone;
    this.onEvent = onEvent;
    this.randomState = tone.seed || 1;
  }

  get isPlaying() {
    return this.timer !== undefined;
  }

  updateTone(tone: RiverTone) {
    this.tone = tone;
    if (this.delay) {
      const now = this.delay.context.currentTime;
      this.delay.delayTime.setTargetAtTime(tone.voice.delayTime, now, 1.2);
    }
    if (this.feedback) {
      this.feedback.gain.setTargetAtTime(tone.voice.feedback, this.feedback.context.currentTime, 1.4);
    }
  }

  async start() {
    if (this.isPlaying) return;
    this.context = this.context ?? new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
    this.buildGraph(true);
    this.wakeOutput(0.18);
    this.schedule();
  }

  async skipRock() {
    this.context = this.context ?? new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
    this.buildGraph(false);
    if (!this.context || !this.master || !this.delay || !this.reverb) return;
    this.wakeOutput(0.16);

    const context = this.context;
    const master = this.master;
    const delay = this.delay;
    const reverb = this.reverb;
    const now = context.currentTime;
    const taps = [0, 0.13, 0.27];
    taps.forEach((offset, index) => {
      const start = now + offset;
      const duration = 0.09 + index * 0.018;
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2.4;
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const pan = context.createStereoPanner();

      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(950 + index * 420 + this.tone.brightness * 480, start);
      filter.Q.value = 2.8;
      pan.pan.setValueAtTime(-0.45 + index * 0.32, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.05 - index * 0.008, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(master);
      pan.connect(delay);
      if (index > 0) pan.connect(reverb);
      source.start(start);
      source.stop(start + duration + 0.02);

    });
  }

  stop() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.4);
    }
  }

  destroy() {
    this.stop();
    void this.context?.close();
    this.context = undefined;
  }

  private buildGraph(includeDrone: boolean) {
    if (!this.context) return;
    if (this.master) {
      if (includeDrone) this.startDrone();
      return;
    }
    const context = this.context;
    this.master = context.createGain();
    this.master.gain.value = 0.0001;

    this.delay = context.createDelay(1);
    this.delay.delayTime.value = this.tone.voice.delayTime;
    this.feedback = context.createGain();
    this.feedback.gain.value = this.tone.voice.feedback;
    this.reverb = context.createConvolver();
    this.reverb.buffer = createImpulse(context);

    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.master);
    this.master.connect(context.destination);
    if (includeDrone) this.startDrone();
  }

  private wakeOutput(level: number) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(level, now, 0.45);
  }

  private startDrone() {
    if (this.droneStarted) return;
    this.droneStarted = true;
    this.createDrone();
  }

  private random() {
    this.randomState = Math.imul(1664525, this.randomState) + 1013904223;
    return (this.randomState >>> 0) / 4294967296;
  }

  private schedule() {
    if (!this.context || !this.master || !this.delay || !this.reverb) return;
    const context = this.context;
    const now = context.currentTime;
    const direction = this.tone.movement;
    const directionBias = direction === 0 ? Math.sin(this.step * 0.12) : direction * (this.step % 3) * 0.22;
    const stationMotif = Math.sin(this.step * (0.055 + (this.tone.seed % 7) * 0.006)) * 1.15;
    const noteIndex =
      2 +
      Math.round(directionBias + stationMotif) +
      Math.floor(this.random() * this.tone.voice.noteSpan);
    const frequency = scaleFrequency(noteIndex, this.tone.rootMidi, this.tone.scale, this.tone.register);
    const accent = this.random() < this.tone.voice.accentChance + this.tone.voice.restlessness * 0.04;
    const velocity = 0.014 + this.random() * 0.018 + this.tone.density * 0.008 + (accent ? 0.008 : 0);
    const attack = this.tone.voice.attack + this.random() * 1.1;
    const release = this.tone.voice.release + this.random() * 3.2;

    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();

    osc.type = accent ? this.tone.voice.accentWave : this.tone.voice.wave;
    osc.frequency.setValueAtTime(frequency, now);
    osc.detune.setValueAtTime((this.random() - 0.5) * (4 + this.tone.stageLevel * 8), now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      this.tone.voice.filterBase + this.tone.brightness * this.tone.voice.filterRange + (accent ? 160 : 0),
      now,
    );
    filter.Q.value = 0.08;
    pan.pan.setValueAtTime(Math.sin(this.step * 0.21 + this.tone.seed) * this.tone.voice.spread * 0.7, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(velocity, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    pan.connect(this.delay);
    if (this.random() < 0.58 + this.tone.stageLevel * 0.24) pan.connect(this.reverb);

    osc.start(now);
    osc.stop(now + attack + release + 0.2);
    this.onEvent(Math.min(1, velocity * 12), noteIndex);
    this.step += 1;

    if (accent && this.random() < this.tone.voice.harmonyChance) this.scheduleHarmony(now, noteIndex);
    if (this.random() < this.tone.voice.harpChance) this.scheduleHarp(now + this.random() * 0.34, noteIndex);

    const jitter = 0.76 + this.random() * 0.72;
    this.timer = window.setTimeout(() => this.schedule(), this.tone.tempoMs * jitter);
  }

  private scheduleHarp(now: number, noteIndex: number) {
    if (!this.context || !this.master || !this.delay || !this.reverb) return;
    const frequency = scaleFrequency(
      noteIndex + 3 + Math.floor(this.random() * 3),
      this.tone.rootMidi,
      this.tone.scale,
      this.tone.register,
    );
    const output = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const pan = this.context.createStereoPanner();
    const decay = this.tone.voice.harpDecay + this.random() * 0.55;
    const level = this.tone.voice.harpLevel * (0.7 + this.random() * 0.5);

    filter.type = "bandpass";
    filter.frequency.value = 900 + this.tone.brightness * 900;
    filter.Q.value = 0.7;
    pan.pan.value = (this.random() * 2 - 1) * this.tone.voice.spread;
    output.gain.setValueAtTime(0.0001, now);
    output.gain.linearRampToValueAtTime(level, now + 0.055);
    output.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    [1, 2.01, 3.02].forEach((partial, index) => {
      const osc = this.context?.createOscillator();
      const partialGain = this.context?.createGain();
      if (!osc || !partialGain) return;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency * partial, now);
      osc.detune.setValueAtTime((this.random() - 0.5) * 5, now);
      partialGain.gain.value = [1, 0.24, 0.08][index];
      osc.connect(partialGain);
      partialGain.connect(filter);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    });

    filter.connect(output);
    output.connect(pan);
    pan.connect(this.master);
    pan.connect(this.delay);
    if (this.random() < 0.65) pan.connect(this.reverb);
    window.setTimeout(
      () => this.onEvent(Math.min(1, level * 18), noteIndex + 5),
      Math.max(0, (now - this.context.currentTime) * 1000),
    );
  }

  private scheduleHarmony(now: number, noteIndex: number) {
    if (!this.context || !this.master || !this.delay) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    osc.type = "sine";
    osc.frequency.setValueAtTime(
      scaleFrequency(noteIndex + 2 + (this.tone.seed % 2), this.tone.rootMidi, this.tone.scale, this.tone.register),
      now + 0.08,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.012 + this.tone.voice.accentChance * 0.02, now + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.8 + this.tone.voice.release * 0.36);
    pan.pan.value = -Math.sin(this.step * 0.37) * this.tone.voice.spread;
    osc.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    pan.connect(this.delay);
    osc.start(now + 0.08);
    osc.stop(now + 4);
    window.setTimeout(() => this.onEvent(0.32, noteIndex + 2), 80);
  }

  private createDrone() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const intervals = [0, 2, 4];
    intervals.forEach((interval, index) => {
      if (!this.context || !this.master) return;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      const pan = this.context.createStereoPanner();
      osc.type = index === 1 ? "triangle" : "sine";
      osc.frequency.value = scaleFrequency(
        interval,
        this.tone.rootMidi + this.tone.voice.droneInterval,
        this.tone.scale,
        this.tone.register - 17,
      );
      osc.detune.value = [-3, 2, 5][index];
      filter.type = "lowpass";
      filter.frequency.value = 140 + index * 42 + this.tone.brightness * 110;
      pan.pan.value = [-0.28, 0.18, 0.34][index] * this.tone.voice.spread;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.setTargetAtTime(this.tone.voice.droneGain * [0.8, 0.46, 0.28][index], now, 6.5);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(this.master);
      osc.start();
    });
  }
}
