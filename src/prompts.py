"""
prompts.py — All LLM prompt templates in one place.

Keeping prompts separate from node logic makes it easy to:
  • Tweak wording without touching business logic
  • Version-control prompt changes independently
  • Swap in different prompt styles per environment
"""

TASK_GENERATION_PROMPT = """
You are an expert software project manager.

Given the following project description, break it down into a clear set of
actionable development tasks.

Project Description:
{project_description}

Requirements:
- Generate between 6 and 12 tasks (more for complex projects).
- Each task must be concrete and independently deliverable.
- Estimate effort in calendar days (1–14).
- List the specific technical skills required.

Return ONLY valid JSON matching this exact schema (no markdown fences):
{{
  "tasks": [
    {{
      "id": "T1",
      "name": "Short task name",
      "description": "What needs to be done",
      "estimated_days": 3,
      "required_skills": ["Python", "REST API"],
      "dependencies": []
    }}
  ]
}}
"""

DEPENDENCY_MAPPING_PROMPT = """
You are a senior technical architect.

Review these project tasks and determine which tasks must be completed BEFORE
others can begin. Only add a dependency when it is technically necessary.

Tasks:
{tasks_json}

Rules:
- A task's "dependencies" list must contain ONLY valid task IDs from the list above.
- Avoid circular dependencies.
- Keep the dependency graph as lean as possible (don't over-constrain).

Return ONLY valid JSON with the updated tasks array (same schema, same IDs):
{{
  "tasks": [ ... ]
}}
"""

SCHEDULING_PROMPT = """
You are a project scheduling expert.

Create a day-by-day schedule for the following tasks, respecting their
dependencies and the available team of {team_size} engineers.

Tasks (with dependencies):
{tasks_json}

Rules:
- Day 0 = project start.
- A task cannot start before all its dependencies have ended.
- Parallelise work where dependencies allow.
- Assign each task to a specific team member (use names from the team list).

Team members:
{team_json}

Return ONLY valid JSON:
{{
  "schedule": [
    {{
      "task_id": "T1",
      "task_name": "...",
      "start_day": 0,
      "end_day": 3,
      "assignee": "Alice"
    }}
  ]
}}
"""

ALLOCATION_PROMPT = """
You are a resource allocation specialist.

Match each task to the best available team member based on required skills and
current workload implied by the schedule.

Tasks:
{tasks_json}

Team members:
{team_json}

Schedule (current assignments):
{schedule_json}

Return ONLY valid JSON:
{{
  "assignments": [
    {{
      "task_id": "T1",
      "task_name": "...",
      "assignee": "Alice",
      "reason": "Alice has strong Python and REST API experience."
    }}
  ]
}}
"""

RISK_ASSESSMENT_PROMPT = """
You are a project risk manager.

Analyse the following project plan and identify the top risks.

Project Description: {project_description}

Tasks:
{tasks_json}

Schedule:
{schedule_json}

Assignments:
{assignments_json}

For each risk provide:
- category: "Resource" | "Dependency" | "Timeline" | "Technical" | "Scope"
- description: what could go wrong
- severity: "low" | "medium" | "high"
- mitigation: concrete action to reduce the risk

Also calculate an overall risk_score (0.0 = no risk, 10.0 = project will fail).

Return ONLY valid JSON:
{{
  "risks": [
    {{
      "category": "Timeline",
      "description": "Three tasks share the same critical resource.",
      "severity": "high",
      "mitigation": "Hire a contractor or reorder tasks."
    }}
  ],
  "risk_score": 6.5
}}
"""

INSIGHT_GENERATION_PROMPT = """
You are an experienced delivery coach.

The current project plan has a risk score of {risk_score}/10.
Here are the identified risks:

{risks_json}

Current plan summary:
- Tasks: {task_count}
- Schedule span: {schedule_span} days
- Team size: {team_size}

Provide 3–5 specific, actionable improvements that would meaningfully reduce
the risk score. Be concrete — name tasks, people, or timelines where relevant.

Return ONLY valid JSON:
{{
  "insights": [
    "Split Task T5 into two parallel subtasks to reduce the critical path by 3 days.",
    "..."
  ]
}}
"""
