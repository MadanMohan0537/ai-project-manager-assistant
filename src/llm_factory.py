"""
llm_factory.py — LLM provider selection and initialisation.

Centralises all LLM setup so main.py stays clean.
Supports both standard OpenAI and Azure OpenAI via environment variables.
"""

from __future__ import annotations

import os

from langchain_openai import AzureChatOpenAI, ChatOpenAI


def get_llm(temperature: float = 0.2):
    """
    Return the appropriate LangChain chat model based on environment variables.

    Priority:
      1. Azure OpenAI  — if AZURE_OPENAI_API_KEY is set
      2. OpenAI        — if OPENAI_API_KEY is set

    Environment variables:
      OPENAI_API_KEY          → standard OpenAI key
      OPENAI_MODEL_NAME       → model name (default: gpt-4o-mini)

      AZURE_OPENAI_API_KEY    → Azure OpenAI key
      AZURE_OPENAI_ENDPOINT   → https://<resource>.openai.azure.com/
      AZURE_OPENAI_DEPLOYMENT → deployment name
      AZURE_OPENAI_API_VERSION→ API version (default: 2024-02-01)

    Args:
        temperature: Sampling temperature. Lower = more deterministic.
                     0.2 is a good default for structured JSON output.

    Returns:
        A LangChain BaseChatModel instance.

    Raises:
        EnvironmentError: If no API key is found.
    """
    azure_key = os.getenv("AZURE_OPENAI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if azure_key:
        return AzureChatOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini"),
            openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
            api_key=azure_key,
            temperature=temperature,
        )

    if openai_key:
        return ChatOpenAI(
            model=os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini"),
            api_key=openai_key,
            temperature=temperature,
        )

    raise EnvironmentError(
        "No LLM API key found. "
        "Set OPENAI_API_KEY or AZURE_OPENAI_API_KEY in your .env file."
    )
