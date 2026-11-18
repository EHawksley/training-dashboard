import { mountBars, mountLine } from "./charts.js";
import {
  BASE_HR_TARGET,
  MONTHS_FULL,
  WEEKDAYS_SHORT,
  activitiesByDate,
  baseCompliance,
  bodyweightBlocks,
  computePRs,
  e1rmSeries,
  exerciseList,
  exercisesInSession,
  feedDays,
  formatCompact,
  formatDuration,
  formatE1rm,
  formatEF,
  formatFull,
  formatInt,
  formatLb,
  formatMiles,
  formatMilesFixed,
  formatPace,
  formatPaceSeconds,
  formatPretty,
  formatWeekRange,
  isBodyweightExercise,
  latestLogDate,
  loadModel,
  logTotals,
  monthGrid,
  paceToSeconds,
  parseISODate,
  prDetail,
  prHeadline,
  repSeries,
  toISODate,
  trendRuns,
  weekSummary,
  weeklyMileage,
  weeklyVolume,
} from "./metrics.js";
import {
  COOLDOWN_KEY,
  COOLDOWN_MS,
  SUCCESS_MESSAGE,
  isConfigured,
  loadSettings,
  postRunCompleted,
  saveSettings,
} from "./webhook.js";

const TYPE_COLOR = {
  Base: "#3ee0b0",
  Long: "#6aa7ff",
  Threshold: "#ff5d73",
  Sprint: "#c084fc",
};

const state = {
  month: null,
  selectedDate: null,
  lift: null,
};

let model = null;
let cleanups = [];
const runState = {
  status: "idle",
  message: "",
  cooldownUntil: 0,
};
let cooldownTimer = 0;

function h(tag, props, ...kids) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function currentTab() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (hash.startsWith("strength")) return "strength";
  if (hash.startsWith("calendar")) return "calendar";
  return "running";
}

function syncTabs() {
  const tab = currentTab();
  document.querySelectorAll(".tabbar a").forEach((link) => {
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function pageHeader(title) {
  const through = latestLogDate(model);
  return h("header", { class: "top" },
    h("div", {},
      h("p", { class: "eyebrow" }, "Evan · Hybrid"),
      h("h1", {}, title),
    ),
    h("div", { class: "top-side" },
      h("button", {
        type: "button",
        class: "gear",
        "aria-label": "Settings",
        onClick: () => openSettings(),
      }, icon(`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.4v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.4-1H4.3a1.8 1.8 0 1 1 0-3.6h.2a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.6 1.6 0 0 0 1.7.3H10a1.6 1.6 0 0 0 1-1.4V4.3a1.8 1.8 0 1 1 3.6 0v.2a1.6 1.6 0 0 0 1 1.4 1.6 1.6 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1c.2.6.8 1 1.4 1h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.6 1.6 0 0 0-1.4 1Z"/></svg>`)),
      through ? h("p", { class: "updated" },
        h("span", {}, "Log through"),
        h("strong", {}, formatPretty(through)),
      ) : null,
    ),
  );
}

function icon(markup) {
  const wrap = document.createElement("span");
  wrap.className = "icon";
  wrap.innerHTML = markup;
  return wrap;
}

function legendItem(color, label, dashed = false) {
  return h("span", { class: "legend-item" },
    h("i", { class: dashed ? "swatch dashed" : "swatch", style: dashed ? `border-color:${color}` : `background:${color}` }),
    label,
  );
}

function chartCard(kicker, title, note, canvasId) {
  const canvas = h("canvas", { class: "chart", id: canvasId, role: "img" });
  const tip = h("div", { class: "tip", hidden: true });
  const legend = h("div", { class: "legend" });
  const card = h("section", { class: "card" },
    kicker ? h("p", { class: "kicker" }, kicker) : null,
    h("h3", {}, title),
    note ? h("p", { class: "note" }, note) : null,
    canvas,
    legend,
    tip,
  );
  return { card, canvas, tip, legend };
}

function statPair(leftLabel, leftValue, leftSub, rightLabel, rightValue, rightSub) {
  return h("div", { class: "split" },
    h("div", {}, h("span", {}, leftLabel), h("b", {}, leftValue), leftSub ? h("small", {}, leftSub) : null),
    h("div", {}, h("span", {}, rightLabel), h("b", {}, rightValue), rightSub ? h("small", {}, rightSub) : null),
  );
}

function renderRunning() {
  const mounts = [];
  const today = new Date();
  const summary = weekSummary(model, today);
  const totals = logTotals(model);
  const newest = latestRun();
  const page = h("div", { class: "page", "data-view": "running" },
    pageHeader("Running"),
    h("p", { class: "week-label" }, `This week · ${summary.rangeLabel}`),
    h("section", { class: "summary pair", "aria-label": `This week ${summary.rangeLabel}` },
      stat("miles", formatMilesFixed(summary.miles, 1), "miles"),
      stat("runs", String(summary.runCount), "runs"),
    ),
    h("p", { class: "log-line" }, `${formatMiles(totals.miles)} mi · ${totals.runs} runs in the log`),
    newest ? [h("h2", { class: "section-label" }, "Latest run"), renderRunCard(newest)] : null,
    ...runningSections(mounts, today),
    ...recentFeed("runs", newest),
  );
  return { node: page, mounts };
}

function renderStrength() {
  const mounts = [];
  const today = new Date();
  const summary = weekSummary(model, today);
  const totals = logTotals(model);
  const prs = computePRs(model.sets);
  const lifts = exerciseList(model.sets);
  if (!state.lift || !lifts.includes(state.lift)) state.lift = lifts[0] || "";
  const latestByExercise = [];
  const seen = new Set();
  for (const pr of prs) {
    if (seen.has(pr.exercise)) continue;
    seen.add(pr.exercise);
    latestByExercise.push(pr);
    if (latestByExercise.length === 6) break;
  }
  const page = h("div", { class: "page", "data-view": "strength" },
    pageHeader("Strength"),
    h("p", { class: "week-label" }, `This week · ${summary.rangeLabel}`),
    h("section", { class: "summary pair", "aria-label": `This week ${summary.rangeLabel}` },
      stat("sessions", String(summary.liftSessions), "sessions"),
      stat("volume", formatCompact(summary.volume), "volume"),
    ),
    h("p", { class: "log-line" }, `${totals.sessions} sessions · ${formatInt(totals.volume)} lb in the log`),
    latestByExercise.length ? [
      h("h2", { class: "section-label" }, "Latest PRs"),
      h("div", { class: "pr-scroller", "aria-label": "Latest PRs" }, latestByExercise.map((pr) => prChip(pr))),
    ] : null,
    liftField(lifts),
    liftChart(mounts),
    volumeCard(mounts, today),
    prList(prs),
    bodyweightSection(mounts),
    ...recentFeed("lifts"),
  );
  return { node: page, mounts };
}

function latestRun() {
  for (const day of feedDays(model)) {
    if (day.runs.length) return day.runs[day.runs.length - 1];
  }
  return null;
}

function recentFeed(kind, skipRun = null) {
  const prIndex = new Set(computePRs(model.sets).map((pr) => `${pr.date}|${pr.workout}|${pr.exercise}`));
  const days = feedDays(model).map((day) => ({
    date: day.date,
    runs: kind === "runs" ? day.runs.filter((run) => run !== skipRun) : [],
    lifts: kind === "lifts" ? day.lifts : [],
  })).filter((day) => day.runs.length || day.lifts.length);
  if (!days.length) return [];
  return [
    h("h2", { class: "section-label" }, kind === "runs" ? "Earlier runs" : "Recent lifts"),
    days.map((day) => h("section", { class: "day-group" },
      h("h2", { class: "day-label" }, formatFull(day.date)),
      day.runs.map((run) => renderRunCard(run)),
      day.lifts.map((lift) => renderLiftCard(lift, prIndex)),
    )),
  ];
}

function stat(kind, value, label) {
  return h("div", { class: `stat ${kind}` }, h("b", {}, value), h("span", {}, label));
}

function prChip(pr) {
  const headline = prHeadline(pr);
  return h("article", { class: "pr-mini" },
    h("p", { class: "ex" }, pr.exercise),
    h("p", { class: "num" }, headline.value, " ", h("small", {}, headline.unit)),
    h("p", { class: "sub" }, `${formatPretty(pr.date)} · ${headline.sub}`),
  );
}

function runningSections(mounts, today) {
  const easyTypes = ["Base", "Long"];
  const efRuns = trendRuns(model.runs, ["Base", "Long", "Threshold"]).filter((run) => run.ef != null);
  const labels = efRuns.map((run) => shortLabel(run.date));
  const easy = efRuns.map((run) => (easyTypes.includes(run.type) ? run.ef : null));
  const threshold = efRuns.map((run) => (run.type === "Threshold" ? run.ef : null));
  const lastEasy = [...efRuns].reverse().find((run) => easyTypes.includes(run.type));
  const lastThreshold = [...efRuns].reverse().find((run) => run.type === "Threshold");
  const efCard = chartCard(
    "Aerobic",
    "Efficiency factor",
    "Speed (m/min) ÷ avg heart rate. Base and long together, threshold separate. Included runs only.",
  );
  efCard.canvas.setAttribute("aria-label", efAria(lastEasy, lastThreshold));
  efCard.legend.append(
    legendItem("#3ee0b0", "Base + long"),
    legendItem("#ff5d73", "Threshold"),
  );
  if (lastEasy || lastThreshold) {
    efCard.card.insertBefore(statPair(
      "Easy",
      lastEasy ? formatEF(lastEasy.ef) : "—",
      lastEasy ? formatPretty(lastEasy.date) : "",
      "Threshold",
      lastThreshold ? formatEF(lastThreshold.ef) : "—",
      lastThreshold ? formatPretty(lastThreshold.date) : "",
    ), efCard.canvas);
  }
  mounts.push(() => mountLine(efCard.canvas, efCard.tip, {
    labels,
    formatY: (value) => value.toFixed(2),
    series: [
      { name: "Base + long", color: "#3ee0b0", fill: "rgba(62,224,176,0.16)", values: easy },
      { name: "Threshold", color: "#ff5d73", fill: "rgba(255,93,115,0.12)", values: threshold },
    ],
    tips: efRuns.map((run) => [
      `${formatPretty(run.date)} · ${run.type}`,
      `EF ${formatEF(run.ef)}`,
      `${run.avgHr} bpm · ${formatPace(run.avgPace)}/mi`,
    ]),
    empty: "No included runs yet",
  }));

  const compliance = baseCompliance(model.runs);
  const baseCard = h("section", { class: "card" },
    h("p", { class: "kicker" }, "Base runs"),
    h("h3", {}, `${BASE_HR_TARGET} bpm target`),
    h("p", { class: "base-score" },
      h("b", {}, `${compliance.hits.length} of ${compliance.total}`),
      " included base runs averaged at or under 147",
    ),
    h("div", { class: "hr-dots", "aria-hidden": "true" },
      compliance.total ? modelBaseDots(compliance) : null,
    ),
    h("p", { class: "note" }, baseNote(compliance)),
  );

  const miles = weeklyMileage(model.runs, today);
  const peakMiles = miles.reduce((best, week) => (week.value > best.value ? week : best), miles[0]);
  const thisMiles = miles.find((week) => week.isCurrent);
  const mileCard = chartCard(
    "Volume",
    "Weekly mileage",
    "Every run counts, including ones left out of the trend. Weeks start Monday.",
  );
  mileCard.canvas.setAttribute("aria-label", peakMiles
    ? `Weekly mileage. Peak ${formatMilesFixed(peakMiles.value, 1)} miles the week of ${formatPretty(peakMiles.week)}.`
    : "Weekly mileage");
  mileCard.card.insertBefore(statPair(
    "This week",
    formatMilesFixed(thisMiles?.value || 0, 1),
    "miles",
    "Peak week",
    peakMiles ? formatMilesFixed(peakMiles.value, 1) : "—",
    peakMiles ? formatWeekRange(peakMiles.week) : "",
  ), mileCard.canvas);
  mileCard.legend.append(legendItem("#3ee0b0", "This week"), legendItem("rgba(62,224,176,0.4)", "Earlier"));
  mounts.push(() => mountBars(mileCard.canvas, mileCard.tip, {
    labels: miles.map((week) => week.label),
    values: miles.map((week) => week.value),
    colors: miles.map((week) => (week.isCurrent ? "#3ee0b0" : "rgba(62,224,176,0.45)")),
    formatY: (value) => String(Math.round(value)),
    tips: miles.map((week) => [
      `Week of ${formatPretty(week.week)}`,
      `${formatMiles(week.value)} mi · ${week.count} runs`,
    ]),
  }));

  const paced = trendRuns(model.runs).filter((run) => paceToSeconds(run.avgPace) != null);
  const paceCard = chartCard("Trend", "Pace", "Included runs only. Lower is faster.");
  paceCard.canvas.setAttribute("aria-label", "Pace trend for included runs, minutes per mile");
  paceCard.legend.append(...typeLegend());
  mounts.push(() => mountLine(paceCard.canvas, paceCard.tip, {
    labels: paced.map((run) => shortLabel(run.date)),
    formatY: formatPaceSeconds,
    series: [{
      name: "Pace",
      color: "#9fb0c3",
      values: paced.map((run) => paceToSeconds(run.avgPace)),
      pointColors: paced.map((run) => TYPE_COLOR[run.type] || "#9fb0c3"),
    }],
    tips: paced.map((run) => [
      `${formatPretty(run.date)} · ${run.type}`,
      `${formatPace(run.avgPace)} /mi`,
      run.title,
    ]),
    empty: "No included runs yet",
  }));

  const hrs = trendRuns(model.runs).filter((run) => run.avgHr != null);
  const hrCard = chartCard("Trend", "Heart rate", "Average heart rate. Dashed line is the 147 base target.");
  hrCard.canvas.setAttribute("aria-label", "Heart rate trend for included runs, with a 147 bpm base target");
  hrCard.legend.append(...typeLegend(), legendItem("#ff5d73", "147 target", true));
  mounts.push(() => mountLine(hrCard.canvas, hrCard.tip, {
    labels: hrs.map((run) => shortLabel(run.date)),
    formatY: (value) => String(Math.round(value)),
    refLine: { y: BASE_HR_TARGET, color: "#ff5d73", label: "147" },
    series: [{
      name: "HR",
      color: "#9fb0c3",
      values: hrs.map((run) => run.avgHr),
      pointColors: hrs.map((run) => TYPE_COLOR[run.type] || "#ff7a59"),
    }],
    tips: hrs.map((run) => [
      `${formatPretty(run.date)} · ${run.type}`,
      `${Math.round(run.avgHr)} bpm avg`,
      run.maxHr != null ? `Max ${Math.round(run.maxHr)}` : run.title,
    ]),
    empty: "No included runs yet",
  }));

  return [efCard.card, baseCard, mileCard.card, paceCard.card, hrCard.card];
}

function modelBaseDots(compliance) {
  const hits = new Set(compliance.hits.map((run) => `${run.date}|${run.title}`));
  return trendRuns(model.runs, ["Base"]).map((run) => (
    h("i", { class: hits.has(`${run.date}|${run.title}`) ? "hr-dot on" : "hr-dot", title: `${formatPretty(run.date)} · ${Math.round(run.avgHr)} bpm` })
  ));
}

function baseNote(compliance) {
  if (!compliance.total) return "No included base runs yet.";
  const avg = compliance.avg == null ? "" : ` Average ${Math.round(compliance.avg)} bpm.`;
  if (!compliance.hits.length) return `None of the included base runs were at or under 147.${avg}`;
  const list = compliance.hits.map((run) => `${formatPretty(run.date)} (${Math.round(run.avgHr)} bpm)`).join(", ");
  return `On target: ${list}.${avg}`;
}

function efAria(lastEasy, lastThreshold) {
  const bits = ["Efficiency factor, base plus long versus threshold"];
  if (lastEasy) bits.push(`latest easy ${formatEF(lastEasy.ef)} on ${formatPretty(lastEasy.date)}`);
  if (lastThreshold) bits.push(`latest threshold ${formatEF(lastThreshold.ef)} on ${formatPretty(lastThreshold.date)}`);
  return bits.join(". ");
}

function typeLegend() {
  return ["Base", "Long", "Threshold", "Sprint"].map((type) => legendItem(TYPE_COLOR[type], type));
}

function shortLabel(iso) {
  const date = parseISODate(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function liftField(lifts) {
  const primary = lifts.filter((name) => ["Bench Press", "Back Squat", "Deadlift", "Shoulder Press", "Barbell Row"].includes(name));
  const rest = lifts.filter((name) => !primary.includes(name));
  const option = (name) => h("option", { value: name, selected: name === state.lift }, name);
  return h("div", { class: "field" },
    h("label", { for: "lift" }, "Lift"),
    h("select", {
      id: "lift",
      "aria-label": "Lift",
      onChange: (event) => {
        state.lift = event.target.value;
        render({ keepScroll: true });
      },
    },
      primary.length ? h("optgroup", { label: "Main lifts" }, primary.map(option)) : null,
      rest.length ? h("optgroup", { label: "More" }, rest.map(option)) : null,
    ),
  );
}

function liftChart(mounts) {
  const name = state.lift;
  if (!name) return h("section", { class: "card" }, h("p", {}, "No lifts logged yet."));
  if (isBodyweightExercise(model.sets, name)) {
    const sessions = repSeries(model.sets, name);
    const total = sessions.reduce((sum, session) => sum + session.reps, 0);
    const best = sessions.reduce((current, session) => (session.best > current.best ? session : current), sessions[0]);
    const card = chartCard("Bodyweight", "Reps", "Logged at 0 lb, so there is no estimated 1RM. Bars are total reps in the session.");
    card.canvas.setAttribute("aria-label", `${name} rep counts. Best set ${best ? best.best : 0}. ${total} reps logged.`);
    if (best) {
      card.card.insertBefore(statPair(
        "Best set",
        String(best.best),
        formatPretty(best.date),
        "Logged",
        formatInt(total),
        "reps",
      ), card.canvas);
    }
    mounts.push(() => mountBars(card.canvas, card.tip, {
      labels: sessions.map((session) => session.label),
      values: sessions.map((session) => session.reps),
      colors: sessions.map(() => "#ffb020"),
      formatY: (value) => String(Math.round(value)),
      tips: sessions.map((session) => [
        `${formatPretty(session.date)} · ${session.workout}`,
        `${session.reps} reps · best set ${session.best}`,
      ]),
      empty: "No reps logged",
    }));
    return card.card;
  }

  const series = e1rmSeries(model.sets, name);
  const loaded = model.sets.filter((set) => set.exercise === name && set.weight > 0 && set.e1rm != null);
  const bestE = loaded.reduce((current, set) => (set.e1rm > current.e1rm ? set : current), loaded[0]);
  const bestW = loaded.reduce((current, set) => (set.weight > current.weight ? set : current), loaded[0]);
  const card = chartCard(
    "Strength",
    "Estimated 1RM",
    "Best set each session. Epley: weight × (1 + reps / 30). Bodyweight sets are skipped.",
  );
  card.canvas.setAttribute("aria-label", bestE
    ? `${name} estimated 1RM. Best ${formatE1rm(bestE.e1rm)} pounds.`
    : `${name} estimated 1RM`);
  if (bestE && bestW) {
    card.card.insertBefore(statPair(
      "Best e1RM",
      formatE1rm(bestE.e1rm),
      `${formatLb(bestE.weight)}×${bestE.reps}`,
      "Heaviest",
      `${formatLb(bestW.weight)} lb`,
      `${formatPretty(bestW.date)}`,
    ), card.canvas);
  }
  mounts.push(() => mountLine(card.canvas, card.tip, {
    labels: series.map((point) => point.label),
    formatY: (value) => formatE1rm(value),
    series: [{
      name: name,
      color: "#7eb6ff",
      fill: "rgba(126,182,255,0.16)",
      values: series.map((point) => point.e1rm),
    }],
    tips: series.map((point) => [
      `${formatPretty(point.date)} · ${point.workout}`,
      `${formatLb(point.weight)}×${point.reps}`,
      `e1RM ${formatE1rm(point.e1rm)}`,
    ]),
    empty: "No loaded sets for this lift",
  }));
  return card.card;
}

function volumeCard(mounts, today) {
  const weeks = weeklyVolume(model.sets, today);
  const peak = weeks.reduce((best, week) => (week.value > best.value ? week : best), weeks[0]);
  const current = weeks.find((week) => week.isCurrent);
  const card = chartCard("Volume", "Weekly volume", "Weight × reps for every exercise. Bodyweight sets add nothing. Carries count as 1 rep.");
  card.canvas.setAttribute("aria-label", peak
    ? `Weekly lifting volume. Peak ${formatInt(peak.value)} pounds the week of ${formatPretty(peak.week)}.`
    : "Weekly lifting volume");
  card.card.insertBefore(statPair(
    "This week",
    formatCompact(current?.value || 0),
    current ? `${formatInt(current.value)} lb` : "lb",
    "Peak week",
    peak ? formatCompact(peak.value) : "—",
    peak ? formatWeekRange(peak.week) : "",
  ), card.canvas);
  card.legend.append(legendItem("#ffb020", "This week"), legendItem("rgba(255,176,32,0.4)", "Earlier"));
  mounts.push(() => mountBars(card.canvas, card.tip, {
    labels: weeks.map((week) => week.label),
    values: weeks.map((week) => week.value),
    colors: weeks.map((week) => (week.isCurrent ? "#ffb020" : "rgba(255,176,32,0.45)")),
    formatY: (value) => (value >= 1000 ? `${Math.round(value / 100) / 10}k`.replace(/\.0k$/, "k") : String(Math.round(value))),
    tips: weeks.map((week) => [
      `Week of ${formatPretty(week.week)}`,
      `${formatInt(week.value)} lb · ${week.count} sessions`,
    ]),
  }));
  return card.card;
}

function prList(prs) {
  const rows = prs.slice(0, 8);
  return h("section", { class: "card" },
    h("p", { class: "kicker" }, "Records"),
    h("h3", {}, "PR badges"),
    h("p", { class: "note" }, "A session that set a new best estimated 1RM, a heavier load, or — for bodyweight — more reps."),
    rows.length ? h("ul", { class: "pr-list" }, rows.map((pr) => (
      h("li", {},
        h("span", { class: "when" }, formatPretty(pr.date)),
        h("span", { class: "what" }, pr.exercise),
        h("span", { class: "how" }, prDetail(pr)),
      )
    ))) : h("p", { class: "note" }, "No records yet."),
  );
}

function bodyweightSection(mounts) {
  const blocks = bodyweightBlocks(model.sets).filter((block) => block.exercise !== state.lift);
  if (!blocks.length) return null;
  const nodes = [h("h2", { class: "section-label" }, "Bodyweight")];
  for (const block of blocks) {
    const best = block.sessions.reduce((current, session) => (session.best > current.best ? session : current), block.sessions[0]);
    const card = chartCard(block.exercise, "Reps per session", "Sets logged at 0 lb. The bar is the session total.");
    card.canvas.setAttribute("aria-label", `${block.exercise}, ${formatInt(block.total)} reps logged, best set ${best.best}`);
    card.card.insertBefore(statPair(
      "Best set",
      String(best.best),
      formatPretty(best.date),
      "Total",
      formatInt(block.total),
      "reps",
    ), card.canvas);
    mounts.push(() => mountBars(card.canvas, card.tip, {
      labels: block.sessions.map((session) => session.label),
      values: block.sessions.map((session) => session.reps),
      colors: block.sessions.map(() => "#3ee0b0"),
      formatY: (value) => String(Math.round(value)),
      tips: block.sessions.map((session) => [
        `${formatPretty(session.date)} · ${session.workout}`,
        `${session.reps} reps · best set ${session.best}`,
      ]),
    }));
    nodes.push(card.card);
  }
  return nodes;
}

function monthBounds(today) {
  const dates = [...model.runs.map((run) => run.date), ...model.sets.map((set) => set.date)];
  const minDate = parseISODate(dates.reduce((a, b) => (a < b ? a : b)));
  const maxData = parseISODate(dates.reduce((a, b) => (a > b ? a : b)));
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const maxDate = maxData > todayDate ? maxData : todayDate;
  return {
    min: new Date(minDate.getFullYear(), minDate.getMonth(), 1),
    max: new Date(maxDate.getFullYear(), maxDate.getMonth(), 1),
  };
}

function ensureMonth() {
  const today = new Date();
  const bounds = monthBounds(today);
  if (!state.month) {
    let month = new Date(today.getFullYear(), today.getMonth(), 1);
    if (month < bounds.min) month = bounds.min;
    if (month > bounds.max) month = bounds.max;
    state.month = month;
  }
  if (state.selectedDate == null) state.selectedDate = latestInMonth(state.month) || toISODate(today);
}

function latestInMonth(month) {
  const year = month.getFullYear();
  const index = month.getMonth();
  const dates = [];
  for (const date of activitiesByDate(model).keys()) {
    const value = parseISODate(date);
    if (value.getFullYear() === year && value.getMonth() === index) dates.push(date);
  }
  dates.sort();
  return dates.at(-1) || null;
}

function shiftMonth(dir) {
  if (!model) return;
  const bounds = monthBounds(new Date());
  const next = new Date(state.month.getFullYear(), state.month.getMonth() + dir, 1);
  if (next < bounds.min || next > bounds.max) return;
  state.month = next;
  state.selectedDate = latestInMonth(next);
  render({ keepScroll: true });
}

function renderCalendar() {
  ensureMonth();
  const mounts = [];
  const bounds = monthBounds(new Date());
  const year = state.month.getFullYear();
  const monthIndex = state.month.getMonth();
  const canPrev = state.month > bounds.min;
  const canNext = state.month < bounds.max;
  const activities = activitiesByDate(model);
  const todayISO = toISODate(new Date());
  const cells = monthGrid(year, monthIndex);
  const prIndex = new Set(computePRs(model.sets).map((pr) => `${pr.date}|${pr.workout}|${pr.exercise}`));

  const grid = h("div", { class: "cal-grid" }, cells.map((cell) => {
    const info = activities.get(cell.iso);
    const classes = ["day"];
    if (!cell.inMonth) classes.push("out");
    if (cell.iso === todayISO) classes.push("today");
    if (cell.iso === state.selectedDate) classes.push("selected");
    const bits = [formatFull(cell.iso)];
    if (info?.runs.length) bits.push(`${info.runs.length} run${info.runs.length === 1 ? "" : "s"}`);
    if (info?.lifts.length) bits.push(`${info.lifts.length} lift session${info.lifts.length === 1 ? "" : "s"}`);
    if (!info) bits.push("no workouts");
    return h("button", {
      type: "button",
      class: classes.join(" "),
      "aria-label": bits.join(", "),
      "aria-pressed": cell.iso === state.selectedDate ? "true" : "false",
      onClick: () => {
        const picked = parseISODate(cell.iso);
        state.month = new Date(picked.getFullYear(), picked.getMonth(), 1);
        state.selectedDate = cell.iso;
        render({ keepScroll: true });
      },
    },
      h("span", {}, String(cell.day)),
      h("span", { class: "marks" },
        info?.runs.length ? h("i", { class: "mark run" }) : null,
        info?.lifts.length ? h("i", { class: "mark lift" }) : null,
      ),
    );
  }));

  const wrap = h("div", { class: "cal-wrap" },
    h("div", { class: "month-bar" },
      h("button", {
        type: "button",
        class: "nav-btn",
        disabled: !canPrev,
        "aria-label": "Previous month",
        onClick: () => shiftMonth(-1),
      }, "‹"),
      h("h2", { class: "month-title" }, `${MONTHS_FULL[monthIndex]} ${year}`),
      h("button", {
        type: "button",
        class: "nav-btn",
        disabled: !canNext,
        "aria-label": "Next month",
        onClick: () => shiftMonth(1),
      }, "›"),
    ),
    h("div", { class: "weekdays" }, WEEKDAYS_SHORT.slice(1).concat(WEEKDAYS_SHORT[0]).map((day) => h("span", {}, day))),
    grid,
    h("p", { class: "cal-key" },
      h("span", {}, h("i", { class: "mark run" }), " Run"),
      h("span", {}, h("i", { class: "mark lift" }), " Lift"),
    ),
  );

  mounts.push(() => bindSwipe(wrap, canPrev, canNext));

  const detail = h("div", { id: "day-detail" }, dayDetail(activities, prIndex));
  const page = h("div", { class: "page", "data-view": "calendar" },
    pageHeader("Calendar"),
    wrap,
    detail,
  );
  return { node: page, mounts };
}

function bindSwipe(el, canPrev, canNext) {
  let startX = null;
  let startY = null;
  const onStart = (event) => {
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  };
  const onEnd = (event) => {
    if (startX == null) return;
    const dx = event.changedTouches[0].clientX - startX;
    const dy = event.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0 && canNext) shiftMonth(1);
      if (dx > 0 && canPrev) shiftMonth(-1);
    }
    startX = null;
    startY = null;
  };
  el.addEventListener("touchstart", onStart, { passive: true });
  el.addEventListener("touchend", onEnd, { passive: true });
  return () => {
    el.removeEventListener("touchstart", onStart);
    el.removeEventListener("touchend", onEnd);
  };
}

function dayDetail(activities, prIndex) {
  if (!state.selectedDate) {
    return h("section", { class: "card" }, h("h3", {}, "No workouts this month"));
  }
  const info = activities.get(state.selectedDate);
  const heading = h("h2", { class: "section-label" }, formatFull(state.selectedDate));
  if (!info) {
    return [heading, h("section", { class: "card" }, h("p", {}, "Rest day. Nothing logged."))];
  }
  return [
    heading,
    info.runs.map((run) => renderRunCard(run)),
    info.lifts.map((lift) => renderLiftCard(lift, prIndex)),
  ];
}

function renderRunCard(run) {
  return h("article", { class: "card feed-card" },
    h("div", { class: "feed-top" },
      h("span", { class: `pill ${run.type.toLowerCase()}` }, run.type || "Run"),
      run.include ? null : h("span", { class: "flag" }, "Not in trend"),
    ),
    h("h3", {}, run.title || "Run"),
    h("div", { class: "run-hero" },
      h("div", { class: "hero" }, h("b", {}, formatMiles(run.distance ?? NaN)), h("span", {}, "miles")),
      h("div", { class: "hero" }, h("b", {}, formatDuration(run.movingTime)), h("span", {}, "moving")),
    ),
    h("p", { class: "run-meta" },
      h("span", {}, h("b", {}, formatPace(run.avgPace)), " /mi"),
      h("span", {}, h("b", {}, run.avgHr == null ? "—" : String(Math.round(run.avgHr))), " bpm"),
      h("span", {}, h("b", {}, formatEF(run.ef)), " EF"),
    ),
    run.notes ? h("p", { class: "run-note" }, run.notes) : null,
  );
}

function renderLiftCard(lift, prIndex) {
  const volume = lift.sets.reduce((sum, set) => sum + set.volume, 0);
  return h("article", { class: "card feed-card" },
    h("div", { class: "feed-top" },
      h("span", { class: "pill lift" }, lift.workout),
      h("span", { class: "vol" }, `${formatInt(volume)} lb`),
    ),
    h("div", { class: "lift-hero" },
      h("div", { class: "hero" }, h("b", {}, formatInt(volume)), h("span", {}, "lb volume")),
      h("div", { class: "hero" }, h("b", {}, String(lift.sets.length)), h("span", {}, "sets")),
    ),
    exercisesInSession(lift.sets).map(([exercise, sets]) => {
      const notes = [];
      for (const set of sets) if (set.notes && !notes.includes(set.notes)) notes.push(set.notes);
      const isPR = prIndex.has(`${lift.date}|${lift.workout}|${exercise}`);
      return h("div", { class: "exercise" },
        h("div", { class: "ex-head" },
          h("h4", {}, exercise),
          isPR ? h("span", { class: "pr-tag" }, "PR") : null,
        ),
        h("div", { class: "set-row" }, sets.map((set) => {
          const label = set.weight === 0 ? `BW × ${set.reps}` : `${formatLb(set.weight)} × ${set.reps}`;
          return h("span", {
            class: set.weight === 0 ? "set bw" : "set",
            "aria-label": set.weight === 0 ? `bodyweight by ${set.reps}` : `${set.weight} pounds by ${set.reps}`,
          }, label);
        })),
        notes.map((note) => h("p", { class: "ex-note" }, note)),
      );
    }),
  );
}

function render({ keepScroll = false } = {}) {
  if (!model) return;
  const y = window.scrollY;
  cleanups.forEach((fn) => fn());
  cleanups = [];
  const tab = currentTab();
  syncTabs();
  const title = tab === "calendar" ? "Calendar" : tab === "strength" ? "Strength" : "Running";
  document.title = `${title} · Training`;
  const view = tab === "calendar" ? renderCalendar() : tab === "strength" ? renderStrength() : renderRunning();
  document.getElementById("view").replaceChildren(view.node);
  syncRunDock();
  requestAnimationFrame(() => {
    for (const mount of view.mounts) {
      const cleanup = mount();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    }
    if (keepScroll) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
  });
}

function showError(error) {
  const view = document.getElementById("view");
  view.replaceChildren(h("section", { class: "card error-card" },
    h("h2", {}, "Could not load the log"),
    h("p", { class: "note" }, error?.message || String(error)),
    h("button", { type: "button", class: "retry", onClick: () => location.reload() }, "Retry"),
  ));
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  const text = await response.text();
  if (!text.trimStart().startsWith("Date")) throw new Error(`${url} is not the training CSV`);
  return text;
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register("sw.js").catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

function mountRunChrome() {
  const dock = h("div", { class: "run-dock", hidden: true },
    h("p", { class: "run-status", role: "status", "aria-live": "polite", hidden: true }),
    h("button", {
      type: "button",
      class: "run-button",
      onClick: () => completeRun(),
    },
      icon(`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
      h("span", { class: "run-label" }, "Completed run"),
    ),
  );
  const sheet = h("div", { class: "sheet-backdrop", hidden: true },
    h("form", { class: "sheet", "aria-labelledby": "settings-title", onSubmit: saveSettingsForm },
      h("div", { class: "sheet-handle", "aria-hidden": "true" }),
      h("div", { class: "sheet-head" },
        h("h2", { id: "settings-title" }, "Settings"),
        h("button", { type: "button", class: "sheet-close", "aria-label": "Close settings", onClick: closeSettings }, "Close"),
      ),
      field("Webhook URL", "url", "webhook-url", "https://"),
      field("Header name", "text", "webhook-header", "Authorization"),
      field("Header value", "password", "webhook-key", "Sender key"),
      h("p", { class: "sheet-help" }, "Paste the URL and sender key from the run-completed-button routine panel in Grok Bot."),
      h("p", { class: "sheet-error", hidden: true }),
      h("button", { type: "submit", class: "sheet-save" }, "Save"),
    ),
  );
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) closeSettings();
  });
  document.querySelector(".app").append(dock, sheet);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  });
}

function field(label, type, id, placeholder) {
  return h("label", { class: "sheet-field" },
    h("span", {}, label),
    h("input", {
      id,
      type,
      name: id,
      placeholder,
      autocomplete: "off",
      spellcheck: "false",
    }),
  );
}

function settingsForm() {
  return document.querySelector(".sheet");
}

function openSettings() {
  const settings = loadSettings(localStorage);
  const form = settingsForm();
  form.elements["webhook-url"].value = settings.url;
  form.elements["webhook-header"].value = settings.headerName || "Authorization";
  form.elements["webhook-key"].value = settings.headerValue;
  const error = form.querySelector(".sheet-error");
  error.hidden = true;
  error.textContent = "";
  document.querySelector(".sheet-backdrop").hidden = false;
  form.elements["webhook-url"].focus();
}

function closeSettings() {
  const backdrop = document.querySelector(".sheet-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function saveSettingsForm(event) {
  event.preventDefault();
  const form = settingsForm();
  const error = form.querySelector(".sheet-error");
  const url = form.elements["webhook-url"].value.trim();
  const headerName = form.elements["webhook-header"].value.trim();
  const headerValue = form.elements["webhook-key"].value.trim();
  if (!url || !headerValue) {
    error.hidden = false;
    error.textContent = url ? "Add the sender key." : "Add the webhook URL.";
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
    error.hidden = false;
    error.textContent = "Enter a full http or https URL.";
    return;
  }
  saveSettings({ url, headerName, headerValue }, localStorage);
  closeSettings();
}

function restoreCooldown() {
  const until = Number(sessionStorage.getItem(COOLDOWN_KEY) || 0);
  if (until > Date.now()) {
    runState.status = "success";
    runState.message = SUCCESS_MESSAGE;
    runState.cooldownUntil = until;
    armCooldownTimer();
  }
}

function armCooldownTimer() {
  clearInterval(cooldownTimer);
  const tick = () => {
    if (Date.now() >= runState.cooldownUntil) {
      clearInterval(cooldownTimer);
      runState.status = "idle";
      runState.message = "";
      runState.cooldownUntil = 0;
      sessionStorage.removeItem(COOLDOWN_KEY);
    }
    syncRunDock();
  };
  tick();
  cooldownTimer = setInterval(tick, 1000);
}

function syncRunDock() {
  const dock = document.querySelector(".run-dock");
  if (!dock) return;
  const show = Boolean(model) && currentTab() === "running";
  dock.hidden = !show;
  document.querySelector(".app")?.classList.toggle("has-run-dock", show);
  const status = dock.querySelector(".run-status");
  const button = dock.querySelector(".run-button");
  const label = dock.querySelector(".run-label");
  const cooling = Date.now() < runState.cooldownUntil;
  const sending = runState.status === "sending";
  button.disabled = sending || cooling;
  button.classList.toggle("is-sending", sending);
  status.hidden = !runState.message;
  status.textContent = runState.message;
  status.classList.toggle("is-error", runState.status === "error");
  status.classList.toggle("is-success", runState.status === "success");
  label.textContent = sending ? "Sending…" : runState.status === "error" ? "Retry" : "Completed run";
  let spinner = button.querySelector(".spinner");
  if (sending && !spinner) {
    spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    button.insertBefore(spinner, label);
  } else if (!sending && spinner) {
    spinner.remove();
  }
}

async function completeRun() {
  const settings = loadSettings(localStorage);
  if (!isConfigured(settings)) {
    openSettings();
    return;
  }
  if (runState.status === "sending" || Date.now() < runState.cooldownUntil) return;
  runState.status = "sending";
  runState.message = "";
  syncRunDock();
  try {
    await postRunCompleted(settings);
    runState.status = "success";
    runState.message = SUCCESS_MESSAGE;
    runState.cooldownUntil = Date.now() + COOLDOWN_MS;
    sessionStorage.setItem(COOLDOWN_KEY, String(runState.cooldownUntil));
    armCooldownTimer();
  } catch (error) {
    runState.status = "error";
    runState.message = error?.message || "Could not reach the webhook.";
    syncRunDock();
  }
}

async function init() {
  mountRunChrome();
  restoreCooldown();
  window.addEventListener("hashchange", () => render());
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (currentTab() !== "calendar") return;
    if (event.key === "ArrowLeft") shiftMonth(-1);
    if (event.key === "ArrowRight") shiftMonth(1);
  });
  try {
    const [runs, strength] = await Promise.all([
      fetchText("data/runs.csv"),
      fetchText("data/strength.csv"),
    ]);
    model = loadModel(runs, strength);
    render();
  } catch (error) {
    showError(error);
  }
  registerSW();
}

init();
