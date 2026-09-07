"""
Pronunciation Normalizer
Performs deterministic phonetic word substitutions for speech synthesis (TTS)
to ensure proper nouns, Indian cities/names, acronyms, and industry terms
are articulated with human-grade clarity.
"""

import re
from typing import List, Optional, Union, Dict, Any


class PronunciationNormalizer:
    """Replaces words in spoken text with their phonetic equivalents."""

    @staticmethod
    def normalize(text: str, rules: Optional[List[Any]] = None) -> str:
        """
        Substitutes matched words with their phonetic representations.
        Uses case-insensitive word boundary regex matching.
        """
        if not text or not text.strip() or not rules:
            return text

        normalized = text

        for rule in rules:
            word = ""
            phonetic = ""
            if hasattr(rule, "word"):
                word = getattr(rule, "word", "")
                phonetic = getattr(rule, "phonetic", "")
            elif isinstance(rule, dict):
                word = rule.get("word", "")
                phonetic = rule.get("phonetic", "")

            if not word or not phonetic or word.strip() == phonetic.strip():
                continue

            escaped_word = re.escape(word.strip())
            # Match whole word boundary (supporting abbreviations with periods like "Sq. Ft.")
            pattern = rf"(?i)(?<!\w){escaped_word}(?!\w)"
            normalized = re.sub(pattern, phonetic.strip(), normalized)

        return normalized
