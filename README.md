<div align="center">

# 🤖 AI Project Manager Assistant

**From plain-English idea → complete, risk-aware project plan — in seconds.**

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2%2B-1C3C3C?style=flat&logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![LangChain](https://img.shields.io/badge/LangChain-0.3%2B-1C3C3C?style=flat&logo=langchain&logoColor=white)](https://langchain.com)
[![OpenAI](https://img.shields.io/badge/GPT--4o--mini-OpenAI-412991?style=flat&logo=openai&logoColor=white)](https://platform.openai.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![HuggingFace Space](https://img.shields.io/badge/🤗%20Try%20it-HuggingFace-orange)](https://huggingface.co/spaces/chmadan99/ai-project-manager-assistant)

<br/>

*Describe your project. List your team. Let the agent do the rest.*

[**Try the Live Demo →**](https://huggingface.co/spaces/chmadan99/ai-project-manager-assistant) · [How it Works](#-how-it-works) · [Quickstart](#-quickstart) · [Architecture](#-architecture)

</div>

---

## 💡 The Problem This Solves

Most project management tools assume you already know your tasks, dependencies, and timeline. But the hardest part of any project is the blank page at the beginning.

This agent fills that blank page for you. Give it one paragraph — it gives you a production-ready plan.

| Without this agent | With this agent |
|---|---|
| Hours of planning meetings | ~30 seconds |
| Manual task breakdown | AI-generated 8–12 tasks with effort estimates |
| Forgotten dependencies | Automatic dependency graph |
| Gut-feel risk assessment | Scored risk report (0–10) with mitigations |
| Static plan | Self-improving — loops until risk is acceptable |

---

## ✨ What You Get

Given a project description and your team roster, the agent produces:

- 📋 **Task Breakdown** — 8–12 concrete tasks with effort estimates and required skills
- 🔗 **Dependency Graph** — what must happen before what, with no circular deps
- 🗓️ **Day-by-Day Timeline** — parallelised where possible, respecting dependencies
- 👥 **Skill-Matched Assignments** — each task goes to the right person based on their profile
- ⚠️ **Risk Report** — overall score (0–10) + individual risks rated 🔴 High / 🟡 Medium / 🟢 Low
- 💡 **Improvement Insights** — specific, actionable suggestions to reduce risk
- 🔄 **Auto-Iteration** — if risk > 5.0, the agent loops back and improves the plan automatically

---

## 🔄 How It Works

The agent is a **self-improving LangGraph workflow**. Here's the full execution path:

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                    ProjectState  (shared memory)                  │
  │  project_description · team_members · tasks · schedule            │
  │  assignments · risks · risk_score · insights · iteration_count    │
  └──────────────────────┬───────────────────────────────────────────┘
                         │
            ┌────────────▼────────────┐
            │    1. Task Generation   │  Break project into 6–12 tasks
            └────────────┬────────────┘
                         │
            ┌────────────▼────────────┐
            │  2. Dependency Mapping  │  "What must come first?"
            └────────────┬────────────┘
                         │
            ┌────────────▼────────────┐
            │      3. Scheduling      │  Build day-by-day timeline
            └────────────┬────────────┘
                         │
            ┌────────────▼────────────┐
            │    4. Task Allocation   │  Match skills → tasks
            └────────────┬────────────┘
                         │
            ┌────────────▼────────────┐
            │    5. Risk Assessment   │◄──────────────┐
            │    "Score: X / 10.0"    │               │
            └────────────┬────────────┘               │
                         │                            │
           ┌─────────────┴──────────────┐             │
           │   risk > 5.0 AND           │             │
           │   iterations < max?        │             │
           └──┬─────────────────────┬───┘             │
             YES                    NO                │
              │                     │                 │
  ┌───────────▼──────┐   ┌──────────▼──────────┐     │
  │ 6. Insight       │   │  7. Finalise Plan   │     │
  │    Generation    │──►│  (assemble output)  │     │
  └──────────────────┘   └─────────────────────┘     │
              │                                       │
              └───────────────────────────────────────┘
                        (loop back to step 5)
```

> **The key innovation:** steps 5 → 6 → 5 form a **self-improvement loop**. The agent keeps iterating until it either achieves acceptable risk OR hits the `max_iterations` cap — just like a real delivery lead would.

---

## 📂 Project Structure

```
ai-project-manager-assistant/
│
├── main.py                    # CLI entry point (argparse)
│
├── src/
│   ├── state.py               # ProjectState TypedDict — shared agent memory
│   ├── prompts.py             # All 6 LLM prompt templates (single source of truth)
│   ├── nodes.py               # One function per graph node
│   ├── graph.py               # Wires nodes → LangGraph StateGraph + conditional edge
│   ├── llm_factory.py         # Auto-selects OpenAI vs Azure OpenAI from env vars
│   ├── team_loader.py         # CSV → List[TeamMember] with validation
│   └── reporter.py            # Console pretty-print + JSON export
│
├── data/
│   └── team.csv               # Sample 6-person engineering team
│
├── .env.example               # Copy → .env, fill your API key
└── requirements.txt
```

---

## 🚀 Quickstart

### 1. Clone & install

```bash
git clone https://github.com/MadanMohan0537/ai-project-manager-assistant.git
cd ai-project-manager-assistant

python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### 2. Add your API key

```bash
cp .env.example .env
```

```env
# OpenAI
OPENAI_API_KEY=sk-...

# — OR — Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-02-01
```

### 3. Run

```bash
# Quick demo (built-in food delivery example)
python main.py

# Your own project
python main.py --project "Build a B2B SaaS invoicing platform with multi-tenant support"

# Custom team + save JSON output
python main.py --project "..." --team data/team.csv --save

# Control iteration depth
python main.py --project "..." --max-iterations 2
```

---

## 📊 Sample Output

<details>
<summary><b>Click to expand full sample output</b></summary>

```
══════════════════════════════════════════════════════════════════════
  🚀  AI PROJECT MANAGER — FINAL PLAN
══════════════════════════════════════════════════════════════════════

📋  Project: Build a mobile application for food delivery...
    Tasks        : 10
    Total days   : 32
    Team size    : 6
    Risk score   : 4.2 / 10.0  ✅
    Iterations   : 2

──────────────────────────────────────────────────────────────────────
  TASKS
──────────────────────────────────────────────────────────────────────
  [T1] System Architecture & API Design  (3 days)
       Skills : Python, REST API, System Design
       Depends: none

  [T2] Database Schema & Backend Setup  (4 days)
       Skills : Python, PostgreSQL, FastAPI
       Depends: T1

  [T3] Mobile UI Development  (6 days)
       Skills : React Native, iOS, Android
       Depends: T1
  ...

──────────────────────────────────────────────────────────────────────
  SCHEDULE  (day 0 = project start)
──────────────────────────────────────────────────────────────────────
  Task                           Assignee           Start    End
  ─────────────────────────────  ─────────────────  ──────  ──────
  System Architecture            Alice Chen             0      3
  Mobile UI Wireframes           Carol Santos           0      4
  Database Schema                Alice Chen             3      7

──────────────────────────────────────────────────────────────────────
  RISKS
──────────────────────────────────────────────────────────────────────
  🔴 [Timeline] Alice is on the critical path for 4 sequential tasks
       Mitigation: Pair Frank with Alice on T4 to reduce blocking

  🟡 [Technical] Real-time tracking adds WebSocket complexity
       Mitigation: Prototype WebSocket layer in week 1

  🟢 [Resource] QA capacity may be stretched in final sprint
       Mitigation: Automate regression tests from week 2

──────────────────────────────────────────────────────────────────────
  IMPROVEMENT INSIGHTS  (iteration 2 of 2)
──────────────────────────────────────────────────────────────────────
  1. Move T7 (Payment Integration) earlier to unblock T9 and T10
  2. Split T5 (Mobile UI) into two parallel tracks: order flow + profile
  3. Add a dedicated spike for WebSocket research before T8 begins
══════════════════════════════════════════════════════════════════════
```

</details>

---

## 🧠 Deep Dive: How Each Piece Works

<details>
<summary><b>ProjectState — The Agent's Shared Memory</b></summary>

Every node reads from and writes to a single `TypedDict`. Nothing is re-explained between steps — the full project context travels through every node.

```python
class ProjectState(TypedDict):
    project_description: str       # What you want to build
    team_members: List[TeamMember] # Your team (from CSV)
    tasks: List[Task]              # Generated + enriched tasks
    schedule: List[ScheduleEntry]  # Day-by-day timeline
    assignments: List[Assignment]  # Who does what
    risks: List[RiskItem]          # Risks with severity ratings
    risk_score: float              # 0.0–10.0 overall risk
    insights: List[str]            # Improvement suggestions
    iteration_count: int           # How many loops have run
    max_iterations: int            # Safety cap (never infinite)
    final_plan: Optional[dict]     # Assembled at the end
```

> Each node only returns the fields it changed — LangGraph merges them automatically.

</details>

<details>
<summary><b>The Self-Improvement Loop</b></summary>

The loop lives in two lines of `src/graph.py`:

```python
graph.add_conditional_edges(
    "risk_assessment",
    _should_iterate,           # "improve" or "finalise"
    {"improve": "insight_generation", "finalise": "finalise_plan"},
)
graph.add_edge("insight_generation", "risk_assessment")   # Loop back
```

And the decision function:

```python
def _should_iterate(state: ProjectState) -> str:
    if state["risk_score"] > 5.0 and state["iteration_count"] < state["max_iterations"]:
        return "improve"   # Generate insights, then re-score
    return "finalise"      # Risk acceptable — wrap up
```

This mirrors exactly how a real delivery lead thinks: *assess → identify problems → fix → reassess → ship.*

</details>

<details>
<summary><b>Node Responsibilities at a Glance</b></summary>

| Node | Responsibility | Key prompt instruction |
|---|---|---|
| `task_generation_node` | Break project into 6–12 tasks | "Return tasks with estimated_days and required_skills" |
| `dependency_mapping_node` | Add dependency IDs to each task | "Only add technically necessary dependencies" |
| `scheduling_node` | Assign start/end days | "Parallelise where possible" |
| `allocation_node` | Match team skills → tasks | "Use skills from the team CSV" |
| `risk_assessment_node` | Score risk 0–10 + list risks | "Return risk_score as a float" |
| `insight_generation_node` | Suggest 3–5 improvements | "Be specific — name tasks and people" |
| `finalise_plan_node` | Assemble output dict | Pure Python — no LLM call |

</details>

<details>
<summary><b>Provider Flexibility — OpenAI or Azure OpenAI</b></summary>

`src/llm_factory.py` auto-detects your provider at startup:

```
AZURE_OPENAI_API_KEY set?  →  AzureChatOpenAI
OPENAI_API_KEY set?        →  ChatOpenAI
Neither?                   →  EnvironmentError with clear message
```

Temperature is `0.2` — reliable JSON output without repetitive phrasing across iterations.

</details>

---

## ⚙️ CLI Reference

| Flag | Default | Description |
|---|---|---|
| `--project` | Built-in food delivery example | Free-text project description |
| `--team` | `data/team.csv` | Path to team members CSV |
| `--max-iterations` | `3` | Max improvement loop passes |
| `--save` | off | Write `outputs/plan.json` |

---

## 🔧 Customisation

**Change the risk threshold** — in `src/graph.py`:
```python
ACCEPTABLE_RISK_THRESHOLD = 4.0  # Stricter → more iterations
ACCEPTABLE_RISK_THRESHOLD = 7.0  # More lenient → exits sooner
```

**Use GPT-4o for higher quality:**
```env
OPENAI_MODEL_NAME=gpt-4o
```

**Add team members** — just add a row to `data/team.csv`:
```csv
Grace Kim,UX designer with Figma and design systems experience
```

**Add a new agent step** (e.g. cost estimation):
1. Add the prompt to `src/prompts.py`
2. Write the node function in `src/nodes.py`
3. Register it in `src/graph.py`
4. Add the new field to `ProjectState` in `src/state.py`

---

## 🛠️ Stack

| Component | Library | Why |
|---|---|---|
| Agent workflow | `langgraph` | Stateful graphs with loops and conditionals |
| LLM client | `langchain-openai` | Unified interface for OpenAI + Azure OpenAI |
| Structured I/O | `langchain-core` | Message types, prompt templates |
| Team data | `pandas` | Clean CSV ingestion with validation |
| Secrets | `python-dotenv` | Loads `.env` before any imports |

---

## 🤔 Design Decisions

<details>
<summary><b>Why one LLM call per node instead of one big prompt?</b></summary>

Each node has a single, focused responsibility. This makes failures easy to diagnose ("the scheduling node returned bad JSON"), prompts easier to tune independently, and the iteration loop meaningful — you can re-run just the risk and insight nodes without regenerating tasks from scratch.

</details>

<details>
<summary><b>Why TypedDict instead of Pydantic?</b></summary>

TypedDict is lightweight, fully type-checked by mypy/Pyright, and LangGraph natively merges dicts returned from nodes — you only need to return the fields you changed. For production hardening, adding per-node Pydantic validation is a worthwhile next step.

</details>

<details>
<summary><b>Why is finalise_plan_node a graph node if it makes no LLM call?</b></summary>

It keeps the graph contract consistent — every node receives state and returns state updates. It also makes the "assembly" step visible in execution logs and easy to extend later (e.g., adding a summary LLM call).

</details>

---

## 📚 Further Reading

- 📖 [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- 🔗 [LangChain OpenAI Integration](https://python.langchain.com/docs/integrations/chat/openai/)
- ✍️ [Original inspiration — Day 17: Building AI Agents](https://srilaxmi.substack.com/p/day-17-of-building-ai-agents-building) by Sri Laxmi

---

## 🙏 Credits

Inspired by **Sri Laxmi's** [AI Agents blog series](https://srilaxmi.substack.com/). This repository expands on the original concept with a modular file structure, Azure OpenAI support, a CLI interface, detailed documentati