import type { RiverTone } from "../audio/mapping";

type Ripple = {
  x: number;
  y: number;
  ttl: number;
  maxTtl: number;
  energy: number;
  note: number;
  scale: number;
};

const noise = (seed: number, index: number) => {
  let state = seed ^ Math.imul(index + 101, 374761393);
  state = (state ^ (state >>> 13)) >>> 0;
  state = Math.imul(state, 1274126177) >>> 0;
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
};

export class RiverVisual {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private tone: RiverTone;
  private frame?: number;
  private ripples: Ripple[] = [];
  private started = false;
  private tick = 0;
  private lastDraw = 0;

  constructor(canvas: HTMLCanvasElement, tone: RiverTone) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    this.canvas = canvas;
    this.context = context;
    this.tone = tone;
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  update(tone: RiverTone) {
    this.tone = tone;
  }

  pulse(energy: number, note: number) {
    const xSeed = noise(this.tone.seed + note * 97, this.tick);
    const ySeed = noise(this.tone.seed + note * 193, this.tick + 17);
    const x = this.canvas.width * (0.12 + xSeed * 0.76);
    const y = this.canvas.height * (0.22 + ySeed * 0.58);
    const ttl = 38 + Math.round(energy * 24);

    this.ripples.push({ x, y, ttl, maxTtl: ttl, energy, note, scale: 1 });
    if (energy > 0.42) {
      this.ripples.push({
        x: this.canvas.width * (0.1 + noise(this.tone.seed + note * 41, this.tick + 5) * 0.8),
        y: this.canvas.height * (0.18 + noise(this.tone.seed + note * 83, this.tick + 9) * 0.64),
        ttl: Math.round(ttl * 0.72),
        maxTtl: Math.round(ttl * 0.72),
        energy: energy * 0.62,
        note: note + 3,
        scale: 1,
      });
    }
  }

  skipRock() {
    const startX = this.canvas.width * (0.18 + noise(this.tone.seed + this.tick, 3) * 0.18);
    const startY = this.canvas.height * (0.38 + noise(this.tone.seed + this.tick, 7) * 0.24);
    const stepX = this.canvas.width * 0.14;
    const stepY = this.canvas.height * 0.035;

    [0, 1, 2].forEach((index) => {
      window.setTimeout(() => {
        const energy = 0.34 - index * 0.06;
        const ttl = 26 - index * 3;
        this.ripples.push({
          x: startX + stepX * index,
          y: startY + Math.sin(index + this.tone.seed) * stepY,
          ttl,
          maxTtl: ttl,
          energy,
          note: 19 + index * 2,
          scale: 0.34,
        });
      }, index * 130);
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.draw();
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(220, Math.floor(rect.height * dpr));
  };

  private drawPigmentBloom(x: number, y: number, radius: number, alpha: number, seed: number, color: string) {
    const ctx = this.context;
    const steps = 22;
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const wobble =
        0.78 +
        noise(seed, i) * 0.34 +
        Math.sin(angle * 3 + this.tick * 0.018 + seed * 0.001) * 0.08 +
        Math.sin(angle * 7 - this.tick * 0.013) * 0.05;
      const px = x + Math.cos(angle) * radius * wobble * (1.18 + noise(seed + 19, i) * 0.28);
      const py = y + Math.sin(angle) * radius * wobble * (0.58 + noise(seed + 31, i) * 0.22);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const gradient = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius * 1.35);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.42, `rgba(18, 79, 151, ${alpha * 0.82})`);
    gradient.addColorStop(0.78, `rgba(68, 155, 205, ${alpha * 0.34})`);
    gradient.addColorStop(1, "rgba(42, 126, 194, 0)");
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  private draw = () => {
    const now = performance.now();
    if (now - this.lastDraw < 1000 / 18) {
      this.frame = requestAnimationFrame(this.draw);
      return;
    }
    this.lastDraw = now;

    const ctx = this.context;
    const { width, height } = this.canvas;
    const flowSpeed = 0.018 + this.tone.flowLevel * 0.038;
    const phase = this.tick * flowSpeed + this.tone.seed * 0.0007;

    ctx.save();
    ctx.fillStyle = "#f7f5ed";
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "multiply";
    ctx.filter = `blur(${Math.max(8, width * 0.008)}px)`;
    const bloomCount = 18 + Math.round(this.tone.density * 8);
    for (let i = 0; i < bloomCount; i += 1) {
      const drift = phase * (0.008 + i * 0.001);
      const x = width * (((noise(this.tone.seed + 17, i) + drift) % 1.16) - 0.08);
      const y =
        height * (0.16 + noise(this.tone.seed + 211, i) * 0.72) +
        Math.sin(phase * 0.28 + i * 1.3) * height * 0.06;
      const radius = width * (0.1 + noise(this.tone.seed + 401, i) * 0.18);
      const alpha = 0.18 + this.tone.brightness * 0.1 + noise(this.tone.seed + 701, i) * 0.2;
      const deep = noise(this.tone.seed + 997, i) > 0.5;
      this.drawPigmentBloom(
        x,
        y,
        radius,
        alpha,
        this.tone.seed + i * 53,
        deep ? `rgba(2, 35, 105, ${alpha * 1.55})` : `rgba(20, 105, 181, ${alpha * 1.08})`,
      );
    }

    ctx.filter = `blur(${Math.max(14, width * 0.012)}px)`;
    for (let i = 0; i < 5; i += 1) {
      const x = width * (0.1 + noise(this.tone.seed + 1601, i) * 0.8);
      const y = height * (0.12 + noise(this.tone.seed + 1709, i) * 0.76);
      const radius = width * (0.075 + noise(this.tone.seed + 1811, i) * 0.095);
      const alpha = 0.24 + noise(this.tone.seed + 1907, i) * 0.18;
      this.drawPigmentBloom(x, y, radius, alpha, this.tone.seed + i * 131, `rgba(0, 22, 82, ${alpha})`);
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.filter = `blur(${Math.max(5, width * 0.004)}px)`;
    for (let i = 0; i < 7; i += 1) {
      const drift = (phase * (0.025 + i * 0.006) + i * 0.17) % 1;
      const x = width * (0.12 + ((drift + noise(this.tone.seed, i) * 0.36) % 0.76));
      const y = height * (0.18 + noise(this.tone.seed + 41, i) * 0.64);
      const radius = width * (0.07 + i * 0.025 + this.tone.stageLevel * 0.024);
      ctx.globalAlpha = 0.16 + this.tone.flowLevel * 0.06;
      ctx.strokeStyle = i % 3 === 0 ? "#082d91" : i % 3 === 1 ? "#1c78d3" : "#ecf5fb";
      ctx.lineWidth = Math.max(5, height * (0.022 + i * 0.004));
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.55, radius, phase * 0.35 + i * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "destination-out";
    ctx.filter = `blur(${Math.max(7, width * 0.006)}px)`;
    for (let i = 0; i < 10; i += 1) {
      const x = width * (0.05 + noise(this.tone.seed + 809, i) * 0.9);
      const y = height * (0.08 + noise(this.tone.seed + 907, i) * 0.84);
      const radius = width * (0.035 + noise(this.tone.seed + 1013, i) * 0.05);
      this.drawPigmentBloom(x, y, radius, 0.1, this.tone.seed + i * 89, "rgba(255, 255, 255, 0.52)");
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    this.ripples.forEach((ripple) => {
      const age = 1 - ripple.ttl / ripple.maxTtl;
      const fade = 1 - age;
      const radius = width * (0.025 + age * (0.19 + ripple.energy * 0.16)) * ripple.scale;
      const lineWidth = Math.max(6, height * (0.022 + ripple.energy * 0.03)) * (0.35 + fade * 0.65);
      ctx.globalAlpha = Math.max(0, fade) * (0.42 + ripple.energy * 0.42);
      ctx.filter = `blur(${Math.max(4, width * 0.004)}px)`;
      ctx.strokeStyle = "#1267ff";
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, radius * 1.45, radius, Math.sin(ripple.note) * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      const glow = ctx.createRadialGradient(ripple.x, ripple.y, 0, ripple.x, ripple.y, radius * 1.5);
      glow.addColorStop(0, `rgba(18, 103, 255, ${0.22 * fade})`);
      glow.addColorStop(0.55, `rgba(18, 103, 255, ${0.08 * fade})`);
      glow.addColorStop(1, "rgba(18, 103, 255, 0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(ripple.x - radius * 1.5, ripple.y - radius * 1.5, radius * 3, radius * 3);

      ctx.globalAlpha = Math.max(0, fade) * 0.26;
      ctx.lineWidth = Math.max(2, lineWidth * 0.42);
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, radius * 0.78, radius * 0.52, Math.cos(ripple.note) * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.globalAlpha = 0.16;
    ctx.filter = "none";
    const grainCount = Math.min(6200, Math.round((width * height) / 230));
    for (let i = 0; i < grainCount; i += 1) {
      const x = noise(this.tone.seed + this.tick, i) * width;
      const y = noise(this.tone.seed + this.tick + 991, i) * height;
      const size = noise(this.tone.seed + 311, i) > 0.72 ? 2 : 1;
      ctx.fillStyle = noise(this.tone.seed + 577, i) > 0.52 ? "#082b92" : "#f2eadc";
      ctx.fillRect(x, y, size, size);
    }

    ctx.restore();
    this.ripples = this.ripples
      .map((ripple) => ({ ...ripple, ttl: ripple.ttl - 1 }))
      .filter((ripple) => ripple.ttl > 0);
    this.tick += 1;
    this.frame = requestAnimationFrame(this.draw);
  };
}
