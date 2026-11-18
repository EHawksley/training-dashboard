import { parseCSV, parseNumber } from "./csv.js";

export const PRIMARY_LIFTS = [
  "Bench Press",
  "Back Squat",
  "Deadlift",
  "Shoulder Press",
  "Barbell Row",
];

export const BASE_HR_TARGET = 147;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value) {
  return ISO_DATE.test(value);
}

export function parseISODate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function weekStartISO(iso) {
  const date = parseISODate(iso);
  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
  return toISODate(date);
}

export function formatPretty(iso) {
  const date = parseISODate(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatFull(iso) {
  const date = parseISODate(iso);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function shortMD(iso) {
  const date = parseISODate(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatWeekRange(startISO) {
  const start = parseISODate(startISO);
  const end = parseISODate(addDays(startISO, 6));
  if (start.getMonth() === end.getMonth()) {
    return `${MONTHS[start.getMonth()]} ${start.getDate()}–${end.getDate()}`;
  }
  return `${MONTHS[start.getMonth()]} ${start.getDate()}–${MONTHS[end.getMonth()]} ${end.getDate()}`;
}

export function formatMiles(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  let text = n.toFixed(digits);
  if (digits > 0) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

export function formatMilesFixed(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function formatInt(n) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function formatCompact(n) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return formatInt(n);
}

export function formatLb(n) {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatE1rm(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatDuration(value) {
  if (!value) return "—";
  const parts = String(value).split(":").map((part) => part.trim());
  if (parts.length !== 3) return String(value);
  const hours = Number(parts[0]);
  if (!Number.isFinite(hours)) return String(value);
  const minutes = parts[1].padStart(2, "0");
  const seconds = parts[2].padStart(2, "0");
  if (hours <= 0) return `${Number(parts[1])}:${seconds}`;
  return `${hours}:${minutes}:${seconds}`;
}

export function formatPace(value) {
  if (!value) return "—";
  const parts = String(value).split(":");
  if (parts.length !== 2) return String(value);
  const minutes = Number(parts[0]);
  if (!Number.isFinite(minutes)) return String(value);
  return `${minutes}:${parts[1].padStart(2, "0")}`;
}

export function paceToSeconds(value) {
  if (!value) return null;
  const parts = String(value).split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function formatPaceSeconds(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remain = Math.abs(total % 60);
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

export function formatEF(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function canonicalType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "base") return "Base";
  if (text === "long") return "Long";
  if (text === "threshold") return "Threshold";
  if (text === "sprint") return "Sprint";
  return String(value ?? "").trim();
}

function mapRun(row) {
  const date = String(row.Date ?? "").trim();
  if (!isISODate(date)) return null;
  const speed = parseNumber(row["Speed (m/min)"]);
  const avgHr = parseNumber(row["Avg HR"]);
  let ef = null;
  if (speed != null && avgHr) ef = speed / avgHr;
  else ef = parseNumber(row["Efficiency Factor"]);
  return {
    date,
    title: String(row.Title ?? "").trim(),
    type: canonicalType(row["Run Type"]),
    distance: parseNumber(row["Distance (mi)"]),
    movingTime: String(row["Moving Time"] ?? "").trim(),
    avgPace: String(row["Avg Pace"] ?? "").trim(),
    avgGap: String(row["Avg GAP"] ?? "").trim(),
    avgHr,
    maxHr: parseNumber(row["Max HR"]),
    ascent: parseNumber(row["Ascent (ft)"]),
    speed,
    ef,
    include: /^y(es)?$/i.test(String(row["Include in trend"] ?? "").trim()),
    notes: String(row.Notes ?? "").trim(),
  };
}

function mapSet(row) {
  const date = String(row.Date ?? "").trim();
  const exercise = String(row.Exercise ?? "").trim();
  if (!isISODate(date) || !exercise) return null;
  const weight = parseNumber(row["Weight (lb)"]);
  const reps = parseNumber(row.Reps);
  const w = weight ?? 0;
  const r = reps ?? 0;
  const volume = weight == null && reps == null ? (parseNumber(row.Volume) ?? 0) : w * r;
  return {
    date,
    day: String(row.Day ?? "").trim(),
    workout: String(row.Workout ?? "").trim() || "Workout",
    exercise,
    setNum: parseNumber(row["Set #"]),
    reps: r,
    weight: w,
    volume,
    e1rm: w > 0 && r > 0 ? w * (1 + r / 30) : null,
    notes: String(row.Notes ?? "").trim(),
  };
}

export function loadModel(runsText, strengthText) {
  const runs = parseCSV(runsText).map(mapRun).filter(Boolean);
  const sets = parseCSV(strengthText).map(mapSet).filter(Boolean);
  runs.sort((a, b) => a.date.localeCompare(b.date));
  sets.sort((a, b) => a.date.localeCompare(b.date));
  return { runs, sets };
}

export function latestLogDate(model) {
  let latest = "";
  for (const run of model.runs) if (run.date > latest) latest = run.date;
  for (const set of model.sets) if (set.date > latest) latest = set.date;
  return latest || null;
}

export function logTotals(model) {
  const sessions = new Set(model.sets.map((set) => `${set.date}|${set.workout}`));
  return {
    miles: model.runs.reduce((sum, run) => sum + (run.distance || 0), 0),
    runs: model.runs.length,
    sessions: sessions.size,
    volume: model.sets.reduce((sum, set) => sum + set.volume, 0),
  };
}

export function weekSummary(model, today = new Date()) {
  const start = weekStartISO(toISODate(today));
  const end = addDays(start, 6);
  const inWeek = (date) => date >= start && date <= end;
  const runs = model.runs.filter((run) => inWeek(run.date));
  const sets = model.sets.filter((set) => inWeek(set.date));
  const sessions = new Set(sets.map((set) => `${set.date}|${set.workout}`));
  return {
    start,
    end,
    rangeLabel: formatWeekRange(start),
    miles: runs.reduce((sum, run) => sum + (run.distance || 0), 0),
    runCount: runs.length,
    liftSessions: sessions.size,
    volume: sets.reduce((sum, set) => sum + set.volume, 0),
  };
}

function daysBetween(startISO, endISO) {
  return Math.round((parseISODate(endISO) - parseISODate(startISO)) / 86400000);
}

export function weeksBetween(startISO, endISO) {
  const out = [];
  let cursor = weekStartISO(startISO);
  const end = weekStartISO(endISO);
  let guard = 0;
  while (cursor <= end && guard < 104) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
    guard++;
  }
  return out;
}

function buildWeeks(items, today, summarize) {
  if (!items.length) return [];
  let first = items[0].date;
  let lastData = items[0].date;
  for (const item of items) {
    if (item.date < first) first = item.date;
    if (item.date > lastData) lastData = item.date;
  }
  const todayISO = toISODate(today);
  const todayWeek = weekStartISO(todayISO);
  const dataWeek = weekStartISO(lastData);
  let last = lastData;
  if (todayWeek > dataWeek && daysBetween(dataWeek, todayWeek) <= 56) last = todayISO;
  const grouped = new Map();
  for (const item of items) {
    const week = weekStartISO(item.date);
    if (!grouped.has(week)) grouped.set(week, []);
    grouped.get(week).push(item);
  }
  return weeksBetween(first, last).map((week) => ({
    week,
    label: shortMD(week),
    isCurrent: week === todayWeek,
    ...summarize(grouped.get(week) || []),
  }));
}

export function weeklyMileage(runs, today = new Date()) {
  return buildWeeks(runs, today, (items) => ({
    value: items.reduce((sum, run) => sum + (run.distance || 0), 0),
    count: items.length,
  }));
}

export function weeklyVolume(sets, today = new Date()) {
  return buildWeeks(sets, today, (items) => ({
    value: items.reduce((sum, set) => sum + set.volume, 0),
    count: new Set(items.map((set) => `${set.date}|${set.workout}`)).size,
  }));
}

export function baseCompliance(runs) {
  const base = runs.filter((run) => run.type === "Base" && run.include && run.avgHr != null);
  const hits = base.filter((run) => run.avgHr <= BASE_HR_TARGET);
  const avg = base.length ? base.reduce((sum, run) => sum + run.avgHr, 0) / base.length : null;
  return { total: base.length, hits, avg };
}

export function trendRuns(runs, types) {
  return runs.filter((run) => run.include && (!types || types.includes(run.type)));
}

export function exerciseList(sets) {
  const names = [...new Set(sets.map((set) => set.exercise))];
  const primary = PRIMARY_LIFTS.filter((name) => names.includes(name));
  const rest = names.filter((name) => !PRIMARY_LIFTS.includes(name)).sort((a, b) => a.localeCompare(b));
  return [...primary, ...rest];
}

function isLoggedBodyweight(set) {
  return set.weight === 0 && set.reps > 0;
}

export function isBodyweightExercise(sets, name) {
  const list = sets.filter((set) => set.exercise === name);
  if (!list.length) return false;
  const bodyweight = list.filter(isLoggedBodyweight).length;
  return bodyweight * 2 > list.length;
}

function groupSessions(sets) {
  const map = new Map();
  for (const set of sets) {
    const key = `${set.date}|${set.workout}`;
    if (!map.has(key)) map.set(key, { date: set.date, workout: set.workout, sets: [] });
    map.get(key).sets.push(set);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function betterE1rm(candidate, current) {
  if (!current) return candidate;
  if (candidate.e1rm !== current.e1rm) return candidate.e1rm > current.e1rm ? candidate : current;
  if (candidate.weight !== current.weight) return candidate.weight > current.weight ? candidate : current;
  return candidate.reps >= current.reps ? candidate : current;
}

export function e1rmSeries(sets, exercise) {
  const sessions = groupSessions(sets.filter((set) => set.exercise === exercise));
  const series = [];
  for (const session of sessions) {
    const weighted = session.sets.filter((set) => set.weight > 0 && set.e1rm != null);
    if (!weighted.length) continue;
    const best = weighted.reduce((current, set) => betterE1rm(set, current));
    series.push({
      date: session.date,
      workout: session.workout,
      e1rm: best.e1rm,
      weight: best.weight,
      reps: best.reps,
      label: shortMD(session.date),
    });
  }
  return series;
}

export function repSeries(sets, exercise) {
  return groupSessions(sets.filter((set) => set.exercise === exercise)).map((session) => {
    const bodyweight = session.sets.filter((set) => set.weight === 0);
    const source = bodyweight.length ? bodyweight : session.sets;
    return {
      date: session.date,
      workout: session.workout,
      reps: source.reduce((sum, set) => sum + set.reps, 0),
      best: source.reduce((max, set) => Math.max(max, set.reps), 0),
      label: shortMD(session.date),
    };
  });
}

export function bodyweightBlocks(sets) {
  const byName = new Map();
  for (const set of sets) {
    if (!byName.has(set.exercise)) byName.set(set.exercise, []);
    byName.get(set.exercise).push(set);
  }
  const names = [...byName.keys()].filter((name) => {
    const list = byName.get(name);
    const bodyweight = list.filter(isLoggedBodyweight).length;
    return bodyweight * 2 > list.length;
  }).sort((a, b) => a.localeCompare(b));
  return names.map((exercise) => {
    const sessions = repSeries(sets, exercise);
    return {
      exercise,
      sessions,
      total: sessions.reduce((sum, session) => sum + session.reps, 0),
    };
  });
}

function primaryRank(name) {
  const index = PRIMARY_LIFTS.indexOf(name);
  return index === -1 ? 100 : index;
}

export function computePRs(sets) {
  const byExercise = new Map();
  for (const set of sets) {
    if (!byExercise.has(set.exercise)) byExercise.set(set.exercise, []);
    byExercise.get(set.exercise).push(set);
  }
  const events = [];
  for (const [exercise, list] of byExercise) {
    const sessions = groupSessions(list);
    const allBodyweight = list.every((set) => set.weight === 0);
    let bestE = -Infinity;
    let bestW = -Infinity;
    let bestR = -Infinity;
    let seen = false;
    for (const session of sessions) {
      const weighted = session.sets.filter((set) => set.weight > 0 && set.e1rm != null);
      const eSet = weighted.length ? weighted.reduce((current, set) => betterE1rm(set, current)) : null;
      const wSet = session.sets.reduce((current, set) => (
        !current || set.weight > current.weight ? set : current
      ), null);
      const rSet = session.sets.reduce((current, set) => (
        !current || set.reps > current.reps ? set : current
      ), null);
      const kinds = [];
      if (!allBodyweight && eSet && eSet.e1rm > bestE) {
        kinds.push("e1rm");
        bestE = eSet.e1rm;
      }
      if (!allBodyweight && wSet && wSet.weight > 0 && wSet.weight > bestW) {
        kinds.push("weight");
        bestW = wSet.weight;
      }
      if (allBodyweight && rSet && rSet.reps > 0 && rSet.reps > bestR) {
        kinds.push("reps");
        bestR = rSet.reps;
      }
      if (!kinds.length) {
        seen = true;
        continue;
      }
      const inaugural = !seen;
      seen = true;
      events.push({
        date: session.date,
        workout: session.workout,
        exercise,
        kinds,
        inaugural,
        e1rm: eSet ? eSet.e1rm : null,
        weight: wSet ? wSet.weight : 0,
        reps: (eSet || rSet)?.reps ?? 0,
        setLabel: eSet ? `${formatLb(eSet.weight)}×${eSet.reps}` : `BW×${rSet.reps}`,
        sameSet: Boolean(eSet && wSet && eSet === wSet),
        isBodyweight: allBodyweight,
      });
    }
  }
  events.sort((a, b) => (
    b.date.localeCompare(a.date)
    || primaryRank(a.exercise) - primaryRank(b.exercise)
    || a.exercise.localeCompare(b.exercise)
  ));
  return events;
}

export function prHeadline(pr) {
  if (pr.isBodyweight) return { value: String(pr.reps), unit: "reps", sub: "best set" };
  if (pr.kinds.includes("e1rm")) return { value: formatE1rm(pr.e1rm), unit: "e1RM", sub: pr.setLabel };
  if (pr.kinds.includes("weight")) return { value: formatLb(pr.weight), unit: "lb", sub: "heaviest" };
  return { value: "—", unit: "", sub: "" };
}

export function prDetail(pr) {
  if (pr.isBodyweight) return `Best set ${pr.reps} reps`;
  const bits = [];
  if (pr.setLabel) bits.push(pr.setLabel);
  if (pr.kinds.includes("e1rm")) bits.push(`e1RM ${formatE1rm(pr.e1rm)}`);
  if (pr.kinds.includes("weight") && !(pr.sameSet && pr.kinds.includes("e1rm"))) {
    bits.push(`heaviest ${formatLb(pr.weight)} lb`);
  }
  return bits.join(" · ");
}

export function activitiesByDate(model) {
  const map = new Map();
  const ensure = (date) => {
    if (!map.has(date)) map.set(date, { runs: [], lifts: [] });
    return map.get(date);
  };
  for (const run of model.runs) ensure(run.date).runs.push(run);
  const lifts = new Map();
  for (const set of model.sets) {
    const key = `${set.date}|${set.workout}`;
    if (!lifts.has(key)) {
      const lift = { date: set.date, workout: set.workout, sets: [] };
      lifts.set(key, lift);
      ensure(set.date).lifts.push(lift);
    }
    lifts.get(key).sets.push(set);
  }
  return map;
}

export function feedDays(model) {
  const map = activitiesByDate(model);
  return [...map.keys()].sort((a, b) => b.localeCompare(a)).map((date) => ({ date, ...map.get(date) }));
}

export function monthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      iso: toISODate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
    });
  }
  if (!cells[35].inMonth) return cells.slice(0, 35);
  return cells;
}

export function exercisesInSession(sets) {
  const map = new Map();
  for (const set of sets) {
    if (!map.has(set.exercise)) map.set(set.exercise, []);
    map.get(set.exercise).push(set);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.setNum ?? 0) - (b.setNum ?? 0));
  }
  return [...map.entries()];
}
