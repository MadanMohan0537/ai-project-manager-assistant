import { ScheduleValidationError, computeCriticalPath } from "./criticalPath";
import { simulateSchedule } from "./monteCarlo";
import { levelResources } from "./resourceLeveling";
import type {
  ResourceDefinition,
  SchedulableTask,
  ScheduleAnalysis,
  ScheduleAnalysisOptions,
} from "./types";

export function analyzeSchedule(
  tasks: SchedulableTask[],
  resources: ResourceDefinition[] = [],
  options: ScheduleAnalysisOptions = {},
): ScheduleAnalysis {
  const criticalPath = computeCriticalPath(tasks);
  const leveling = options.leveling === false ? undefined : levelResources(tasks, resources, criticalPath);
  const monteCarlo = options.monteCarlo === false ? undefined : simulateSchedule(tasks, options.monteCarlo ?? {});
  const insights = buildInsights(tasks, { criticalPath, leveling, monteCarlo, insights: [] });
  return { criticalPath, leveling, monteCarlo, insights };
}

function label(tasks: SchedulableTask[], id: string): string {
  const task = tasks.find((t) => t.id === id);
  return task?.name ? `${task.name} (${id})` : id;
}

export function buildInsights(tasks: SchedulableTask[], analysis: ScheduleAnalysis): string[] {
  const insights: string[] = [];
  const { criticalPath, leveling, monteCarlo } = analysis;

  if (tasks.length === 0) return ["There are no tasks to analyze."];

  const chain = criticalPath.criticalPath.map((id) => label(tasks, id)).join(" -> ");
  insights.push(
    `The critical path is ${criticalPath.projectDurationDays} days long and runs through ${chain}. Any slip on these tasks moves the end date one for one.`,
  );

  const parallelCritical = criticalPath.criticalTaskIds.length - criticalPath.criticalPath.length;
  if (parallelCritical > 0) {
    insights.push(
      `${parallelCritical} more task(s) also have zero float on a parallel chain, so there is more than one way to be late.`,
    );
  }

  const slack = criticalPath.tasks
    .filter((t) => !t.critical)
    .sort((a, b) => b.totalFloat - a.totalFloat)
    .slice(0, 3);
  if (slack.length > 0) {
    insights.push(
      `Most flexible tasks: ${slack.map((t) => `${label(tasks, t.id)} (${t.totalFloat} days of float)`).join(", ")}. These can absorb delays or lend people to the critical path.`,
    );
  }

  if (leveling) {
    if (leveling.slipDays > 0) {
      const busiest = leveling.utilization[0];
      const delayed = leveling.tasks
        .filter((t) => t.delayDays > 0)
        .sort((a, b) => b.delayDays - a.delayDays)
        .slice(0, 3)
        .map((t) => `${label(tasks, t.id)} (+${t.delayDays} days)`);
      insights.push(
        `With one task per person at a time, the schedule stretches to ${leveling.projectDurationDays} days (${leveling.slipDays} more than the critical path).` +
          (busiest ? ` ${busiest.key} is the bottleneck at ${busiest.utilizationPct}% utilization.` : "") +
          (delayed.length > 0 ? ` Most delayed: ${delayed.join(", ")}.` : ""),
      );
    } else {
      insights.push("Assignments do not add any delay: nobody is double-booked on the critical path.");
    }
    const idle = leveling.utilization.filter((u) => u.taskCount === 0).map((u) => u.key);
    if (idle.length > 0) insights.push(`Team members with no tasks: ${idle.join(", ")}.`);
    if (leveling.unassignedTaskIds.length > 0) {
      insights.push(`${leveling.unassignedTaskIds.length} task(s) have no owner yet and were scheduled without a resource constraint.`);
    }
  }

  if (monteCarlo) {
    const p50 = monteCarlo.percentiles.P50;
    const p80 = monteCarlo.percentiles.P80;
    const p90 = monteCarlo.percentiles.P90;
    const parts: string[] = [];
    if (p50 !== undefined) parts.push(`50% chance of finishing within ${p50} days`);
    if (p80 !== undefined) parts.push(`80% within ${p80} days`);
    if (p90 !== undefined) parts.push(`90% within ${p90} days`);
    if (parts.length > 0) {
      insights.push(`Under estimate uncertainty (${monteCarlo.iterations} simulations): ${parts.join(", ")}.`);
    }
    if (monteCarlo.probabilityWithinTarget !== undefined && monteCarlo.targetDays !== undefined) {
      insights.push(
        `The chance of hitting the ${monteCarlo.targetDays}-day target is ${Math.round(monteCarlo.probabilityWithinTarget * 100)}%.`,
      );
    }
    const risky = Object.entries(monteCarlo.criticalityIndex)
      .filter(([id, index]) => index >= 0.3 && !criticalPath.criticalTaskIds.includes(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (risky.length > 0) {
      insights.push(
        `Hidden risks: ${risky.map(([id, index]) => `${label(tasks, id)} is critical in ${Math.round(index * 100)}% of simulations`).join("; ")}. These are not on the deterministic critical path but often end up driving the date.`,
      );
    }
  }

  return insights;
}

/**
 * Best-effort adapter from the planner's exported project JSON to engine
 * inputs. Accepts the common field names used by the workspace export so the
 * analysis endpoint can take the same payload the UI already stores.
 */
export function fromPlanExport(plan: unknown): { tasks: SchedulableTask[]; resources: ResourceDefinition[] } {
  const record = (plan ?? {}) as Record<string, unknown>;
  const rawTasks = Array.isArray(record.tasks) ? record.tasks : [];
  const rawTeam = Array.isArray(record.team) ? record.team : [];

  const tasks: SchedulableTask[] = rawTasks.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const id = String(item.id ?? item.taskId ?? "");
    const duration = firstNumber(item, ["durationDays", "estimateDays", "effortDays", "days", "duration"]);
    const deps = firstArray(item, ["dependencies", "dependsOn", "blockedBy", "predecessors"]);
    const assignee = firstString(item, ["assignee", "owner", "assignedTo", "assigneeName"]);
    const task: SchedulableTask = {
      id,
      name: firstString(item, ["name", "title"]),
      durationDays: duration ?? 1,
      dependencies: deps.map((d) => String(d)),
      assignee,
      priority: firstString(item, ["priority"]),
    };
    const optimistic = firstNumber(item, ["optimisticDays"]);
    const likely = firstNumber(item, ["mostLikelyDays"]);
    const pessimistic = firstNumber(item, ["pessimisticDays"]);
    if (optimistic !== undefined && likely !== undefined && pessimistic !== undefined) {
      task.optimisticDays = optimistic;
      task.mostLikelyDays = likely;
      task.pessimisticDays = pessimistic;
    }
    return task;
  });

  const resources: ResourceDefinition[] = rawTeam.map((raw) => {
    const member = (raw ?? {}) as Record<string, unknown>;
    return {
      key: String(member.name ?? member.key ?? member.id ?? ""),
      capacity: firstNumber(member, ["capacity", "availability"]),
      maxConcurrentTasks: firstNumber(member, ["maxConcurrentTasks"]),
    };
  }).filter((r) => r.key !== "");

  return { tasks, resources };
}

function firstNumber(item: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function firstString(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}

function firstArray(item: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = item[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

const MAX_BODY_BYTES = 512 * 1024;

/**
 * Worker route handler for `POST /api/projects/analyze`.
 * Body: `{ project?: <workspace export>, tasks?: SchedulableTask[], resources?: ResourceDefinition[], options?: ScheduleAnalysisOptions }`.
 * The handler never mutates project data and never calls Workers AI.
 */
export async function handleScheduleAnalysis(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    return json({ error: "Request body too large" }, 413);
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Body must be valid JSON" }, 400);
  }

  let tasks: SchedulableTask[];
  let resources: ResourceDefinition[];
  if (body.project !== undefined) {
    ({ tasks, resources } = fromPlanExport(body.project));
  } else {
    tasks = Array.isArray(body.tasks) ? (body.tasks as SchedulableTask[]) : [];
    resources = Array.isArray(body.resources) ? (body.resources as ResourceDefinition[]) : [];
  }
  if (tasks.length === 0) return json({ error: "No tasks supplied" }, 400);
  if (tasks.length > 500) return json({ error: "At most 500 tasks are supported" }, 400);

  const options = (body.options ?? {}) as ScheduleAnalysisOptions;
  try {
    return json(analyzeSchedule(tasks, resources, options), 200);
  } catch (error) {
    if (error instanceof ScheduleValidationError) {
      return json({ error: "Invalid schedule", issues: error.issues }, 400);
    }
    throw error;
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
