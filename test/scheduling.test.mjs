import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  computeCriticalPath,
  validateTasks,
  levelResources,
  simulateSchedule,
  analyzeSchedule,
  fromPlanExport,
  handleScheduleAnalysis,
  ScheduleValidationError,
} = require("../.test-dist/scheduling/index.js");

// Textbook network: A(3) -> B(2) -> D(4); A -> C(5) -> D.  Longest: A, C, D = 12.
const network = () => [
  { id: "A", name: "Design", durationDays: 3, assignee: "Alice" },
  { id: "B", name: "API", durationDays: 2, dependencies: ["A"], assignee: "Bob" },
  { id: "C", name: "UI", durationDays: 5, dependencies: ["A"], assignee: "Alice" },
  { id: "D", name: "Launch", durationDays: 4, dependencies: ["B", "C"], assignee: "Bob" },
];

test("critical path: duration, chain, floats", () => {
  const result = computeCriticalPath(network());
  assert.equal(result.projectDurationDays, 12);
  assert.deepEqual(result.criticalPath, ["A", "C", "D"]);
  assert.deepEqual(result.criticalTaskIds, ["A", "C", "D"]);
  const b = result.tasks.find((t) => t.id === "B");
  assert.equal(b.totalFloat, 3);
  assert.equal(b.freeFloat, 3); // D starts at 8, B finishes at 5
  assert.equal(b.critical, false);
  const a = result.tasks.find((t) => t.id === "A");
  assert.equal(a.freeFloat, 0);
  assert.deepEqual(result.order, ["A", "B", "C", "D"]);
});

test("critical path: parallel chains and milestones", () => {
  const tasks = [
    { id: "x", durationDays: 4 },
    { id: "y", durationDays: 4 },
    { id: "m", durationDays: 0, dependencies: ["x", "y"] },
  ];
  const result = computeCriticalPath(tasks);
  assert.equal(result.projectDurationDays, 4);
  assert.deepEqual(result.criticalTaskIds, ["x", "y", "m"]);
  assert.ok(result.warnings.some((w) => w.includes("milestones")));
});

test("validation: cycles, unknown and self dependencies, bad durations", () => {
  const cyclic = [
    { id: "a", durationDays: 1, dependencies: ["c"] },
    { id: "b", durationDays: 1, dependencies: ["a"] },
    { id: "c", durationDays: 1, dependencies: ["b"] },
  ];
  const issues = validateTasks(cyclic);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "cycle");
  assert.deepEqual(issues[0].path, ["a", "c", "b", "a"]);
  assert.throws(() => computeCriticalPath(cyclic), ScheduleValidationError);

  const broken = validateTasks([
    { id: "a", durationDays: -1, dependencies: ["a", "zz"] },
    { id: "a", durationDays: 1 },
    { id: "", durationDays: 1 },
  ]);
  const codes = broken.map((i) => i.code).sort();
  assert.deepEqual(codes, ["duplicate_id", "invalid_duration", "missing_id", "self_dependency", "unknown_dependency"]);

  const estimates = validateTasks([{ id: "a", durationDays: 2, optimisticDays: 3, mostLikelyDays: 2, pessimisticDays: 1 }]);
  assert.equal(estimates[0].code, "invalid_estimate");
});

test("resource leveling: serializes a double-booked person and reports slip", () => {
  const cpm = computeCriticalPath(network());
  const leveled = levelResources(network(), [{ key: "Alice" }, { key: "Bob" }], cpm);
  // Alice has A (0-3) then C (3-8); Bob has B (3-5) then D (8-12): no slip.
  assert.equal(leveled.slipDays, 0);
  assert.equal(leveled.projectDurationDays, 12);

  const conflict = [
    { id: "p", durationDays: 3, assignee: "Sam" },
    { id: "q", durationDays: 3, assignee: "Sam" },
    { id: "r", durationDays: 3, assignee: "Sam" },
  ];
  const out = levelResources(conflict, [{ key: "Sam" }]);
  assert.equal(out.projectDurationDays, 9);
  assert.equal(out.slipDays, 6);
  const starts = out.tasks.map((t) => t.start).sort((a, b) => a - b);
  assert.deepEqual(starts, [0, 3, 6]);
  assert.equal(out.utilization[0].key, "Sam");
  assert.equal(out.utilization[0].utilizationPct, 100);
});

test("resource leveling: capacity stretches duration, concurrency allows overlap", () => {
  const tasks = [
    { id: "a", durationDays: 4, assignee: "Half" },
    { id: "b", durationDays: 2, assignee: "Pair" },
    { id: "c", durationDays: 2, assignee: "Pair" },
    { id: "d", durationDays: 1 },
  ];
  const out = levelResources(tasks, [
    { key: "Half", capacity: 50 },
    { key: "Pair", maxConcurrentTasks: 2 },
  ]);
  const a = out.tasks.find((t) => t.id === "a");
  assert.equal(a.durationDays, 8);
  const b = out.tasks.find((t) => t.id === "b");
  const c = out.tasks.find((t) => t.id === "c");
  assert.equal(b.start, 0);
  assert.equal(c.start, 0);
  assert.deepEqual(out.unassignedTaskIds, ["d"]);
  assert.ok(out.warnings.length === 0);
});

test("resource leveling: unknown assignee is tolerated with a warning", () => {
  const out = levelResources([{ id: "a", durationDays: 1, assignee: "Ghost" }], []);
  assert.ok(out.warnings[0].includes("Ghost"));
});

test("monte carlo: deterministic for a seed, sane bounds, criticality index", () => {
  const first = simulateSchedule(network(), { iterations: 1500, seed: 42, targetDays: 12 });
  const second = simulateSchedule(network(), { iterations: 1500, seed: 42, targetDays: 12 });
  assert.deepEqual(first, second);
  const third = simulateSchedule(network(), { iterations: 1500, seed: 43 });
  assert.notDeepEqual(first.percentiles, third.percentiles);

  // Default spread: optimistic 0.75d, pessimistic 1.5d. Bounds on A-C-D = 12 days.
  assert.ok(first.minDurationDays >= 12 * 0.75 - 1e-6);
  assert.ok(first.maxDurationDays <= 12 * 1.5 + 1e-6);
  assert.ok(first.percentiles.P50 <= first.percentiles.P80);
  assert.ok(first.percentiles.P80 <= first.percentiles.P90);
  assert.ok(first.probabilityWithinTarget >= 0 && first.probabilityWithinTarget <= 1);
  for (const value of Object.values(first.criticalityIndex)) assert.ok(value >= 0 && value <= 1);
  assert.equal(first.criticalityIndex.A, 1); // A precedes everything
  assert.ok(first.criticalityIndex.C > first.criticalityIndex.B);
  assert.equal(first.histogram.reduce((s, b) => s + b.count, 0), 1500);
});

test("monte carlo: explicit three-point estimates and triangular sampling", () => {
  const tasks = [{ id: "a", durationDays: 5, optimisticDays: 4, mostLikelyDays: 5, pessimisticDays: 10 }];
  const pert = simulateSchedule(tasks, { iterations: 2000, seed: 7 });
  const tri = simulateSchedule(tasks, { iterations: 2000, seed: 7, distribution: "triangular" });
  assert.ok(pert.minDurationDays >= 4 && pert.maxDurationDays <= 10);
  assert.ok(tri.minDurationDays >= 4 && tri.maxDurationDays <= 10);
  assert.ok(pert.meanDurationDays > 5 && pert.meanDurationDays < 7);
});

test("analyzeSchedule: produces insights that mention the critical path and risk", () => {
  const analysis = analyzeSchedule(network(), [{ key: "Alice" }, { key: "Bob" }], {
    monteCarlo: { iterations: 500, seed: 1, targetDays: 12 },
  });
  assert.ok(analysis.insights[0].includes("critical path is 12 days"));
  assert.ok(analysis.insights.some((i) => i.includes("simulations")));
  assert.ok(analysis.insights.some((i) => i.includes("12-day target")));
});

test("fromPlanExport: adapts the workspace export shape", () => {
  const plan = {
    tasks: [
      { id: "T1", title: "Spec", estimateDays: 2, dependsOn: [], owner: "Alice" },
      { id: "T2", title: "Build", estimateDays: "4", dependsOn: ["T1"], owner: "Bob", priority: "P1" },
    ],
    team: [{ name: "Alice", capacity: 100 }, { name: "Bob", capacity: 50 }],
  };
  const { tasks, resources } = fromPlanExport(plan);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].durationDays, 4);
  assert.deepEqual(tasks[1].dependencies, ["T1"]);
  assert.equal(tasks[1].assignee, "Bob");
  assert.equal(resources[1].capacity, 50);
});

test("handler: validates method, JSON, and schedule", async () => {
  const bad = await handleScheduleAnalysis(new Request("http://x/api/projects/analyze", { method: "POST", body: "{" }));
  assert.equal(bad.status, 400);
  const empty = await handleScheduleAnalysis(
    new Request("http://x/api/projects/analyze", { method: "POST", body: JSON.stringify({ tasks: [] }) }),
  );
  assert.equal(empty.status, 400);
  const cyclic = await handleScheduleAnalysis(
    new Request("http://x/api/projects/analyze", {
      method: "POST",
      body: JSON.stringify({ tasks: [{ id: "a", durationDays: 1, dependencies: ["b"] }, { id: "b", durationDays: 1, dependencies: ["a"] }] }),
    }),
  );
  assert.equal(cyclic.status, 400);
  assert.equal((await cyclic.json()).issues[0].code, "cycle");
  const ok = await handleScheduleAnalysis(
    new Request("http://x/api/projects/analyze", {
      method: "POST",
      body: JSON.stringify({ tasks: network(), resources: [{ key: "Alice" }], options: { monteCarlo: { iterations: 200 } } }),
    }),
  );
  assert.equal(ok.status, 200);
  const payload = await ok.json();
  assert.equal(payload.criticalPath.projectDurationDays, 12);
  assert.ok(Array.isArray(payload.insights));
  const wrong = await handleScheduleAnalysis(new Request("http://x/api/projects/analyze", { method: "GET" }));
  assert.equal(wrong.status, 405);
});
