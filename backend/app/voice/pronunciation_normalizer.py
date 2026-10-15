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

    _DIGIT_WORDS = {
        "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
        "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
    }
    # Optional +country code, then 10-15 digits that may be separated by single spaces, dashes, dots or brackets
    _PHONE_RE = re.compile(r"(?<![\w.])(\+?)(\(?\d[\d\s\-().]{5,}\d)(?![\w])")

    @staticmethod
    def _digits_to_words(digits: str) -> str:
        return " ".join(PronunciationNormalizer._DIGIT_WORDS[d] for d in digits)

    @staticmethod
    def _group_digits(digits: str) -> List[str]:
        n = len(digits)
        if n == 10:
            return [digits[:5], digits[5:]]  # Indian style 5-5
        if n == 11 and digits.startswith("1"):
            return [digits[:1], digits[1:4], digits[4:7], digits[7:]]
        groups, i = [], 0
        while i < n:
            size = 4 if (n - i) in (4, 7, 8) else 3
            groups.append(digits[i:i + size])
            i += size
        return groups

    @staticmethod
    def speak_phone_numbers(text: str) -> str:
        """Rewrites phone-number-like digit runs as digit words in comma-separated groups."""
        def _sub(match: "re.Match") -> str:
            plus, body = match.group(1), match.group(2)
            digits = re.sub(r"\D", "", body)
            if not 10 <= len(digits) <= 15:
                return match.group(0)
            # A plain 4-digit-or-shorter amount/year never reaches here; require phone-like length.
            spoken = ""
            if plus:
                # Country code: 1-3 leading digits when the full number exceeds 10 digits
                cc_len = len(digits) - 10 if 11 <= len(digits) <= 13 else 0
                if cc_len:
                    spoken = "plus " + PronunciationNormalizer._digits_to_words(digits[:cc_len]) + ", "
                    digits = digits[cc_len:]
                else:
                    spoken = "plus "
            groups = [PronunciationNormalizer._digits_to_words(g) for g in PronunciationNormalizer._group_digits(digits)]
            return spoken + ", ".join(groups)

        return PronunciationNormalizer._PHONE_RE.sub(_sub, text)

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

        # 5. Phone numbers: speak digit by digit in comma-separated groups so TTS never reads
        # them as one large number. E.g. "+91 9876543210" -> "plus nine one, nine eight seven six five, four three two one zero"
        normalized = PronunciationNormalizer.speak_phone_numbers(normalized)

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
