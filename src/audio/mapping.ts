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

export type ToneProfile = {
  name: string;
  scale: number[];
  rootMidi: number;
  registerBias: number;
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
  flowTempoInfluence: number;
  flowDensityInfluence: number;
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

const seededUnit = (seed: number, salt: number) => {
  let out = seed ^ Math.imul(salt, 374761393);
  out = Math.imul(out ^ (out >>> 13), 1274126177);
  return ((out ^ (out >>> 16)) >>> 0) / 4294967296;
};

const vary = (base: number, seed: number, salt: number, width: number) =>
  base * (1 + (seededUnit(seed, salt) * 2 - 1) * width);

const choose = <T>(items: T[], seed: number, salt: number) =>
  items[Math.floor(seededUnit(seed, salt) * items.length)] ?? items[0];

const personalityFamilies: ToneProfile[] = [
  {
    name: "glassy",
    scale: [0, 2, 4, 7, 9],
    rootMidi: 50,
    registerBias: 4,
    wave: "sine",
    accentWave: "triangle",
    droneInterval: -12,
    delayTime: 0.38,
    feedback: 0.21,
    spread: 0.78,
    attack: 0.66,
    release: 5.2,
    noteSpan: 8,
    restlessness: 0.28,
    accentChance: 0.12,
    harmonyChance: 0.36,
    harpChance: 0.5,
    harpDecay: 2.15,
    harpLevel: 0.04,
    droneGain: 0.013,
    filterBase: 950,
    filterRange: 2550,
    flowTempoInfluence: 0.9,
    flowDensityInfluence: 0.9,
  },
  {
    name: "drifting",
    scale: [0, 2, 5, 7, 9],
    rootMidi: 44,
    registerBias: 0,
    wave: "triangle",
    accentWave: "sine",
    droneInterval: -12,
    delayTime: 0.43,
    feedback: 0.24,
    spread: 0.46,
    attack: 1.1,
    release: 7.4,
    noteSpan: 6,
    restlessness: 0.17,
    accentChance: 0.07,
    harmonyChance: 0.48,
    harpChance: 0.17,
    harpDecay: 2.7,
    harpLevel: 0.024,
    droneGain: 0.032,
    filterBase: 500,
    filterRange: 1650,
    flowTempoInfluence: 0.68,
    flowDensityInfluence: 0.72,
  },
  {
    name: "pulsing",
    scale: [0, 2, 3, 7, 9],
    rootMidi: 47,
    registerBias: 1,
    wave: "triangle",
    accentWave: "triangle",
    droneInterval: -12,
    delayTime: 0.2,
    feedback: 0.14,
    spread: 0.5,
    attack: 0.28,
    release: 2.45,
    noteSpan: 8,
    restlessness: 0.72,
    accentChance: 0.2,
    harmonyChance: 0.22,
    harpChance: 0.42,
    harpDecay: 1.35,
    harpLevel: 0.034,
    droneGain: 0.014,
    filterBase: 720,
    filterRange: 2050,
    flowTempoInfluence: 1.22,
    flowDensityInfluence: 1.14,
  },
  {
    name: "choral",
    scale: [0, 2, 4, 7, 9],
    rootMidi: 42,
    registerBias: -1,
    wave: "sine",
    accentWave: "triangle",
    droneInterval: -7,
    delayTime: 0.34,
    feedback: 0.2,
    spread: 0.38,
    attack: 0.92,
    release: 6.2,
    noteSpan: 7,
    restlessness: 0.24,
    accentChance: 0.09,
    harmonyChance: 0.6,
    harpChance: 0.2,
    harpDecay: 2.45,
    harpLevel: 0.027,
    droneGain: 0.029,
    filterBase: 620,
    filterRange: 1900,
    flowTempoInfluence: 0.82,
    flowDensityInfluence: 0.86,
  },
  {
    name: "plucked",
    scale: [0, 2, 4, 7, 9],
    rootMidi: 48,
    registerBias: 2,
    wave: "triangle",
    accentWave: "triangle",
    droneInterval: -5,
    delayTime: 0.18,
    feedback: 0.13,
    spread: 0.58,
    attack: 0.2,
    release: 2.35,
    noteSpan: 9,
    restlessness: 0.56,
    accentChance: 0.18,
    harmonyChance: 0.28,
    harpChance: 0.64,
    harpDecay: 1.25,
    harpLevel: 0.045,
    droneGain: 0.011,
    filterBase: 820,
    filterRange: 2250,
    flowTempoInfluence: 1.08,
    flowDensityInfluence: 1.04,
  },
  {
    name: "low-slow",
    scale: [0, 2, 5, 7, 9],
    rootMidi: 41,
    registerBias: -3,
    wave: "triangle",
    accentWave: "sine",
    droneInterval: -12,
    delayTime: 0.41,
    feedback: 0.2,
    spread: 0.36,
    attack: 1.02,
    release: 6.5,
    noteSpan: 6,
    restlessness: 0.19,
    accentChance: 0.08,
    harmonyChance: 0.34,
    harpChance: 0.16,
    harpDecay: 2.45,
    harpLevel: 0.025,
    droneGain: 0.03,
    filterBase: 470,
    filterRange: 1550,
    flowTempoInfluence: 0.68,
    flowDensityInfluence: 0.72,
  },
  {
    name: "bright-scattered",
    scale: [0, 2, 4, 7, 11],
    rootMidi: 53,
    registerBias: 3,
    wave: "sine",
    accentWave: "sine",
    droneInterval: -12,
    delayTime: 0.17,
    feedback: 0.17,
    spread: 0.72,
    attack: 0.24,
    release: 2.75,
    noteSpan: 10,
    restlessness: 0.66,
    accentChance: 0.24,
    harmonyChance: 0.5,
    harpChance: 0.6,
    harpDecay: 1.55,
    harpLevel: 0.047,
    droneGain: 0.012,
    filterBase: 1120,
    filterRange: 3100,
    flowTempoInfluence: 1.14,
    flowDensityInfluence: 1.1,
  },
];

const stationFamilyOverrides: Record<string, string> = {
  "USGS-08057000": "choral",
};

export const personalityForStation = (stationId: string): ToneProfile => {
  const seed = hash(stationId);
  const familyName = stationFamilyOverrides[stationId];
  const family =
    personalityFamilies.find((profile) => profile.name === familyName) ??
    personalityFamilies[seed % personalityFamilies.length];
  const rootChoices = [-5, -2, 0, 2, 5];

  return {
    ...family,
    scale: choose([family.scale, [0, 2, 5, 7, 9], [0, 2, 4, 7, 10]], seed, 1),
    rootMidi: family.rootMidi + choose(rootChoices, seed, 2),
    registerBias: Math.round(family.registerBias + (seededUnit(seed, 3) * 2 - 1) * 2),
    delayTime: Math.max(0.14, Math.min(0.55, vary(family.delayTime, seed, 4, 0.13))),
    feedback: Math.max(0.1, Math.min(0.28, vary(family.feedback, seed, 5, 0.12))),
    spread: Math.max(0.24, Math.min(0.86, vary(family.spread, seed, 6, 0.16))),
    attack: Math.max(0.16, vary(family.attack, seed, 7, 0.18)),
    release: Math.max(1.9, vary(family.release, seed, 8, 0.16)),
    noteSpan: Math.max(5, Math.min(11, Math.round(family.noteSpan + (seededUnit(seed, 9) * 2 - 1) * 2))),
    restlessness: clamp01(vary(family.restlessness, seed, 10, 0.16)),
    accentChance: clamp01(vary(family.accentChance, seed, 11, 0.18)),
    harmonyChance: clamp01(vary(family.harmonyChance, seed, 12, 0.16)),
    harpChance: clamp01(vary(family.harpChance, seed, 13, 0.18)),
    harpDecay: Math.max(1.1, vary(family.harpDecay, seed, 14, 0.15)),
    harpLevel: Math.max(0.018, vary(family.harpLevel, seed, 15, 0.12)),
    droneGain: Math.max(0.009, vary(family.droneGain, seed, 16, 0.16)),
    filterBase: Math.round(vary(family.filterBase, seed, 17, 0.14)),
    filterRange: Math.round(vary(family.filterRange, seed, 18, 0.12)),
  };
};

export const mapRiverToTone = (data: ChannelData): RiverTone => {
  const flow = data.measurements.flow;
  const stage = data.measurements.stage;
  const tempC = safeNumber(data.measurements.temperature);
  const flowLevel = relativeLevel(flow, flow ? 0.52 : 0.34);
  const stageLevel = relativeLevel(stage, stage ? 0.5 : 0.42);
  const temperatureLevel = tempC === undefined ? 0.5 : clamp01((tempC - 1) / 31);
  const seed = hash(data.station.id);
  const profile = personalityForStation(data.station.id);
  const density = clamp01(0.24 + flowLevel * 0.62 * profile.flowDensityInfluence + profile.restlessness * 0.08);
  const scale = profile.scale;
  const rootMidi = profile.rootMidi + Math.round((stageLevel - 0.5) * 5);
  const slowWater = 1 - flowLevel;
  const activeWater = flowLevel * profile.flowTempoInfluence;

  return {
    density,
    tempoMs: Math.round(3120 - activeWater * 1320 - profile.restlessness * 260 + (seed % 260) + profile.attack * 155),
    register: Math.round(profile.registerBias + (stageLevel - 0.5) * 9),
    brightness: clamp01(0.76 - temperatureLevel * 0.3 + (profile.filterBase - 680) / 4200),
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
      feedback: Math.min(0.24, profile.feedback * 0.82),
      spread: profile.spread,
      attack: profile.attack + slowWater * 0.46 + 0.62,
      release: profile.release + slowWater * 1.55 + 1.8,
      noteSpan: Math.max(5, Math.round(profile.noteSpan * 0.78 + flowLevel * 4)),
      restlessness: profile.restlessness * 0.62 + flowLevel * 0.22 * profile.flowDensityInfluence,
      accentChance: profile.accentChance * 0.45 + flowLevel * 0.035,
      harmonyChance: Math.min(0.62, profile.harmonyChance * 0.78 + flowLevel * 0.12),
      harpChance: Math.min(0.64, profile.harpChance * 0.46 + flowLevel * 0.16),
      harpDecay: profile.harpDecay + slowWater * 0.5 + 0.55,
      harpLevel: profile.harpLevel * 0.34,
      droneGain: profile.droneGain * 0.92,
      filterBase: profile.filterBase,
      filterRange: profile.filterRange * 0.52,
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
