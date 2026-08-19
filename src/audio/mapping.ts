import type { ChannelData, Measurement } from "../api/usgs";

export type RiverTone = {
  density: number;
  tempoMs: number;
  register: number;
  brightness: number;
  movement: -1 | 0 | 1;
  flowLevel: number;
  stageLevel: number;
  scale: number[];
  rootMidi: number;
  voice: {
    name: string;
    wave: OscillatorType;
    accentWave: OscillatorType;
    droneInterval: number;
    delayTime: number;
    feedback: number;
    spread: number;
    attack: number;
    release: number;
    noteSpan: number;
    restlessness: number;
    accentChance: number;
    harmonyChance: number;
    harpChance: number;
    harpDecay: number;
    harpLevel: number;
    droneGain: number;
    filterBase: number;
    filterRange: number;
  };
  seed: number;
};

type ToneProfile = {
  name: string;
  scale: number[];
  rootMidi: number;
  wave: OscillatorType;
  accentWave: OscillatorType;
  droneInterval: number;
  delayTime: number;
  feedback: number;
  spread: number;
  attack: number;
  release: number;
  noteSpan: number;
  restlessness: number;
  accentChance: number;
  harmonyChance: number;
  harpChance: number;
  harpDecay: number;
  harpLevel: number;
  droneGain: number;
  filterBase: number;
  filterRange: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const safeNumber = (value?: Measurement) => {
  if (!value || !Number.isFinite(value.value)) return undefined;
  return value.value;
};

const relativeLevel = (current?: Measurement, fallback = 0.5) => {
  if (!current) return fallback;
  const history = current.history.map((point) => point.value).filter(Number.isFinite);
  if (history.length < 4) return fallback;
  const min = Math.min(...history);
  const max = Math.max(...history);
  if (Math.abs(max - min) < 0.0001) return fallback;
  return clamp01((current.value - min) / (max - min));
};

const hash = (input: string) => {
  let out = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    out ^= input.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return Math.abs(out >>> 0);
};

const featuredProfiles: Record<string, ToneProfile> = {
  "USGS-08057000": {
    name: "clear",
    scale: [0, 2, 4, 7, 9],
    rootMidi: 49,
    wave: "sine",
    accentWave: "triangle",
    droneInterval: -12,
    delayTime: 0.24,
    feedback: 0.18,
    spread: 0.42,
    attack: 0.55,
    release: 4.2,
    noteSpan: 7,
    restlessness: 0.34,
    accentChance: 0.14,
    harmonyChance: 0.38,
    harpChance: 0.34,
    harpDecay: 1.9,
    harpLevel: 0.038,
    droneGain: 0.018,
    filterBase: 680,
    filterRange: 2450,
  },
  "USGS-07032000": {
    name: "moody",
    scale: [0, 3, 5, 7, 10],
    rootMidi: 40,
    wave: "triangle",
    accentWave: "sine",
    droneInterval: -19,
    delayTime: 0.36,
    feedback: 0.24,
    spread: 0.3,
    attack: 1.05,
    release: 7.1,
    noteSpan: 5,
    restlessness: 0.18,
    accentChance: 0.06,
    harmonyChance: 0.24,
    harpChance: 0.12,
    harpDecay: 2.8,
    harpLevel: 0.022,
    droneGain: 0.038,
    filterBase: 360,
    filterRange: 1250,
  },
  "USGS-01358000": {
    name: "twinkly",
    scale: [0, 2, 4, 7, 11],
    rootMidi: 55,
    wave: "sine",
    accentWave: "sine",
    droneInterval: -12,
    delayTime: 0.17,
    feedback: 0.2,
    spread: 0.72,
    attack: 0.2,
    release: 2.8,
    noteSpan: 10,
    restlessness: 0.62,
    accentChance: 0.24,
    harmonyChance: 0.58,
    harpChance: 0.62,
    harpDecay: 1.55,
    harpLevel: 0.048,
    droneGain: 0.012,
    filterBase: 1200,
    filterRange: 3300,
  },
  "USGS-09402500": {
    name: "canyon",
    scale: [0, 2, 5, 7, 10],
    rootMidi: 45,
    wave: "sine",
    accentWave: "triangle",
    droneInterval: -7,
    delayTime: 0.48,
    feedback: 0.28,
    spread: 0.64,
    attack: 0.82,
    release: 6.4,
    noteSpan: 6,
    restlessness: 0.24,
    accentChance: 0.1,
    harmonyChance: 0.32,
    harpChance: 0.22,
    harpDecay: 2.35,
    harpLevel: 0.028,
    droneGain: 0.027,
    filterBase: 520,
    filterRange: 1800,
  },
  "USGS-08330000": {
    name: "dry pulse",
    scale: [0, 2, 3, 7, 9],
    rootMidi: 47,
    wave: "triangle",
    accentWave: "square",
    droneInterval: -12,
    delayTime: 0.2,
    feedback: 0.13,
    spread: 0.5,
    attack: 0.28,
    release: 2.4,
    noteSpan: 8,
    restlessness: 0.72,
    accentChance: 0.2,
    harmonyChance: 0.22,
    harpChance: 0.42,
    harpDecay: 1.35,
    harpLevel: 0.034,
    droneGain: 0.014,
    filterBase: 720,
    filterRange: 2000,
  },
  "USGS-14246900": {
    name: "wide glass",
    scale: [0, 2, 4, 7, 9, 12],
    rootMidi: 43,
    wave: "sine",
    accentWave: "triangle",
    droneInterval: -5,
    delayTime: 0.42,
    feedback: 0.26,
    spread: 0.82,
    attack: 0.7,
    release: 5.7,
    noteSpan: 9,
    restlessness: 0.38,
    accentChance: 0.16,
    harmonyChance: 0.48,
    harpChance: 0.46,
    harpDecay: 2.15,
    harpLevel: 0.04,
    droneGain: 0.026,
    filterBase: 840,
    filterRange: 2600,
  },
};

const fallbackProfile = (seed: number): ToneProfile => {
  const scaleBank = [
    [0, 2, 4, 7, 9],
    [0, 3, 5, 7, 10],
    [0, 2, 5, 7, 9],
    [0, 2, 3, 7, 10],
  ];
  const waveBank: OscillatorType[] = ["sine", "triangle", "sine", "triangle"];
  return {
    name: "field",
    scale: scaleBank[seed % scaleBank.length],
    rootMidi: 45 + (seed % 7),
    wave: waveBank[seed % waveBank.length],
    accentWave: seed % 5 === 0 ? "square" : waveBank[(seed + 1) % waveBank.length],
    droneInterval: [0, -5, -7, -12][seed % 4],
    delayTime: 0.18 + ((seed >>> 3) % 7) * 0.045,
    feedback: 0.12 + ((seed >>> 5) % 8) * 0.018,
    spread: 0.28 + ((seed >>> 7) % 8) * 0.07,
    attack: 0.36 + ((seed >>> 9) % 5) * 0.06,
    release: 2.2 + ((seed >>> 11) % 6) * 0.42,
    noteSpan: 4 + (seed % 5),
    restlessness: 0.18 + ((seed >>> 13) % 5) * 0.045,
    accentChance: 0.12 + ((seed >>> 15) % 4) * 0.035,
    harmonyChance: 0.25 + ((seed >>> 17) % 5) * 0.055,
    harpChance: 0.18 + ((seed >>> 18) % 5) * 0.055,
    harpDecay: 1.5 + ((seed >>> 20) % 6) * 0.24,
    harpLevel: 0.025 + ((seed >>> 22) % 5) * 0.004,
    droneGain: 0.018 + ((seed >>> 19) % 5) * 0.004,
    filterBase: 520 + ((seed >>> 21) % 7) * 90,
    filterRange: 1650 + ((seed >>> 23) % 7) * 210,
  };
};

export const mapRiverToTone = (data: ChannelData): RiverTone => {
  const flow = data.measurements.flow;
  const stage = data.measurements.stage;
  const tempC = safeNumber(data.measurements.temperature);
  const flowLevel = relativeLevel(flow, flow ? 0.52 : 0.34);
  const stageLevel = relativeLevel(stage, stage ? 0.5 : 0.42);
  const temperatureLevel = tempC === undefined ? 0.5 : clamp01((tempC - 1) / 31);
  const density = clamp01(0.22 + flowLevel * 0.7);
  const seed = hash(data.station.id);
  const profile = featuredProfiles[data.station.id] ?? fallbackProfile(seed);
  const scale = profile.scale;
  const rootMidi = profile.rootMidi + Math.round((stageLevel - 0.5) * 5);
  const slowWater = 1 - flowLevel;

  return {
    density,
    tempoMs: Math.round(3900 - density * 1100 + (seed % 360) + profile.attack * 260),
    register: Math.round((stageLevel - 0.5) * 9),
    brightness: clamp01(0.82 - temperatureLevel * 0.34),
    movement: data.movement,
    flowLevel,
    stageLevel,
    scale,
    rootMidi,
    voice: {
      name: profile.name,
      wave: profile.wave,
      accentWave: profile.accentWave,
      droneInterval: profile.droneInterval,
      delayTime: profile.delayTime + flowLevel * 0.08,
      feedback: profile.feedback,
      spread: profile.spread,
      attack: profile.attack + slowWater * 0.8 + 1.2,
      release: profile.release + slowWater * 3.2 + 3.5,
      noteSpan: Math.max(3, Math.round(profile.noteSpan * 0.62 + flowLevel * 2)),
      restlessness: profile.restlessness * 0.45 + flowLevel * 0.12,
      accentChance: profile.accentChance * 0.35,
      harmonyChance: profile.harmonyChance * 0.62,
      harpChance: profile.harpChance * 0.28 + flowLevel * 0.025,
      harpDecay: profile.harpDecay + slowWater * 0.8 + 0.8,
      harpLevel: profile.harpLevel * 0.45,
      droneGain: profile.droneGain * 1.35,
      filterBase: profile.filterBase,
      filterRange: profile.filterRange * 0.62,
    },
    seed,
  };
};

export const scaleFrequency = (
  index: number,
  rootMidi: number,
  scale: number[],
  registerOffset = 0,
) => {
  const baseMidi = rootMidi + registerOffset;
  const octave = Math.floor(index / scale.length);
  const note = scale[((index % scale.length) + scale.length) % scale.length];
  const midi = baseMidi + octave * 12 + note;
  return 440 * 2 ** ((midi - 69) / 12);
};
