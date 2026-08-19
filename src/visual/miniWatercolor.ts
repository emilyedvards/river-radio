const noise = (seed: number, index: number) => {
  let state = seed ^ Math.imul(index + 101, 374761393);
  state = (state ^ (state >>> 13)) >>> 0;
  state = Math.imul(state, 1274126177) >>> 0;
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
};

const resizeCanvas = (canvas: HTMLCanvasElement) => {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(48, Math.floor(rect.width * dpr));
  canvas.height = Math.max(48, Math.floor(rect.height * dpr));
};

export const startMiniWatercolor = (canvas: HTMLCanvasElement, seed: number) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;
  const isWide = canvas.dataset.miniVariant === "wide";

  let frame: number | undefined;
  let startedAt = 0;
  let lastDraw = 0;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let targetPointerX = 0.5;
  let targetPointerY = 0.5;
  let pointerForce = 0;
  let targetPointerForce = 0;

  const drawBloom = (x: number, y: number, radius: number, alpha: number, bloomSeed: number, color: string, time: number) => {
    const steps = 20;
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const wobble =
        0.76 +
        noise(bloomSeed, i) * 0.38 +
        Math.sin(angle * 3 + time * 0.38 + bloomSeed * 0.001) * 0.08 +
        Math.sin(angle * 6 - time * 0.26) * 0.045;
      const px = x + Math.cos(angle) * radius * wobble * (1.04 + noise(bloomSeed + 19, i) * 0.24);
      const py = y + Math.sin(angle) * radius * wobble * (0.86 + noise(bloomSeed + 31, i) * 0.22);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const gradient = ctx.createRadialGradient(x, y, radius * 0.12, x, y, radius * 1.25);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.48, `rgba(14, 70, 145, ${alpha * 0.9})`);
    gradient.addColorStop(0.84, `rgba(55, 140, 198, ${alpha * 0.38})`);
    gradient.addColorStop(1, "rgba(42, 126, 194, 0)");
    ctx.fillStyle = gradient;
    ctx.fill();
  };

  const draw = (now: number) => {
    if (now - lastDraw < 1000 / 24) {
      frame = requestAnimationFrame(draw);
      return;
    }
    if (!startedAt) startedAt = now;
    lastDraw = now;

    const { width, height } = canvas;
    const size = isWide ? Math.max(width, height) * 0.52 : Math.min(width, height);
    const time = (now - startedAt) / 1000;
    const phase = time * 0.18 + seed * 0.001;
    pointerX += (targetPointerX - pointerX) * 0.12;
    pointerY += (targetPointerY - pointerY) * 0.12;
    pointerForce += (targetPointerForce - pointerForce) * 0.08;
    const cursorX = pointerX * width;
    const cursorY = pointerY * height;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#d9e6ee";
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "multiply";
    ctx.filter = `blur(${Math.max(4, size * 0.055)}px)`;
    for (let i = 0; i < (isWide ? 9 : 11); i += 1) {
      const baseX = width * (0.08 + noise(seed + 17, i) * 0.84);
      const baseY = height * (0.08 + noise(seed + 211, i) * 0.84);
      const speed = 0.16 + noise(seed + 331, i) * 0.18;
      const driftX = Math.sin(phase * speed + i * 1.7) * size * (isWide ? 0.06 : 0.035);
      const driftY = Math.cos(phase * (speed + 0.08) + i * 1.1) * size * (isWide ? 0.018 : 0.028);
      const towardX = cursorX - baseX;
      const towardY = cursorY - baseY;
      const distance = Math.hypot(towardX, towardY) / Math.max(1, size);
      const pull = pointerForce * Math.exp(-distance * 2.5) * (0.18 + noise(seed + 1499, i) * 0.2);
      const swirl = pointerForce * Math.exp(-distance * 3.2) * Math.sin(time * 1.2 + i) * size * 0.025;
      const x = baseX + driftX + towardX * pull - towardY * 0.018 * pointerForce + swirl;
      const y = baseY + driftY + towardY * pull + towardX * 0.018 * pointerForce;
      const radius = size * ((isWide ? 0.11 : 0.17) + noise(seed + 401, i) * (isWide ? 0.12 : 0.2) + Math.sin(time * 0.22 + i) * 0.012);
      const alpha = 0.3 + noise(seed + 701, i) * 0.22 + Math.sin(time * 0.24 + i * 0.9) * 0.018;
      const deep = noise(seed + 997, i) > 0.44;
      drawBloom(
        x,
        y,
        radius,
        alpha,
        seed + i * 53,
        deep ? `rgba(1, 27, 91, ${alpha * 1.48})` : `rgba(12, 92, 172, ${alpha * 1.08})`,
        time,
      );
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.filter = `blur(${Math.max(2, size * 0.028)}px)`;
    for (let i = 0; i < 3; i += 1) {
      const radius = size * (0.18 + i * 0.1);
      const x = width * (0.28 + noise(seed + 41, i) * 0.44) + (cursorX - width / 2) * pointerForce * 0.03;
      const y = height * (0.3 + noise(seed + 79, i) * 0.4) + (cursorY - height / 2) * pointerForce * 0.03;
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = i % 2 === 0 ? "#062b89" : "#7fb5d7";
      ctx.lineWidth = Math.max(2, size * (0.045 + i * 0.01));
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.2, radius * 0.78, phase * 0.48 + i, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "destination-out";
    ctx.filter = `blur(${Math.max(4, size * 0.045)}px)`;
    for (let i = 0; i < 2; i += 1) {
      const baseX = width * (0.08 + noise(seed + 809, i) * 0.84);
      const baseY = height * (0.08 + noise(seed + 907, i) * 0.84);
      const x = baseX + Math.sin(time * 0.14 + i) * size * 0.018 + (cursorX - baseX) * pointerForce * 0.08;
      const y = baseY + Math.cos(time * 0.12 + i * 1.4) * size * 0.018 + (cursorY - baseY) * pointerForce * 0.08;
      drawBloom(x, y, size * (0.05 + noise(seed + 1013, i) * 0.04), 0.05, seed + i * 89, "rgba(255,255,255,0.28)", time);
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.16;
    ctx.filter = "none";
    const grainCount = Math.round((width * height) / 42);
    for (let i = 0; i < grainCount; i += 1) {
      const x = noise(seed + 1301, i) * width;
      const y = noise(seed + 2291, i) * height;
      ctx.fillStyle = noise(seed + 577, i) > 0.48 ? "#082b92" : "#a8c8dc";
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.restore();
    frame = requestAnimationFrame(draw);
  };

  const resize = () => resizeCanvas(canvas);
  const movePointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    targetPointerX = rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0.5;
    targetPointerY = rect.height ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0.5;
    targetPointerForce = 1;
  };
  const leavePointer = () => {
    targetPointerForce = 0;
  };
  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointermove", movePointer);
  canvas.addEventListener("pointerenter", movePointer);
  canvas.addEventListener("pointerleave", leavePointer);
  frame = requestAnimationFrame(draw);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("pointermove", movePointer);
    canvas.removeEventListener("pointerenter", movePointer);
    canvas.removeEventListener("pointerleave", leavePointer);
  };
};
