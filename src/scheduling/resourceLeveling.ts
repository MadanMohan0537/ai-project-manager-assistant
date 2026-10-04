import { computeCriticalPath, round } from "./criticalPath";
import type {
  CriticalPathResult,
  LeveledTask,
  LevelingResult,
  ResourceDefinition,
  ResourceUtilization,
  SchedulableTask,
} from "./types";

interface Booking {
  start: number;
  end: number;
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function priorityRank(label: string | undefined): number {
  if (!label) return 9;
  const key = label.toUpperCase();
  if (key in PRIORITY_RANK) return PRIORITY_RANK[key];
  if (key === "CRITICAL" || key === "HIGHEST") return 0;
  if (key === "HIGH") return 1;
  if (key === "MEDIUM") return 2;
  if (key === "LOW") return 3;
  return 9;
}

/**
 * Serial schedule generation scheme (SSGS):
 * 1. Order tasks by total float (critical first), then priority, then longer
 *    duration, then id.
 * 2. Repeatedly take the first task whose predecessors are all scheduled and
 *    place it at the earliest time where its resource has a free slot.
 *
 * A resource with capacity c% stretches calendar duration by 100/c, and can
 * hold at most `maxConcurrentTasks` overlapping tasks (default 1).
 * Unassigned tasks are only constrained by their dependencies.
 */
export function levelResources(
  tasks: SchedulableTask[],
  resources: ResourceDefinition[] = [],
  precomputed?: CriticalPathResult,
): LevelingResult {
  const cpm = precomputed ?? computeCriticalPath(tasks);
  const floatById = new Map(cpm.tasks.map((t) => [t.id, t.totalFloat]));
  const esById = new Map(cpm.tasks.map((t) => [t.id, t.earliestStart]));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const resourceByKey = new Map(resources.map((r) => [r.key, r]));
  const warnings: string[] = [];

  const ranked = [...tasks].sort((a, b) => {
    const floatDiff = (floatById.get(a.id) ?? 0) - (floatById.get(b.id) ?? 0);
    if (Math.abs(floatDiff) > 1e-9) return floatDiff;
    const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const durationDiff = b.durationDays - a.durationDays;
    if (durationDiff !== 0) return durationDiff;
    return a.id.localeCompare(b.id);
  });

  const scheduled = new Map<string, LeveledTask>();
  const bookings = new Map<string, Booking[]>();
  const unassignedTaskIds: string[] = [];
  const remaining = new Set(ranked.map((t) => t.id));

  while (remaining.size > 0) {
    const next = ranked.find(
      (task) =>
        remaining.has(task.id) &&
        (task.dependencies ?? []).every((dep) => scheduled.has(dep)),
    );
    if (!next) {
      // validateTasks already rejects cycles; this guards against partial input.
      warnings.push("Leveling stopped early: unresolved dependencies.");
      break;
    }
    remaining.delete(next.id);

    const earliest = Math.max(
      0,
      ...(next.dependencies ?? []).map((dep) => scheduled.get(dep)?.end ?? 0),
    );
    const resource = next.assignee ? resourceByKey.get(next.assignee) : undefined;
    if (next.assignee && !resource) {
      warnings.push(
        `Task "${next.id}" is assigned to "${next.assignee}", who is not in the resource list; treated as full time.`,
      );
    }
    const capacity = clampCapacity(resource?.capacity);
    const concurrency = Math.max(1, Math.floor(resource?.maxConcurrentTasks ?? 1));
    const duration = next.durationDays === 0 ? 0 : (next.durationDays * 100) / capacity;

    let start = earliest;
    if (next.assignee) {
      const list = bookings.get(next.assignee) ?? [];
      start = findSlot(list, earliest, duration, concurrency);
      list.push({ start, end: start + duration });
      list.sort((a, b) => a.start - b.start);
      bookings.set(next.assignee, list);
    } else {
      unassignedTaskIds.push(next.id);
    }

    scheduled.set(next.id, {
      id: next.id,
      name: next.name,
      assignee: next.assignee,
      start: round(start),
      end: round(start + duration),
      durationDays: round(duration),
      delayDays: round(start - (esById.get(next.id) ?? 0)),
    });
  }

  const leveled = cpm.order
    .filter((id) => scheduled.has(id))
    .map((id) => scheduled.get(id) as LeveledTask);
  const projectDurationDays = round(Math.max(0, ...leveled.map((t) => t.end)));

  const utilization: ResourceUtilization[] = [...bookings.entries()]
    .map(([key, list]) => {
      const busyDays = list.reduce((sum, b) => sum + (b.end - b.start), 0);
      const availableDays = projectDurationDays * (clampCapacity(resourceByKey.get(key)?.capacity) / 100);
      return {
        key,
        busyDays: round(busyDays),
        availableDays: round(availableDays),
        utilizationPct: availableDays > 0 ? round((busyDays / availableDays) * 100) : 0,
        taskCount: list.length,
      };
    })
    .sort((a, b) => b.utilizationPct - a.utilizationPct || a.key.localeCompare(b.key));

  for (const resource of resources) {
    if (!bookings.has(resource.key) && byId.size > 0) {
      utilization.push({
        key: resource.key,
        busyDays: 0,
        availableDays: round(projectDurationDays * (clampCapacity(resource.capacity) / 100)),
        utilizationPct: 0,
        taskCount: 0,
      });
    }
  }

  return {
    projectDurationDays,
    slipDays: round(projectDurationDays - cpm.projectDurationDays),
    tasks: leveled,
    utilization,
    unassignedTaskIds,
    warnings,
  };
}

function clampCapacity(capacity: number | undefined): number {
  if (capacity === undefined || !Number.isFinite(capacity) || capacity <= 0) return 100;
  return Math.min(100, capacity);
}

/**
 * Earliest start >= `earliest` at which fewer than `concurrency` bookings
 * overlap the whole interval [start, start + duration).
 */
function findSlot(bookings: Booking[], earliest: number, duration: number, concurrency: number): number {
  const candidates = [earliest, ...bookings.map((b) => b.end).filter((end) => end > earliest)].sort(
    (a, b) => a - b,
  );
  for (const start of candidates) {
    const end = start + duration;
    const overlapping = bookings.filter((b) => b.start < end && b.end > start);
    if (duration === 0) {
      if (overlapping.filter((b) => b.start < start && b.end > start).length < concurrency) return start;
      continue;
    }
    if (maxOverlap(overlapping, start, end) < concurrency) return start;
  }
  return candidates[candidates.length - 1];
}

/** Peak number of bookings active at any instant inside [start, end). */
function maxOverlap(bookings: Booking[], start: number, end: number): number {
  const points = new Set<number>([start]);
  for (const b of bookings) {
    if (b.start > start && b.start < end) points.add(b.start);
  }
  let peak = 0;
  for (const point of points) {
    const active = bookings.filter((b) => b.start <= point && b.end > point).length;
    peak = Math.max(peak, active);
  }
  return peak;
}
