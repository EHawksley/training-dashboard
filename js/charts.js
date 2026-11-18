// Small canvas charts. No CDN dependency, so the installed app can draw offline.

const FONT = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const AXIS = "#93a0b0";
const GRID = "rgba(255,255,255,0.06)";

function niceScale(min, max, count = 4) {
  if (!(max > min)) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7 ? 10 : norm >= 3 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const niceMin = Math.floor(min / step) * step;
  const ticks = [];
  const niceMax = Math.ceil(max / step) * step;
  for (let value = niceMin, n = 0; value <= niceMax + step * 0.001 && n < 8; value += step, n++) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

function sizeCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 2 || height < 2) return null;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function segments(points) {
  const groups = [];
  let current = [];
  for (const point of points) {
    if (point.value == null) {
      if (current.length) groups.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function roundTopRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, h / 2, w / 2));
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function drawEmpty(ctx, width, height, message) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = AXIS;
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message || "No data yet", width / 2, height / 2);
}

function showTip(tooltip, canvas, lines, px, py) {
  tooltip.replaceChildren();
  lines.forEach((line, index) => {
    const el = document.createElement(index === 0 ? "strong" : "div");
    el.textContent = line;
    tooltip.append(el);
  });
  tooltip.hidden = false;
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  const card = canvas.closest(".card") || canvas.parentElement;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  let left = canvas.offsetLeft + px - tw / 2;
  left = Math.max(8, Math.min(left, card.clientWidth - tw - 8));
  let top = canvas.offsetTop + py - th - 10;
  if (top < 8) top = canvas.offsetTop + py + 14;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function bindPointer(canvas, tooltip, ac) {
  const hide = () => {
    tooltip.hidden = true;
  };
  const pick = (event) => {
    const layout = canvas.__layout;
    if (!layout) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best = null;
    let bestDist = Infinity;
    for (const item of layout.hits) {
      const dist = Math.abs(item.x - x);
      if (dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
    if (!best || bestDist > 36) {
      hide();
      return;
    }
    showTip(tooltip, canvas, best.lines, best.x, best.y);
  };
  canvas.addEventListener("pointerdown", pick, { signal: ac.signal });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") pick(event);
  }, { signal: ac.signal });
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") hide();
  }, { signal: ac.signal });
  window.addEventListener("scroll", hide, { signal: ac.signal, passive: true });
}

function watch(canvas, draw) {
  const ac = new AbortController();
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  };
  schedule();
  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);
  return { ac, stop: () => { observer.disconnect(); ac.abort(); cancelAnimationFrame(frame); } };
}

export function mountLine(canvas, tooltip, spec) {
  const draw = () => renderLine(canvas, spec);
  const { ac, stop } = watch(canvas, draw);
  bindPointer(canvas, tooltip, ac);
  return stop;
}

export function mountBars(canvas, tooltip, spec) {
  const draw = () => renderBars(canvas, spec);
  const { ac, stop } = watch(canvas, draw);
  bindPointer(canvas, tooltip, ac);
  return stop;
}

function renderLine(canvas, spec) {
  const sized = sizeCanvas(canvas);
  if (!sized) return;
  const { ctx, width, height } = sized;
  const count = spec.labels.length;
  const values = [];
  for (const series of spec.series) {
    for (const value of series.values) if (value != null) values.push(value);
  }
  if (!count || !values.length) {
    drawEmpty(ctx, width, height, spec.empty);
    canvas.__layout = { hits: [] };
    return;
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (spec.refLine) {
    min = Math.min(min, spec.refLine.y);
    max = Math.max(max, spec.refLine.y);
  }
  const pad = (max - min) * 0.18 || 1;
  const scale = niceScale(min - pad, max + pad, 4);
  ctx.font = FONT;
  let yLabelW = 0;
  for (const tick of scale.ticks) {
    yLabelW = Math.max(yLabelW, ctx.measureText(spec.formatY(tick)).width);
  }
  const xLabelW = spec.labels.reduce((width, label) => Math.max(width, ctx.measureText(String(label)).width), 0);
  const padL = Math.ceil(yLabelW) + 10;
  const padR = Math.max(spec.refLine ? 28 : 12, Math.ceil(xLabelW / 2) + 12);
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xAt = (index) => padL + (count === 1 ? plotW / 2 : (plotW * index) / (count - 1));
  const yAt = (value) => padT + ((scale.max - value) / (scale.max - scale.min)) * plotH;

  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  ctx.font = FONT;
  for (const tick of scale.ticks) {
    const y = yAt(tick);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(width - padR, y);
    ctx.stroke();
    ctx.fillStyle = AXIS;
    ctx.textAlign = "right";
    ctx.fillText(spec.formatY(tick), padL - 6, y);
  }

  if (spec.refLine && spec.refLine.y >= scale.min && spec.refLine.y <= scale.max) {
    const y = yAt(spec.refLine.y);
    ctx.save();
    ctx.strokeStyle = spec.refLine.color;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(width - padR, y);
    ctx.stroke();
    ctx.restore();
  }

  const hits = [];
  for (const series of spec.series) {
    const points = series.values.map((value, index) => (
      value == null ? { value: null } : { value, index, x: xAt(index), y: yAt(value) }
    ));
    for (const group of segments(points)) {
      if (group.length >= 2 && series.fill) {
        ctx.beginPath();
        ctx.moveTo(group[0].x, yAt(scale.min));
        for (const point of group) ctx.lineTo(point.x, point.y);
        ctx.lineTo(group[group.length - 1].x, yAt(scale.min));
        ctx.closePath();
        ctx.fillStyle = series.fill;
        ctx.fill();
      }
      if (group.length >= 2) {
        ctx.beginPath();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = series.color;
        ctx.lineWidth = 2;
        group.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      }
      for (const point of group) {
        const color = series.pointColors?.[point.index] || series.color;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.strokeStyle = "#141b24";
        ctx.lineWidth = 2;
        ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        hits.push({ x: point.x, y: point.y, lines: spec.tips[point.index] || [series.name] });
      }
    }
  }

  ctx.fillStyle = AXIS;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = FONT;
  const step = Math.max(1, Math.ceil(count / 5));
  for (let index = 0; index < count; index++) {
    if (index % step !== 0 && index !== count - 1) continue;
    ctx.fillText(spec.labels[index], xAt(index), height - padB + 6);
  }
  canvas.__layout = { hits };
}

function renderBars(canvas, spec) {
  const sized = sizeCanvas(canvas);
  if (!sized) return;
  const { ctx, width, height } = sized;
  const values = spec.values || [];
  if (!values.length) {
    drawEmpty(ctx, width, height, spec.empty);
    canvas.__layout = { hits: [] };
    return;
  }
  const maxValue = Math.max(...values, 0);
  const scale = niceScale(0, maxValue === 0 ? 1 : maxValue * 1.12, 4);
  ctx.font = FONT;
  let yLabelW = 0;
  for (const tick of scale.ticks) {
    yLabelW = Math.max(yLabelW, ctx.measureText(spec.formatY(tick)).width);
  }
  const xLabelW = (spec.labels || []).reduce((width, label) => Math.max(width, ctx.measureText(String(label)).width), 0);
  const padL = Math.ceil(yLabelW) + 10;
  const padR = Math.max(12, Math.ceil(xLabelW / 2) + 8);
  const padT = 12;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const yAt = (value) => padT + ((scale.max - value) / (scale.max - scale.min)) * plotH;
  const band = plotW / values.length;
  const barW = Math.min(26, band * 0.62);

  ctx.clearRect(0, 0, width, height);
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  for (const tick of scale.ticks) {
    const y = yAt(tick);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(width - padR, y);
    ctx.stroke();
    ctx.fillStyle = AXIS;
    ctx.textAlign = "right";
    ctx.fillText(spec.formatY(tick), padL - 6, y);
  }

  const baseline = yAt(0);
  const hits = [];
  values.forEach((value, index) => {
    const x = padL + band * index + (band - barW) / 2;
    const y = yAt(value);
    const h = Math.max(value > 0 ? 2 : 0, baseline - y);
    if (value > 0) {
      roundTopRect(ctx, x, baseline - h, barW, h, 5);
      ctx.fillStyle = spec.colors?.[index] || spec.color || "#3ee0b0";
      ctx.fill();
    }
    hits.push({
      x: x + barW / 2,
      y: baseline - h,
      lines: spec.tips[index] || [spec.labels[index]],
    });
  });

  ctx.fillStyle = AXIS;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const step = Math.max(1, Math.ceil(values.length / 6));
  values.forEach((_, index) => {
    if (index % step !== 0 && index !== values.length - 1) return;
    ctx.fillText(spec.labels[index], padL + band * index + band / 2, height - padB + 6);
  });
  canvas.__layout = { hits };
}
