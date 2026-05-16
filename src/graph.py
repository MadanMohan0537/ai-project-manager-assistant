"""
graph.py — LangGraph workflow definition.

This file wires all nodes together into a directed graph.
The control flow looks like this:

  [START]
     │
     ▼
  task_generation
     │
     ▼
  dependency_mapping
     │
     ▼
  scheduling
     │
     ▼
  allocation
     │
     ▼
  risk_assessment
     │
     ▼ (risk_score > threshold AND iterations < max?)
  insight_generation ──► risk_assessment  (loop back)
     │
     ▼ (risk is acceptable OR max iterations reached)
  finalise_plan
     │
     ▼
  [END]

The conditional edge after risk_assessment is the key design decision:
it turns a linear pipeline into a self-improving feedback loop.
"""

from __future__ import annotations

import functools
import logging
from typing import Any

from langgraph.graph import END, START, StateGraph

from .nodes import (
    allocation_node,
    dependency_mapping_node,
    finalise_plan_node,
    insight_generation_node,
    risk_assessment_node,
    scheduling_node,
    task_generation_node,
)
from .state import ProjectState

logger = logging.getLogger(__name__)

# Risk score at or below this value is considered acceptable → exit the loop
ACCEPTABLE_RISK_THRESHOLD = 5.0


def _should_iterate(state: ProjectState) -> str:
    """
    Conditional edge function: decides whether to loop back for another
    improvement pass or to exit toward finalise_plan.

    Returns:
        "improve"  → risk is still high, run insight_generation again
        "finalise" → risk is acceptable or max iterations reached
    """
    risk_score = state.get("risk_score", 10.0)
    iterations = state.get("iteration_count", 0)
    max_iter = state.get("max_iterations", 3)

    if risk_score > ACCEPTABLE_RISK_THRESHOLD and iterations < max_iter:
        logger.info(
            "  ↻ Risk %.1f > threshold %.1f — iterating (pass %d/%d)",
            risk_score,
            ACCEPTABLE_RISK_THRESHOLD,
            iterations,
            max_iter,
        )
        return "improve"

    logger.info(
        "  ✓ Exiting loop — risk %.1f, iterations %d/%d",
        risk_score,
        iterations,
        max_iter,
    )
    return "finalise"


def build_graph(llm: Any) -> StateGraph:
    """
    Constructs and compiles the LangGraph StateGraph.

    Each node is a partial function that closes over the `llm` instance,
    so the graph itself stays stateless and reusable.

    Args:
        llm: A LangChain-compatible chat model (OpenAI, AzureOpenAI, etc.)

    Returns:
        A compiled LangGraph runnable ready to call with .invoke()
    """
    graph = StateGraph(ProjectState)

    # ── Register nodes (partial-apply the llm so signatures match) ─────────
    graph.add_node("task_generation",    functools.partial(task_generation_node,    llm=llm))
    graph.add_node("dependency_mapping", functools.partial(dependency_mapping_node, llm=llm))
    graph.add_node("scheduling",         functools.partial(scheduling_node,         llm=llm))
    graph.add_node("allocation",         functools.partial(allocation_node,         llm=llm))
    graph.add_node("risk_assessment",    functools.partial(risk_assessment_node,    llm=llm))
    graph.add_node("insight_generation", functools.partial(insight_generation_node, llm=llm))
    graph.add_node("finalise_plan",      functools.partial(finalise_plan_node,      llm=llm))

    # ── Linear edges ────────────────────────────────────────────────────────
    graph.add_edge(START,                "task_generation")
    graph.add_edge("task_generation",    "dependency_mapping")
    graph.add_edge("dependency_mapping", "scheduling")
    graph.add_edge("scheduling",         "allocation")
    graph.add_edge("allocation",         "risk_assessment")

    # ── Conditional edge (the improvement loop) ─────────────────────────────
    graph.add_conditional_edges(
        "risk_assessment",
        _should_iterate,
        {
            "improve":  "insight_generation",
            "finalise": "finalise_plan",
        },
    )

    graph.add_edge("insight_generation", "risk_assessment")  # loop back
    graph.add_edge("finalise_plan",      END)

    return graph.compile()
