"""Language model settings read from the environment, shared by the Economy gate and the Economy client."""
import os
from typing import Optional


def resolve_llm_key() -> Optional[str]:
    """The language model key: AZURE_OPENAI_API_KEY, or else the AZURE_OPENAI_KEY alias. None when neither is set."""
    return os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_OPENAI_KEY") or None
