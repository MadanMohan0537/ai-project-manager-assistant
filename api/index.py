"""
api/index.py - Flask web API wrapper for the AI Project Manager Assistant.
Exposes the LangGraph workflow as REST endpoints for Vercel deployment.
"""

from __future__ import annotations

import os
import sys

# Add the project root to Python path so src/ imports work on Vercel
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)


@app.route("/", methods=["GET"])
def index():
      """Health check / landing page."""
      return jsonify({
          "service": "AI Project Manager Assistant",
          "status": "running",
          "description": "LangGraph-powered project planning API",
          "endpoints": {
              "POST /api/run": "Generate a full project plan",
              "GET /api/health": "Health check"
          }
      })


@app.route("/api/health", methods=["GET"])
def health():
      """Health check endpoint."""
      return jsonify({"status": "ok"})


@app.route("/api/run", methods=["POST"])
def run_project():
      """
          Generate a full AI project plan.

              Request JSON body:
                      project        (str):        Project description (required)
                              team           (list[dict]): Optional team members with 'name' and 'profile'
                                      max_iterations (int):        Max risk-refinement loops (default: 3)

                                          Returns:
                                                  JSON with the complete project plan.
                                                      """
      try:
                from src.graph import build_graph
                from src.llm_factory import get_llm
                from src.state import ProjectState

          data = request.get_json(force=True) or {}

        project_description = data.get("project", "").strip()
        if not project_description:
                      return jsonify({"error": "The 'project' field is required."}), 400

        max_iterations = int(data.get("max_iterations", 3))

        team_members = data.get("team", [])
        if not team_members:
                      team_members = [
                                        {"name": "Alice", "profile": "Full-stack developer, Python, React"},
                                        {"name": "Bob",   "profile": "Backend engineer, APIs, databases"},
                                        {"name": "Carol", "profile": "DevOps engineer, CI/CD, cloud infrastructure"},
                                        {"name": "Dave",  "profile": "QA engineer, testing, automation"},
                      ]

        llm = get_llm()
        graph = build_graph(llm=llm, max_iterations=max_iterations)

        initial_state: ProjectState = {
                      "project_description": project_description,
                      "team_members": team_members,
                      "tasks": [],
                      "schedule": [],
                      "assignments": [],
                      "risks": [],
                      "risk_score": 0.0,
                      "insights": [],
                      "final_plan": {},
                      "iteration_count": 0,
        }

        final_state = graph.invoke(initial_state)

        return jsonify({
                      "project": project_description,
                      "plan": final_state.get("final_plan", {}),
                      "tasks": final_state.get("tasks", []),
                      "schedule": final_state.get("schedule", []),
                      "assignments": final_state.get("assignments", []),
                      "risks": final_state.get("risks", []),
                      "risk_score": final_state.get("risk_score", 0),
                      "insights": final_state.get("insights", []),
                      "iterations": final_state.get("iteration_count", 0),
        })

except EnvironmentError as exc:
        return jsonify({
                      "error": str(exc),
                      "hint": "Set OPENAI_API_KEY in Vercel environment variables."
        }), 500
except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
      app.run(debug=True)
