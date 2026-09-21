"""
Pronunciation Normalizer
Performs deterministic phonetic word substitutions and acoustic entity normalization
for speech synthesis (TTS) to ensure proper nouns, Indian cities/names, acronyms,
phone numbers, currencies, and industry terms are articulated with human-grade clarity.
"""

import re
from typing import List, Optional, Union, Dict, Any


class PronunciationNormalizer:
    """Replaces words in spoken text with their phonetic equivalents and normalizes entities for TTS."""

    @staticmethod
    def normalize_telephony_entities(text: str) -> str:
        """
        Expands currencies, units, long digit sequences (phone numbers/OTPs), and punctuation
        into human-sounding spoken text so TTS doesn't stumble or speak raw symbols.
        """
        if not text or not text.strip():
            return text

        normalized = text

        # 1. Clean markdown formatting that can confuse TTS (asterisks, hashtags, backticks)
        normalized = re.sub(r"[*#`_~]", "", normalized)

        # 2. Currency symbol expansion
        # Indian Rupees: ₹1,500 or Rs. 1500 or Rs 1500 or INR 1500
        normalized = re.sub(r"(?:₹|Rs\.?\s*|INR\s*)([0-9]+(?:\.[0-9]+)?)", r"\1 rupees", normalized, flags=re.IGNORECASE)
        # US Dollars: $150 or $ 150
        normalized = re.sub(r"\$([0-9]+(?:\.[0-9]+)?)", r"\1 dollars", normalized)
        # Euros: €150
        normalized = re.sub(r"€([0-9]+(?:\.[0-9]+)?)", r"\1 euros", normalized)
        # British Pounds: £150
        normalized = re.sub(r"£([0-9]+(?:\.[0-9]+)?)", r"\1 pounds", normalized)

        # 3. Currency suffixes (Cr / L / Lakh / Crore)
        normalized = re.sub(r"\b([0-9]+(?:\.[0-9]+)?)\s*(?:Cr|cr|crores?)\b", r"\1 crore", normalized)
        normalized = re.sub(r"\b([0-9]+(?:\.[0-9]+)?)\s*(?:L|l|lakhs?|lacs?)\b", r"\1 lakh", normalized)

        # 4. Dimension and real estate units
        normalized = re.sub(r"\b(?:sq\.?\s*ft\.?|sqft)\b", "square feet", normalized, flags=re.IGNORECASE)
        normalized = re.sub(r"\b(?:sq\.?\s*m\.?|sqm)\b", "square meters", normalized, flags=re.IGNORECASE)
        normalized = re.sub(r"\b([0-9]+)\s*bhk\b", r"\1 B-H-K", normalized, flags=re.IGNORECASE)

        # 5. Spaced phone numbers and long digit strings (10-digit phone numbers: space out in natural human groups)
        # E.g. "+91 9876543210" or "9876543210" -> "98765 43210"
        def _format_phone(match):
            digits = match.group(0)
            if len(digits) == 10:
                return f"{digits[:5]} {digits[5:]}"
            return digits

        # Match standalone 10 digit strings
        normalized = re.sub(r"(?<!\d)\d{10}(?!\d)", _format_phone, normalized)

        # 6. Punctuation spacing cleanup
        normalized = re.sub(r"\s+", " ", normalized).strip()

        return normalized

    @staticmethod
    def normalize(text: str, rules: Optional[List[Any]] = None) -> str:
        """
        Substitutes matched words with their phonetic representations
        and applies telephony entity normalization.
        Uses case-insensitive word boundary regex matching.
        """
        if not text or not text.strip():
            return text

        # First run acoustic entity expansions
        normalized = PronunciationNormalizer.normalize_telephony_entities(text)

        if not rules:
            return normalized

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
