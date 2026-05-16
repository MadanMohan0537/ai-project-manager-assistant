# 🤖 AI Project Manager Assistant

> Turn a plain-English project idea into a **complete, risk-aware project plan** in seconds — powered by LangGraph, LangChain, and GPT-4o-mini.

---

## 📌 What Is This?

Most project planning tools require you to already know your tasks, dependencies, and timeline. This agent does it for you.

You give it:
1. A one-paragraph description of your project
2. A CSV file listing your team members and their skills

The agent returns:
- A structured task breakdown (8–12 tasks)
- A dependency graph (what must happen before what)
- A day-by-day timeline
- Skill-matched task assignments per team member
- A risk report with severity ratings
- Actionable improvement suggestions (auto-iterated until risk is acceptable)

---

## 🏗️ Architecture

The system is built as a **LangGraph stateful workflow** — a directed graph where each node is an LLM call that reads from and writes to a shared state object.

```
┌─────────────────────────────────────────────────────────┐
│                    ProjectState (shared)                 │
│  project_description │ team_members │ tasks             │
│  schedule │ assignments │ risks │ risk_score │ insights  │
└─────────────────────────────────────────────────────────┘
                          │
             ┌────────────▼────────────┐
             │     Task Generation     │  Node 1
             │  "Break this into tasks"│
             └────────────┬────────────┘
                          │
             ┌────────────▼────────────┐
             │   Dependency Mapping    │  Node 2
             │  "What must come first?"│
             └────────────┬────────────┘
                          │
             ┌────────────▼────────────┐
             │       Scheduling        │  Node 3
             │  "Build the timeline"   │
             └────────────┬────────────┘
                          │
             ┌────────────▼────────────┐
             │     Task Allocation     │  Node 4
             │  "Match skills → tasks" │
             └────────────┬────────────┘
                          │
             ┌────────────▼────────────┐
             │     Risk Assessment     │  Node 5
             │  "Score: X/10"          │◄──────────┐
             └────────────┬────────────┘           │
                          │                        │
              ┌───────────┴──────────┐             │
              │  risk > 5.0          │             │
              │  AND iters < max?    │             │
              └──┬────────────────┬──┘             │
               YES                NO               │
                │                 │                │
    ┌───────────▼──────┐   ┌──────▼───────────┐   │
    │ Insight          │   │  Finalise Plan   │   │
    │ Generation       │   │  (assemble JSON) │   │
    │ Node 6           ├───┘  Node 7          │   │
    └──────────────────┘                      │   │
              │                               │   │
              └───────────────────────────────┘   │
              (loop back to risk_assessment) ──────┘
```

### Why LangGraph?

Traditional LLM chains go A → B → C and stop. LangGraph adds:

- **Shared state**: every node reads and enriches the same object; nothing is re-explained between steps
- **Conditional edges**: the `should_iterate` function routes execution back into a loop until risk is acceptable
- **Hard iteration cap**: `max_iterations` guarantees the loop always terminates even if risk stays high

---

## 📂 Project Structure

```
ai-project-manager-assistant/
│
├── main.py                    # CLI entry point
│
├── src/
│   ├── __init__.py
│   ├── state.py               # ProjectState TypedDict (shared memory)
│   ├── prompts.py             # All LLM prompt templates (single source of truth)
│   ├── nodes.py               # One function per graph node
│   ├── graph.py               # Wires nodes into the LangGraph StateGraph
│   ├── llm_factory.py         # OpenAI / Azure OpenAI initialisation
│   ├── team_loader.py         # CSV → List[TeamMember]
│   └── reporter.py            # Pretty-print + JSON export
│
├── data/
│   └── team.csv               # Sample 6-person engineering team
│
├── .env.example               # Copy → .env, fill in your API key
├── .gitignore
└── requirements.txt
```

---

## 🧠 How Each File Works

### `src/state.py` — The Agent's Memory

Defines `ProjectState`, a `TypedDict` that every node reads from and writes to:

```python
class ProjectState(TypedDict):
    project_description: str       # What you want to build
    team_members: List[TeamMember] # Your team (from CSV)
    tasks: List[Task]              # Generated + enriched tasks
    schedule: List[ScheduleEntry]  # Day-by-day timeline
    assignments: List[Assignment]  # Who does what (and why)
    risks: List[RiskItem]          # Identified risks with severity
    risk_score: float              # 0.0–10.0 overall risk
    insights: List[str]            # Improvement suggestions
    iteration_count: int           # How many loops have run
    max_iterations: int            # Safety cap
    final_plan: Optional[dict]     # Assembled at the end
```

**Why TypedDict?** It's lightweight (no Pydantic overhead), fully type-checked by mypy/Pyright, and LangGraph natively merges dicts returned from nodes — you only need to return the fields you changed.

---

### `src/prompts.py` — All LLM Instructions

All six prompts live here, kept completely separate from business logic. This means:

- Tweaking a prompt never touches node or graph code
- You can A/B test prompts by changing one file
- Prompts are readable and auditable in isolation

Each prompt asks the model to return **only valid JSON** — no prose, no markdown fences. The `_parse_json()` helper in `nodes.py` handles the rare case where the model still wraps output in code fences.

---

### `src/nodes.py` — The Six Agent Steps

Each function follows the same contract:
- **Input**: full `ProjectState`
- **Work**: one focused LLM call
- **Output**: `dict` of only the fields it changed (LangGraph merges this)

| Node | What it does | Key prompt instruction |
|---|---|---|
| `task_generation_node` | Breaks the project into 6–12 tasks | "Return tasks with estimated_days and required_skills" |
| `dependency_mapping_node` | Adds dependency IDs to each task | "Only add technically necessary dependencies" |
| `scheduling_node` | Assigns start/end days respecting deps | "Parallelise where possible" |
| `allocation_node` | Matches team skills to task needs | "Use skills from the team CSV" |
| `risk_assessment_node` | Scores risk 0–10 + lists risk items | "Return risk_score as a float" |
| `insight_generation_node` | Suggests 3–5 concrete improvements | "Be specific — name tasks and people" |
| `finalise_plan_node` | Assembles the complete output dict | Pure Python — no LLM call |

---

### `src/graph.py` — The Workflow Wiring

```python
graph.add_conditional_edges(
    "risk_assessment",
    _should_iterate,          # Returns "improve" or "finalise"
    {
        "improve":  "insight_generation",
        "finalise": "finalise_plan",
    },
)
graph.add_edge("insight_generation", "risk_assessment")  # Loop back
```

The `_should_iterate` function is the brain of the loop:

```python
def _should_iterate(state: ProjectState) -> str:
    if state["risk_score"] > 5.0 and state["iteration_count"] < state["max_iterations"]:
        return "improve"   # Run insights, then re-score
    return "finalise"      # Good enough — wrap up
```

This is exactly how a real delivery lead works: assess → identify improvements → reassess → repeat until acceptable.

---

### `src/llm_factory.py` — Provider Flexibility

Supports both OpenAI and Azure OpenAI. The factory checks environment variables at startup:

```
AZURE_OPENAI_API_KEY set?  →  Use AzureChatOpenAI
OPENAI_API_KEY set?        →  Use ChatOpenAI
Neither set?               →  EnvironmentError with a clear message
```

Temperature is set to `0.2` by default — low enough for reliable JSON output, high enough to avoid repetitive phrasing across iterations.

---

### `src/team_loader.py` — CSV Ingestion

Reads `data/team.csv` into `List[TeamMember]` using pandas. Handles:
- Missing file → `FileNotFoundError` with the resolved path
- Missing columns → `ValueError` with column names found vs. required
- Case-insensitive column names (normalised to lowercase)

---

### `data/team.csv` — Sample Team

```csv
name,profile
Alice Chen,Senior Python backend developer with 7 years experience...
Bob Kumar,Full-stack JavaScript developer specialising in React...
Carol Santos,Mobile developer with 6 years in React Native and Flutter...
David Lee,DevOps and cloud infrastructure engineer...
Eva Martinez,QA engineer and automation specialist...
Frank Osei,Data engineer with payment gateway integration experience...
```

The `profile` column is free-text — the LLM reads it directly to match skills to tasks. You can describe people however makes sense for your team.

---

## 🚀 Quickstart

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/ai-project-manager-assistant.git
cd ai-project-manager-assistant
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure your API key

```bash
cp .env.example .env
```

Open `.env` and add your key:

```env
OPENAI_API_KEY=sk-...
```

Or for Azure OpenAI:

```env
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-02-01
```

### 5. Run it

```bash
# Default example project (food delivery app)
python main.py

# Your own project
python main.py --project "Build a B2B SaaS invoicing platform with multi-tenant support"

# Custom team file + save output
python main.py --project "..." --team data/team.csv --save

# Limit to 2 improvement iterations
python main.py --project "..." --max-iterations 2
```

---

## 📊 Sample Output

```
══════════════════════════════════════════════════════════════════════
  🚀  AI PROJECT MANAGER — FINAL PLAN
══════════════════════════════════════════════════════════════════════

📋  Project: Build a mobile application for food delivery...
    Tasks        : 10
    Total days   : 32
    Team size    : 6
    Risk score   : 4.2 / 10.0
    Iterations   : 2

──────────────────────────────────────────────────────────────────────
  TASKS
──────────────────────────────────────────────────────────────────────
  [T1] System Architecture & API Design  (3 days)
       Skills : Python, REST API, System Design
       Depends: none
       Define service boundaries, API contracts, and data models

  [T2] Database Schema & Backend Setup  (4 days)
       Skills : Python, PostgreSQL, FastAPI
       Depends: T1
  ...

──────────────────────────────────────────────────────────────────────
  SCHEDULE  (day 0 = project start)
──────────────────────────────────────────────────────────────────────
  Task                           Assignee           Start    End
  ------------------------------ ------------------ ------ ------
  System Architecture            Alice Chen             0      3
  Mobile UI Wireframes           Carol Santos           0      4
  Database Schema                Alice Chen             3      7
  ...

──────────────────────────────────────────────────────────────────────
  RISKS
──────────────────────────────────────────────────────────────────────
  🔴 [Timeline] Alice is on the critical path for 4 sequential tasks
       Mitigation: Pair Frank with Alice on T4 to reduce blocking
  🟡 [Technical] Real-time tracking adds latency complexity
       Mitigation: Use a proven WebSocket library; prototype in week 1
  🟢 [Resource] Eva's QA capacity may be stretched in final sprint
       Mitigation: Automate regression tests early

──────────────────────────────────────────────────────────────────────
  IMPROVEMENT INSIGHTS
──────────────────────────────────────────────────────────────────────
  1. Move T7 (Payment Integration) earlier to unblock T9 and T10
  2. Split T5 (Mobile UI) into two parallel tracks: order flow + profile
  3. Add a dedicated spike task for WebSocket research before T8
══════════════════════════════════════════════════════════════════════
```

---

## ⚙️ Configuration Reference

| Flag | Default | Description |
|---|---|---|
| `--project` | Food delivery app description | Free-text project description |
| `--team` | `data/team.csv` | Path to team CSV file |
| `--max-iterations` | `3` | Max improvement loop passes |
| `--save` | off | Write `outputs/plan.json` |

---

## 🔧 Customisation

### Change the risk threshold

In `src/graph.py`, adjust `ACCEPTABLE_RISK_THRESHOLD`:

```python
ACCEPTABLE_RISK_THRESHOLD = 4.0  # Stricter — more iterations
ACCEPTABLE_RISK_THRESHOLD = 7.0  # More lenient — exits sooner
```

### Use a different model

Set `OPENAI_MODEL_NAME=gpt-4o` in your `.env` for higher quality at higher cost.

### Add more team members

Just add rows to `data/team.csv`:

```csv
Grace Kim,UX designer with Figma, user research, and design systems experience
```

### Extend the workflow

To add a new step (e.g., a cost estimation node):

1. Write a prompt in `src/prompts.py`
2. Write the node function in `src/nodes.py`
3. Register it and add edges in `src/graph.py`
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

**Why not use Pydantic for output validation?**  
The LLM outputs are validated by the prompts themselves (strict JSON schema instructions) and by `_parse_json()`. Adding a Pydantic layer would require defining 7 extra models and would make the code harder to modify. For production use, adding Pydantic validation per node is a worthwhile improvement.

**Why one LLM call per node instead of one big prompt?**  
Each node has a single, focused responsibility. This makes failures easy to diagnose ("the scheduling node returned bad JSON"), prompts easier to tune independently, and the iteration loop meaningful — you can re-run just the risk and insight nodes without regenerating tasks.

**Why is `finalise_plan_node` a graph node if it makes no LLM call?**  
It keeps the graph contract consistent — every node receives state and returns state updates. It also makes the "assembly" step visible in logs and easy to extend (e.g., adding a summary LLM call later).

---

## 📚 Further Reading

- [LangGraph documentation](https://langchain-ai.github.io/langgraph/)
- [LangChain OpenAI integration](https://python.langchain.com/docs/integrations/chat/openai/)
- [Original blog post — Day 17: Building AI Agents](https://srilaxmi.substack.com/p/day-17-of-building-ai-agents-building)

---

## 🙏 Credits

Inspired by **Sri Laxmi's** excellent [AI Agents blog series](https://srilaxmi.substack.com/). This repository expands on the original concept with a modular file structure, Azure OpenAI support, CLI interface, detailed inline documentation, and an improved iteration loop.

---

## 📄 License

MIT License — free to use, modify, and distribute.
