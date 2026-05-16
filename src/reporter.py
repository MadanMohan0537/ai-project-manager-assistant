"""
reporter.py — Console and file output for the final project plan.

Provides a rich, human-readable summary and an optional JSON export.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional


def _separator(char: str = "─", width: int = 70) -> str:
    return char * width


def print_plan(final_plan: Dict[str, Any]) -> None:
    """Print a formatted summary of the project plan to stdout."""

    summary = final_plan.get("summary", {})
    print("\n" + _separator("═"))
    print("  🚀  AI PROJECT MANAGER — FINAL PLAN")
    print(_separator("═"))

    # ── Summary banner ───────────────────────────────────────────────────
    print(f"\n📋  Project: {final_plan.get('project_description', '')[:80]}")
    print(f"    Tasks        : {summary.get('total_tasks', '?')}")
    print(f"    Total days   : {summary.get('total_days', '?')}")
    print(f"    Team size    : {summary.get('team_size', '?')}")
    print(f"    Risk score   : {summary.get('final_risk_score', '?'):.1f} / 10.0")
    print(f"    Iterations   : {summary.get('iterations_completed', '?')}")

    # ── Tasks ────────────────────────────────────────────────────────────
    print(f"\n{_separator()}")
    print("  TASKS")
    print(_separator())
    for t in final_plan.get("tasks", []):
        deps = ", ".join(t.get("dependencies", [])) or "none"
        skills = ", ".join(t.get("required_skills", []))
        print(
            f"  [{t['id']}] {t['name']}  ({t.get('estimated_days', '?')} days)\n"
            f"       Skills : {skills}\n"
            f"       Depends: {deps}\n"
            f"       {t.get('description', '')}"
        )

    # ── Schedule ─────────────────────────────────────────────────────────
    print(f"\n{_separator()}")
    print("  SCHEDULE  (day 0 = project start)")
    print(_separator())
    print(f"  {'Task':<30} {'Assignee':<18} {'Start':>6} {'End':>6}")
    print(f"  {'-'*30} {'-'*18} {'-'*6} {'-'*6}")
    for entry in sorted(final_plan.get("schedule", []), key=lambda x: x.get("start_day", 0)):
        print(
            f"  {entry.get('task_name', ''):<30} "
            f"{entry.get('assignee', ''):<18} "
            f"{entry.get('start_day', 0):>6} "
            f"{entry.get('end_day', 0):>6}"
        )

    # ── Assignments ──────────────────────────────────────────────────────
    print(f"\n{_separator()}")
    print("  TASK ASSIGNMENTS")
    print(_separator())
    for a in final_plan.get("assignments", []):
        print(
            f"  [{a.get('task_id', '')}] {a.get('task_name', '')}\n"
            f"       → {a.get('assignee', '')}  —  {a.get('reason', '')}"
        )

    # ── Risks ────────────────────────────────────────────────────────────
    print(f"\n{_separator()}")
    print("  RISKS")
    print(_separator())
    severity_icons = {"high": "🔴", "medium": "🟡", "low": "🟢"}
    for r in final_plan.get("risks", []):
        icon = severity_icons.get(r.get("severity", "low"), "⚪")
        print(
            f"  {icon} [{r.get('category', '')}] {r.get('description', '')}\n"
            f"       Mitigation: {r.get('mitigation', '')}"
        )

    # ── Insights ─────────────────────────────────────────────────────────
    insights = final_plan.get("insights", [])
    if insights:
        print(f"\n{_separator()}")
        print("  IMPROVEMENT INSIGHTS")
        print(_separator())
        for i, insight in enumerate(insights, 1):
            print(f"  {i}. {insight}")

    print(f"\n{_separator('═')}\n")


def save_plan_json(
    final_plan: Dict[str, Any],
    output_path: Optional[str | Path] = None,
) -> Path:
    """
    Save the final plan as a JSON file.

    Args:
        final_plan: The assembled plan dict from finalise_plan_node.
        output_path: Where to write the file. Defaults to ./outputs/plan.json

    Returns:
        The resolved Path where the file was written.
    """
    if output_path is None:
        output_path = Path("outputs") / "plan.json"

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as f:
        json.dump(final_plan, f, indent=2, ensure_ascii=False)

    print(f"  💾  Plan saved to {path.resolve()}")
    return path
