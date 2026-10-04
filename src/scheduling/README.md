# Scheduling engine

Deterministic critical-path analysis, resource leveling and Monte Carlo
schedule risk for the AI Project Manager Assistant. It closes three items from
the README's limitations list: the timeline is now backed by a real
critical-path engine, capacity is used to level resources, and the module ships
with automated tests and CI.

The engine has no dependency on Workers AI, D1 or the browser. It takes the
tasks the planner already produces and returns plain JSON.

## What it computes

| Module | Output |
| --- | --- |
| `criticalPath.ts` | Validation (duplicate ids, unknown or self dependencies, cycles with the offending path), deterministic topological order, early/late start and finish, total float, free float, the critical chain and every zero-float task. |
| `resourceLeveling.ts` | A serial schedule generation scheme: one task per person at a time by default, capacity scales calendar duration (50% capacity doubles it), `maxConcurrentTasks` allows overlap, per-task delay against the unconstrained start, per-person utilization and the total slip versus the critical path. |
| `monteCarlo.ts` | Seeded, reproducible simulation of the whole network with PERT (default) or triangular sampling, three-point estimates when present and a derived spread otherwise, P50/P80/P90, probability of meeting a target, a histogram and a criticality index per task. |
| `analyze.ts` | `analyzeSchedule()` runs all three and writes plain-language insights (bottleneck person, hidden risks, flexible tasks) the copilot or report view can quote. `fromPlanExport()` adapts the workspace JSON export. `handleScheduleAnalysis()` is a ready-made Worker route. |

## Wire the route

In `src/index.ts`, next to the existing `/api/projects/plan` route:

```ts
import { handleScheduleAnalysis } from "./scheduling";

if (url.pathname === "/api/projects/analyze") {
  return handleScheduleAnalysis(request);
}
```

Request body (either form):

```json
{ "project": { "tasks": [...], "team": [...] }, "options": { "monteCarlo": { "iterations": 2000, "targetDays": 30 } } }
```

```json
{ "tasks": [{ "id": "T1", "name": "Design", "durationDays": 3, "dependencies": [], "assignee": "Alice" }],
  "resources": [{ "key": "Alice", "capacity": 100 }] }
```

The response contains `criticalPath`, `leveling`, `monteCarlo` and `insights`.
The handler never mutates project data and never calls a model.

## Use it in the planner

After `POST /api/projects/plan` normalizes tasks, call `analyzeSchedule()` once
and attach the result to the response. The timeline can then colour critical
tasks, the workload view can show leveled dates and utilization, and the
executive report can quote the P80 date instead of the deterministic one.

## Tests and CI

```bash
npx tsc -p tsconfig.scheduling.json   # type-check and compile to .test-dist/
node --test "test/**/*.test.mjs"      # node:test, no extra dependencies
```

Add to `package.json` (and `.test-dist/` to `.gitignore`):

```json
"test": "tsc -p tsconfig.scheduling.json && node --test 'test/**/*.test.mjs'"
```

The GitHub Actions workflow lives at `ci/github-actions-ci.yml`; move it to
`.github/workflows/ci.yml` in a local commit (workflow files can only be
written by a token with the `workflow` scope).

## Decision boundaries

- Durations and estimates are inputs; the engine does not change them.
- Leveling is a heuristic (critical-first priority rule), not a proof of optimality.
- Monte Carlo describes estimate uncertainty with the distribution you choose; it is not a forecast of outcomes that depend on scope or staffing changes.
- Percentiles are reported with the seed, so a result can be reproduced and challenged.
