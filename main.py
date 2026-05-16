"""
main.py — Entry point for the AI Project Manager Assistant.

Usage:
    python main.py
    python main.py --project "Build a SaaS invoicing platform" --team data/team.csv
    python main.py --project "..." --team data/team.csv --max-iterations 2 --save

Run `python main.py --help` for all options.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# ── Load .env before any LLM imports ─────────────────────────────────────────
load_dotenv()

from src.graph import build_graph
from src.llm_factory import get_llm
from src.reporter import print_plan, save_plan_json
from src.team_loader import load_team

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Default project description (used when --project is not supplied) ────────
DEFAULT_PROJECT = (
    "Build a mobile application for food delivery. "
    "The app should support customer ordering, restaurant management, "
    "real-time delivery tracking, payment processing, and push notifications."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="AI Project Manager Assistant — turns ideas into full project plans.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py
  python main.py --project "Build a healthcare dashboard" --team data/team.csv
  python main.py --project "..." --max-iterations 3 --save
        """,
    )
    parser.add_argument(
        "--project",
        type=str,
        default=DEFAULT_PROJECT,
        help="Free-text description of the project to plan.",
    )
    parser.add_argument(
        "--team",
        type=str,
        default="data/team.csv",
        help="Path to the team CSV file (columns: name, profile).",
    )
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=3,
        dest="max_iterations",
        help="Maximum improvement iterations before the loop exits (default: 3).",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save the final plan as outputs/plan.json.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # ── Load team ─────────────────────────────────────────────────────────
    team_path = Path(args.team)
    logger.info("Loading team from %s", team_path)
    try:
        team_members = load_team(team_path)
    except (FileNotFoundError, ValueError) as exc:
        logger.error("Failed to load team: %s", exc)
        sys.exit(1)

    logger.info("Team loaded: %d members", len(team_members))
    for member in team_members:
        logger.info("  • %s — %s", member["name"], member["profile"][:60])

    # ── Build the LangGraph agent ─────────────────────────────────────────
    logger.info("Initialising LLM…")
    try:
        llm = get_llm(temperature=0.2)
    except EnvironmentError as exc:
        logger.error("%s", exc)
        sys.exit(1)

    logger.info("Building agent graph…")
    agent = build_graph(llm)

    # ── Prepare initial state ─────────────────────────────────────────────
    initial_state = {
        "project_description": args.project,
        "team_members": team_members,
        "tasks": [],
        "schedule": [],
        "assignments": [],
        "risks": [],
        "risk_score": 10.0,
        "insights": [],
        "iteration_count": 0,
        "max_iterations": args.max_iterations,
        "final_plan": None,
    }

    # ── Run the agent ─────────────────────────────────────────────────────
    logger.info("=" * 60)
    logger.info("Starting AI Project Manager Agent")
    logger.info("Project: %s…", args.project[:70])
    logger.info("=" * 60)

    result = agent.invoke(initial_state)

    # ── Output ────────────────────────────────────────────────────────────
    final_plan = result.get("final_plan")
    if not final_plan:
        logger.error("Agent completed but no final_plan was produced.")
        sys.exit(1)

    print_plan(final_plan)

    if args.save:
        save_plan_json(final_plan)


if __name__ == "__main__":
    main()
