"""
Language rules and offline fallbacks for AI-generated agent prompts and greetings.

The LLM does the real writing. These helpers (1) tell it exactly which language(s) to write in, including
the mid-call switching rules for multi-language agents, and (2) give a correctly localized greeting when the
LLM is unavailable, so a Hindi agent never ends up with an English greeting.
"""

import re
from typing import List, Optional

from app.voice.language_switcher import language_name, normalize_code

# {name} = the agent's spoken first name. Three tones: warm, engaging, consultative.
_GREETINGS = {
    "hi": [
        "नमस्ते! मैं {name} बोल रहा हूँ। आज मैं आपकी किस प्रकार सहायता कर सकता हूँ?",
        "नमस्ते, मैं {name} हूँ। आपसे बात करके अच्छा लगा, बताइए आज आपकी प्राथमिकता क्या है?",
        "नमस्कार, मैं {name} बोल रहा हूँ। क्या मैं आपका दो मिनट का समय ले सकता हूँ?",
    ],
    "gu": [
        "નમસ્તે! હું {name} બોલું છું. આજે હું તમને કેવી રીતે મદદ કરી શકું?",
        "નમસ્તે, હું {name} છું. તમારી સાથે વાત કરીને આનંદ થયો, આજે તમારી પ્રાથમિકતા શું છે?",
        "નમસ્કાર, હું {name} બોલું છું. શું હું તમારો બે મિનિટનો સમય લઈ શકું?",
    ],
    "es": [
        "¡Hola! Soy {name}. ¿En qué puedo ayudarle hoy?",
        "Hola, soy {name}. Gracias por atender, ¿cuál es su prioridad en este momento?",
        "Buenos días, le habla {name}. ¿Tiene dos minutos para conversar?",
    ],
    "fr": [
        "Bonjour ! Ici {name}. Comment puis-je vous aider aujourd'hui ?",
        "Bonjour, je suis {name}. Merci de votre appel, quelle est votre priorité du moment ?",
        "Bonjour, {name} à l'appareil. Auriez-vous deux minutes à m'accorder ?",
    ],
    "de": [
        "Hallo! Hier ist {name}. Wie kann ich Ihnen heute helfen?",
        "Guten Tag, ich bin {name}. Was ist im Moment Ihre wichtigste Priorität?",
        "Guten Tag, hier spricht {name}. Haben Sie zwei Minuten Zeit für mich?",
    ],
    "it": [
        "Ciao! Sono {name}. Come posso aiutarla oggi?",
        "Buongiorno, sono {name}. Qual è la sua priorità in questo momento?",
        "Buongiorno, parla {name}. Ha due minuti per me?",
    ],
    "pt": [
        "Olá! Aqui é {name}. Como posso ajudar você hoje?",
        "Olá, sou {name}. Qual é a sua prioridade neste momento?",
        "Bom dia, aqui é {name}. Você teria dois minutos para conversar?",
    ],
    "nl": [
        "Hallo! U spreekt met {name}. Waarmee kan ik u vandaag helpen?",
        "Goedendag, ik ben {name}. Wat is op dit moment uw prioriteit?",
        "Goedendag, {name} hier. Heeft u twee minuten voor mij?",
    ],
    "ru": [
        "Здравствуйте! Это {name}. Чем я могу вам помочь сегодня?",
        "Здравствуйте, я {name}. Что для вас сейчас в приоритете?",
        "Добрый день, это {name}. Найдётся ли у вас пара минут?",
    ],
    "ja": [
        "こんにちは、{name}です。本日はどのようなご用件でしょうか？",
        "こんにちは、{name}と申します。現在、最も重視されていることは何でしょうか？",
        "お世話になっております、{name}です。少々お時間よろしいでしょうか？",
    ],
}

_LABELS = ["Direct & Warm", "Engaging Hook & Discovery", "Consultative & Professional"]


def localized_greetings(language: Optional[str], persona: str) -> Optional[List[dict]]:
    """Offline greeting options in the requested language, or None if we have no template for it."""
    templates = _GREETINGS.get(normalize_code(language))
    if not templates:
        return None
    return [{"label": label, "text": text.format(name=persona)} for label, text in zip(_LABELS, templates)]


def resolve_languages(language: Optional[str], languages: Optional[List[str]] = None) -> List[str]:
    """Opening language first, then any extra languages, without duplicates."""
    ordered = [normalize_code(language)]
    for code in languages or []:
        code = normalize_code(code)
        if code not in ordered:
            ordered.append(code)
    return ordered


def language_rules(language: Optional[str], languages: Optional[List[str]] = None) -> str:
    """The language instructions handed to the prompt-writing LLM."""
    ordered = resolve_languages(language, languages)
    primary = ordered[0]
    primary_name = language_name(primary)

    if len(ordered) > 1:
        names = ", ".join(language_name(c) for c in ordered)
        return (
            f"MANDATORY LANGUAGE RULES (multi-language agent):\n"
            f"- The call OPENS in {primary_name}. Write 'suggested_greeting' and ALL 'suggested_greetings' in {primary_name}, "
            f"in its native script, with NO romanized/transliterated words (Latin letters only for proper nouns and "
            f"template variables like {{{{company_name}}}}).\n"
            f"- Write the ENTIRE 'system_prompt' (every section, instruction and spoken example) in {primary_name}, "
            f"except the language rules below which must also be understandable in {primary_name}.\n"
            f"- Include a section titled for LANGUAGE SWITCHING (written in {primary_name}) that says: the agent speaks "
            f"only these languages: {names}; it detects the language of each caller turn and replies in that same "
            f"language in its native script; if the caller switches language mid-call it switches in that very reply "
            f"and switches back when they do; for mixed speech (e.g. Hinglish) it answers in the dominant language of "
            f"the last sentence; it never replies in a language outside the list; if the transcript looks garbled it "
            f"infers the language from context and only then asks the caller to repeat.\n"
            f"- Keep all JSON keys and 'label' values in English; only the spoken/instruction text uses the languages above."
        )
    if primary == "en":
        return "Language: English. Write the system prompt and greetings in English."
    return (
        f"MANDATORY LANGUAGE RULES (single-language agent):\n"
        f"- The agent speaks and converses ONLY in {primary_name}.\n"
        f"- Write the ENTIRE 'system_prompt' (every section, instruction and spoken example) in {primary_name}, "
        f"using its native script/characters (e.g. Devanagari for Hindi).\n"
        f"- 'suggested_greeting' and ALL 'suggested_greetings' MUST be written authentically in {primary_name}.\n"
        f"- Write every word in {primary_name}'s native script. NEVER write {primary_name} in Latin letters (no romanized/"
        f"transliterated words like 'ki taraf se' or 'baat'). Latin letters are allowed only for proper nouns "
        f"(company, person and product names) and template variables like {{{{company_name}}}}.\n"
        f"- Keep all JSON keys and 'label' values in English; only the spoken/instruction text uses {primary_name}."
    )


_NON_LATIN = frozenset("hi gu bn pa ta te th ko ja zh ru uk ar he ur el".split())


def has_romanized_speech(text: str, language: Optional[str]) -> bool:
    """True when a non-Latin-script greeting contains romanized words (e.g. Hindi 'ki taraf se' in Latin letters).

    Proper nouns (company, person, product) are capitalized, so they are ignored; template variables too.
    """
    if normalize_code(language) not in _NON_LATIN:
        return False
    cleaned = re.sub(r"\{\{.*?\}\}", " ", text or "")
    return len(re.findall(r"\b[a-z][a-z']+\b", cleaned)) >= 2


def repair_greetings(parsed: dict, language: Optional[str], persona: str) -> dict:
    """Swaps in localized template greetings when the model wrote romanized text instead of native script."""
    options = parsed.get("suggested_greetings") or []
    texts = [parsed.get("suggested_greeting", "")] + [o.get("text", "") for o in options if isinstance(o, dict)]
    if not any(has_romanized_speech(t, language) for t in texts):
        return parsed
    fixed = localized_greetings(language, persona)
    if not fixed:
        return parsed
    parsed = dict(parsed)
    parsed["suggested_greetings"] = fixed
    parsed["suggested_greeting"] = fixed[0]["text"]
    return parsed


def spoken_name(name: Optional[str]) -> str:
    """Agent name as a person would say it on the phone ('Aria Assistant' -> 'Aria')."""
    persona = (name or "").strip() or "Alex"
    for suffix in (" Agent", " Assistant", " Bot", " AI", " Specialist", " Representative"):
        if persona.endswith(suffix):
            return persona[: -len(suffix)].strip() or "Alex"
    return persona


_DEFAULT_REPROMPTS = {
    "Are you still there? I'm here if you have any questions.",
    "Hello? Are you there? Are you available?",
}
_DEFAULT_CONCLUSIONS = {
    "Thank you for your time. Have a great day!",
    "Thank you for your time. We will connect with you shortly. Goodbye!",
}
_REPROMPTS = {
    "en": "Are you still there? I'm here if you have any questions.",
    "hi": "क्या आप अभी भी लाइन पर हैं? कोई सवाल हो तो मैं यहाँ हूँ।",
    "gu": "શું તમે હજી લાઇન પર છો? કોઈ પ્રશ્ન હોય તો હું અહીં છું.",
    "es": "¿Sigue ahí? Estoy aquí si tiene alguna pregunta.",
    "fr": "Êtes-vous toujours là ? Je suis là si vous avez des questions.",
    "de": "Sind Sie noch da? Ich bin da, falls Sie Fragen haben.",
    "pt": "Você ainda está aí? Estou aqui se tiver alguma dúvida.",
    "it": "È ancora lì? Sono qui se ha qualche domanda.",
    "nl": "Bent u er nog? Ik ben er als u vragen heeft.",
    "ru": "Вы ещё на линии? Я здесь, если у вас есть вопросы.",
    "ja": "まだお電話中でしょうか？ご質問があればお知らせください。",
}


def silence_messages(configured_reprompt: Optional[str], configured_conclusion: Optional[str], language: Optional[str]):
    """(reprompt, conclusion) for the silence timeout, in the language the call is currently in.

    Text the client wrote themselves is used exactly as written; only the built-in English defaults are localized.
    """
    from app.voice.ivr_detector import SmartIVRDetector

    code = normalize_code(language)
    reprompt = (configured_reprompt or "").strip()
    if not reprompt or reprompt in _DEFAULT_REPROMPTS:
        reprompt = _REPROMPTS.get(code, _REPROMPTS["en"])
    conclusion = (configured_conclusion or "").strip()
    if not conclusion or conclusion in _DEFAULT_CONCLUSIONS:
        conclusion = SmartIVRDetector.closing_for_code(code)
    return reprompt, conclusion
