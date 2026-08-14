interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  AI_MODEL?: string;
}

interface TeamMember {
  name: string;
  profile: string;
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function cleanJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI response was not valid JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeTeam(value: unknown): TeamMember[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      { name: "Alice", profile: "Full-stack development" },
      { name: "Bob", profile: "Backend APIs and databases" },
      { name: "Carol", profile: "Cloud and DevOps" },
      { name: "Dave", profile: "QA and test automation" },
    ];
  }

  return value.slice(0, 20).map((item, index) => {
    const member = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    return {
      name: String(member.name || `Member ${index + 1}`).trim().slice(0, 80),
      profile: String(member.profile || "Generalist").trim().slice(0, 500),
    };
  });
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
  const model = env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fp8";
  const prompt = `Create a practical project execution plan from the project and team below.

Return ONLY one valid JSON object with this exact top-level shape:
{
  "summary": {"objective":"string","total_tasks":0,"total_days":0,"team_size":0,"risk_score":0},
  "tasks": [{"id":"T1","title":"string","description":"string","duration_days":1,"dependencies":[]}],
  "schedule": [{"task_id":"T1","start_day":1,"end_day":1}],
  "assignments": [{"task_id":"T1","member":"string","reason":"string"}],
  "risks": [{"risk":"string","severity":"low|medium|high","mitigation":"string"}],
  "insights": ["string"]
}

Rules:
- Create 5 to 12 specific tasks.
- Dependency IDs must exist and the schedule must respect them.
- Assign every task once, using only provided team names.
- Use realistic integer durations and parallelize independent work.
- risk_score must be a number from 0 to 10.
- Keep descriptions concise.

PROJECT:
${project}

TEAM:
${JSON.stringify(team)}`;

  try {
    const result = await env.AI.run(model as Parameters<Ai["run"]>[0], {
      messages: [
        { role: "system", content: "You are a senior technical project manager. Produce strict JSON without markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 3500,
    } as never) as { response?: string };

    if (!result.response) throw new Error("The AI model returned an empty response.");
    const plan = cleanJson(result.response);
    return json({ project, team, plan, model });
  } catch (error) {
    console.error("Plan generation failed", error);
    return json({ error: "Plan generation failed. Please try again.", detail: error instanceof Error ? error.message : "Unknown error" }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ status: "ok", service: "AI Project Manager Assistant", runtime: "Cloudflare Workers" });
    }
    if (url.pathname === "/api/run" && request.method === "POST") return createPlan(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
