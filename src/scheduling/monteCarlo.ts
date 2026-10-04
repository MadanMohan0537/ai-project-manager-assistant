import { ScheduleValidationError, computePasses, round, topologicalOrder, validateTasks } from "./criticalPath";
import type { MonteCarloOptions, MonteCarloResult, SchedulableTask } from "./types";

/** mulberry32: small, fast, seedable PRNG so results are reproducible. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNormal(random: () => number): number {
  // Box-Muller; avoid log(0).
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia and Tsang gamma sampler (shape >= 1 branch plus boost for < 1). */
function randomGamma(random: () => number, shape: number): number {
  if (shape < 1) {
    return randomGamma(random, shape + 1) * Math.pow(random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = randomNormal(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function randomBeta(random: () => number, alpha: number, beta: number): number {
  const x = randomGamma(random, alpha);
  const y = randomGamma(random, beta);
  return x / (x + y);
}

interface ThreePoint {
  low: number;
  mode: number;
  high: number;
}

function threePoint(task: SchedulableTask, spread: number): ThreePoint {
  if (
    task.optimisticDays !== undefined &&
    task.mostLikelyDays !== undefined &&
    task.pessimisticDays !== undefined
  ) {
    return { low: task.optimisticDays, mode: task.mostLikelyDays, high: task.pessimisticDays };
  }
  const d = task.durationDays;
  return { low: d * (1 - spread), mode: d, high: d * (1 + 2 * spread) };
}

function sampleDuration(random: () => number, point: ThreePoint, distribution: "pert" | "triangular"): number {
  const { low, mode, high } = point;
  const range = high - low;
  if (range <= 0) return mode;
  if (distribution === "triangular") {
    const u = random();
    const f = (mode - low) / range;
    return u < f ? low + Math.sqrt(u * range * (mode - low)) : high - Math.sqrt((1 - u) * range * (high - mode));
  }
  // Modified PERT with lambda = 4.
  const alpha = 1 + (4 * (mode - low)) / range;
  const beta = 1 + (4 * (high - mode)) / range;
  return low + randomBeta(random, alpha, beta) * range;
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Simulate project duration under estimate uncertainty. Every iteration
 * samples each task's duration, recomputes the forward and backward passes,
 * and records which tasks were critical. Results are deterministic for a
 * given seed.
 */
export function simulateSchedule(tasks: SchedulableTask[], options: MonteCarloOptions = {}): MonteCarloResult {
  const issues = validateTasks(tasks);
  if (issues.length > 0) throw new ScheduleValidationError(issues);

  const iterations = Math.max(1, Math.min(20000, Math.floor(options.iterations ?? 2000)));
  const seed = options.seed ?? 20260101;
  const distribution = options.distribution ?? "pert";
  const confidence = options.confidence ?? [0.5, 0.8, 0.9];
  const spread = options.defaultSpread ?? 0.25;
  const random = createRandom(seed);
  const order = topologicalOrder(tasks);
  const points = new Map(tasks.map((task) => [task.id, threePoint(task, spread)]));
  const criticalCounts = new Map(tasks.map((task) => [task.id, 0]));
  const durationsOut: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const sampled = new Map<string, number>();
    for (const task of tasks) {
      sampled.set(task.id, sampleDuration(random, points.get(task.id) as ThreePoint, distribution));
    }
    const passes = computePasses(tasks, order, sampled);
    durationsOut.push(passes.projectDurationDays);
    for (const task of passes.tasks) {
      if (task.critical) criticalCounts.set(task.id, (criticalCounts.get(task.id) ?? 0) + 1);
    }
  }

  const sorted = [...durationsOut].sort((a, b) => a - b);
  const percentiles: Record<string, number> = {};
  for (const fraction of confidence) {
    percentiles[`P${Math.round(fraction * 100)}`] = round(percentile(sorted, fraction));
  }

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const bins = Math.max(1, Math.min(60, Math.floor(options.histogramBins ?? 12)));
  const width = max > min ? (max - min) / bins : 1;
  const histogram = Array.from({ length: bins }, (_, index) => ({
    from: round(min + index * width),
    to: round(min + (index + 1) * width),
    count: 0,
  }));
  for (const value of sorted) {
    const index = Math.min(bins - 1, Math.floor((value - min) / width));
    histogram[index].count += 1;
  }

  const criticalityIndex: Record<string, number> = {};
  for (const [id, count] of criticalCounts) criticalityIndex[id] = round(count / iterations);

  const result: MonteCarloResult = {
    iterations,
    seed,
    distribution,
    meanDurationDays: round(sorted.reduce((sum, v) => sum + v, 0) / sorted.length),
    minDurationDays: round(min),
    maxDurationDays: round(max),
    percentiles,
    criticalityIndex,
    histogram,
  };

  if (options.targetDays !== undefined && Number.isFinite(options.targetDays)) {
    const within = sorted.filter((v) => v <= (options.targetDays as number)).length;
    result.targetDays = options.targetDays;
    result.probabilityWithinTarget = round(within / sorted.length);
  }

  return result;
}
