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
  private compressor?: DynamicsCompressorNode;
  private delay?: DelayNode;
  private feedback?: GainNode;
  private reverb?: ConvolverNode;
  private timer?: number;
  private step = 0;
  private lastNoteIndex = 2;
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
    this.wakeOutput(0.12);
    this.schedule();
  }

  async skipRock() {
    this.context = this.context ?? new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
    this.buildGraph(false);
    if (!this.context || !this.master || !this.delay || !this.reverb) return;
    const wasPlaying = this.isPlaying;
    this.wakeOutput(0.16);

    const context = this.context;
    const master = this.master;
    const delay = this.delay;
    const reverb = this.reverb;
    const now = context.currentTime;
    const taps = [0, 0.13, 0.27];
    taps.forEach((offset, index) => {
      const start = now + offset;
      const duration = 0.075 + index * 0.018;
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        const decay = 1 - i / data.length;
        data[i] = (Math.random() * 2 - 1) * decay ** 5.2;
      }

      const source = context.createBufferSource();
      const noiseGain = context.createGain();
      const noiseFilter = context.createBiquadFilter();
      const clickFilter = context.createBiquadFilter();
      const clickGain = context.createGain();
      const toneOsc = context.createOscillator();
      const toneGain = context.createGain();
      const toneFilter = context.createBiquadFilter();
      const pan = context.createStereoPanner();

      source.buffer = buffer;
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setTargetAtTime(1650 + index * 620 + this.tone.brightness * 720, start, 0.008);
      noiseFilter.Q.value = 3.4;
      noiseGain.gain.setValueAtTime(0.0001, start);
      noiseGain.gain.linearRampToValueAtTime(0.05 - index * 0.007, start + 0.004);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      clickFilter.type = "highpass";
      clickFilter.frequency.setValueAtTime(2200 + index * 420, start);
      clickGain.gain.setValueAtTime(0.0001, start);
      clickGain.gain.linearRampToValueAtTime(0.024 - index * 0.004, start + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.026 + index * 0.006);

      toneOsc.type = "sine";
      toneOsc.frequency.setValueAtTime(
        scaleFrequency(0, this.tone.rootMidi, this.tone.scale, this.tone.register - 10) * (1.32 + index * 0.1),
        start,
      );
      toneOsc.frequency.exponentialRampToValueAtTime(
        scaleFrequency(0, this.tone.rootMidi, this.tone.scale, this.tone.register - 11) * (1.16 + index * 0.08),
        start + 0.055,
      );
      toneFilter.type = "bandpass";
      toneFilter.frequency.setTargetAtTime(260 + index * 90 + this.tone.brightness * 130, start, 0.012);
      toneFilter.Q.value = 1.1;
      toneGain.gain.setValueAtTime(0.0001, start);
      toneGain.gain.linearRampToValueAtTime(0.026 - index * 0.004, start + 0.006);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13 + index * 0.035);

      pan.pan.setTargetAtTime(-0.45 + index * 0.32, start, 0.015);

      source.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(pan);
      source.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(pan);
      toneOsc.connect(toneFilter);
      toneFilter.connect(toneGain);
      toneGain.connect(pan);
      pan.connect(master);
      pan.connect(delay);
      if (index > 1) pan.connect(reverb);
      source.start(start);
      source.stop(start + duration + 0.02);
      toneOsc.start(start);
      toneOsc.stop(start + 0.2 + index * 0.045);
      window.setTimeout(
        () => this.onEvent(0.5 - index * 0.08, 7 + index * 2),
        Math.max(0, (start - context.currentTime) * 1000),
      );

    });
    if (!wasPlaying && this.master) {
      this.master.gain.setTargetAtTime(0.0001, now + 1.1, 0.65);
    }
  }

  stop() {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
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
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.018;
    this.compressor.release.value = 0.32;

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
    this.master.connect(this.compressor);
    this.compressor.connect(context.destination);
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
    const start = now + 0.035;
    const directionBias = direction === 0 ? Math.sin(this.step * 0.14) : direction * (0.42 + (this.step % 3) * 0.16);
    const stationMotif = Math.sin(this.step * (0.07 + (this.tone.seed % 7) * 0.007)) * 1.35;
    const melodicStep = direction === 0
      ? Math.round((this.random() - 0.48) * 4)
      : direction * (1 + Math.floor(this.random() * 3));
    const center = 2 + Math.floor(this.tone.voice.noteSpan * 0.48);
    const wandered = Math.round(this.lastNoteIndex + melodicStep + directionBias + stationMotif * 0.35);
    const noteIndex = Math.max(0, Math.min(this.tone.voice.noteSpan + 5, Math.round((wandered + center) / 2)));
    this.lastNoteIndex = noteIndex;
    const frequency = scaleFrequency(noteIndex, this.tone.rootMidi, this.tone.scale, this.tone.register);
    const accent = this.random() < this.tone.voice.accentChance + this.tone.voice.restlessness * 0.04;
    const velocity = 0.008 + this.random() * 0.01 + this.tone.density * 0.004 + (accent ? 0.004 : 0);
    const attack = this.tone.voice.attack + this.random() * 0.62;
    const release = this.tone.voice.release + this.random() * 1.8;

    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();

    osc.type = accent ? this.tone.voice.accentWave : this.tone.voice.wave;
    osc.frequency.setValueAtTime(frequency * 0.996, start);
    osc.frequency.exponentialRampToValueAtTime(frequency, start + 0.08);
    osc.detune.setTargetAtTime((this.random() - 0.5) * (3 + this.tone.stageLevel * 5), start, 0.08);
    filter.type = "lowpass";
    filter.frequency.setTargetAtTime(
      this.tone.voice.filterBase + this.tone.brightness * this.tone.voice.filterRange + (accent ? 90 : 0),
      start,
      0.12,
    );
    filter.Q.value = 0.08;
    pan.pan.setTargetAtTime(Math.sin(this.step * 0.21 + this.tone.seed) * this.tone.voice.spread * 0.7, start, 0.08);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(velocity, start + attack);
    gain.gain.setTargetAtTime(0.0001, start + attack + release * 0.72, Math.max(0.18, release * 0.16));

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    pan.connect(this.delay);
    if (this.random() < 0.58 + this.tone.stageLevel * 0.24) pan.connect(this.reverb);

    osc.start(start);
    osc.stop(start + attack + release + 0.35);
    this.onEvent(Math.min(1, velocity * 12), noteIndex);
    this.step += 1;

    if (this.random() < this.tone.voice.harmonyChance) this.scheduleHarmony(start, noteIndex);
    if (this.random() < this.tone.voice.harpChance) this.scheduleHarp(start + this.random() * 0.38, noteIndex);
    if (this.tone.density > 0.62 && this.random() < this.tone.voice.restlessness * 0.28) {
      this.scheduleHarmony(start + 0.34 + this.random() * 0.42, noteIndex + (direction >= 0 ? 1 : -1));
    }

    const jitter = 0.68 + this.random() * 0.54;
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
    const level = this.tone.voice.harpLevel * (0.56 + this.random() * 0.34);

    filter.type = "bandpass";
    filter.frequency.setTargetAtTime(760 + this.tone.brightness * 680, now, 0.04);
    filter.Q.value = 0.5;
    pan.pan.setTargetAtTime((this.random() * 2 - 1) * this.tone.voice.spread, now, 0.04);
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
      partialGain.gain.value = [1, 0.16, 0.045][index];
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
    gain.gain.linearRampToValueAtTime(0.006 + this.tone.voice.accentChance * 0.008, now + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.8 + this.tone.voice.release * 0.36);
    pan.pan.setTargetAtTime(-Math.sin(this.step * 0.37) * this.tone.voice.spread, now, 0.08);
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
      filter.frequency.setTargetAtTime(120 + index * 34 + this.tone.brightness * 82, now, 1.2);
      pan.pan.setTargetAtTime([-0.28, 0.18, 0.34][index] * this.tone.voice.spread, now, 1.2);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.setTargetAtTime(this.tone.voice.droneGain * [0.62, 0.34, 0.2][index], now, 7.5);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(this.master);
      osc.start();
    });
  }
}
