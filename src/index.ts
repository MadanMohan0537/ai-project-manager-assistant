interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  AI_MODEL?: string;
}

interface TeamMember {
  name: string;
  profile: string;
}

interface PlanTask {
  id: string;
  title: string;
  description: string;
  duration_days: number;
  required_skills: string[];
  dependencies: string[];
}

interface PlanSchedule {
  task_id: string;
  task_name: string;
  start_day: number;
  end_day: number;
  assignee: string;
}

interface PlanAssignment {
  task_id: string;
  task_name: string;
  member: string;
  reason: string;
}

interface PlanRisk {
  category: string;
  risk: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
}

interface ProjectPlan {
  summary: {
    objective: string;
    total_tasks: number;
    total_days: number;
    team_size: number;
    risk_score: number;
  };
  tasks: PlanTask[];
  schedule: PlanSchedule[];
  assignments: PlanAssignment[];
  risks: PlanRisk[];
  insights: string[];
}

interface PlanRequest {
  project?: unknown;
  team?: unknown;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const DEFAULT_TEAM: TeamMember[] = [
  { name: "Alice", profile: "Full-stack developer, Python, React" },
  { name: "Bob", profile: "Backend engineer, APIs, databases" },
  { name: "Carol", profile: "DevOps engineer, CI/CD, cloud infrastructure" },
  { name: "Dave", profile: "QA engineer, testing, automation" },
];

const PLAN_JSON_SCHEMA = {
  type: "object",
  required: ["summary", "tasks", "schedule", "assignments", "risks", "insights"],
  properties: {
    summary: {
      type: "object",
      required: ["objective", "total_tasks", "total_days", "team_size", "risk_score"],
      properties: {
        objective: { type: "string" },
        total_tasks: { type: "number" },
        total_days: { type: "number" },
        team_size: { type: "number" },
        risk_score: { type: "number" },
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "description", "duration_days", "dependencies"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          duration_days: { type: "number" },
          required_skills: { type: "array", items: { type: "string" } },
          dependencies: { type: "array", items: { type: "string" } },
        },
      },
    },
    schedule: {
      type: "array",
      items: {
        type: "object",
        required: ["task_id", "start_day", "end_day", "assignee"],
        properties: {
          task_id: { type: "string" },
          task_name: { type: "string" },
          start_day: { type: "number" },
          end_day: { type: "number" },
          assignee: { type: "string" },
        },
      },
    },
    assignments: {
      type: "array",
      items: {
        type: "object",
        required: ["task_id", "member", "reason"],
        properties: {
          task_id: { type: "string" },
          task_name: { type: "string" },
          member: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        required: ["risk", "severity", "mitigation"],
        properties: {
          category: { type: "string" },
          risk: { type: "string" },
          severity: { type: "string" },
          mitigation: { type: "string" },
        },
      },
    },
    insights: { type: "array", items: { type: "string" } },
  },
} as const;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function parseJsonText(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI response was not valid JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function extractModelOutput(result: unknown): unknown {
  const payload = asRecord(result);
  const response = payload.response;
  if (typeof response === "object" && response !== null) return response;
  if (typeof response === "string" && response.trim()) return parseJsonText(response);
  if (payload.tasks || payload.summary) return payload;

  const choices = payload.choices;
  if (Array.isArray(choices) && choices[0]) {
    const message = asRecord(asRecord(choices[0]).message);
    const content = message.content;
    if (typeof content === "object" && content !== null) return content;
    if (typeof content === "string" && content.trim()) return parseJsonText(content);
  }

  throw new Error("The AI model returned an empty response.");
}

function normalizeTeam(value: unknown): TeamMember[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_TEAM;

  return value.slice(0, 20).map((item, index) => {
    const member = asRecord(item);
    return {
      name: asString(member.name, `Member ${index + 1}`).slice(0, 80) || `Member ${index + 1}`,
      profile: asString(member.profile, "Generalist").slice(0, 500) || "Generalist",
    };
  });
}

function pickMember(team: TeamMember[], index: number, requested?: string): string {
  if (requested) {
    const match = team.find((member) => member.name.toLowerCase() === requested.toLowerCase());
    if (match) return match.name;
  }
  return team[index % team.length]?.name || "Unassigned";
}

function fallbackPlan(project: string, team: TeamMember[]): ProjectPlan {
  const templates = [
    ["T1", "Project kickoff and requirements", "Clarify scope, success metrics, constraints, and delivery milestones.", 3, ["product", "facilitation"], []],
    ["T2", "Architecture and technical design", "Define system boundaries, APIs, data model, and non-functional requirements.", 4, ["architecture", "backend"], ["T1"]],
    ["T3", "Foundational platform setup", "Stand up environments, CI/CD, secrets, and observability.", 3, ["devops", "cloud"], ["T2"]],
    ["T4", "Core backend services", "Implement APIs, persistence, and the primary business workflows.", 6, ["backend", "apis"], ["T2"]],
    ["T5", "User-facing application", "Build the primary UI flows, empty states, and error handling.", 6, ["frontend", "ux"], ["T2"]],
    ["T6", "Integrations and automation", "Connect third-party services, notifications, and operational tooling.", 4, ["backend", "integrations"], ["T4"]],
    ["T7", "Quality, security, and test automation", "Add automated tests, security checks, and release criteria.", 4, ["qa", "security"], ["T4", "T5"]],
    ["T8", "Launch readiness and handover", "Prepare rollout, runbooks, monitoring, and team handover.", 3, ["devops", "qa"], ["T3", "T6", "T7"]],
  ] as const;

  const tasks: PlanTask[] = templates.map(([id, title, description, duration_days, skills, dependencies]) => ({
    id,
    title,
    description: `${description} Ground this work in: ${project.slice(0, 140)}`,
    duration_days,
    required_skills: [...skills],
    dependencies: [...dependencies],
  }));

  return assemblePlan(project, team, {
    summary: {
      objective: project.slice(0, 180),
      total_tasks: tasks.length,
      total_days: 0,
      team_size: team.length,
      risk_score: 5.5,
    },
    tasks,
    schedule: [],
    assignments: [],
    risks: [
      {
        category: "Timeline",
        risk: "AI planning was unavailable, so this is a structured baseline rather than a model-authored plan.",
        severity: "medium",
        mitigation: "Review estimates with the team and regenerate once Workers AI is responding.",
      },
      {
        category: "Resource",
        risk: "Specialist work may be concentrated on one person if skills are unevenly distributed.",
        severity: "medium",
        mitigation: "Pair on critical-path tasks and keep a backup owner for backend and DevOps work.",
      },
    ],
    insights: [
      "Start design and environment setup in parallel after kickoff to shorten the critical path.",
      "Keep backend contracts stable before UI polish so frontend and QA can work concurrently.",
      "Add a mid-project demo after T5 to catch scope drift before launch readiness.",
    ],
  });
}

function buildSchedule(tasks: PlanTask[], assignments: PlanAssignment[], team: TeamMember[]): PlanSchedule[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ends = new Map<string, number>();
  const workload = new Map<string, number>();
  for (const member of team) workload.set(member.name, 0);

  const ordered: PlanTask[] = [];
  const remaining = [...tasks];
  while (remaining.length) {
    const readyIndex = remaining.findIndex((task) => task.dependencies.every((dep) => ends.has(dep) || !byId.has(dep)));
    const next = remaining.splice(readyIndex >= 0 ? readyIndex : 0, 1)[0];
    ordered.push(next);
    const depEnd = next.dependencies.reduce((max, dep) => Math.max(max, ends.get(dep) || 0), 0);
    const assignee = assignments.find((item) => item.task_id === next.id)?.member || pickMember(team, ordered.length - 1);
    const startDay = Math.max(depEnd, workload.get(assignee) || 0);
    const endDay = startDay + Math.max(1, next.duration_days);
    ends.set(next.id, endDay);
    workload.set(assignee, endDay);
  }

  return ordered.map((task) => {
    const assignee = assignments.find((item) => item.task_id === task.id)?.member || pickMember(team, 0);
    const endDay = ends.get(task.id) || task.duration_days;
    const startDay = Math.max(0, endDay - Math.max(1, task.duration_days));
    return {
      task_id: task.id,
      task_name: task.title,
      start_day: startDay,
      end_day: endDay,
      assignee,
    };
  });
}

function assemblePlan(project: string, team: TeamMember[], raw: unknown): ProjectPlan {
  const source = asRecord(raw);
  const summaryIn = asRecord(source.summary);
  const names = new Set(team.map((member) => member.name));
  const tasksIn = Array.isArray(source.tasks) ? source.tasks : [];

  const tasks: PlanTask[] = tasksIn.slice(0, 12).map((item, index) => {
    const task = asRecord(item);
    const id = asString(task.id, `T${index + 1}`) || `T${index + 1}`;
    return {
      id,
      title: asString(task.title || task.name, `Task ${index + 1}`) || `Task ${index + 1}`,
      description: asString(task.description, "Complete this work package."),
      duration_days: Math.max(1, Math.min(14, Math.round(asNumber(task.duration_days ?? task.estimated_days, 3)))),
      required_skills: asStringArray(task.required_skills).slice(0, 6),
      dependencies: asStringArray(task.dependencies).slice(0, 8),
    };
  });

  const taskIds = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    task.dependencies = task.dependencies.filter((dep) => dep !== task.id && taskIds.has(dep));
  }

  const assignmentsIn = Array.isArray(source.assignments) ? source.assignments : [];
  const assignments: PlanAssignment[] = tasks.map((task, index) => {
    const match = assignmentsIn.find((item) => asString(asRecord(item).task_id) === task.id);
    const row = asRecord(match);
    const requested = asString(row.member || row.assignee);
    const member = names.has(requested) ? requested : pickMember(team, index, requested);
    return {
      task_id: task.id,
      task_name: asString(row.task_name, task.title) || task.title,
      member,
      reason: asString(row.reason, `${member} is the best available match for ${task.required_skills.join(", ") || "this work"}.`),
    };
  });

  const scheduleIn = Array.isArray(source.schedule) ? source.schedule : [];
  let schedule: PlanSchedule[] = scheduleIn.map((item) => {
    const row = asRecord(item);
    const task = tasks.find((entry) => entry.id === asString(row.task_id));
    if (!task) return null;
    const assignee = pickMember(team, 0, asString(row.assignee || row.member || assignments.find((a) => a.task_id === task.id)?.member));
    const startDay = Math.max(0, Math.round(asNumber(row.start_day, 0)));
    const endDay = Math.max(startDay + 1, Math.round(asNumber(row.end_day, startDay + task.duration_days)));
    return {
      task_id: task.id,
      task_name: asString(row.task_name, task.title) || task.title,
      start_day: startDay,
      end_day: endDay,
      assignee,
    };
  }).filter((item): item is PlanSchedule => item !== null);

  if (schedule.length !== tasks.length) {
    schedule = buildSchedule(tasks, assignments, team);
  }

  const risksIn = Array.isArray(source.risks) ? source.risks : [];
  const risks: PlanRisk[] = risksIn.slice(0, 8).map((item) => {
    const row = asRecord(item);
    const severityRaw = asString(row.severity, "medium").toLowerCase();
    const severity = severityRaw === "high" || severityRaw === "low" ? severityRaw : "medium";
    return {
      category: asString(row.category, "Delivery") || "Delivery",
      risk: asString(row.risk || row.description, "Delivery risk"),
      severity,
      mitigation: asString(row.mitigation, "Review with the team and add a buffer."),
    };
  });

  const insights = asStringArray(source.insights).slice(0, 6);
  const totalDays = schedule.reduce((max, item) => Math.max(max, item.end_day), 0);
  const riskScore = Math.max(0, Math.min(10, asNumber(summaryIn.risk_score ?? summaryIn.final_risk_score, risks.some((r) => r.severity === "high") ? 6.5 : 4.5)));

  return {
    summary: {
      objective: asString(summaryIn.objective, project).slice(0, 280) || project.slice(0, 280),
      total_tasks: tasks.length,
      total_days: totalDays || asNumber(summaryIn.total_days, 0),
      team_size: team.length,
      risk_score: Number(riskScore.toFixed(1)),
    },
    tasks,
    schedule: schedule.sort((a, b) => a.start_day - b.start_day || a.end_day - b.end_day),
    assignments,
    risks,
    insights,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function planPrompt(project: string, team: TeamMember[]): string {
  return `Create a practical software project execution plan.

PROJECT:
${project}

TEAM:
${JSON.stringify(team)}

Rules:
- Create 6 to 10 specific, independently deliverable tasks.
- Use only provided team member names for assignees.
- Dependencies must reference existing task IDs and must not be circular.
- Schedule day 0 is kickoff. A task cannot start before its dependencies end.
- Parallelize independent work across the team.
- Estimate duration_days as integers from 1 to 14.
- risk_score is a number from 0 to 10.
- Include 3 to 6 risks with category, severity, and mitigation.
- Include 3 to 5 concrete insights that name tasks or people.`;
}

async function generateWithAI(project: string, team: TeamMember[], env: Env): Promise<ProjectPlan> {
  const model = (env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast") as Parameters<Ai["run"]>[0];
  const result = await withTimeout(
    env.AI.run(model, {
      messages: [
        { role: "system", content: "You are a senior technical project manager. Return only valid JSON that matches the schema." },
        { role: "user", content: planPrompt(project, team) },
      ],
      temperature: 0.2,
      max_tokens: 1800,
      response_format: {
        type: "json_schema",
        json_schema: PLAN_JSON_SCHEMA,
      },
    } as never),
    25_000,
    "Workers AI timed out while generating the plan.",
  );

  return assemblePlan(project, team, extractModelOutput(result));
}

async function createPlan(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64_000) return json({ error: "Request body is too large." }, 413);

  let body: PlanRequest;
  try {
    body = await request.json<PlanRequest>();
  } catch {
    return json({ error: "Send a valid JSON request body." }, 400);
  }

  const project = typeof body.project === "string" ? body.project.trim() : "";
  if (!project) return json({ error: "The 'project' field is required." }, 400);
  if (project.length > 10_000) return json({ error: "Project description must be under 10,000 characters." }, 400);

  const team = normalizeTeam(body.team);
  const model = env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast";

  try {
    const plan = await generateWithAI(project, team, env);
    if (!plan.tasks.length) throw new Error("The AI model returned no tasks.");
    return json({ project, team, plan, model, source: "ai" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Plan generation failed, using fallback plan", detail);
    const plan = fallbackPlan(project, team);
    return json({
      project,
      team,
      plan,
      model,
      source: "fallback",
      warning: "AI generation was slow or incomplete, so a structured baseline plan was returned.",
      detail,
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        status: "ok",
        service: "AI Project Manager Assistant",
        runtime: "Cloudflare Workers",
        model: env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast",
      });
    }
    if (url.pathname === "/api/run" && request.method === "POST") return createPlan(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
