/**
 * Scheduling engine types.
 *
 * The engine is deliberately independent of the Worker, Workers AI and the
 * browser UI: it takes plain task and resource objects and returns plain
 * results, so it can run inside the Worker (`/api/projects/analyze`), in
 * tests, or in the browser.
 */

export interface SchedulableTask {
  /** Stable task identifier (the normalized ID produced by the planner). */
  id: string;
  /** Human-readable name used in insights. */
  name?: string;
  /** Deterministic duration in working days. Zero is allowed for milestones. */
  durationDays: number;
  /** Predecessor task IDs. All dependencies are finish-to-start. */
  dependencies?: string[];
  /** Resource key (team member name) the task is assigned to, if any. */
  assignee?: string;
  /** Optional three-point estimate for Monte Carlo simulation. */
  optimisticDays?: number;
  mostLikelyDays?: number;
  pessimisticDays?: number;
  /** Optional priority label, used only to break ties during leveling. */
  priority?: string;
}

export interface ResourceDefinition {
  /** Matches `SchedulableTask.assignee`. */
  key: string;
  /** Available capacity in percent (100 = full time). Scales calendar duration. */
  capacity?: number;
  /** How many tasks the resource can work on at the same time. Default 1. */
  maxConcurrentTasks?: number;
}

export interface ValidationIssue {
  code:
    | "duplicate_id"
    | "missing_id"
    | "invalid_duration"
    | "unknown_dependency"
    | "self_dependency"
    | "cycle"
    | "invalid_estimate";
  message: string;
  taskId?: string;
  path?: string[];
}

export interface CriticalPathTask {
  id: string;
  name?: string;
  durationDays: number;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  totalFloat: number;
  freeFloat: number;
  critical: boolean;
}

export interface CriticalPathResult {
  projectDurationDays: number;
  /** Topological order used by the passes. */
  order: string[];
  tasks: CriticalPathTask[];
  /** One longest chain from a start task to an end task. */
  criticalPath: string[];
  /** Every task with zero total float (there may be parallel critical chains). */
  criticalTaskIds: string[];
  warnings: string[];
}

export interface LeveledTask {
  id: string;
  name?: string;
  assignee?: string;
  start: number;
  end: number;
  /** Calendar duration after capacity scaling. */
  durationDays: number;
  /** Days the task slipped compared with its unconstrained earliest start. */
  delayDays: number;
}

export interface ResourceUtilization {
  key: string;
  busyDays: number;
  availableDays: number;
  utilizationPct: number;
  taskCount: number;
}

export interface LevelingResult {
  projectDurationDays: number;
  /** Extra days versus the unconstrained critical-path duration. */
  slipDays: number;
  tasks: LeveledTask[];
  utilization: ResourceUtilization[];
  unassignedTaskIds: string[];
  warnings: string[];
}

export interface MonteCarloOptions {
  iterations?: number;
  seed?: number;
  distribution?: "pert" | "triangular";
  /** Percentiles to report, as fractions. Default [0.5, 0.8, 0.9]. */
  confidence?: number[];
  /** Target duration in days; enables `probabilityWithinTarget`. */
  targetDays?: number;
  /**
   * When a task has no three-point estimate, derive one from durationDays:
   * optimistic = d * (1 - spread), pessimistic = d * (1 + 2 * spread).
   */
  defaultSpread?: number;
  histogramBins?: number;
}

export interface MonteCarloResult {
  iterations: number;
  seed: number;
  distribution: "pert" | "triangular";
  meanDurationDays: number;
  minDurationDays: number;
  maxDurationDays: number;
  /** Keyed like "P50", "P80", "P90". */
  percentiles: Record<string, number>;
  probabilityWithinTarget?: number;
  targetDays?: number;
  /** Share of iterations in which each task was on the critical path. */
  criticalityIndex: Record<string, number>;
  histogram: { from: number; to: number; count: number }[];
}

export interface ScheduleAnalysisOptions {
  monteCarlo?: MonteCarloOptions | false;
  leveling?: boolean;
}

export interface ScheduleAnalysis {
  criticalPath: CriticalPathResult;
  leveling?: LevelingResult;
  monteCarlo?: MonteCarloResult;
  /** Plain-language findings for the copilot or the report view. */
  insights: string[];
}
