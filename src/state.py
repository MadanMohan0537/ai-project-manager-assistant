"""
state.py — Shared agent state definition.

All nodes in the LangGraph workflow read from and write to this TypedDict.
Think of it as the agent's working memory: it accumulates everything the
agent learns across steps so nothing is ever lost between nodes.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


class Task(TypedDict):
    """Represents a single project task."""
    id: str                        # Unique identifier, e.g. "T1"
    name: str                      # Short human-readable name
    description: str               # What needs to be done
    estimated_days: int            # Effort estimate in calendar days
    required_skills: List[str]     # Skills needed to complete the task
    dependencies: List[str]        # IDs of tasks that must finish first


class TeamMember(TypedDict):
    """Represents one team member loaded from the CSV."""
    name: str
    profile: str                   # Comma-separated skills / role description


class Assignment(TypedDict):
    """Maps a task to a team member."""
    task_id: str
    task_name: str
    assignee: str
    reason: str                    # Why this person was chosen


class ScheduleEntry(TypedDict):
    """Timeline entry for a single task."""
    task_id: str
    task_name: str
    start_day: int                 # 0-indexed day from project kick-off
    end_day: int
    assignee: str


class RiskItem(TypedDict):
    """A single identified risk."""
    category: str                  # e.g. "Resource", "Dependency", "Timeline"
    description: str
    severity: str                  # "low" | "medium" | "high"
    mitigation: str


class ProjectState(TypedDict):
    """
    Central state object passed between every node in the graph.

    Fields are populated progressively:
      1. project_description + team_members  → provided by the user
      2. tasks                               → TaskGenerationNode
      3. tasks (with dependencies filled)   → DependencyMappingNode
      4. schedule                            → SchedulingNode
      5. assignments                         → AllocationNode
      6. risks + risk_score                  → RiskAssessmentNode
      7. insights                            → InsightGenerationNode
      8. iteration_count                     → updated each loop pass
    """
    # ── Input ──────────────────────────────────────────────────────────────
    project_description: str
    team_members: List[TeamMember]

    # ── Derived ────────────────────────────────────────────────────────────
    tasks: List[Task]
    schedule: List[ScheduleEntry]
    assignments: List[Assignment]
    risks: List[RiskItem]
    risk_score: float              # 0.0 – 10.0; drives the iteration loop
    insights: List[str]            # Actionable improvement suggestions

    # ── Control ────────────────────────────────────────────────────────────
    iteration_count: int
    max_iterations: int            # Hard cap so the loop always terminates
    final_plan: Optional[Dict[str, Any]]  # Assembled at the end
