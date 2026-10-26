"""
Smart IVR & Answering Machine Detection (AMD) Engine
Analyzes streaming telephony transcripts to detect IVR menus, keypad prompts,
voicemails, call-forwarding queues, and operator announcements in real time (sub-50ms).
"""

import re
from typing import Optional, Dict, Any, Tuple, List


class IVRDetectionResult:
    def __init__(
        self,
        is_ivr: bool,
        symptom_type: Optional[str] = None,
        matched_phrase: Optional[str] = None,
        confidence: float = 0.0,
        recommended_action: str = "continue"
    ):
        self.is_ivr = is_ivr
        self.symptom_type = symptom_type
        self.matched_phrase = matched_phrase
        self.confidence = confidence
        self.recommended_action = recommended_action

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_ivr": self.is_ivr,
            "symptom_type": self.symptom_type,
            "matched_phrase": self.matched_phrase,
            "confidence": self.confidence,
            "recommended_action": self.recommended_action
        }


class SmartIVRDetector:
    """Fast-path regex and heuristic IVR/Machine detector."""

    # 1. DTMF & IVR Keypad Menu Prompts
    DTMF_PATTERNS = [
        r"\b(?:press|dial|hit|enter)\s+(?:one|two|three|four|five|six|seven|eight|nine|zero|\d+)\b",
        r"\b(?:press|dial)\s+(?:pound|hash|star|asterisk)\b",
        r"\bfor\s+[a-zA-Z\s]+\s+(?:press|dial)\s+(?:one|two|three|four|five|six|seven|eight|nine|zero|\d+)\b",
        r"\bto\s+speak\s+(?:with|to)\s+(?:an?\s+)?(?:agent|representative|specialist|operator)\b",
        r"\bmain\s+menu\b",
        r"\b(?:ivr|automated)\s+menu\b",
        r"\b(?:ek|do|teen|char|panch|\d+)\s+dabaye\b",  # Hindi: press 1, 2, 3
        r"\b(?:ek|be|tran|char|paanch|\d+)\s+dabavo\b",  # Gujarati: press 1, 2, 3
        r"\b(?:marque|pulse|oprima)\s+(?:el\s+)?(?:uno|dos|tres|cuatro|cinco|\d+)\b",  # Spanish: marque 2 / marque dos
        r"\bpara\s+[a-zA-Z\s]+\s+(?:marque|pulse|oprima)\s+(?:el\s+)?(?:uno|dos|tres|cuatro|cinco|\d+)\b",
    ]

    # 2. Voicemail & Answering Machine Prompts
    VOICEMAIL_PATTERNS = [
        r"\b(?:leave|record)\s+(?:a|your)\s+(?:message|voicemail)\b",
        r"\bafter\s+the\s+(?:tone|beep|sound)\b",
        r"\bat\s+the\s+(?:tone|beep)\b",
        r"\bmailbox\s+is\s+(?:full|unavailable)\b",
        r"\bvoicemail\s+box\s+is\s+(?:full|unavailable)\b",
        r"\b(?:subscriber|party)\s+(?:is\s+not\s+available|cannot\s+be\s+reached|is\s+busy)\b",
        r"\bplease\s+leave\s+your\s+name\s+and\s+number\b",
        r"\byou\s+have\s+reached\s+the\s+voicemail\s+of\b",
        r"\bcall\s+(?:has\s+been|is)\s+forwarded\s+to\s+(?:an?\s+)?(?:automated\s+voice\s+messaging|voice\s*mail|voicemail)\b",
        r"\b(?:forwarded|transferred|directed)\s+to\s+(?:voice\s*mail|voicemail)\b",
        r"\b(?:voice\s*mail|voicemail)\b",
        r"\brecord\s+(?:your\s+)?message\s+at\s+the\s+beep\b",
        r"\bbeep\s+ke\s+baad\b",  # Hindi voicemail: after beep
        r"\b(?:apna\s+)?(?:sandesh|message)\s+(?:record|chhoden|chhode)\b",  # Hindi record message
        r"\bdeje\s+su\s+mensaje\s+despues\s+del\s+tono\b",     # Spanish voicemail
    ]

    # 3. Call Forwarding & Automated Waiting Queue
    FORWARDING_QUEUE_PATTERNS = [
        r"\bplease\s+hold\s+(?:while|on)\b",
        r"\b(?:transferring|connecting)\s+your\s+call\b",
        r"\ball\s+(?:our\s+)?(?:agents|representatives|operators)\s+are\s+(?:currently\s+)?busy\b",
        r"\byour\s+call\s+is\s+important\s+to\s+us\b",
        r"\byou\s+are\s+(?:currently\s+)?caller\s+number\s+\d+\b",
        r"\bestimated\s+wait\s+time\b",
        r"\bhold\s+the\s+line\b",
        r"\bkripya\s+line\s+par\s+bane\s+rahein\b",  # Hindi: please hold
        r"\bpor\s+favor\s+mantengase\s+en\s+la\s+linea\b",  # Spanish: hold the line
    ]

    # 4. Telecom Carrier Intercepts & Network Announcements
    CARRIER_INTERCEPT_PATTERNS = [
        r"\b(?:the\s+)?number\s+(?:you\s+(?:have\s+)?)?(?:dialed|called)?\s*is\s+(?:currently\s+)?(?:switched\s+off|busy|unreachable|out\s+of\s+(?:service|reach)|temporarily\s+unavailable)\b",
        r"\b(?:the\s+)?party\s+you\s+are\s+trying\s+to\s+reach\b",
        r"\ball\s+circuits\s+are\s+busy\b",
        r"\b(?:number\s+is\s+)?out\s+of\s+coverage\s+area\b",
        r"\bcall\s+cannot\s+be\s+completed\s+as\s+dialed\b",
        r"\bcheck\s+the\s+number\s+and\s+dial\s+again\b",
        r"\b(?:switched\s+off|not\s+reachable|temporarily\s+out\s+of\s+service)\b",
        r"\baapke\s+dwara\s+dial\s+kiya\s+gaya\s+number\b",  # Hindi carrier announcement
        r"\btamara\s+dwara\s+dial\s+karelo\s+number\b",     # Gujarati carrier announcement
    ]

    # 5. Third-Party AI / Virtual Assistant Greeter & Self-Identification (Strict automated machine greeting)
    AI_ASSISTANT_PATTERNS = [
        r"\b(?:this\s+is\s+an\s+automated\s+(?:voice|assistant|receptionist|bot|system))\b",
        r"\b(?:this\s+call\s+is\s+being\s+screened\s+by\s+(?:an?\s+)?(?:ai|virtual|automated))\b",
        r"\bcall\s+assistant\s+is\s+screening\s+this\s+call\b",
        r"\bautomated\s+screening\s+system\b",
        r"\bplease\s+state\s+(?:the\s+reason\s+for\s+)?your\s+call\s+to\s+be\s+connected\b",
    ]

    # 6. Native-script (Devanagari / Gujarati) machine cues. No \b: combining vowel marks are not \w.
    INDIC_DTMF_PATTERNS = [
        r"(?:दबाएं|दबाएँ|दबाइए|दबाये|डायल करें)",
        r"(?:દબાવો|દબાવ્યા|ડાયલ કરો)",
    ]
    INDIC_VOICEMAIL_PATTERNS = [
        r"बीप\s*(?:के बाद|की आवाज़? के बाद)",
        r"(?:संदेश|मैसेज)\s*(?:रिकॉर्ड|छोड़ें|छोड़िए)",
        r"वॉयस\s*मेल|वॉइस\s*मेल",
        r"(?:आपके द्वारा डायल किया गया नंबर|यह नंबर)\s*(?:अभी\s*)?(?:बंद|उपलब्ध नहीं|पहुँच से बाहर|पहुंच से बाहर)",
        r"બીપ\s*પછી",
        r"વોઇસ\s*મેઇલ|વૉઇસ\s*મેલ",
    ]

    # 7. Caller clearly refusing to continue (any language) -> conclude politely and hang up.
    REFUSAL_PATTERNS = [
        # English
        r"\b(?:not\s+interested|no\s+thanks|don'?t\s+call\s+(?:me\s+)?again|stop\s+calling|do\s+not\s+call)\b",
        r"\b(?:i\s+)?(?:don'?t|do\s+not)\s+(?:want|wish|need)\s+to\s+(?:talk|speak|continue)\b",
        r"\b(?:please\s+)?hang\s+up\b|\bdisconnect\s+(?:the\s+)?call\b",
        # Hindi / Romanized Hinglish
        r"\b(?:baat|bat)\s*(?:bhi\s*|hi\s*|to\s*)?nahi\s*kar(?:ni|na|ta|ti)\b",
        r"\b(?:mujhe|mujhko)\s*(?:aapse\s*|tumse\s*)?(?:baat|bat)\s*(?:hi\s*|bhi\s*)?nahi\s*kar(?:ni|na|ta|ti)\b",
        r"\b(?:mujhe\s+)?(?:koi\s+)?(?:zaroorat|jarurat)\s+nahi\b",
        r"\b(?:interested|intrest)\s+(?:nahi|nahin)\b",
        r"\bphone\s+(?:mat\s+karo|nahi\s+karna|rakho|kat\s+do|rakh\s+do)\b",
        # Devanagari Hindi
        r"(?:बात|बातचीत)\s*(?:भी\s*|ही\s*|तो\s*)?नहीं\s*(?:करनी|करना|करूँगा|करूँगी)",
        r"(?:मुझे|मुझको)\s*(?:आपसे\s*|तुमसे\s*)?(?:बात|बातचीत)\s*(?:ही\s*|भी\s*)?नहीं\s*(?:करनी|करना)",
        r"(?:मुझे\s*)?(?:कोई\s*)?(?:ज़रूरत|जरूरत)\s*नहीं",
        r"(?:इंटरेस्टेड|रुचि|दिलचस्पी)\s*नहीं",
        r"फोन\s*(?:मत|ना|नहीं)\s*(?:करो|कीजिए|रखो|काटो)",
        r"कॉल\s*(?:काट|कट)\s*(?:दो|दीजिए|करो)",
        # Gujarati
        r"\b(?:tamari\s+sathe\s+)?(?:vaat|vat)\s*(?:nathi|nahi)\s*karvi\b",
        r"મારે\s*(?:તમારી\s*સાથે\s*)?(?:કોઈ\s*)?(?:વાત|જરૂર)\s*નથી",
        r"(?:વાત\s*(?:નથી\s*કરવી|નથી\s*જોઈતી)|રસ\s*નથી)",
        r"ફોન\s*(?:મૂકો|કાપો|ન\s*કરો)",
        # Spanish
        r"\bno\s+me\s+interesa\b|\bno\s+quiero\s+hablar\b|\bno\s+llame\s+m[aá]s\b|\bdeje\s+de\s+llamar\b",
        # French
        r"\bpas\s+int[eé]ress[eé]\b|\bne\s+me\s+rappelez\s+plus\b|\bje\s+ne\s+veux\s+pas\s+parler\b",
        # German
        r"\bkein\s+interesse\b|\bnicht\s+interessiert\b|\brufen\s+sie\s+nicht\s+mehr\s+an\b",
    ]

    _COMPILED_INDIC_DTMF = [re.compile(p) for p in INDIC_DTMF_PATTERNS]
    _COMPILED_INDIC_VOICEMAIL = [re.compile(p) for p in INDIC_VOICEMAIL_PATTERNS]
    _COMPILED_REFUSAL = [re.compile(p, re.IGNORECASE) for p in REFUSAL_PATTERNS]

    _CLOSINGS = {
        "hi": "समझ गया, आपके समय के लिए धन्यवाद। यदि भविष्य में किसी मदद की ज़रूरत हो तो कृपया संपर्क करें। अलविदा!",
        "gu": "સમજી ગયો, તમારા સમય માટે આભાર. ભવિષ્યમાં કોઈ મદદ જોઈએ તો કૃપા કરીને સંપર્ક કરજો. આવજો!",
        "es": "Entendido, gracias por su tiempo. Si necesita ayuda en el futuro, no dude en contactarnos. ¡Adiós!",
        "fr": "C'est compris, merci pour votre temps. Si vous avez besoin d'aide à l'avenir, n'hésitez pas à nous contacter. Au revoir !",
        "de": "Verstanden, vielen Dank für Ihre Zeit. Wenn Sie in Zukunft Hilfe benötigen, melden Sie sich gerne. Auf Wiedersehen!",
        "it": "Ho capito, grazie per il suo tempo. Se dovesse avere bisogno in futuro, non esiti a contattarci. Arrivederci!",
        "pt": "Entendido, obrigado pelo seu tempo. Se precisar de ajuda no futuro, entre em contato. Até logo!",
        "ru": "Понятно, спасибо за ваше время. Если в будущем понадобится помощь, обращайтесь. До свидания!",
        "ja": "かしこまりました。お時間をいただきありがとうございました。また何かございましたらご連絡ください。失礼いたします。",
        "hinglish": "Samajh gaya, aapke samay ke liye dhanyavaad. Future mein kisi madad ki zaroorat ho to kripya sampark karein. Alvida!",
        "en": "Understood, thank you for your time. If you need any help in the future, please get in touch. Goodbye!",
    }

    @classmethod
    def detect_language(cls, text: str) -> str:
        """Cheap script/keyword language guess used only to pick a closing message."""
        if re.search(r"[઀-૿]", text):
            return "gu"
        if re.search(r"[ऀ-ॿ]", text):
            return "hi"
        low = text.lower()
        if re.search(r"\b(?:nahi|nahin|hai|mujhe|aap|kripya|dhanyavaad|baat|zaroorat|jarurat)\b", low):
            return "hinglish"
        if re.search(r"[¿¡ñáéíóú]|\b(?:no\s+quiero|gracias|hola|por\s+favor|mensaje|tono)\b", low):
            return "es"
        return "en"

    @classmethod
    def closing_for_code(cls, code: Optional[str]) -> str:
        """Static closing for a configured language code (e.g. 'hi', 'es-MX'); English if unknown."""
        return cls._CLOSINGS.get((code or "en").split("-")[0].lower(), cls._CLOSINGS["en"])

    @classmethod
    def closing_message(cls, text: str) -> str:
        """Conclusion message in the same language as the given transcript turn."""
        return cls._CLOSINGS[cls.detect_language(text)]

    @classmethod
    def is_user_refusal(cls, text: str) -> bool:
        if not text or not text.strip():
            return False
        clean = " ".join(text.lower().split())
        return any(p.search(clean) for p in cls._COMPILED_REFUSAL)

    # Compile regexes for ultra-fast matching
    _COMPILED_DTMF = [re.compile(p, re.IGNORECASE) for p in DTMF_PATTERNS]
    _COMPILED_VOICEMAIL = [re.compile(p, re.IGNORECASE) for p in VOICEMAIL_PATTERNS]
    _COMPILED_FORWARDING = [re.compile(p, re.IGNORECASE) for p in FORWARDING_QUEUE_PATTERNS]
    _COMPILED_CARRIER = [re.compile(p, re.IGNORECASE) for p in CARRIER_INTERCEPT_PATTERNS]
    _COMPILED_AI_BOT = [re.compile(p, re.IGNORECASE) for p in AI_ASSISTANT_PATTERNS]

    @classmethod
    def analyze_transcript(
        cls,
        text: str,
        enabled_rules: Optional[Dict[str, bool]] = None
    ) -> IVRDetectionResult:
        """
        Analyzes a spoken transcript turn and determines if an IVR or automated machine is speaking.
        """
        if not text or not text.strip():
            return IVRDetectionResult(is_ivr=False)

        clean_text = " ".join(text.lower().strip().split())

        # Check rules state if provided (defaulting to enabled if no dict provided)
        if enabled_rules is not None:
            check_dtmf = enabled_rules.get("ivr_dtmf_menu_detection", False)
            check_voicemail = enabled_rules.get("ivr_voicemail_detection", False)
            check_forwarding = enabled_rules.get("ivr_forwarding_queue_detection", False)
            check_carrier = enabled_rules.get("ivr_operator_carrier_detection", False)
            check_bot = enabled_rules.get("ivr_ai_bot_detection", False)
        else:
            check_dtmf = True
            check_voicemail = True
            check_forwarding = True
            check_carrier = True
            check_bot = True

        # 1. Check Carrier / Network Intercepts (Highest Priority -> Instant Disconnect)
        if check_carrier:
            for pattern in cls._COMPILED_CARRIER:
                match = pattern.search(clean_text)
                if match:
                    return IVRDetectionResult(
                        is_ivr=True,
                        symptom_type="CARRIER_OPERATOR_INTERCEPT",
                        matched_phrase=match.group(0),
                        confidence=0.98,
                        recommended_action="disconnect_immediate"
                    )

        # 2. Check DTMF / Keypad Menus (e.g. 'Press 1 for Sales')
        if check_dtmf:
            for pattern in cls._COMPILED_DTMF:
                match = pattern.search(clean_text)
                if match:
                    return IVRDetectionResult(
                        is_ivr=True,
                        symptom_type="DTMF_IVR_MENU",
                        matched_phrase=match.group(0),
                        confidence=0.96,
                        recommended_action="conclude_and_hangup"
                    )

        if check_dtmf:
            for pattern in cls._COMPILED_INDIC_DTMF:
                match = pattern.search(clean_text)
                if match:
                    return IVRDetectionResult(
                        is_ivr=True,
                        symptom_type="DTMF_IVR_MENU",
                        matched_phrase=match.group(0),
                        confidence=0.94,
                        recommended_action="conclude_and_hangup"
                    )

        if check_voicemail:
            for pattern in cls._COMPILED_INDIC_VOICEMAIL:
                match = pattern.search(clean_text)
                if match:
                    return IVRDetectionResult(
                        is_ivr=True,
                        symptom_type="VOICEMAIL_MACHINE",
                        matched_phrase=match.group(0),
                        confidence=0.93,
                        recommended_action="conclude_and_hangup"
                    )

        # 3. Check Voicemail / Answering Machines (e.g. 'Leave message after beep')
        if check_voicemail:
            for pattern in cls._COMPILED_VOICEMAIL:
                match = pattern.search(clean_text)
                if match:
                    return IVRDetectionResult(
                        is_ivr=True,
                        symptom_type="VOICEMAIL_MACHINE",
                        matched_phrase=match.group(0),
                        confidence=0.95,
                        recommended_action="conclude_and_hangup"
                    )

        # 4. Check Call Forwarding & Queue Messages (e.g. 'Please hold while we transfer')
        if check_forwarding:
            for pattern in cls._COMPILED_FORWARDING:
                match = pattern.search(clean_text)
                if match:
                    return IVRDetectionResult(
                        is_ivr=True,
                        symptom_type="FORWARDING_QUEUE_MESSAGE",
                        matched_phrase=match.group(0),
                        confidence=0.90,
                        recommended_action="conclude_and_hangup"
                    )

        # 5. Check Third-Party AI / Virtual Assistant Bots
        if check_bot:
            for pattern in cls._COMPILED_AI_BOT:
                match = pattern.search(clean_text)
                if match:
                    return IVRDetectionResult(
                        is_ivr=True,
                        symptom_type="THIRD_PARTY_AI_ASSISTANT",
                        matched_phrase=match.group(0),
                        confidence=0.92,
                        recommended_action="conclude_and_hangup"
                    )

        return IVRDetectionResult(is_ivr=False, confidence=0.0, recommended_action="continue")
