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

    # 1. DTMF & IVR Keypad Menu Prompts (Multi-Lingual)
    DTMF_PATTERNS = [
        # English
        r"\b(?:press|dial|hit|enter)\s+(?:one|two|three|four|five|six|seven|eight|nine|zero|\d+)\b",
        r"\b(?:press|dial)\s+(?:pound|hash|star|asterisk)\b",
        r"\bfor\s+[a-zA-Z\s]+\s+(?:press|dial)\s+(?:one|two|three|four|five|six|seven|eight|nine|zero|\d+)\b",
        r"\bto\s+speak\s+(?:with|to)\s+(?:an?\s+)?(?:agent|representative|specialist|operator)\b",
        r"\bmain\s+menu\b|\b(?:ivr|automated)\s+menu\b",
        # Hindi & Hinglish
        r"\b(?:ek|do|teen|char|panch|chhah|saat|aath|nau|shunya|\d+)\s+dabaye\b",
        r"\b(?:jankari|madad|bat|baat)\s+ke\s+liye\s+(?:ek|do|teen|\d+)\s+dabaye\b",
        # Gujarati
        r"\b(?:ek|be|tran|char|paanch|chha|saat|aath|nav|shunya|\d+)\s+dabavo\b",
        # Spanish
        r"\b(?:marque|pulse|oprima)\s+(?:el\s+)?(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|cero|\d+)\b",
        r"\bpara\s+[a-zA-Z\s]+\s+(?:marque|pulse|oprima)\s+(?:el\s+)?(?:uno|dos|tres|\d+)\b",
        r"\bmenu\s+principal\b",
        # French
        r"\b(?:appuyez|tapez|composez)\s+(?:sur\s+(?:le\s+)?)?(?:un|deux|trois|quatre|cinq|\d+)\b",
        r"\bpour\s+[a-zA-Z\s]+,?\s*(?:appuyez|tapez)\s+sur\b",
        # German
        r"\bdr[uü]cken\s+sie\s+(?:die\s+)?(?:eins|zwei|drei|vier|f[uü]nf|\d+)\b",
        r"\bf[uü]r\s+[a-zA-Z\s]+,?\s*dr[uü]cken\s+sie\b",
        # Italian
        r"\b(?:prema|preme)\s+(?:il\s+)?(?:uno|due|tre|quattro|cinque|\d+)\b",
        r"\bper\s+[a-zA-Z\s]+,?\s*prema\b",
        # Portuguese
        r"\b(?:pressione|disque|tecle)\s+(?:o\s+)?(?:um|dois|tr[eê]s|quatro|cinco|\d+)\b",
        r"\bpara\s+[a-zA-Z\s]+,\s*(?:tecle|disque)\b",
        # Dutch
        r"\bdruk\s+(?:op\s+)?(?:een|twee|drie|vier|vijf|\d+)\b",
        # Russian
        r"\b(?:нажмите|наберите)\s+(?:один|два|три|четыре|пять|\d+)\b",
        # Japanese (Romaji / phonetic)
        r"\b(?:ichi|ni|san|yon|go)\s+(?:o\s+oshite|o\s+oshi\s+kudasai)\b",
        # Arabic (phonetic/Latin transcript)
        r"\b(?:idghat|idghat\s+ala)\s+(?:wahid|ithnayn|thalatha|\d+)\b",
        # Turkish
        r"\b(?:tu[sş]lay[iı]n[iı]z?|bas[iı]n[iı]z?)\s*(?:bir|iki|[uü][cç]|\d+)?\b",
        # Polish
        r"\b(?:naci[sś]nij|wybierz)\s+(?:jeden|dwa|trzy|\d+)\b",
        # Swedish
        r"\btryck\s+(?:ett|tv[aå]|tre|\d+)\b",
        # Indonesian / Malay
        r"\btekan\s+(?:satu|dua|tiga|\d+)\b",
        # Vietnamese
        r"\bb[aấ]m\s+ph[ií]m\s+(?:m[oộ]t|hai|ba|\d+)\b",
        # Filipino / Tagalog
        r"\bpindutin\s+ang\s+(?:isa|dalawa|tatlo|\d+)\b",
    ]

    # 2. Voicemail & Answering Machine Prompts (Multi-Lingual)
    VOICEMAIL_PATTERNS = [
        # English
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
        # Hindi / Hinglish
        r"\bbeep\s+ke\s+baad\b",
        r"\b(?:apna\s+)?(?:sandesh|message)\s+(?:record|chhoden|chhode)\b",
        # Spanish
        r"\bdeje\s+(?:su\s+)?mensaje\s+despu[eé]s\s+del\s+tono\b",
        r"\bbuz[oó]n\s+de\s+voz\b|\bgrabe\s+su\s+mensaje\b",
        # French
        r"\blaissez\s+(?:un\s+)?message\s+apr[eè]s\s+le\s+bip\b",
        r"\bmessagerie\s+vocale\b|\bbo[iî]te\s+vocale\b",
        # German
        r"\bhinterlassen\s+sie\s+eine\s+nachricht\s+nach\s+dem\s+ton\b",
        r"\bmailbox\s+ist\s+voll\b|\bauf\s+den\s+anrufbeantworter\b",
        # Italian
        r"\blasciate\s+un\s+messaggio\s+dopo\s+il\s+segnale\s+acustico\b",
        r"\bsegreteria\s+telefonica\b",
        # Portuguese
        r"\bdeixe\s+(?:seu\s+)?recado\s+ap[oó]s\s+o\s+sinal\b",
        r"\bcaixa\s+postal\b|\bmensagem\s+ap[oó]s\s+o\s+bip\b",
        # Dutch
        r"\blaat\s+een\s+bericht\s+achter\s+na\s+de\s+toon\b",
        r"\bvoicemailbox\b|\bantwoordapparaat\b",
        # Russian
        r"\bоставьте\s+сообщение\s+после\s+сигнала\b",
        r"\bавтоответчик\b|\bголосовая\s+почта\b",
        # Japanese (Latin transcript)
        r"\bhatsuon\s+no\s+ato\s+ni\b|\brusu\s+den\b",
        # Arabic (phonetic/Latin)
        r"\bitruk\s+risala\s+baad\s+al-sawt\b|\bal-barid\s+al-sawti\b",
        # Turkish
        r"\bsinyal\s+sesinden\s+sonra\s+mesaj[iı]n[iı]z[iı]\s+b[iı]rak[iı]n[iı]z?\b",
        r"\bsesli\s+mesaj\b",
        # Polish
        r"\bzostaw\s+wiadomo[sś][cć]\s+po\s+d[zż]wi[eę]ku\b|\bpoczta\s+g[lł]osowa\b",
        # Swedish
        r"\bl[aä]mna\s+ett\s+meddelande\s+efter\s+tonen\b|\br[oö]stbrevl[aå]da\b",
        # Indonesian / Malay
        r"\btinggalkan\s+pesan\s+setelah\s+nada\b|\bpeti\s+suara\b|\bpesan\s+suara\b",
        # Vietnamese
        r"\b[dđ][eể]\s+l[aạ]i\s+l[oờ]i\s+nh[aắ]n\s+sau\s+ti[eế]ng\s+bip\b|\bh[oộ]p\s+th[uư]\s+tho[aạ]i\b",
    ]

    # 3. Call Forwarding & Automated Waiting Queue (Multi-Lingual)
    FORWARDING_QUEUE_PATTERNS = [
        # English
        r"\bplease\s+hold\s+(?:while|on)\b",
        r"\b(?:transferring|connecting)\s+your\s+call\b",
        r"\ball\s+(?:our\s+)?(?:agents|representatives|operators)\s+are\s+(?:currently\s+)?busy\b",
        r"\byour\s+call\s+is\s+important\s+to\s+us\b",
        r"\byou\s+are\s+(?:currently\s+)?caller\s+number\s+\d+\b",
        r"\bestimated\s+wait\s+time\b|\bhold\s+the\s+line\b",
        # Hindi / Hinglish
        r"\bkripya\s+line\s+par\s+bane\s+rahein\b",
        r"\bsabhi\s+representatives\s+vyast\s+hain\b",
        # Spanish
        r"\bpor\s+favor\s+mant[eé]ngase\s+en\s+la\s+l[ií]nea\b",
        r"\btodos\s+nuestros\s+operadores\s+est[aá]n\s+ocupados\b",
        r"\bsu\s+llamada\s+es\s+muy\s+importante\s+para\s+nosotros\b",
        # French
        r"\bvoulez-vous\s+patienter\b|\bveuillez\s+patienter\b",
        r"\btous\s+nos\s+conseillers\s+sont\s+occup[eé]s\b",
        r"\bvotre\s+appel\s+est\s+important\s+pour\s+nous\b",
        # German
        r"\bbitte\s+warten\s+sie\b|\bbleiben\s+sie\s+bitte\s+in\s+der\s+leitung\b",
        r"\balle\s+unsere\s+mitarbeiter\s+sind\s+besch[aä]ftigt\b",
        # Italian
        r"\battenda\s+in\s+linea\b|\btutti\s+i\s+nostri\s+operatori\s+sono\s+occupati\b",
        # Portuguese
        r"\bpor\s+favor\s+aguarde\s+na\s+linha\b|\btodos\s+os\s+atendentes\s+est[aã]o\s+ocupados\b",
        # Dutch
        r"\beven\s+geduld\s+alstublieft\b|\bal\s+onze\s+medewerkers\s+zijn\s+in\s+gesprek\b",
        # Russian
        r"\bпожалуйста,\s*оставайтесь\s+на\s+линии\b|\bвсе\s+операторы\s+заняты\b",
        # Turkish
        r"\bl[uü]tfen\s+hatta\s+kal[iı]n[iı]z?\b|\bt[uü]m\s+m[uü][sş]teri\s+temsilcilerimiz\s+dolu\b",
        # Polish
        r"\bprosz[eę]\s+czeka[cć]\s+na\s+po[lł][aą]czenie\b",
        # Swedish
        r"\bvar\s+god\s+dr[oö]j\b|\balla\s+v[aå]ra\s+handl[aä]ggare\s+[aä]r\s+upptagna\b",
        # Indonesian / Malay
        r"\bmohon\s+tunggu\s+sebentar\b|\bsemua\s+operator\s+sedang\s+sibuk\b",
        # Vietnamese
        r"\bxin\s+vui\s+l[oò]ng\s+ch[oờ]\s+m[aá]y\b",
    ]

    # 4. Telecom Carrier Intercepts & Network Announcements (Multi-Lingual)
    CARRIER_INTERCEPT_PATTERNS = [
        # English
        r"\b(?:the\s+)?number\s+(?:you\s+(?:have\s+)?)?(?:dialed|called)?\s*is\s+(?:currently\s+)?(?:switched\s+off|busy|unreachable|out\s+of\s+(?:service|reach)|temporarily\s+unavailable)\b",
        r"\b(?:the\s+)?party\s+you\s+are\s+trying\s+to\s+reach\b",
        r"\ball\s+circuits\s+are\s+busy\b|\b(?:number\s+is\s+)?out\s+of\s+coverage\s+area\b",
        r"\bcall\s+cannot\s+be\s+completed\s+as\s+dialed\b|\bcheck\s+the\s+number\s+and\s+dial\s+again\b",
        r"\b(?:switched\s+off|not\s+reachable|temporarily\s+out\s+of\s+service)\b",
        # Hindi / Hinglish carrier intercept
        r"\baapke\s+dwara\s+dial\s+kiya\s+gaya\s+number\b",
        r"\byah\s+number\s+abhi\s+vyast\s+hai\b",
        # Gujarati carrier intercept
        r"\btamara\s+dwara\s+dial\s+karelo\s+number\b",
        # Spanish
        r"\bel\s+n[uú]mero\s+que\s+usted\s+marc[oó]\s+(?:est[aá]\s+ocupado|no\s+est[aá]\s+disponible|est[aá]\s+apagado)\b",
        r"\bfuera\s+del\s+[aá]rea\s+de\s+cobertura\b",
        # French
        r"\ble\s+num[eé]ro\s+que\s+vous\s+avez\s+compos[eé]\s+n'est\s+pas\s+attribu[eé]\b",
        r"\bl'appareil\s+de\s+votre\s+correspondant\s+est\s+(?:[eé]teint|occup[eé])\b",
        # German
        r"\bdie\s+von\s+ihnen\s+gew[aä]hlte\s+rufnummer\s+ist\s+vor[uü]bergehend\s+nicht\s+erreichbar\b",
        r"\bder\s+teilnehmer\s+ist\s+vor[uü]bergehend\s+nicht\s+erreichbar\b",
        # Italian
        r"\bil\s+numero\s+selezionato\s+[eè]\s+inesistente\b",
        r"\bil\s+cliente\s+chiamato\s+non\s+[eè]\s+al\s+momento\s+raggiungibile\b",
        # Portuguese
        r"\bo\s+n[uú]mero\s+discado\s+(?:n[aã]o\s+existe|est[aá]\s+ocupado|est[aá]\s+fora\s+de\s+[aá]rea)\b",
        # Russian
        r"(?:номер,?\s*который\s+вы\s+набрали,?\s*не\s+существует|абонент\s+(?:временно\s+недоступен|занят|выключен))",
        # Turkish
        r"\barad[iı][gğ][iı]n[iı]z\s+numara\s+kullan[iı]lmamaktad[iı]r\b",
        r"\barad[iı][gğ][iı]n[iı]z\s+ki[sş]iye\s+[sş]u\s+anda\s+ula[sş][iı]lam[iı]yor\b",
        # Arabic
        r"\bal-raqm\s+alladhi\s+talabtahu\s+ghayr\s+sahih\b",
    ]

    # 5. Third-Party AI / Virtual Assistant Greeter & Self-Identification (Strict automated machine greeting)
    AI_ASSISTANT_PATTERNS = [
        r"\b(?:this\s+is\s+an\s+automated\s+(?:voice|assistant|receptionist|bot|system))\b",
        r"\b(?:this\s+call\s+is\s+being\s+screened\s+by\s+(?:an?\s+)?(?:ai|virtual|automated))\b",
        r"\bcall\s+assistant\s+is\s+screening\s+this\s+call\b",
        r"\bautomated\s+screening\s+system\b",
        r"\bplease\s+state\s+(?:the\s+reason\s+for\s+)?your\s+call\s+to\s+be\s+connected\b",
        r"\b(?:google\s+assistant|siri|bixby|alexa)\s+is\s+screening\b",
    ]

    # 6. Native-script machine cues (Devanagari, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, etc.)
    # Note: no \b because combining vowel diacritics are not word characters.
    NON_LATIN_DTMF_PATTERNS = [
        # Hindi / Marathi (Devanagari)
        r"(?:दबाएं|दबाएँ|दबाइए|दबाये|डायल करें|दाबा)",
        # Gujarati
        r"(?:દબાવો|દબાવ્યા|ડાયલ કરો)",
        # Bengali
        r"(?:চাপুন|ডায়াল করুন)",
        # Punjabi
        r"(?:ਦਬਾਓ|ਡਾਇਲ ਕਰੋ)",
        # Tamil
        r"(?:அழுத்தவும்|டயல் செய்யவும்)",
        # Telugu
        r"(?:నొక్కండి|డయల్ చేయండి)",
        # Kannada
        r"(?:ಒತ್ತಿ|ಡಯಲ್ ಮಾಡಿ)",
        # Malayalam
        r"(?:അമർത്തുക|ഡയൽ ചെയ്യുക)",
        # Japanese
        r"(?:を押してください|をダイヤルしてください|番号を押して)",
        # Chinese
        r"(?:请按|请拨|按\d+键)",
        # Korean
        r"(?:번을 눌러주세요|누르세요)",
        # Arabic / Urdu
        r"(?:اضغط على الرقم|دبائیں|ڈائل کریں)",
        # Russian / Ukrainian / Bulgarian (Cyrillic)
        r"(?:нажмите|наберіть|натисніть|натиснете)",
        # Greek
        r"(?:πατήστε το|πληκτρολογήστε)",
        # Hebrew
        r"(?:הקש|חייג|לחץ על)",
        # Thai
        r"(?:กดหมายเลข|กรุณากด)",
    ]

    NON_LATIN_VOICEMAIL_PATTERNS = [
        # Hindi / Marathi
        r"बीप\s*(?:के बाद|की आवाज़? के बाद|नंतर)",
        r"(?:संदेश|मैसेज)\s*(?:रिकॉर्ड|छोड़ें|छोड़िए|रेकॉर्ड करा)",
        r"वॉयस\s*मेल|वॉइस\s*मेल",
        r"(?:आपके द्वारा डायल किया गया नंबर|हा नंबर)\s*(?:अभी\s*)?(?:बंद|उपलब्ध नहीं|पहुँच से बाहर|व्यस्त)",
        # Gujarati
        r"બીપ\s*પછી",
        r"વોઇસ\s*મેઇલ|વૉઇસ\s*મેલ",
        r"તમારા\s*દ્વારા\s*ડાયલ\s*કરેલો\s*નંબર\s*(?:બંધ|ઉપલબ્ધ\s*નથી)",
        # Bengali
        r"(?:বীপের পর|ভয়েসমেল|বার্তা পাঠান|বার্তা রেকর্ড করুন)",
        # Tamil
        r"(?:பீப் ஒலிக்குப் பிறகு|குரல் அஞ்சல்|செய்தியைப் பதிவு செய்க)",
        # Telugu
        r"(?:బీప్ తర్వాత|వాయిస్ మెయిల్|సందేశాన్ని రికార్డ్ చేయండి)",
        # Kannada
        r"(?:ಬೀಪ್ ನಂತರ|ಧ್ವನಿ ಮೇಲ್|ಸಂದೇಶವನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಿ)",
        # Malayalam
        r"(?:ബീപ്പിന് ശേഷം|വോയ്‌സ് മെയിൽ|സന്ദേശം റിക്കോർഡ് ചെയ്യുക)",
        # Japanese
        r"(?:発信音の後に|留守番電話|メッセージをお残しください)",
        # Chinese
        r"(?:请在嘟声后留言|语音信箱|您拨打的用户忙|已关机|不在服务区)",
        # Korean
        r"(?:삐 소리 후|음성 사서함|연결이 되지 않아)",
        # Arabic / Urdu
        r"(?:البريد الصوتي|بعد سماع النغمة|پیغام ریکارڈ کریں|وائس میل)",
        # Russian / Ukrainian / Bulgarian
        r"(?:после звукового сигнала|голосовая почта|після звукового сигналу|след звуковия сигнал)",
        # Hebrew
        r"(?:לאחר הישמע הצליל|תא קולי|השאר הודעה)",
        # Thai
        r"(?:หลังเสียงสัญญาณ|ฝากข้อความ)",
    ]

    # 7. Caller clearly refusing to continue (across ALL portal supported languages)
    REFUSAL_PATTERNS = [
        # English
        r"\b(?:not\s+interested|no\s+thanks|don'?t\s+call\s+(?:me\s+)?again|stop\s+calling|do\s+not\s+call)\b",
        r"\b(?:i\s+)?(?:don'?t|do\s+not)\s+(?:want|wish|need)\s+to\s+(?:talk|speak|continue)\b",
        r"\b(?:please\s+)?hang\s+up\b|\bdisconnect\s+(?:the\s+)?call\b",
        # Hindi & Romanized Hinglish
        r"\b(?:baat|bat)\s*(?:bhi\s*|hi\s*|to\s*)?nahi\s*kar(?:ni|na|ta|ti)\b",
        r"\b(?:mujhe|mujhko)\s*(?:aapse\s*|tumse\s*)?(?:baat|bat)\s*(?:hi\s*|bhi\s*)?nahi\s*kar(?:ni|na|ta|ti)\b",
        r"\b(?:mujhe\s+)?(?:koi\s+)?(?:zaroorat|jarurat)\s+nahi\b",
        r"\b(?:interested|intrest)\s+(?:nahi|nahin)\b",
        r"\bphone\s+(?:mat\s+karo|nahi\s+karna|rakho|kat\s+do|rakh\s+do)\b",
        # Devanagari Hindi & Marathi
        r"(?:बात|बातचीत|बोलणे)\s*(?:भी\s*|ही\s*|तो\s*)?नहीं\s*(?:करनी|करना|करूँगा|करूँगी|करायचे)",
        r"(?:मुझे|मुझको|मला)\s*(?:आपसे\s*|तुमसे\s*)?(?:बात|बातचीत|बोलू)\s*(?:ही\s*|भी\s*)?नहीं\s*(?:करनी|करना|नको)",
        r"(?:मुझे\s*)?(?:कोई\s*)?(?:ज़रूरत|जरूरत)\s*नहीं",
        r"(?:इंटरेस्टेड|रुचि|दिलचस्पी)\s*नहीं",
        r"फोन\s*(?:मत|ना|नहीं)\s*(?:करो|कीजिए|रखो|काटो)",
        r"कॉल\s*(?:काट|कट)\s*(?:दो|दीजिए|करो)",
        # Gujarati
        r"\b(?:tamari\s+sathe\s+)?(?:vaat|vat)\s*(?:nathi|nahi)\s*karvi\b",
        r"મારે\s*(?:તમારી\s*સાથે\s*)?(?:કોઈ\s*)?(?:વાત|જરૂર)\s*નથી",
        r"(?:વાત\s*(?:નથી\s*કરવી|નથી\s*જોઈતી)|રસ\s*નથી)",
        r"ફોન\s*(?:મૂકો|કાપો|ન\s*કરો)",
        # Tamil
        r"(?:பேச\s*விரும்பவில்லை|ஆர்வமில்லை|போனை\s*வைக்கவும்|அழைக்க\s*வேண்டாம்)",
        # Telugu
        r"(?:మాట్లాడటం\s*ఇష్టం\s*లేదు|ఆసక్తి\s*లేదు|ఫోన్\s*కట్\s*చేయండి|చేయవద్దు)",
        # Bengali
        r"(?:কথা\s*বলতে\s*চাই\s*না|আগ্রহী\s*নই|ফোন\s*রাখুন|ফোন\s*করবেন\s*না)",
        # Punjabi
        r"(?:ਗੱਲ\s*ਨਹੀਂ\s*ਕਰਨੀ|ਕੋਈ\s*ਦਿਲਚਸਪੀ\s*ਨਹੀਂ|ਫੋਨ\s*ਰੱਖੋ)",
        # Kannada
        r"(?:ಮಾತನಾಡಲು\s*ಇಷ್ಟವಿಲ್ಲ|ಆಸಕ್ತಿಯಿಲ್ಲ|ಫೋನ್\s*ಇಡಿ)",
        # Malayalam
        r"(?:സംസാരിക്കാൻ\s*താൽപ്പര്യമില്ല|താൽപ്പര്യമില്ല|ഫോൺ\s*വയ്ക്കൂ)",
        # Urdu
        r"(?:بات\s*نہیں\s*کرنی|کوئی\s*دلچسپی\s*نہیں|فون\s*رکھیں)",
        # Spanish
        r"\bno\s+me\s+interesa\b|\bno\s+quiero\s+hablar\b|\bno\s+llame\s+m[aá]s\b|\bdeje\s+de\s+llamar\b|\bcuelgue\b",
        # French
        r"\bpas\s+int[eé]ress[eé]\b|\bne\s+me\s+rappelez\s+plus\b|\bje\s+ne\s+veux\s+pas\s+parler\b|\braccrochez\b",
        # German
        r"\bkein\s+interesse\b|\bnicht\s+interessiert\b|\brufen\s+sie\s+nicht\s+mehr\s+an\b|\blegen\s+sie\s+auf\b",
        # Italian
        r"\bnon\s+mi\s+interessa\b|\bnon\s+voglio\s+parlare\b|\bnon\s+chiamate\s+pi[uù]\b|\bchiuda\s+la\s+chiamata\b",
        # Portuguese
        r"\bn[aã]o\s+tenho\s+interesse\b|\bn[aã]o\s+quero\s+falar\b|\bn[aã]o\s+me\s+ligue\s+mais\b|\bdesligue\b",
        # Dutch
        r"\bgeen\s+interesse\b|\bik\s+wil\s+niet\s+praten\b|\bbel\s+mij\s+niet\s+meer\b|\bhang\s+op\b",
        # Russian
        r"\b(?:мне\s+)?не\s+интересно\b|\bне\s+хочу\s+разговаривать\b|\bбольше\s+не\s+звоните\b|\bположите\s+трубку\b",
        # Ukrainian
        r"\bне\s+цікаво\b|\bне\s+хочу\s+розмовляти\b|\bне\s+дзвоніть\s+більше\b|\bпокладіть\s+слухавку\b",
        # Polish
        r"\bnie\s+jestem\s+zainteresowany\b|\bnie\s+chc[eę]\s+rozmawia[cć]\b|\bprosz[eę]\s+nie\s+dzwoni[cć]\b|\bprosz[eę]\s+si[eę]\s+roz[lł][aą]czy[cć]\b",
        # Turkish
        r"\bilgilenmiyorum\b|\bkonu[sş]mak\s+istemiyorum\b|\bbir\s+daha\s+aramay[iı]n\b|\bkapat[iı]n\b",
        # Japanese
        r"(?:興味がありません|話したくありません|電話を切ってください|もう電話しないでください)",
        # Chinese
        r"(?:我不需要|没兴趣|不想聊|请挂机|请挂掉电话|不要再打了)",
        # Korean
        r"(?:관심\s*없습니다|통화하고\s*싶지\s*않습니다|전화\s*끊어\s*주세요|전화하지\s*마세요)",
        # Arabic
        r"(?:لست\s*مهتماً|لست\s*مهتم|لا\s*أريد\s*التحدث|أغلق\s*الخط|لا\s*تتصل\s*مرة\s*أخرى)",
        # Swedish
        r"\binte\s+intresserad\b|\bjag\s+vill\s+inte\s+prata\b|\bring\s+inte\s+igen\b|\bl[aä]gg\s+p[aå]\b",
        # Indonesian / Malay
        r"\btidak\s+tertarik\b|\btak\s+berminat\b|\btidak\s+mau\s+bicara\b|\btolong\s+tutup\s+teleponnya\b|\bjangan\s+telepon\s+lagi\b",
        # Vietnamese
        r"\bt[oô]i\s+kh[oô]ng\s+quan\s+t[aâ]m\b|\bkh[oô]ng\s+mu[oố]n\s+n[oó]i\s+chuy[eệ]n\b|\bxin\s+c[uú]p\s+m[aá]y\b|\b[dđ][uừ]ng\s+g[oọ]i\s+n[uữ]a\b",
        # Filipino / Tagalog
        r"\bhindi\s+ako\s+interesado\b|\bayaw\s+ko\s+makipag-usap\b|\bibaba\s+ang\s+telepono\b|\bhwag\s+nang\s+tumawag\b",
        # Greek
        r"\bδεν\s+ενδιαφέρομαι\b|\bδεν\s+θέλω\s+να\s+μιλήσω\b|\bκλείστε\s+το\s+τηλέφωνο\b",
        # Hebrew
        r"(?:לא\s*מעוניין|לא\s*רוצה\s*לדבר|נא\s*לנתק|אל\s*תתקשרו\s*שוב)",
        # Thai
        r"(?:ไม่สนใจ|ไม่อยากคุย|กรุณาวางสาย|อย่ายื่นโทรมาอีก)",
        # Czech
        r"\bnem[aá]m\s+z[aá]jem\b|\bnechci\s+mluvit\b|\bnezvo[nň]te\s+znovu\b|\bzav[eě]ste\b",
        # Hungarian
        r"\bnem\s+[eé]rdekel\b|\bnem\s+akarok\s+besz[eé]lni\b|\btegye\s+le\s+a\s+telefont\b",
        # Romanian
        r"\bnu\s+m[aă]\s+intereseaz[aă]\b|\bnu\s+vreau\s+s[aă]\s+vorbesc\b|\bv[aă]\s+rog\s+[iî]nchide[tț]i\b",
        # Danish / Norwegian
        r"\bikke\s+interessert\b|\bvil\s+ikke\s+snakke\b|\blegg\s+p[aå]\b|\bikke\s+ring\s+igjen\b",
        # Finnish
        r"\bei\s+kiinnosta\b|\ben\s+halua\s+puhua\b|\blopeta\s+puhelu\b|\b[aä]l[aä]\s+soita\s+uudelleen\b",
    ]

    _COMPILED_INDIC_DTMF = [re.compile(p) for p in NON_LATIN_DTMF_PATTERNS]
    _COMPILED_INDIC_VOICEMAIL = [re.compile(p) for p in NON_LATIN_VOICEMAIL_PATTERNS]
    _COMPILED_REFUSAL = [re.compile(p, re.IGNORECASE) for p in REFUSAL_PATTERNS]

    # Authentic localized closings for all 43 supported languages
    _CLOSINGS = {
        "en": "Understood, thank you for your time. If you need any help in the future, please get in touch. Goodbye!",
        "es": "Entendido, muchas gracias por su tiempo. Si necesita ayuda en el futuro, no dude en contactarnos. ¡Adiós!",
        "fr": "C'est compris, merci pour votre temps. Si vous avez besoin d'aide à l'avenir, n'hésitez pas à nous contacter. Au revoir !",
        "de": "Verstanden, vielen Dank für Ihre Zeit. Wenn Sie in Zukunft Hilfe benötigen, melden Sie sich gerne. Auf Wiedersehen!",
        "it": "Ho capito, grazie per il suo tempo. Se dovesse avere bisogno in futuro, non esiti a contattarci. Arrivederci!",
        "pt": "Entendido, obrigado pelo seu tempo. Se precisar de ajuda no futuro, entre em contato. Até logo!",
        "ja": "かしこまりました。お時間をいただきありがとうございました。また何かございましたらご連絡ください。失礼いたします。",
        "hi": "समझ गया, आपके समय के लिए धन्यवाद। यदि भविष्य में किसी मदद की ज़रूरत हो तो कृपया संपर्क करें। अलविदा!",
        "gu": "સમજી ગયો, તમારા સમય માટે આભાર. ભવિષ્યમાં કોઈ મદદ જોઈએ તો કૃપા કરીને સંપર્ક કરજો. આવજો!",
        "zh": "好的，非常感谢您的时间。如果未来需要任何帮助，欢迎随时联系我们。再见！",
        "ko": "알겠습니다. 귀한 시간 내주셔서 감사합니다. 추후 도움이 필요하시면 언제든 연락주세요. 안녕히 계세요!",
        "ar": "مفهوم، شكراً جزيلاً لوقتكم. إذا احتجتم إلى أي مساعدة في المستقبل، يسعدنا تواصلكم. مع السلامة!",
        "nl": "Begrepen, hartelijk dank voor uw tijd. Mocht u in de toekomst hulp nodig hebben, neem gerust contact op. Tot ziens!",
        "he": "הבנתי, תודה רבה על זמנך. אם תצטרך עזרה בעתיד, נשמח לעמוד לרשותך. להתראות!",
        "sv": "Förstått, stort tack för din tid. Hör gärna av dig om du behöver hjälp i framtiden. Hej då!",
        "pl": "Rozumiem, dziękuję za poświęcony czas. Jeśli w przyszłości będzie potrzebna pomoc, zapraszamy do kontaktu. Do widzenia!",
        "tr": "Anladım, vaktiniz için teşekkür ederiz. Gelecekte herhangi bir yardıma ihtiyacınız olursa lütfen bizimle iletişime geçin. Hoşça kalın!",
        "id": "Dimengerti, terima kasih atas waktu Anda. Jika memerlukan bantuan di masa mendatang, jangan ragu untuk menghubungi kami. Selamat tinggal!",
        "th": "เข้าใจแล้วครับ ขอบคุณสำหรับเวลาของคุณ หากต้องการความช่วยเหลือในอนาคต สามารถติดต่อเราได้เสมอครับ สวัสดีครับ",
        "ru": "Понятно, большое спасибо за ваше время. Если в будущем понадобится помощь, обращайтесь. До свидания!",
        "vi": "Tôi đã hiểu, cảm ơn bạn đã dành thời gian. Nếu bạn cần hỗ trợ trong tương lai, vui lòng liên hệ lại. Tạm biệt!",
        "tl": "Nauunawaan ko, maraming salamat sa iyong oras. Kung kailangan mo ng tulong sa hinaharap, huwag mag-atubiling makipag-ugnayan. Paalam!",
        "ta": "புரிந்துகொண்டேன், உங்கள் நேரத்திற்கு மிக்க நன்றி. எதிர்காலத்தில் ஏதேனும் உதவி தேவைப்பட்டால் தொடர்பு கொள்ளவும். வணக்கம்!",
        "te": "అర్థమైంది, మీ సమయానికి చాలా ధన్యవాదాలు. భవిష్యత్తులో ఏదైనా సహాయం కావాలంటే దయచేసి సంప్రదించండి. సెలవు!",
        "bn": "বুঝেছি, আপনার মূল্যবান সময়ের জন্য ধন্যবাদ। ভবিষ্যতে কোনো সাহায্যের প্রয়োজন হলে অবশ্যই যোগাযোগ করবেন। বিদায়!",
        "pa": "ਸਮਝ ਗਿਆ, ਤੁਹਾਡੇ ਸਮੇਂ ਲਈ ਧੰਨਵਾਦ। ਜੇਕਰ ਭਵਿੱਖ ਵਿੱਚ ਕਿਸੇ ਮਦਦ ਦੀ ਲੋੜ ਹੋਵੇ ਤਾਂ ਸੰਪਰਕ ਕਰ ਸਕਦੇ ਹੋ। ਅਲਵਿਦਾ!",
        "ur": "سمجھ گیا، آپ کے وقت کا شکریہ۔ اگر مستقبل میں کسی مدد کی ضرورت ہو تو ضرور رابطہ کریں۔ الوداع!",
        "el": "Κατάλαβα, σας ευχαριστώ πολύ για τον χρόνο σας. Αν χρειαστείτε βοήθεια στο μέλλον, μη διστάσετε να επικοινωνήσετε. Αντίο!",
        "da": "Forstået, mange tak for din tid. Hvis du får brug for hjælp i fremtiden, er du altid velkommen til at kontakte os. Farvel!",
        "fi": "Ymmärretty, kiitos paljon ajastasi. Jos tarvitset apua tulevaisuudessa, ota rohkeasti yhteyttä. Näkemiin!",
        "no": "Forstått, tusen takk for tiden din. Ta gjerne kontakt om du skulle trenge hjelp i fremtiden. Ha det bra!",
        "cs": "Rozumím, velice děkuji za váš čas. Pokud budete v budoucnu potřebovat pomoc, neváhejte se na nás obrátit. Na shledanou!",
        "hu": "Értem, nagyon köszönöm az idejét. Ha a jövőben segítségre lenne szüksége, forduljon hozzánk bizalommal. Viszontlátásra!",
        "ro": "Am înțeles, vă mulțumesc mult pentru timpul acordat. Dacă aveți nevoie de ajutor în viitor, nu ezitați să ne contactați. La revedere!",
        "uk": "Зрозуміло, щиро дякую за ваш час. Якщо в майбутньому знадобиться допомога, звертайтеся. До побачення!",
        "bg": "Разбрах, много благодаря за отделеното време. Ако имате нужда от помощ в бъдеще, не се колебайте да се свържете с нас. Довиждане!",
        "hr": "Razumijem, puno hvala na vašem vremenu. Ako u budućnosti zatrebate pomoć, slobodno se javite. Doviđenja!",
        "ms": "Faham, terima kasih atas masa anda. Jika memerlukan bantuan pada masa hadapan, sila hubungi kami. Selamat tinggal!",
        "sk": "Rozumiem, ďakujem pekne za váš čas. Ak budete v budúcnosti potrebovať pomoc, neváhajte sa ozvať. Dovidenia!",
        "ka": "გასაგებია, დიდი მადლობა დათმობილი დროისთვის. თუ მომავალში დახმარება დაგჭირდებათ, სიამოვნებით დაგეხმარებით. ნახვამდის!",
        "kn": "ಅರ್ಥವಾಯಿತು, ನಿಮ್ಮ ಸಮಯಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ಭವಿಷ್ಯದಲ್ಲಿ ಯಾವುದೇ ಸಹಾಯ ಬೇಕಾದರೆ ದಯವಿಟ್ಟು ಸಂಪರ್ಕಿಸಿ. ನಮಸ್ಕಾರ!",
        "ml": "മനസ്സിലായി, നിങ്ങളുടെ വിലയേറിയ സമയത്തിന് നന്ദി. ഭാവിയിൽ എന്തെങ്കിലും സഹായം ആവശ്യമുണ്ടെങ്കിൽ ബന്ധപ്പെടുക. വിട!",
        "mr": "समजले, तुमच्या वेळेबद्दल धन्यवाद. भविष्यात कोणतीही मदत हवी असल्यास कृपया संपर्क साधा. नमस्कार!",
        "hinglish": "Samajh gaya, aapke samay ke liye dhanyavaad. Future mein kisi madad ki zaroorat ho to kripya sampark karein. Alvida!",
    }

    @classmethod
    def detect_language(cls, text: str) -> str:
        """Language guess using native Unicode scripts and language keywords across all portal languages."""
        if not text or not text.strip():
            return "en"
        # 1. Non-Latin Unicode Script matching
        if re.search(r"[઀-૿]", text):
            return "gu"
        if re.search(r"[ऀ-ॿ]", text):
            # Hindi vs Marathi distinguishing
            if re.search(r"\b(?:आहे|नाही|करायचे|बोला|नमस्कार|धन्यवाद)\b", text):
                return "mr"
            return "hi"
        if re.search(r"[஀-௿]", text):
            return "ta"
        if re.search(r"[ఀ-౿]", text):
            return "te"
        if re.search(r"[ঀ-৿]", text):
            return "bn"
        if re.search(r"[਀-੿]", text):
            return "pa"
        if re.search(r"[ಀ-೿]", text):
            return "kn"
        if re.search(r"[ഀ-ൿ]", text):
            return "ml"
        if re.search(r"[぀-ヿ]", text):
            return "ja"
        if re.search(r"[一-鿿]", text):
            return "zh"
        if re.search(r"[가-힯]", text):
            return "ko"
        if re.search(r"[؀-ۿ]", text):
            if re.search(r"\b(?:نہیں|شکریہ|بات|کریں)\b", text):
                return "ur"
            return "ar"
        if re.search(r"[֐-׿]", text):
            return "he"
        if re.search(r"[฀-๿]", text):
            return "th"
        if re.search(r"[Ͱ-Ͽ]", text):
            return "el"
        if re.search(r"[Ⴀ-ჿ]", text):
            return "ka"
        if re.search(r"[Ѐ-ӿ]", text):
            if re.search(r"[іїєґ]", text, re.IGNORECASE):
                return "uk"
            if re.search(r"\b(?:не\s+ща|благодаря)\b", text, re.IGNORECASE):
                return "bg"
            return "ru"

        # 2. Latin-Script vocabulary and keyword inspection
        low = text.lower()
        if re.search(r"\b(?:nahi|nahin|hai|hain|mujhe|aap|kripya|dhanyavaad|baat|zaroorat|jarurat|theek|achha)\b", low):
            return "hinglish"
        if re.search(r"[¿¡ñáéíóú]|\b(?:no\s+quiero|gracias|hola|por\s+favor|mensaje|tono|interesa|cuelgue)\b", low):
            return "es"
        if re.search(r"[àâçéèêëîïôûùüÿœæ]|\b(?:bonjour|merci|s'il\s+vous\s+pla[iî]t|rappelez|parler|raccrochez)\b", low):
            return "fr"
        if re.search(r"[äöüß]|\b(?:danke|bitte|hallo|nicht|interesse|anrufen|auflegen|auf\s+wiedersehen)\b", low):
            return "de"
        if re.search(r"\b(?:grazie|prego|ciao|non\s+voglio|interessa|chiamata|chiuda|arrivederci)\b", low):
            return "it"
        if re.search(r"[ãõáéíóúâêôç]|\b(?:ol[aá]|obrigado|obrigada|n[aã]o\s+quero|interesse|desligue|at[eé]\s+logo)\b", low):
            return "pt"
        if re.search(r"\b(?:dank\s+u|alstublieft|goedendag|geen\s+interesse|praten|opbellen|tot\s+ziens)\b", low):
            return "nl"
        if re.search(r"[ığüşöç]|\b(?:te[sş]ekk[uü]r|l[uü]tfen|merhaba|istemiyorum|aramay[iı]n|ho[sş][cç]a\s+kal[iı]n)\b", low):
            return "tr"
        if re.search(r"[ąćęłńóśźż]|\b(?:dzi[eę]kuj[eę]|prosz[eę]|cze[sś][cć]|nie\s+chc[eę]|zainteresowany|do\s+widzenia)\b", low):
            return "pl"
        if re.search(r"[åäö]|\b(?:tack|sn[aä]lla|hej|inte\s+intresserad|prata|l[aä]gg\s+p[aå]|hej\s+d[aå])\b", low):
            return "sv"
        if re.search(r"\b(?:terima\s+kasih|tolong|halo|tidak\s+tertarik|bicara|jangan\s+telepon|selamat\s+tinggal)\b", low):
            return "id"
        if re.search(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]|\b(?:c[aả]m\s+[oơ]n|xin\s+vui\s+l[oò]ng|ch[aà]o|kh[oô]ng\s+quan\s+t[aâ]m|t[aạ]m\s+bi[eệ]t)\b", low):
            return "vi"
        if re.search(r"\b(?:salamat|pakiusap|kamusta|hindi\s+interesado|makipag-usap|paalam)\b", low):
            return "tl"
        if re.search(r"[čďěňřšťž]|\b(?:d[eě]kuji|pros[ií]m|dobr[yý]\s+den|nem[aá]m\s+z[aá]jem|na\s+shledanou)\b", low):
            return "cs"
        if re.search(r"[őűáéíóöúü]|\b(?:k[oö]sz[oö]n[oö]m|k[eé]rem|hall[oó]|nem\s+[eé]rdekel|viszontl[aá]t[aá]sra)\b", low):
            return "hu"
        if re.search(r"[ăâîșț]|\b(?:mul[tț]umesc|v[aă]\s+rog|bun[aă]\s+ziua|nu\s+vreau|la\s+revedere)\b", low):
            return "ro"
        if re.search(r"[æøå]|\b(?:mange\s+tak|v[æe]r\s+s[aå]\s+vennlig|hei|ikke\s+interessert|ha\s+det)\b", low):
            return "no"
        if re.search(r"[äö]|\b(?:kiitos|ole\s+hyv[aä]|hei|ei\s+kiinnosta|n[aä]kemiin)\b", low):
            return "fi"
        if re.search(r"[čćžšđ]|\b(?:hvala|molim|dobar\s+dan|ne\s+želim|dovi[dđ]enja)\b", low):
            return "hr"

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
