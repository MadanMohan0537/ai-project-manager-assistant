"""
nodes.py — LangGraph node implementations.

Each function is a self-contained "node" that:
  1. Receives the full ProjectState
  2. Calls the LLM with a structured prompt
  3. Parses + validates the response
  4. Returns a dict of state fields to update

LangGraph merges the returned dict into the shared state automatically.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from langchain_core.messages import HumanMessage
from langchain_openai import AzureChatOpenAI, ChatOpenAI

from .prompts import (
    ALLOCATION_PROMPT,
    DEPENDENCY_MAPPING_PROMPT,
    INSIGHT_GENERATION_PROMPT,
    RISK_ASSESSMENT_PROMPT,
    SCHEDULING_PROMPT,
    TASK_GENERATION_PROMPT,
)
from .state import ProjectState

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _call_llm(llm: Any, prompt: str) -> str:
    """Send a prompt to the LLM and return the raw text response."""
    response = llm.invoke([HumanMessage(content=prompt)])
    return response.content.strip()


def _parse_json(raw: str) -> Dict[str, Any]:
    """
    Safely parse JSON from LLM output.
    Handles cases where the model wraps JSON in markdown fences.
    """
    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
    return json.loads(raw)


# ─────────────────────────────────────────────────────────────────────────────
# Node 1 — Task Generation
# ─────────────────────────────────────────────────────────────────────────────

def task_generation_node(state: ProjectState, llm: Any) -> Dict[str, Any]:
    """
    Converts the project description into a list of concrete tasks.

    Input state fields used:  project_description
    Output state fields set:  tasks
    """
    logger.info("▶ Node: Task Generation")

    prompt = TASK_GENERATION_PROMPT.format(
        project_description=state["project_description"]
    )

    raw = _call_llm(llm, prompt)
    data = _parse_json(raw)
    tasks = data.get("tasks", [])

    logger.info("  Generated %d tasks", len(tasks))
    return {"tasks": tasks}


# ─────────────────────────────────────────────────────────────────────────────
# Node 2 — Dependency Mapping
# ─────────────────────────────────────────────────────────────────────────────

def dependency_mapping_node(state: ProjectState, llm: Any) -> Dict[str, Any]:
    """
    Analyses tasks and fills in the 'dependencies' field for each task.

    Input state fields used:  tasks
    Output state fields set:  tasks (updated with dependency info)
    """
    logger.info("▶ Node: Dependency Mapping")

    prompt = DEPENDENCY_MAPPING_PROMPT.format(
        tasks_json=json.dumps(state["tasks"], indent=2)
    )

    raw = _call_llm(llm, prompt)
    data = _parse_json(raw)
    tasks = data.get("tasks", state["tasks"])

    logger.info("  Dependency graph complete")
    return {"tasks": tasks}


# ─────────────────────────────────────────────────────────────────────────────
# Node 3 — Scheduling
# ─────────────────────────────────────────────────────────────────────────────

def scheduling_node(state: ProjectState, llm: Any) -> Dict[str, Any]:
    """
    Builds a day-by-day timeline respecting task dependencies.

    Input state fields used:  tasks, team_members
    Output state fields set:  schedule
    """
    logger.info("▶ Node: Scheduling")

    prompt = SCHEDULING_PROMPT.format(
        tasks_json=json.dumps(state["tasks"], indent=2),
        team_json=json.dumps(state["team_members"], indent=2),
        team_size=len(state["team_members"]),
    )

    raw = _call_llm(llm, prompt)
    data = _parse_json(raw)
    schedule = data.get("schedule", [])

    if schedule:
        total_days = max(e.get("end_day", 0) for e in schedule)
        logger.info("  Schedule spans %d days across %d entries", total_days, len(schedule))

    return {"schedule": schedule}


# ─────────────────────────────────────────────────────────────────────────────
# Node 4 — Task Allocation
# ─────────────────────────────────────────────────────────────────────────────

def allocation_node(state: ProjectState, llm: Any) -> Dict[str, Any]:
    """
    Matches tasks to team members based on skills and workload.

    Input state fields used:  tasks, team_members, schedule
    Output state fields set:  assignments
    """
    logger.info("▶ Node: Task Allocation")

    prompt = ALLOCATION_PROMPT.format(
        tasks_json=json.dumps(state["tasks"], indent=2),
        team_json=json.dumps(state["team_members"], indent=2),
        schedule_json=json.dumps(state["schedule"], indent=2),
    )

    raw = _call_llm(llm, prompt)
    data = _parse_json(raw)
    assignments = data.get("assignments", [])

    logger.info("  Assigned %d tasks", len(assignments))
    return {"assignments": assignments}


# ─────────────────────────────────────────────────────────────────────────────
# Node 5 — Risk Assessment
# ─────────────────────────────────────────────────────────────────────────────

def risk_assessment_node(state: ProjectState, llm: Any) -> Dict[str, Any]:
    """
    Scores overall project risk and lists individual risk items.

    Input state fields used:  project_description, tasks, schedule, assignments
    Output state fields set:  risks, risk_score
    """
    logger.info("▶ Node: Risk Assessment")

    prompt = RISK_ASSESSMENT_PROMPT.format(
        project_description=state["project_description"],
        tasks_json=json.dumps(state["tasks"], indent=2),
        schedule_json=json.dumps(state["schedule"], indent=2),
        assignments_json=json.dumps(state["assignments"], indent=2),
    )

    raw = _call_llm(llm, prompt)
    data = _parse_json(raw)

    risks = data.get("risks", [])
    risk_score = float(data.get("risk_score", 5.0))

    logger.info("  Risk score: %.1f/10 | %d risk items identified", risk_score, len(risks))
    return {"risks": risks, "risk_score": risk_score}


# ─────────────────────────────────────────────────────────────────────────────
# Node 6 — Insight Generation
# ─────────────────────────────────────────────────────────────────────────────

def insight_generation_node(state: ProjectState, llm: Any) -> Dict[str, Any]:
    """
    Produces actionable improvements when risk score is above threshold.

    Input state fields used:  risks, risk_score, tasks, schedule, team_members
    Output state fields set:  insights, iteration_count
    """
    logger.info("▶ Node: Insight Generation (iteration %d)", state["iteration_count"] + 1)

    schedule = state.get("schedule", [])
    schedule_span = (
        max((e.get("end_day", 0) for e in schedule), default=0) if schedule else 0
    )

    prompt = INSIGHT_GENERATION_PROMPT.format(
        risk_score=state["risk_score"],
        risks_json=json.dumps(state["risks"], indent=2),
        task_count=len(state["tasks"]),
        schedule_span=schedule_span,
        team_size=len(state["team_members"]),
    )

    raw = _call_llm(llm, prompt)
    data = _parse_json(raw)
    insights = data.get("insights", [])

    logger.info("  Generated %d insights", len(insights))

    return {
        "insights": state.get("insights", []) + insights,
        "iteration_count": state["iteration_count"] + 1,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Node 7 — Finalise Plan
# ─────────────────────────────────────────────────────────────────────────────

def finalise_plan_node(state: ProjectState, llm: Any) -> Dict[str, Any]:  # noqa: ARG001
    """
    Assembles the complete project plan into a single summary dict.
    No LLM call needed here — pure data assembly.

    Output state fields set:  final_plan
    """
    logger.info("▶ Node: Finalise Plan")

    schedule = state.get("schedule", [])
    total_days = max((e.get("end_day", 0) for e in schedule), default=0) if schedule else 0

    final_plan = {
        "project_description": state["project_description"],
        "summary": {
            "total_tasks": len(state["tasks"]),
            "total_days": total_days,
            "team_size": len(state["team_members"]),
            "final_risk_score": state["risk_score"],
            "iterations_completed": state["iteration_count"],
        },
        "tasks": state["tasks"],
        "schedule": schedule,
        "assignments": state["assignments"],
        "risks": state["risks"],
        "insights": state.get("insights", []),
    }

    logger.info(
        "  ✅ Plan complete — %d tasks, %d days, risk %.1f/10",
        len(state["tasks"]),
        total_days,
        state["risk_score"],
    )

    return {"final_plan": final_plan}
