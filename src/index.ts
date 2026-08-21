interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  AI_MODEL?: string;
}

type Priority = "low" | "medium" | "high" | "critical";
type Severity = "low" | "medium" | "high";

type TeamMember = {
  id?: string;
  name: string;
  role: string;
  skills: string;
  capacity: number;
};

type Task = {
  id: string;
  epic: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  duration_days: number;
  dependencies: string[];
  priority: Priority;
  assignee: string;
  status: "backlog" | "todo" | "in_progress" | "review" | "done";
  start_day?: number;
  end_day?: number;
};

type RaidItem = {
  type: "risk" | "assumption" | "issue" | "dependency";
  title: string;
  detail: string;
  severity: Severity;
  owner: string;
  mitigation: string;
};

type PlanRequest = {
  name?: unknown;
  objective?: unknown;
  description?: unknown;
  startDate?: unknown;
  targetDate?: unknown;
  methodology?: unknown;
  constraints?: unknown;
  stack?: unknown;
  team?: unknown;
};

type CopilotRequest = {
  question?: unknown;
  project?: unknown;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function cleanJson(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI response was not valid JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function text(value: unknown, max = 10_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeTeam(value: unknown): TeamMember[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      { name: "Alice", role: "Full-stack Engineer", skills: "React, TypeScript, APIs", capacity: 100 },
      { name: "Bob", role: "Backend Engineer", skills: "APIs, databases, Python", capacity: 100 },
      { name: "Carol", role: "Cloud Engineer", skills: "Cloudflare, CI/CD, observability", capacity: 100 },
    ];
  }

  return value.slice(0, 20).map((raw, index) => {
    const item = typeof raw === "object" && raw ? raw as Record<string, unknown> : {};
    const capacity = Number(item.capacity);
    return {
      id: text(item.id, 50) || `M${index + 1}`,
      name: text(item.name, 80) || `Member ${index + 1}`,
      role: text(item.role, 120) || "Generalist",
      skills: text(item.skills ?? item.profile, 500) || "General project work",
      capacity: Number.isFinite(capacity) ? Math.min(100, Math.max(10, Math.round(capacity))) : 100,
    };
  });
}

function normalizeTasks(raw: unknown, team: TeamMember[]): Task[] {
  if (!Array.isArray(raw)) return [];
  const names = new Set(team.map((m) => m.name));
  const tasks: Task[] = raw.slice(0, 40).map((value, index) => {
    const t = typeof value === "object" && value ? value as Record<string, unknown> : {};
    const deps = Array.isArray(t.dependencies) ? t.dependencies.map((x) => text(x, 20)).filter(Boolean) : [];
    const ac = Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria.map((x) => text(x, 250)).filter(Boolean).slice(0, 5) : [];
    const assignee = text(t.assignee, 80);
    const priority = ["low", "medium", "high", "critical"].includes(String(t.priority)) ? String(t.priority) as Priority : "medium";
    return {
      id: `T${index + 1}`,
      epic: text(t.epic, 120) || "Project Delivery",
      title: text(t.title, 160) || `Task ${index + 1}`,
      description: text(t.description, 600),
      acceptance_criteria: ac,
      duration_days: Math.min(20, Math.max(1, Math.round(Number(t.duration_days) || 1))),
      dependencies: deps,
      priority,
      assignee: names.has(assignee) ? assignee : team[index % team.length].name,
      status: "todo",
    };
  });

  const validIds = new Set(tasks.map((t) => t.id));
  tasks.forEach((task, index) => {
    task.dependencies = task.dependencies
      .map((d) => {
        const match = /^T?(\d+)$/i.exec(d);
        return match ? `T${Number(match[1])}` : d;
      })
      .filter((d) => validIds.has(d) && d !== task.id && Number(d.slice(1)) < index + 1);
    task.dependencies = [...new Set(task.dependencies)];
  });
  return tasks;
}

function scheduleTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const task of tasks) {
    let start = 1;
    for (const dependencyId of task.dependencies) {
      const dep = byId.get(dependencyId);
      if (dep?.end_day) start = Math.max(start, dep.end_day + 1);
    }
    task.start_day = start;
    task.end_day = start + task.duration_days - 1;
  }
  return tasks;
}

function buildMilestones(tasks: Task[]) {
  const epics = new Map<string, Task[]>();
  for (const task of tasks) {
    const items = epics.get(task.epic) || [];
    items.push(task);
    epics.set(task.epic, items);
  }
  return [...epics.entries()].map(([title, items], index) => ({
    id: `MS${index + 1}`,
    title: `${title} complete`,
    day: Math.max(...items.map((t) => t.end_day || 1)),
    status: "planned",
  }));
}

function workload(tasks: Task[], team: TeamMember[]) {
  const total = tasks.reduce((sum, t) => sum + t.duration_days, 0) || 1;
  return team.map((member) => {
    const assigned = tasks.filter((t) => t.assignee === member.name);
    const days = assigned.reduce((sum, t) => sum + t.duration_days, 0);
    return {
      member: member.name,
      role: member.role,
      task_count: assigned.length,
      assigned_days: days,
      share_percent: Math.round((days / total) * 100),
      capacity: member.capacity,
    };
  });
}

async function runAI(env: Env, system: string, prompt: string, maxTokens = 4500): Promise<string> {
  const model = env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fp8";
  const result = await env.AI.run(model as Parameters<Ai["run"]>[0], {
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    temperature: 0.25,
    max_tokens: maxTokens,
  } as never) as { response?: string };
  if (!result.response) throw new Error("The AI model returned an empty response.");
  return result.response;
}

async function createPlan(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 96_000) return json({ error: "Request body is too large." }, 413);

  let body: PlanRequest;
  try { body = await request.json<PlanRequest>(); }
  catch { return json({ error: "Send a valid JSON request body." }, 400); }

  const name = text(body.name, 120) || "Untitled Project";
  const objective = text(body.objective, 1200);
  const description = text(body.description, 10_000);
  if (!objective && !description) return json({ error: "Add a project objective or description." }, 400);

  const team = normalizeTeam(body.team);
  const projectContext = {
    name,
    objective,
    description,
    startDate: text(body.startDate, 20),
    targetDate: text(body.targetDate, 20),
    methodology: text(body.methodology, 40) || "Agile",
    constraints: text(body.constraints, 2000),
    stack: text(body.stack, 1200),
    team,
  };

  const planningPrompt = `Design an executable software/project delivery work breakdown structure.
Return ONLY valid JSON with this shape:
{
  "summary": {"objective":"string","executive_summary":"string"},
  "tasks": [{
    "epic":"string",
    "title":"string",
    "description":"string",
    "acceptance_criteria":["string"],
    "duration_days":1,
    "dependencies":["T1"],
    "priority":"low|medium|high|critical",
    "assignee":"exact team member name"
  }],
  "raid": [{
    "type":"risk|assumption|issue|dependency",
    "title":"string",
    "detail":"string",
    "severity":"low|medium|high",
    "owner":"exact team member name",
    "mitigation":"string"
  }],
  "insights":["string"]
}
Rules:
- Produce 10-24 concrete tasks grouped into 3-6 epics.
- Number dependency references as if tasks are T1, T2... in returned order.
- Dependencies may only point backward to earlier tasks.
- Include clear acceptance criteria, realistic durations and useful technical descriptions.
- Assign work according to team roles/skills and avoid concentrating everything on one person.
- Include all four RAID categories where applicable.
- Do not invent named people outside the supplied team.

PROJECT:\n${JSON.stringify(projectContext)}`;

  try {
    const raw = await runAI(env, "You are a senior technical program manager. Produce precise execution plans as strict JSON, with no markdown.", planningPrompt);
    const generated = cleanJson(raw);
    const tasks = scheduleTasks(normalizeTasks(generated.tasks, team));
    if (tasks.length < 5) throw new Error("The generated plan did not contain enough usable tasks.");

    const maxDay = Math.max(...tasks.map((t) => t.end_day || 1));
    const raidRaw = Array.isArray(generated.raid) ? generated.raid : [];
    const raid: RaidItem[] = raidRaw.slice(0, 24).map((value: any) => ({
      type: ["risk", "assumption", "issue", "dependency"].includes(value?.type) ? value.type : "risk",
      title: text(value?.title, 180) || "Project concern",
      detail: text(value?.detail, 700),
      severity: ["low", "medium", "high"].includes(value?.severity) ? value.severity : "medium",
      owner: team.some((m) => m.name === value?.owner) ? value.owner : team[0].name,
      mitigation: text(value?.mitigation, 700),
    }));

    const project = {
      id: crypto.randomUUID(),
      ...projectContext,
      createdAt: new Date().toISOString(),
      status: "planning",
      summary: {
        objective: text(generated.summary?.objective, 1200) || objective || description.slice(0, 600),
        executive_summary: text(generated.summary?.executive_summary, 1800),
        total_tasks: tasks.length,
        total_days: maxDay,
        team_size: team.length,
        risk_score: Math.min(10, raid.filter((r) => r.type === "risk").reduce((s, r) => s + (r.severity === "high" ? 2 : r.severity === "medium" ? 1 : 0.5), 0)),
      },
      tasks,
      milestones: buildMilestones(tasks),
      raid,
      workload: workload(tasks, team),
      insights: Array.isArray(generated.insights) ? generated.insights.map((x: unknown) => text(x, 500)).filter(Boolean).slice(0, 10) : [],
    };
    return json({ project, model: env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fp8" });
  } catch (error) {
    console.error("Plan generation failed", error);
    return json({ error: "Plan generation failed. Please try again.", detail: error instanceof Error ? error.message : "Unknown error" }, 502);
  }
}

async function copilot(request: Request, env: Env): Promise<Response> {
  let body: CopilotRequest;
  try { body = await request.json<CopilotRequest>(); }
  catch { return json({ error: "Send a valid JSON request body." }, 400); }

  const question = text(body.question, 2000);
  if (!question) return json({ error: "The 'question' field is required." }, 400);
  if (!body.project || typeof body.project !== "object") return json({ error: "Project context is required." }, 400);

  const compact = JSON.stringify(body.project).slice(0, 50_000);
  const prompt = `Answer the project manager's question using the supplied project state. Be concise, concrete and action-oriented. Identify blockers, dependencies, workload conflicts and schedule effects when relevant. Do not claim to modify project data; instead state recommended changes clearly.\n\nQUESTION:\n${question}\n\nPROJECT STATE:\n${compact}`;
  try {
    const answer = await runAI(env, "You are an embedded senior project-management copilot. Use only supplied project context and practical PM reasoning.", prompt, 1800);
    return json({ answer: answer.trim() });
  } catch (error) {
    console.error("Copilot failed", error);
    return json({ error: "Copilot request failed. Please try again." }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ status: "ok", service: "AI Project Manager Assistant", runtime: "Cloudflare Workers", version: "3.0.0" });
    }
    if (url.pathname === "/api/projects/plan" && request.method === "POST") return createPlan(request, env);
    if (url.pathname === "/api/copilot" && request.method === "POST") return copilot(request, env);
    if (url.pathname === "/api/run" && request.method === "POST") return createPlan(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
