"""
team_loader.py — Loads team member data from a CSV file.

The CSV must have at minimum two columns: 'name' and 'profile'.
The 'profile' column is a free-text description of the person's skills and role.

Example CSV row:
  Alice,Senior Python developer with REST API and cloud deployment experience
"""

from __future__ import annotations

from pathlib import Path
from typing import List

import pandas as pd

from .state import TeamMember


def load_team(csv_path: str | Path) -> List[TeamMember]:
    """
    Read a CSV file and return a list of TeamMember dicts.

    Args:
        csv_path: Path to the CSV file. Must contain 'name' and 'profile' columns.

    Returns:
        List of TeamMember TypedDicts.

    Raises:
        FileNotFoundError: If the CSV file does not exist.
        ValueError: If required columns are missing.
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Team CSV not found: {path.resolve()}")

    df = pd.read_csv(path)

    missing = {"name", "profile"} - set(df.columns.str.lower())
    if missing:
        raise ValueError(
            f"Team CSV is missing required columns: {missing}. "
            f"Found columns: {list(df.columns)}"
        )

    # Normalise column names to lowercase
    df.columns = df.columns.str.lower()

    team: List[TeamMember] = []
    for _, row in df.iterrows():
        team.append(
            TeamMember(
                name=str(row["name"]).strip(),
                profile=str(row["profile"]).strip(),
            )
        )

    return team
