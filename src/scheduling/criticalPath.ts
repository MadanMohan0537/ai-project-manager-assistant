import type {
  CriticalPathResult,
  CriticalPathTask,
  SchedulableTask,
  ValidationIssue,
} from "./types";

const EPSILON = 1e-9;

export class ScheduleValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      `Schedule validation failed: ${issues.map((issue) => issue.message).join("; ")}`,
    );
    this.name = "ScheduleValidationError";
    this.issues = issues;
  }
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Validate a task graph without throwing. Returns an empty array when the
 * graph is a well-formed DAG with sane durations.
 */
export function validateTasks(tasks: SchedulableTask[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map<string, SchedulableTask>();

  for (const task of tasks) {
    if (typeof task.id !== "string" || task.id.trim() === "") {
      issues.push({ code: "missing_id", message: "A task is missing an id." });
      continue;
    }
    if (byId.has(task.id)) {
      issues.push({
        code: "duplicate_id",
        message: `Task id "${task.id}" is used more than once.`,
        taskId: task.id,
      });
      continue;
    }
    byId.set(task.id, task);

    if (!isFiniteNonNegative(task.durationDays)) {
      issues.push({
        code: "invalid_duration",
        message: `Task "${task.id}" needs a duration of zero or more days.`,
        taskId: task.id,
      });
    }

    const estimates = [task.optimisticDays, task.mostLikelyDays, task.pessimisticDays];
    const provided = estimates.filter((value) => value !== undefined);
    if (provided.length > 0) {
      if (provided.length !== 3 || !provided.every(isFiniteNonNegative)) {
        issues.push({
          code: "invalid_estimate",
          message: `Task "${task.id}" needs optimistic, most likely and pessimistic days together.`,
          taskId: task.id,
        });
      } else if (
        (task.optimisticDays as number) > (task.mostLikelyDays as number) ||
        (task.mostLikelyDays as number) > (task.pessimisticDays as number)
      ) {
        issues.push({
          code: "invalid_estimate",
          message: `Task "${task.id}" estimates must satisfy optimistic <= most likely <= pessimistic.`,
          taskId: task.id,
        });
      }
    }
  }

  for (const task of byId.values()) {
    for (const dependency of task.dependencies ?? []) {
      if (dependency === task.id) {
        issues.push({
          code: "self_dependency",
          message: `Task "${task.id}" depends on itself.`,
          taskId: task.id,
        });
      } else if (!byId.has(dependency)) {
        issues.push({
          code: "unknown_dependency",
          message: `Task "${task.id}" depends on unknown task "${dependency}".`,
          taskId: task.id,
        });
      }
    }
  }

  if (issues.length === 0) {
    const cycle = findCycle(byId);
    if (cycle) {
      issues.push({
        code: "cycle",
        message: `Dependency cycle detected: ${cycle.join(" -> ")}.`,
        path: cycle,
      });
    }
  }

  return issues;
}

/** Depth-first search that returns the first cycle found, as a closed path. */
function findCycle(byId: Map<string, SchedulableTask>): string[] | null {
  const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    stack.push(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) {
      const seen = state.get(dependency);
      if (seen === 1) {
        const start = stack.indexOf(dependency);
        return [...stack.slice(start), dependency];
      }
      if (seen === undefined) {
        const found = visit(dependency);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };

  for (const id of [...byId.keys()].sort()) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Deterministic topological order (Kahn's algorithm, ties broken by id) so
 * that identical inputs always produce identical output ordering.
 */
export function topologicalOrder(tasks: SchedulableTask[]): string[] {
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const task of tasks) {
    indegree.set(task.id, 0);
    successors.set(task.id, []);
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) {
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      successors.get(dependency)?.push(task.id);
    }
  }
  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const successor of (successors.get(id) ?? []).sort()) {
      const remaining = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) {
        ready.push(successor);
        ready.sort();
      }
    }
  }
  return order;
}

/**
 * Forward and backward pass over the dependency graph using the given
 * durations. Exposed separately so Monte Carlo can reuse it with sampled
 * durations without re-validating the graph every iteration.
 */
export function computePasses(
  tasks: SchedulableTask[],
  order: string[],
  durations: Map<string, number>,
): { tasks: CriticalPathTask[]; projectDurationDays: number } {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const successors = new Map<string, string[]>();
  for (const task of tasks) successors.set(task.id, []);
  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) {
      successors.get(dependency)?.push(task.id);
    }
  }

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const task = byId.get(id) as SchedulableTask;
    const start = Math.max(0, ...(task.dependencies ?? []).map((dep) => ef.get(dep) ?? 0));
    es.set(id, start);
    ef.set(id, start + (durations.get(id) ?? 0));
  }
  const projectDurationDays = Math.max(0, ...[...ef.values()]);

  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const succ = successors.get(id) ?? [];
    const finish =
      succ.length === 0
        ? projectDurationDays
        : Math.min(...succ.map((s) => ls.get(s) ?? projectDurationDays));
    lf.set(id, finish);
    ls.set(id, finish - (durations.get(id) ?? 0));
  }

  const result: CriticalPathTask[] = order.map((id) => {
    const task = byId.get(id) as SchedulableTask;
    const succ = successors.get(id) ?? [];
    const earliestFinish = ef.get(id) ?? 0;
    const nextStart =
      succ.length === 0
        ? projectDurationDays
        : Math.min(...succ.map((s) => es.get(s) ?? projectDurationDays));
    const totalFloat = (ls.get(id) ?? 0) - (es.get(id) ?? 0);
    return {
      id,
      name: task.name,
      durationDays: durations.get(id) ?? 0,
      earliestStart: round(es.get(id) ?? 0),
      earliestFinish: round(earliestFinish),
      latestStart: round(ls.get(id) ?? 0),
      latestFinish: round(lf.get(id) ?? 0),
      totalFloat: round(totalFloat),
      freeFloat: round(nextStart - earliestFinish),
      critical: totalFloat <= EPSILON,
    };
  });

  return { tasks: result, projectDurationDays: round(projectDurationDays) };
}

/**
 * Critical path method over finish-to-start dependencies.
 * Throws ScheduleValidationError when the graph is not a valid DAG.
 */
export function computeCriticalPath(tasks: SchedulableTask[]): CriticalPathResult {
  const issues = validateTasks(tasks);
  if (issues.length > 0) throw new ScheduleValidationError(issues);

  const order = topologicalOrder(tasks);
  const durations = new Map(tasks.map((task) => [task.id, task.durationDays]));
  const passes = computePasses(tasks, order, durations);
  const criticalTaskIds = passes.tasks.filter((t) => t.critical).map((t) => t.id);
  const warnings: string[] = [];

  if (tasks.length === 0) warnings.push("No tasks to schedule.");
  const zeroDuration = tasks.filter((t) => t.durationDays === 0).map((t) => t.id);
  if (zeroDuration.length > 0) {
    warnings.push(`Zero-duration tasks treated as milestones: ${zeroDuration.join(", ")}.`);
  }

  return {
    projectDurationDays: passes.projectDurationDays,
    order,
    tasks: passes.tasks,
    criticalPath: longestCriticalChain(tasks, passes.tasks),
    criticalTaskIds,
    warnings,
  };
}

/**
 * Reconstruct one critical chain: start from the critical end task that
 * finishes last, then walk back through critical predecessors whose finish
 * equals the current start. Ties are broken by id for determinism.
 */
function longestCriticalChain(
  tasks: SchedulableTask[],
  computed: CriticalPathTask[],
): string[] {
  if (computed.length === 0) return [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const info = new Map(computed.map((task) => [task.id, task]));
  const ends = computed
    .filter((t) => t.critical)
    .sort((a, b) => b.earliestFinish - a.earliestFinish || a.id.localeCompare(b.id));
  if (ends.length === 0) return [];

  const chain: string[] = [];
  let current: CriticalPathTask | undefined = ends[0];
  while (current) {
    chain.unshift(current.id);
    const task = byId.get(current.id) as SchedulableTask;
    const candidates = (task.dependencies ?? [])
      .map((dep) => info.get(dep))
      .filter(
        (dep): dep is CriticalPathTask =>
          !!dep && dep.critical && Math.abs(dep.earliestFinish - (current as CriticalPathTask).earliestStart) <= EPSILON,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    current = candidates[0];
  }
  return chain;
}

export function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
