import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCSV, parseNumber } from "../js/csv.js";
import {
  BASE_HR_TARGET,
  baseCompliance,
  bodyweightBlocks,
  computePRs,
  e1rmSeries,
  exerciseList,
  loadModel,
  monthGrid,
  repSeries,
  trendRuns,
  weekStartISO,
  weekSummary,
  weeklyMileage,
  weeklyVolume,
} from "../js/metrics.js";

const runsText = readFileSync(new URL("../data/runs.csv", import.meta.url), "utf8");
const strengthText = readFileSync(new URL("../data/strength.csv", import.meta.url), "utf8");
const model = loadModel(runsText, strengthText);
const today = new Date(2026, 10, 18);

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.02, `${label}: ${actual} != ${expected}`);
}

test("parses quoted thousands, missing notes, and commas inside notes", () => {
  assert.equal(parseNumber("1,350"), 1350);
  const quoted = parseCSV('Date,Volume\n2026-01-01,"1,350"\n');
  assert.equal(parseNumber(quoted[0].Volume), 1350);
  assert.equal(parseNumber(""), null);
  const rows = parseCSV([
    "Date,Distance (mi),Cadence,Notes",
    '2026-01-05,3.5,172,"felt fine, kept it easy"',
    "2026-01-06,1.00,160,",
    'DateOnly,"1,200"',
  ].join("\n"));
  assert.equal(rows[0].Cadence, "172");
  assert.equal(rows[0].Notes, "felt fine, kept it easy");
  assert.equal(rows[1].Notes, "");
  const noNotes = parseCSV('Date,Exercise,Reps,Weight (lb)\n2026-01-01,Pull-ups,8,"0"\n');
  assert.equal(noNotes[0].Notes, undefined);
  assert.equal(parseNumber(noNotes[0]["Weight (lb)"]), 0);
  const escaped = parseCSV('Date,Notes\n2026-01-01,"He said ""hi"", then left"\n');
  assert.equal(escaped[0].Notes, 'He said "hi", then left');
});

test("real log shape and quirks", () => {
  assert.equal(model.runs.length, 20);
  assert.equal(model.sets.length, 133);
  const first = model.sets.find((set) => set.date === "2026-10-26" && set.exercise === "Bench Press" && set.setNum === 1);
  assert.equal(first.weight, 135);
  assert.equal(first.volume, 1350);
  assert.ok(model.sets.some((set) => set.exercise === "Back Squat" && set.volume === 2775));
  const shoulder = model.sets.find((set) => set.date === "2026-11-09" && set.exercise === "Shoulder Press");
  assert.match(shoulder.notes, /under-ate night before, low energy/);
  const pullup = model.sets.find((set) => set.exercise === "Pull-ups");
  assert.equal(pullup.weight, 0);
  assert.equal(pullup.e1rm, null);
  const carry = model.sets.filter((set) => set.exercise === "Farmer Carry");
  assert.deepEqual(carry.map((set) => set.reps), [1, 1, 1]);
  assert.equal(carry.reduce((sum, set) => sum + set.volume, 0), 180);
  const excluded = model.runs.filter((run) => !run.include);
  assert.equal(excluded.length, 3);
  const oct14 = model.runs.find((run) => run.date === "2026-10-14");
  near(oct14.ef, 156.67 / 153, "ef");
});

test("weeks start Monday and this week matches 18 Nov 2026", () => {
  assert.equal(weekStartISO("2026-11-18"), "2026-11-16");
  assert.equal(weekStartISO("2026-11-15"), "2026-11-09");
  assert.equal(weekStartISO("2026-10-13"), "2026-10-12");
  const summary = weekSummary(model, today);
  assert.equal(summary.rangeLabel, "Nov 16–22");
  assert.equal(summary.miles, 0);
  assert.equal(summary.runCount, 0);
  assert.equal(summary.liftSessions, 1);
  assert.equal(summary.volume, 21045);
  const miles = weeklyMileage(model.runs, today);
  const byWeek = Object.fromEntries(miles.map((week) => [week.week, week.value]));
  near(byWeek["2026-10-12"], 18.78, "oct 12");
  near(byWeek["2026-10-19"], 31.29, "oct 19");
  near(byWeek["2026-10-26"], 20.66, "oct 26");
  near(byWeek["2026-11-02"], 18.96, "nov 2");
  near(byWeek["2026-11-09"], 3.98, "nov 9");
  near(byWeek["2026-11-16"], 0, "nov 16");
  assert.equal(miles.find((week) => week.week === "2026-11-16").isCurrent, true);
  const volume = weeklyVolume(model.sets, today);
  assert.equal(volume.find((week) => week.week === "2026-11-16").value, 21045);
});

test("efficiency trend, base target, and lift records", () => {
  const ef = trendRuns(model.runs, ["Base", "Long", "Threshold"]);
  assert.equal(ef.filter((run) => run.type === "Base" || run.type === "Long").length, 13);
  assert.equal(ef.filter((run) => run.type === "Threshold").length, 3);
  assert.equal(trendRuns(model.runs, ["Sprint"]).length, 1);
  const base = baseCompliance(model.runs);
  assert.equal(BASE_HR_TARGET, 147);
  assert.equal(base.total, 10);
  assert.equal(base.hits.length, 1);
  assert.equal(base.hits[0].date, "2026-10-21");
  assert.deepEqual(exerciseList(model.sets).slice(0, 5), [
    "Bench Press",
    "Back Squat",
    "Deadlift",
    "Shoulder Press",
    "Barbell Row",
  ]);
  const bench = e1rmSeries(model.sets, "Bench Press");
  near(bench.at(-1).e1rm, 262.5, "bench");
  const squat = e1rmSeries(model.sets, "Back Squat");
  near(squat.at(-1).e1rm, 285, "squat");
  assert.equal(squat.filter((point) => point.date === "2026-11-12").length, 2);
  const prs = computePRs(model.sets);
  const squatPr = prs.find((pr) => pr.date === "2026-11-17" && pr.exercise === "Back Squat");
  assert.ok(squatPr.kinds.includes("e1rm"));
  assert.ok(squatPr.kinds.includes("weight"));
  assert.equal(squatPr.inaugural, false);
  assert.equal(prs.some((pr) => pr.date === "2026-11-09" && pr.exercise === "Bench Press"), false);
  const pullups = prs.find((pr) => pr.date === "2026-11-14" && pr.exercise === "Pull-ups");
  assert.deepEqual(pullups.kinds, ["reps"]);
  assert.equal(pullups.reps, 10);
  const block = bodyweightBlocks(model.sets).find((item) => item.exercise === "Pull-ups");
  assert.deepEqual(block.sessions.map((session) => session.reps), [28, 40, 50]);
  assert.equal(repSeries(model.sets, "Pull-ups")[2].best, 10);
  assert.equal(bodyweightBlocks(model.sets).some((item) => item.exercise === "Back Extension"), false);
});

test("November 2026 calendar starts on Monday", () => {
  const cells = monthGrid(2026, 10);
  assert.equal(cells[0].iso, "2026-10-26");
  assert.equal(cells[6].iso, "2026-11-01");
  assert.equal(cells[6].inMonth, true);
  assert.equal(cells.length, 42);
});

test("site stays relative and installable", () => {
  const root = new URL("..", import.meta.url);
  const html = readFileSync(new URL("index.html", root), "utf8");
  const manifest = readFileSync(new URL("manifest.json", root), "utf8");
  const sw = readFileSync(new URL("sw.js", root), "utf8");
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-touch-icon/);
  assert.doesNotMatch(html, /(?:src|href)="\//);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"start_url": "\.\/"/);
  assert.match(sw, /no-store/);
  assert.match(sw, /networkFirst/);
  assert.match(sw, /\.\/data\/runs\.csv/);
});
