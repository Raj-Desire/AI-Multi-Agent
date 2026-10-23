import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Volume2,
  Play,
  Square,
  Sparkles,
  Globe,
  Sliders,
  Cpu,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Zap,
  Mic,
  Smile,
  ShieldCheck,
  Headphones,
  User,
  BookOpen,
  Plus,
  Trash2,
  RotateCcw,
  Bookmark,
  MoreVertical,
  X
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import {
  AURA_VOICES,
  POPULAR_SONIC_VOICES,
  VOICE_CATEGORIES,
  getVoiceCategories,
  SUPPORTED_LANGUAGES,
  LLM_MODELS,
  AGENT_PURPOSES,
  DEFAULT_PRONUNCIATION_RULES
} from "./constants";
import { AgentConfig, PronunciationRule } from "../../types";
import { MultilingualSettings } from "./MultilingualSettings";

interface Step3VoiceLanguageProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

interface VoiceMetadata {
  accent: string;
  tone: string;
  bestFor: string;
  tagColor?: string;
}

const VOICE_METADATA_MAP: Record<string, VoiceMetadata> = {
  // Flux Conversation-Native Voices
  "flux-hannah-en": { accent: "US English", tone: "Ultra-Natural & Engaging", bestFor: "Reception, Support & High EQ" },
  "flux-alexis-en": { accent: "US English", tone: "Confident & Professional", bestFor: "Executive & Consultation" },
  "flux-sienna-en": { accent: "US English", tone: "Warm & Friendly", bestFor: "Healthcare, Wellness & Booking" },
  "flux-brooke-en": { accent: "US English", tone: "Calm & Polished", bestFor: "Technical Advisory & Inquiries" },
  "flux-cliff-en": { accent: "US English", tone: "Conversational & Grounded", bestFor: "B2B Sales & Follow-ups" },
  "flux-cole-en": { accent: "US English", tone: "Energetic & Direct", bestFor: "Outbound Lead Gen & Surveys" },
  "flux-kit-en": { accent: "British English", tone: "Articulate British", bestFor: "Global Enterprise & Luxury" },
  "flux-colin-en": { accent: "British English", tone: "Executive British", bestFor: "Financial & Corporate Services" },
  "flux-gemma-en": { accent: "British English", tone: "Cheerful & Gentle", bestFor: "Customer support, IVR" },
  "flux-haley-en": { accent: "US English", tone: "Articulate & Polished", bestFor: "Customer support, financial services, IVR" },
  "flux-heather-en": { accent: "US English", tone: "Articulate & Animated", bestFor: "Customer support, IVR" },
  "flux-miles-en": { accent: "US English", tone: "Articulate & Serene", bestFor: "Customer support, financial services, informational" },
  "flux-sean-en": { accent: "British English", tone: "Amiable & Gentle", bestFor: "IVR" },
  "flux-bree-en": { accent: "US English", tone: "Warm & Gentle", bestFor: "Customer support, casual conversation" },
  "flux-brittany-en": { accent: "US English", tone: "Self-assured & Caring", bestFor: "Casual conversation" },
  "flux-bruce-en": { accent: "US English", tone: "Amiable & Considerate", bestFor: "Customer support, IVR" },
  "flux-conor-en": { accent: "British English", tone: "Self-assured & Low-pitched", bestFor: "Customer support, IVR" },
  "flux-donovan-en": { accent: "US English", tone: "Professional & Serene", bestFor: "IVR" },
  "flux-drew-en": { accent: "US English", tone: "Self-assured & Laid-back", bestFor: "Healthcare, financial services, customer support, IVR" },
  "flux-elise-en": { accent: "US English", tone: "Articulate & Professional", bestFor: "Customer support, financial services, IVR" },
  "flux-jack-en": { accent: "British English", tone: "Self-assured & Reflective", bestFor: "Customer support, storytelling" },
  "flux-kai-en": { accent: "Singaporean English", tone: "Articulate & Serene", bestFor: "Customer support, informational, IVR" },
  "flux-kelsey-en": { accent: "US English", tone: "Articulate & Professional", bestFor: "Customer support, IVR, financial services" },
  "flux-maeve-en": { accent: "Irish English", tone: "Amiable & Spirited", bestFor: "Customer support, IVR, narration" },
  "flux-marcelo-en": { accent: "Filipino English", tone: "Articulate & Serene", bestFor: "Customer support, informational, IVR" },
  "flux-marcus-en": { accent: "US English", tone: "Amiable & Helpful", bestFor: "Customer support, casual conversation" },
  "flux-meena-en": { accent: "Indian English", tone: "Empathetic & Professional", bestFor: "Customer support, casual conversation" },
  "flux-meghan-en": { accent: "US English", tone: "Amiable & Pleasant", bestFor: "Healthcare, financial services" },
  "flux-naveen-en": { accent: "Indian English", tone: "Articulate & Professional", bestFor: "Customer support, IVR, informational" },
  "flux-paige-en": { accent: "US English", tone: "Articulate & Professional", bestFor: "Customer support, financial services, IVR" },
  "flux-priya-en": { accent: "Indian English", tone: "Self-assured & Empathetic", bestFor: "IVR" },
  "flux-rufus-en": { accent: "British English", tone: "Amiable & Self-assured", bestFor: "Healthcare, financial services, storytelling" },
  "flux-sharon-en": { accent: "Australian English", tone: "Formal & Serene", bestFor: "Healthcare, financial services" },
  "flux-tanner-en": { accent: "British English", tone: "Professional & Serene", bestFor: "Customer support" },
  "flux-wade-en": { accent: "US English", tone: "Warm & Self-assured", bestFor: "Customer support, casual conversation" },
  "flux-wes-en": { accent: "US English", tone: "Reflective & Amiable", bestFor: "Customer support, casual conversation" },

  // Multilingual Spoken Voices
  "aura-2-thalia-en": { accent: "US English (Gen-2)", tone: "Ultra-Natural & Warm", bestFor: "High-EQ Conversations" },
  "aura-2-andromeda-en": { accent: "US English (Gen-2)", tone: "Expressive & Natural", bestFor: "Concierge & Real Estate" },
  "aura-2-apollo-en": { accent: "US English (Gen-2)", tone: "Dynamic & Expressive", bestFor: "Interactive Pitching" },
  "aura-2-agustina-es": { accent: "Spanish (ES)", tone: "Warm & Clear", bestFor: "Spanish Reception" },
  "aura-2-javier-es": { accent: "Spanish (ES)", tone: "Professional", bestFor: "Spanish Sales & Business" },
  "aura-2-aurelia-de": { accent: "German (DE)", tone: "Clear & Natural", bestFor: "German Customer Service" },
  "aura-2-agathe-fr": { accent: "French (FR)", tone: "Warm & Natural", bestFor: "French Reception" },
  "aura-2-cesare-it": { accent: "Italian (IT)", tone: "Warm & Engaging", bestFor: "Italian Customer Service" },
  "aura-2-ama-ja": { accent: "Japanese (JA)", tone: "Polite & Natural", bestFor: "Japanese Business Care" }
};

// Language to Primary Country Code Mapping for Authentic Regional Flag Rendering
export const LANG_TO_COUNTRY_CODE: Record<string, string> = {
  en: "us",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "br",
  ja: "jp",
  hi: "in",
  gu: "in",
  ta: "in",
  te: "in",
  bn: "in",
  pa: "in",
  ur: "pk",
  zh: "cn",
  ko: "kr",
  ar: "sa",
  nl: "nl",
  he: "il",
  sv: "se",
  pl: "pl",
  tr: "tr",
  id: "id",
  th: "th",
  ru: "ru",
  vi: "vn",
  tl: "ph",
  el: "gr",
  da: "dk",
  fi: "fi",
  no: "no",
  cs: "cz",
  hu: "hu",
  ro: "ro",
  uk: "ua"
};

// Vector-Clean Cross-Platform Country Flag Component with Zero-Jank Fallback
export function CountryFlag({
  code,
  className = "w-4 h-3 rounded-[2px] object-cover inline-block shrink-0 shadow-2xs border border-black/10"
}: {
  code: string;
  className?: string;
}) {
  const cleanCode = (code || "us").toLowerCase();
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <span className="inline-flex items-center justify-center w-4 h-3 rounded-[2px] bg-slate-200 dark:bg-slate-700 text-[8px] font-mono font-bold uppercase text-slate-700 dark:text-slate-300 shrink-0">
        {cleanCode.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/24x18/${cleanCode}.png`}
      srcSet={`https://flagcdn.com/48x36/${cleanCode}.png 2x`}
      alt={cleanCode.toUpperCase()}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

// Precise Country Code Mapping for Voice Models based on Accent & Regional Dialect
export function getVoiceCountryCode(voiceId: string, langCode?: string): string {
  const meta = VOICE_METADATA_MAP[voiceId];
  const accent = (meta?.accent || "").toLowerCase();
  const lang = (langCode || "").toLowerCase();

  if (accent.includes("british") || accent.includes("uk")) return "gb";
  if (accent.includes("indian") || lang === "hi" || lang === "gu" || lang === "ta" || lang === "te" || lang === "pa" || lang === "bn") return "in";
  if (accent.includes("australian")) return "au";
  if (accent.includes("irish")) return "ie";
  if (accent.includes("singaporean")) return "sg";
  if (accent.includes("filipino") || lang === "tl") return "ph";
  if (accent.includes("mexican") || accent.includes("mexico")) return "mx";
  if (lang === "es" || accent.includes("spanish")) return "es";
  if (lang === "fr" || accent.includes("french")) return "fr";
  if (lang === "de" || accent.includes("german")) return "de";
  if (lang === "it" || accent.includes("italian")) return "it";
  if (lang === "pt" || accent.includes("portuguese")) return "br";
  if (lang === "ja" || accent.includes("japanese")) return "jp";
  if (lang === "zh" || accent.includes("chinese")) return "cn";
  if (lang === "ko" || accent.includes("korean")) return "kr";
  if (lang === "ar" || accent.includes("arabic")) return "sa";
  if (lang === "he" || accent.includes("hebrew")) return "il";
  if (lang === "sv" || accent.includes("swedish")) return "se";
  if (lang === "pl" || accent.includes("polish")) return "pl";
  if (lang === "tr" || accent.includes("turkish")) return "tr";
  if (lang === "id" || accent.includes("indonesian")) return "id";
  if (lang === "th" || accent.includes("thai")) return "th";
  if (lang === "ru" || accent.includes("russian")) return "ru";
  if (lang === "vi" || accent.includes("vietnamese")) return "vn";
  if (lang === "ur") return "pk";
  if (lang === "el") return "gr";
  if (lang === "da") return "dk";
  if (lang === "fi") return "fi";
  if (lang === "no") return "no";
  if (lang === "cs") return "cz";
  if (lang === "hu") return "hu";
  if (lang === "ro") return "ro";
  if (lang === "uk") return "ua";
  return "us";
}

// Complete 38 Dialect & Regional Language Set Supported by Sonic Models
export const ALL_SONIC_SUPPORTED_LANGUAGES = [
  { countryCode: "us", lang: "en", label: "English (American)" },
  { countryCode: "gb", lang: "en", label: "English (British)" },
  { countryCode: "in", lang: "hi", label: "Hindi (हिन्दी)" },
  { countryCode: "es", lang: "es", label: "Spanish (Español)" },
  { countryCode: "mx", lang: "es", label: "Spanish (Mexican)" },
  { countryCode: "fr", lang: "fr", label: "French (Français)" },
  { countryCode: "de", lang: "de", label: "German (Deutsch)" },
  { countryCode: "it", lang: "it", label: "Italian (Italiano)" },
  { countryCode: "br", lang: "pt", label: "Portuguese (Brazilian)" },
  { countryCode: "pt", lang: "pt", label: "Portuguese (European)" },
  { countryCode: "jp", lang: "ja", label: "Japanese (日本語)" },
  { countryCode: "cn", lang: "zh", label: "Chinese (Mandarin)" },
  { countryCode: "kr", lang: "ko", label: "Korean (한국어)" },
  { countryCode: "sa", lang: "ar", label: "Arabic (العربية)" },
  { countryCode: "nl", lang: "nl", label: "Dutch (Nederlands)" },
  { countryCode: "il", lang: "he", label: "Hebrew (עברית)" },
  { countryCode: "se", lang: "sv", label: "Swedish (Svenska)" },
  { countryCode: "pl", lang: "pl", label: "Polish (Polski)" },
  { countryCode: "tr", lang: "tr", label: "Turkish (Türkçe)" },
  { countryCode: "id", lang: "id", label: "Indonesian (Bahasa)" },
  { countryCode: "th", lang: "th", label: "Thai (ไทย)" },
  { countryCode: "ru", lang: "ru", label: "Russian (Русский)" },
  { countryCode: "vn", lang: "vi", label: "Vietnamese (Tiếng Việt)" },
  { countryCode: "ph", lang: "tl", label: "Tagalog (Filipino)" },
  { countryCode: "in", lang: "ta", label: "Tamil (தமிழ்)" },
  { countryCode: "in", lang: "te", label: "Telugu (తెలుగు)" },
  { countryCode: "in", lang: "bn", label: "Bengali (বাংলা)" },
  { countryCode: "in", lang: "gu", label: "Gujarati (ગુજરાતી)" },
  { countryCode: "in", lang: "pa", label: "Punjabi (ਪੰਜਾਬੀ)" },
  { countryCode: "pk", lang: "ur", label: "Urdu (اردو)" },
  { countryCode: "gr", lang: "el", label: "Greek (Ελληνικά)" },
  { countryCode: "dk", lang: "da", label: "Danish (Dansk)" },
  { countryCode: "fi", lang: "fi", label: "Finnish (Suomi)" },
  { countryCode: "no", lang: "no", label: "Norwegian (Norsk)" },
  { countryCode: "cz", lang: "cs", label: "Czech (Čeština)" },
  { countryCode: "hu", lang: "hu", label: "Hungarian (Magyar)" },
  { countryCode: "ro", lang: "ro", label: "Romanian (Română)" },
  { countryCode: "ua", lang: "uk", label: "Ukrainian (Українська)" }
];

export function getVoiceSupportedList(voiceId: string, engine: string, langCode?: string): Array<{ countryCode: string; lang: string; label: string }> {
  if (engine === "sonic") {
    return ALL_SONIC_SUPPORTED_LANGUAGES;
  }
  if (voiceId.startsWith("aura-2")) {
    return [
      { countryCode: "us", lang: "en", label: "English (American)" },
      { countryCode: "es", lang: "es", label: "Spanish (Español)" },
      { countryCode: "fr", lang: "fr", label: "French (Français)" },
      { countryCode: "de", lang: "de", label: "German (Deutsch)" },
      { countryCode: "it", lang: "it", label: "Italian (Italiano)" },
      { countryCode: "jp", lang: "ja", label: "Japanese (日本語)" }
    ];
  }
  const countryCode = getVoiceCountryCode(voiceId, langCode);
  const meta = VOICE_METADATA_MAP[voiceId];
  return [{ countryCode, lang: langCode || "en", label: meta?.accent || "English (American)" }];
}

// Global Set of Featured Voice IDs for O(1) instantaneous lookup
const FEATURED_VOICE_IDS = new Set([
  ...AURA_VOICES.map((v) => v.id),
  ...POPULAR_SONIC_VOICES.map((v) => v.id)
]);

// Authentic Native Greeting Translations for Synchronized Voice & Listening Experience
export const NATIVE_DEFAULT_GREETINGS: Record<string, string> = {
  en: "Hi! Thanks for connecting. How can I help you today?",
  hi: "नमस्ते! बात करने के लिए धन्यवाद। आज मैं आपकी किस प्रकार सहायता कर सकता हूँ?",
  gu: "નમસ્તે! વાત કરવા બદલ આભાર. આજે હું તમને કેવી રીતે મદદ કરી શકું?",
  es: "¡Hola! Gracias por comunicarte. ¿En qué puedo ayudarte hoy?",
  fr: "Bonjour ! Merci de nous contacter. Comment puis-je vous aider aujourd'hui ?",
  de: "Hallo! Vielen Dank für Ihre Kontaktaufnahme. Wie kann ich Ihnen heute helfen?",
  it: "Ciao! Grazie per averci contattato. Come posso aiutarti oggi?",
  pt: "Olá! Obrigado por entrar em contato. Como posso ajudar você hoje?",
  ja: "こんにちは！お電話ありがとうございます。本日はどのようなご用件でしょうか？",
  zh: "您好！感谢您的致电。请问今天有什么我可以帮您的？",
  ko: "안녕하세요! 연결해 주셔서 감사합니다. 오늘 어떤 도움이 필요하신가요?",
  ar: "مرحباً! شكراً لاتصالك بنا. كيف يمكنني مساعدتك اليوم؟",
  nl: "Hallo! Bedankt voor het contact opnemen. Hoe kan ik u vandaag helpen?",
  he: "שלום! תודה שפנית אלינו. איך אוכל לעזור לך היום?",
  sv: "Hej! Tack för att du kontaktar oss. Hur kan jag hjälpa dig idag?",
  pl: "Cześć! Dziękujemy za kontakt. W czym mogę Ci dzisiaj pomóc?",
  tr: "Merhaba! Bize ulaştığınız için teşekkürler. Bugün size nasıl yardımcı olabilirim?",
  id: "Halo! Terima kasih telah menghubungi kami. Ada yang bisa saya bantu hari ini?",
  th: "สวัสดีค่ะ! ขอบคุณที่ติดต่อเรานะคะ วันนี้มีอะไรให้ช่วยไหมคะ?",
  ru: "Здравствуйте! Спасибо за обращение. Чем я могу помочь вам сегодня?",
  vi: "Xin chào! Cảm ơn bạn đã liên hệ. Tôi có thể giúp gì cho bạn hôm nay?",
  tl: "Kamusta! Salamat sa pagtawag. Paano kita matutulungan ngayon?",
  ta: "வணக்கம்! எங்களைத் தொடர்பு கொண்டதற்கு நன்றி. இன்று உங்களுக்கு எவ்வாறு உதவ முடியும்?",
  te: "నమస్కారం! మమ్మల్ని సంప్రదించినందుకు ధన్యవాదాలు. ఈరోజు మీకు ఎలా సహాయపడగలను?",
  bn: "নমস্কার! যোগাযোগ করার জন্য ধন্যবাদ। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  pa: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਸਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
  ur: "السلام علیکم! رابطہ کرنے کا شکریہ۔ آج میں آپ کی کیا مدد کر سکتا ہوں؟",
  el: "Γεια σας! Ευχαριστούμε που επικοινωνήσατε μαζί μας. Πώς μπορώ να σας βοηθήσω σήμερα;",
  da: "Hej! Tak fordi du kontakter os. Hvordan kan jeg hjælpe dig i dag?",
  fi: "Hei! Kiitos yhteydenotostasi. Kuinka voin auttaa sinua tänään?",
  no: "Hei! Takk for at du kontakter oss. Hvordan kan jeg hjelpe deg i dag?",
  cs: "Dobrý den! Děkujeme, že jste se ozvali. Jak vám mohu dnes pomoci?",
  hu: "Üdvözlöm! Köszönjük megkeresését. Miben segíthetek ma?",
  ro: "Bună! Îți mulțumim că ne-ai contactat. Cu ce te pot ajuta astăzi?",
  uk: "Вітаю! Дякуємо за звернення. Чим можу допомогти вам сьогодні?"
};

export function Step3VoiceLanguage({
  agentData,
  setAgentData
}: Step3VoiceLanguageProps) {
  // Voice Engine Toggle State ("flux" | "sonic")
  const currentVoiceId = agentData.voice?.voice || "flux-hannah-en";
  const initialEngine = (agentData.voice?.provider === "cartesia" || (!currentVoiceId.startsWith("flux-") && !currentVoiceId.startsWith("aura-") && currentVoiceId.includes("-"))) ? "sonic" : "flux";
  const [selectedEngine, setSelectedEngine] = useState<"flux" | "sonic">(initialEngine);

  // Cartesia Sonic dynamic voices list
  const [sonicVoices, setSonicVoices] = useState<any[]>(POPULAR_SONIC_VOICES);
  const [isLoadingSonic, setIsLoadingSonic] = useState(false);

  // Selected Language filter for Sonic
  const [sonicLangFilter, setSonicLangFilter] = useState<string>("all");

  // Fetch dynamic Sonic voices from backend endpoint
  useEffect(() => {
    let isMounted = true;
    async function loadSonicVoices() {
      setIsLoadingSonic(true);
      try {
        const token = localStorage.getItem("desire_token");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
        const url = apiBase.endsWith("/api/v1") ? `${apiBase}/voice/cartesia-voices` : `${apiBase}/api/v1/voice/cartesia-voices`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.data) && data.data.length > 0 && isMounted) {
            setSonicVoices(data.data);
          }
        }
      } catch (err) {
        console.warn("Could not fetch remote Sonic voices, using local catalog:", err);
      } finally {
        if (isMounted) setIsLoadingSonic(false);
      }
    }
    loadSonicVoices();
    return () => { isMounted = false; };
  }, []);

  // Voice Preview State & Instant Audio Cache
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const audioBlobCacheRef = useRef<Map<string, string>>(new Map());

  // Filter & Search State for Voice Picker
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "female" | "male" | "english" | "multilingual">("all");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [voiceTab, setVoiceTab] = useState<"featured" | "saved">("featured");
  const [visibleLimit, setVisibleLimit] = useState(40);

  // Instantly reset visibleLimit to 40 on any filter/tab switch to keep DOM rendering under 10ms
  useEffect(() => {
    setVisibleLimit(40);
  }, [voiceTab, selectedEngine, searchQuery, sonicLangFilter, activeFilter, activeCategory]);

  const [savedVoiceIds, setSavedVoiceIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("preferred_saved_voices");
      return stored ? new Set(JSON.parse(stored)) : new Set(["flux-hannah-en", "f5a7e270-a91b-463e-8997-8ed08b6a6a77"]);
    } catch {
      return new Set(["flux-hannah-en"]);
    }
  });

  const toggleSaveVoice = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedVoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("preferred_saved_voices", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Advanced AI Settings Collapsible
  const [showAdvancedAI, setShowAdvancedAI] = useState(false);

  // Pronunciation Dictionary State
  const [newWord, setNewWord] = useState("");
  const [newPhonetic, setNewPhonetic] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("custom");
  const [isPronunciationOpen, setIsPronunciationOpen] = useState(true);

  const pronunciationRules: PronunciationRule[] = agentData.pronunciation_rules || DEFAULT_PRONUNCIATION_RULES;

  const handleAddPronunciationRule = () => {
    if (!newWord.trim() || !newPhonetic.trim()) return;
    const updated = [
      ...pronunciationRules,
      { word: newWord.trim(), phonetic: newPhonetic.trim(), category: selectedCategory }
    ];
    setAgentData((prev) => ({
      ...prev,
      pronunciation_rules: updated
    }));
    setNewWord("");
    setNewPhonetic("");
  };

  const handleRemovePronunciationRule = (index: number) => {
    const updated = pronunciationRules.filter((_, i) => i !== index);
    setAgentData((prev) => ({
      ...prev,
      pronunciation_rules: updated
    }));
  };

  const handleLoadPresetPack = (category: "general" | "acronyms") => {
    const presetItems = DEFAULT_PRONUNCIATION_RULES.filter((r) => r.category === category);
    const existingWords = new Set(pronunciationRules.map((r) => r.word.toLowerCase()));
    const itemsToAdd = presetItems.filter((r) => !existingWords.has(r.word.toLowerCase()));
    if (itemsToAdd.length === 0) return;
    setAgentData((prev) => ({
      ...prev,
      pronunciation_rules: [...pronunciationRules, ...itemsToAdd]
    }));
  };


  const handleResetPronunciationRules = () => {
    setAgentData((prev) => ({
      ...prev,
      pronunciation_rules: DEFAULT_PRONUNCIATION_RULES
    }));
  };

  // Match role/purpose for recommendations
  const matchedPurpose = useMemo(() => {
    return (
      AGENT_PURPOSES.find(
        (p) =>
          p.defaultRole.toLowerCase() === (agentData.role || "").toLowerCase() ||
          p.title.toLowerCase() === (agentData.role || "").toLowerCase() ||
          agentData.name?.toLowerCase().includes(p.id.replace(/_/g, " "))
      ) ||
      AGENT_PURPOSES.find((p) => p.id === "custom") ||
      AGENT_PURPOSES[0]
    );
  }, [agentData.role, agentData.name]);

  // Selected Voice
  const selectedVoiceId = agentData.voice?.voice || "flux-hannah-en";
  const isPlayingSample = playingVoiceId === selectedVoiceId;

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.onerror = null;
        audioElement.onended = null;
        audioElement.pause();
        audioElement.src = "";
      }
    };
  }, [audioElement]);

  // Prefetch voice sample audio into memory for instantaneous (0ms) playback on click
  const prefetchVoiceSample = async (voiceId: string, customText?: string): Promise<string | undefined> => {
    const voiceObj =
      sonicVoices.find((v) => v.id === voiceId) ||
      POPULAR_SONIC_VOICES.find((v) => v.id === voiceId) ||
      AURA_VOICES.find((v) => v.id === voiceId);

    const sampleText =
      customText ||
      (voiceObj as any)?.sampleText ||
      `Hello! I am your AI voice agent. How can I help you today?`;

    const cacheKey = `${voiceId}:${sampleText}`;
    if (audioBlobCacheRef.current.has(cacheKey)) return audioBlobCacheRef.current.get(cacheKey);

    try {
      const token = localStorage.getItem("desire_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
      const sampleUrl = apiBase.endsWith("/api/v1") ? `${apiBase}/voice/sample-speech` : `${apiBase}/api/v1/voice/sample-speech`;

      const isSonicVoice = (voiceObj as any)?.engine === "sonic" || (!voiceId.startsWith("flux-") && !voiceId.startsWith("aura-") && voiceId.includes("-"));

      const response = await fetch(sampleUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: sampleText,
          voice: voiceId,
          provider: isSonicVoice ? "cartesia" : "deepgram",
          // Sonic needs the language to pronounce non-English text correctly
          language: customText ? agentData.voice?.language || "en" : (voiceObj as any)?.language || "en"
        })
      });

      if (!response.ok) return undefined;

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      audioBlobCacheRef.current.set(cacheKey, audioUrl);
      return audioUrl;
    } catch {
      return undefined;
    }
  };

  // Audio preview playback stops when unmounting or switching steps
  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  const stopCurrentAudio = () => {
    if (audioElement) {
      audioElement.onerror = null;
      audioElement.onended = null;
      audioElement.pause();
      audioElement.src = "";
      setAudioElement(null);
    }
    setPlayingVoiceId(null);
  };

  const playVoiceSample = async (voiceId: string, customText?: string) => {
    if (playingVoiceId === voiceId) {
      stopCurrentAudio();
      return;
    }

    stopCurrentAudio();
    setPlayingVoiceId(voiceId);
    setAudioError(null);

    try {
      const voiceObj =
        sonicVoices.find((v) => v.id === voiceId) ||
        POPULAR_SONIC_VOICES.find((v) => v.id === voiceId) ||
        AURA_VOICES.find((v) => v.id === voiceId);

      const sampleText =
        customText ||
        (voiceObj as any)?.sampleText ||
        `Hello! I am your AI voice agent. How can I help you today?`;

      const cacheKey = `${voiceId}:${sampleText}`;
      let audioUrl = audioBlobCacheRef.current.get(cacheKey);
      if (!audioUrl) {
        audioUrl = await prefetchVoiceSample(voiceId, sampleText);
      }

      if (!audioUrl) {
        throw new Error("Failed to load voice audio preview.");
      }

      const audio = new Audio(audioUrl);
      const currentSpeed = agentData.voice?.speed || 1.0;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, currentSpeed));

      audio.onended = () => {
        setPlayingVoiceId(null);
        setAudioElement(null);
        setAudioError(null);
      };

      audio.onerror = () => {
        if (!audio.src || audio.src === "" || audio.src === window.location.href) return;
        setPlayingVoiceId(null);
        setAudioElement(null);
        setAudioError("Audio playback failed. Please check your audio output device.");
      };

      setAudioElement(audio);
      try {
        await audio.play();
        setAudioError(null);
      } catch (playErr: any) {
        if (playErr.name !== "AbortError") {
          setAudioError("Audio playback failed. Please check your audio output device.");
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.warn("Voice TTS error:", err);
      stopCurrentAudio();
      setAudioError(err?.message || "Failed to generate speech preview.");
    }
  };

  const handlePlaySample = () => {
    playVoiceSample(selectedVoiceId);
  };

  const handleVoiceChange = (voiceId: string, explicitLang?: string) => {
    const isSonic = selectedEngine === "sonic" || (!voiceId.startsWith("flux-") && !voiceId.startsWith("aura-") && voiceId.includes("-"));
    const voiceObj = isSonic
      ? (sonicVoices.find((v) => v.id === voiceId) || POPULAR_SONIC_VOICES.find((v) => v.id === voiceId))
      : AURA_VOICES.find((v) => v.id === voiceId);

    // Prioritize explicit language (e.g. from regional flyout selector), then voice's native language, then existing agent language, falling back to English
    const targetLang = explicitLang || voiceObj?.language || agentData.voice?.language || "en";
    const translatedGreeting = NATIVE_DEFAULT_GREETINGS[targetLang] || NATIVE_DEFAULT_GREETINGS["en"];

    setAgentData((prev) => {
      const isDefaultOrGeneric =
        !prev.greeting ||
        prev.greeting.includes("How can I help you today?") ||
        prev.greeting.includes("How can I assist you?") ||
        prev.greeting.includes("reaching out to support") ||
        prev.greeting.includes("AI voice assistant") ||
        Object.values(NATIVE_DEFAULT_GREETINGS).includes(prev.greeting);

      return {
        ...prev,
        greeting: isDefaultOrGeneric ? translatedGreeting : prev.greeting,
        voice: {
          ...prev.voice,
          provider: isSonic ? "cartesia" : "deepgram",
          model: isSonic ? "sonic-3.5" : "flux",
          voice: voiceId,
          language: targetLang
        },
        listen: {
          ...prev.listen,
          provider: prev.listen?.provider || "deepgram",
          model: prev.listen?.model || "nova-3",
          language: targetLang
        }
      };
    });
  };

  const handleEngineSwitch = (engine: "flux" | "sonic") => {
    setSelectedEngine(engine);
    const currentLang = agentData.voice?.language || "en";
    if (engine === "sonic") {
      // Find a Sonic voice matching current language if possible, else default to Harlow
      const matchingSonic = sonicVoices.find((v) => v.language === currentLang);
      const targetSonicId = matchingSonic ? matchingSonic.id : "6c756032-11c3-4be8-a120-74f9673fb700";
      handleVoiceChange(targetSonicId, matchingSonic ? currentLang : undefined);
      prefetchVoiceSample(targetSonicId);
    } else {
      // Find a Flux voice matching current language if possible, else default to Hannah
      const matchingFlux = AURA_VOICES.find((v) => v.language === currentLang);
      const targetFluxId = matchingFlux ? matchingFlux.id : "flux-hannah-en";
      handleVoiceChange(targetFluxId, matchingFlux ? currentLang : "en");
      prefetchVoiceSample(targetFluxId);
    }
  };

  const handleLanguageChange = (lang: string) => {
    // 1. Find matching native voice for the selected language
    const currentVoiceObj = AURA_VOICES.find((v) => v.id === selectedVoiceId) || sonicVoices.find((v) => v.id === selectedVoiceId);
    let targetVoiceId = selectedVoiceId;

    if (selectedEngine === "sonic") {
      const nativeSonic = sonicVoices.find((v) => v.language === lang);
      if (nativeSonic) targetVoiceId = nativeSonic.id;
    } else {
      // If current voice does not support the newly selected language, automatically switch to the native voice
      if (currentVoiceObj?.language !== lang) {
        const langConfig = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
        const nativeVoice = AURA_VOICES.find((v) => v.language === lang);
        targetVoiceId = (langConfig as any)?.defaultVoice || nativeVoice?.id || "aura-2-thalia-en";
      }
    }

    // 2. Stop any currently playing preview
    stopCurrentAudio();

    // 3. Clear audio cache to avoid stale language previews
    audioBlobCacheRef.current.clear();

    // 4. Update voice and listen atomically
    handleVoiceChange(targetVoiceId, lang);

    // 5. Pre-warm preview for newly selected voice in the target language
    prefetchVoiceSample(targetVoiceId);
  };

  // Custom Voice Dropdown State
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
  const voiceDropdownRef = useRef<HTMLDivElement>(null);

  // Active Voice Language Flyout State (keeps popup open on click or hover)
  const [openFlyoutVoiceId, setOpenFlyoutVoiceId] = useState<string | null>(null);

  // Custom Language Dropdown State (Step 3 Main Selector)
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  // Modal Toolbar Language Filter Dropdown State
  const [isModalLangFilterOpen, setIsModalLangFilterOpen] = useState(false);
  const modalLangFilterRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(event.target as Node)) {
        setIsVoiceDropdownOpen(false);
      }
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
      if (modalLangFilterRef.current && !modalLangFilterRef.current.contains(event.target as Node)) {
        setIsModalLangFilterOpen(false);
      }
      const target = event.target as HTMLElement;
      if (!target.closest("[data-flyout-container]")) {
        setOpenFlyoutVoiceId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedVoiceObj = useMemo(() => {
    if (selectedEngine === "sonic") {
      return (
        sonicVoices.find((v) => v.id === selectedVoiceId) ||
        POPULAR_SONIC_VOICES.find((v) => v.id === selectedVoiceId) ||
        POPULAR_SONIC_VOICES[0]
      );
    }
    return AURA_VOICES.find((v) => v.id === selectedVoiceId) || AURA_VOICES[0];
  }, [selectedEngine, selectedVoiceId, sonicVoices]);

  const selectedMetadata = useMemo(() => {
    if (selectedEngine === "sonic") {
      return {
        accent: (selectedVoiceObj.language || "en").toUpperCase(),
        tone: selectedVoiceObj.style || "Ultra-Natural",
        bestFor: "Customer Care & Sales"
      };
    }
    return VOICE_METADATA_MAP[selectedVoiceId] || {
      accent: "US English",
      tone: selectedVoiceObj.style,
      bestFor: "General Telephony"
    };
  }, [selectedEngine, selectedVoiceId, selectedVoiceObj]);

  // Unique languages available in Sonic voices
  const availableSonicLanguages = useMemo(() => {
    const set = new Set<string>();
    sonicVoices.forEach((v) => {
      if (v.language) set.add(v.language);
    });
    return Array.from(set).sort();
  }, [sonicVoices]);

  // Filtered voice list for the rich dropdown catalog (Featuring flagship calibrated voices)
  const filteredVoices = useMemo(() => {
    const rawList = selectedEngine === "sonic" ? POPULAR_SONIC_VOICES : AURA_VOICES;

    return rawList.filter((v) => {
      // Sonic language filter
      if (selectedEngine === "sonic" && sonicLangFilter !== "all" && v.language !== sonicLangFilter) {
        return false;
      }

      // 1. Gender / Language filter
      if (activeFilter === "female" && (v.gender || "").toLowerCase() !== "female") return false;
      if (activeFilter === "male" && (v.gender || "").toLowerCase() !== "male") return false;
      if (activeFilter === "english" && (v.language !== "en" || (v.id.startsWith("aura-2-") && !v.id.endsWith("-en")))) return false;
      if (activeFilter === "multilingual" && v.language === "en" && !v.id.startsWith("aura-2")) return false;

      // 2. Use-case category (sales, support, ...) for Flux
      if (selectedEngine === "flux" && activeCategory !== "all" && !getVoiceCategories(v.id).includes(activeCategory as any)) return false;

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const meta = VOICE_METADATA_MAP[v.id];
        const matchName = (v.name || "").toLowerCase().includes(q);
        const matchDesc = (v.description || "").toLowerCase().includes(q);
        const matchStyle = (v.style || "").toLowerCase().includes(q);
        const matchBest = (meta?.bestFor || "").toLowerCase().includes(q);
        const matchTone = (meta?.tone || "").toLowerCase().includes(q);
        const matchAccent = (meta?.accent || "").toLowerCase().includes(q);
        const matchLang = (v.language || "").toLowerCase().includes(q);
        const matchCategory = selectedEngine === "flux" ? getVoiceCategories(v.id).some((c) =>
          (VOICE_CATEGORIES.find((x) => x.id === c)?.label || "").toLowerCase().includes(q)
        ) : false;
        return matchName || matchDesc || matchStyle || matchBest || matchTone || matchAccent || matchCategory || matchLang;
      }
      // Tab Filter: featured vs saved
      if (voiceTab === "saved" && !savedVoiceIds.has(v.id)) return false;

      return true;
    });
  }, [selectedEngine, sonicLangFilter, searchQuery, activeFilter, activeCategory, voiceTab, savedVoiceIds]);

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-1.5">
              Voice, Speed &amp; Language
            </h2>
            <InfoTooltip
              content="Select Aura ultra-low latency lifelike telephony voice, conversational speed, and AI intelligence model."
              position="top"
            />
          </div>
        </div>
      </div>

      {/* Section 1: Rich Production Voice Picker */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3 relative z-30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--color-border)]/60 pb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Voice Model Engine
              </label>
              <InfoTooltip
                content="Choose between Flux Conversation Engine for standard clarity or Sonic Engine for hyper-realistic human prosody, breathing, and sub-100ms ultra-low latency."
                position="top"
              />
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              Select your conversational synthesis architecture
            </p>
          </div>

          {/* Engine Dual Toggle: Flux vs Sonic */}
          <div className="inline-flex p-1 bg-[var(--color-surface-muted)] rounded-lg border border-[var(--color-border)] self-start sm:self-center shadow-2xs">
            <button
              type="button"
              onClick={() => handleEngineSwitch("flux")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedEngine === "flux"
                  ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs border border-[var(--color-border)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Flux Engine</span>
              <span className="text-[9px] px-1 py-0.2 bg-[var(--color-primary-light)]/40 text-[var(--color-primary)] rounded font-medium">Standard</span>
            </button>

            <button
              type="button"
              onClick={() => handleEngineSwitch("sonic")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedEngine === "sonic"
                  ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs border border-[var(--color-border)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Sonic Engine</span>
              <span className="text-[9px] px-1 py-0.2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded font-bold border border-emerald-500/20">Hyper-Real</span>
            </button>
          </div>
        </div>

        {/* Selected Engine Subheader & Stats */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
          <span className="text-[var(--color-muted)]">
            {selectedEngine === "sonic" ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Cartesia Sonic Active • Sub-100ms streaming TTS &amp; natural breathing
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[var(--color-muted)] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                Flux Spoken AI Active • Reliable low-latency conversational telephony
              </span>
            )}
          </span>
          <span className="text-[10px] text-[var(--color-muted)] font-mono">
            {selectedEngine === "sonic"
              ? `${POPULAR_SONIC_VOICES.length} Featured Sonic Voices Available`
              : `${AURA_VOICES.length} Featured Flux Voices Available`}
          </span>
        </div>

        {/* Dropdown Button + Quick Preview Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
          {/* Custom Controlled Rich Voice Dropdown Button */}
          <div className="flex-1 min-w-0 relative" ref={voiceDropdownRef}>
            <button
              type="button"
              onClick={() => setIsVoiceDropdownOpen(!isVoiceDropdownOpen)}
              className={`w-full min-h-[42px] px-3.5 py-1.5 text-xs bg-[var(--color-surface-muted)] border rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] font-semibold flex items-center justify-between gap-2.5 focus:outline-none cursor-pointer select-none transition-all ${
                isVoiceDropdownOpen
                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 shadow-xs"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                {/* Voice Avatar Badge */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border ${
                  selectedEngine === "sonic"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20"
                }`}>
                  {selectedVoiceObj.name[0]}
                </div>

                <div className="min-w-0 flex items-center gap-2 flex-wrap truncate">
                  <span className="font-bold text-xs text-[var(--color-heading)]">
                    {selectedVoiceObj.name}
                  </span>

                  {/* Engine Badge */}
                  <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                    selectedEngine === "sonic"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-[var(--color-primary-light)] text-[var(--color-primary)] border-[var(--color-primary)]/20"
                  }`}>
                    {selectedEngine.toUpperCase()}
                  </span>

                  {/* Accent Tag */}
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)]">
                    <Globe className="w-2.5 h-2.5 text-[var(--color-muted)]" />
                    <span>{selectedMetadata.accent}</span>
                  </span>

                  {/* Tone Tag */}
                  <span className="inline-flex items-center text-[10px] font-medium bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)]">
                    {selectedMetadata.tone}
                  </span>

                  {/* Best For Tag */}
                  <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] bg-[var(--color-primary-light)]/20 px-2 py-0.5 rounded border border-[var(--color-primary)]/20">
                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                    <span>{selectedMetadata.bestFor}</span>
                  </span>
                </div>
              </div>

              <ChevronDown className={`w-4 h-4 text-[var(--color-muted)] shrink-0 transition-transform duration-200 ${isVoiceDropdownOpen ? "rotate-180 text-[var(--color-primary)]" : ""}`} />
            </button>

            {/* Rich Dropdown Panel matching Image 1 - Clean, Modern & Productive */}
            {isVoiceDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in text-xs font-sans">
                {/* Top Bar with Selected Voice Pill and Close Icon */}
                <div className="px-3.5 py-2.5 bg-[var(--color-surface-muted)]/50 border-b border-[var(--color-border)]/70 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                    <span className="font-bold text-xs text-[var(--color-heading)]">
                      {selectedVoiceObj.name}
                    </span>
                    <span className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5 font-medium bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-border)] shadow-2xs">
                      <CountryFlag code={getVoiceCountryCode(selectedVoiceObj.id, selectedVoiceObj.language)} />
                      <span>+{selectedEngine === "sonic" ? ALL_SONIC_SUPPORTED_LANGUAGES.length - 1 : (selectedVoiceObj.id.startsWith("aura-2") ? 5 : 0)}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsVoiceDropdownOpen(false)}
                    className="w-6 h-6 rounded-md hover:bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-heading)] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="p-3 pb-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search voices by name, accent, tone, or language..."
                      className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)]"
                    />
                  </div>
                </div>

                {/* Filter Toolbar & Tab Bar */}
                <div className="px-3 pb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)]/70">
                  {/* Select Dropdown Filters */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Direct Engine Switcher Pill (Sonic vs Flux) */}
                    <div className="inline-flex p-0.5 bg-[var(--color-surface-muted)] rounded-md border border-[var(--color-border)] shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handleEngineSwitch("flux")}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          selectedEngine === "flux"
                            ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs border border-[var(--color-border)]"
                            : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                        }`}
                      >
                        <Zap className="w-3 h-3 text-[var(--color-primary)]" />
                        <span>Flux</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEngineSwitch("sonic")}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          selectedEngine === "sonic"
                            ? "bg-[var(--color-surface)] text-emerald-600 dark:text-emerald-400 shadow-xs border border-[var(--color-border)]"
                            : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                        }`}
                      >
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        <span>Sonic</span>
                      </button>
                    </div>

                    {/* Gender Select with Icon */}
                    <div className="relative">
                      <select
                        value={activeFilter}
                        onChange={(e) => setActiveFilter(e.target.value as any)}
                        className="h-7 pl-6 pr-6 text-[11px] font-medium bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] appearance-none cursor-pointer"
                      >
                        <option value="all">Any gender</option>
                        <option value="female">Female (♀)</option>
                        <option value="male">Male (♂)</option>
                      </select>
                      <User className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
                      <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
                    </div>

                    {/* Language Filter Dropdown with Real Country Flags and Scrollable List */}
                    <div className="relative" ref={modalLangFilterRef}>
                      <button
                        type="button"
                        onClick={() => setIsModalLangFilterOpen(!isModalLangFilterOpen)}
                        className="h-7 px-2 text-[11px] font-medium bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md text-[var(--color-heading)] flex items-center gap-1.5 hover:border-[var(--color-primary)] transition-all cursor-pointer"
                      >
                        {selectedEngine === "sonic" && sonicLangFilter !== "all" ? (
                          <>
                            <CountryFlag code={LANG_TO_COUNTRY_CODE[sonicLangFilter] || "us"} />
                            <span className="truncate max-w-[85px]">
                              {SUPPORTED_LANGUAGES.find((l) => l.code === sonicLangFilter)?.label.split(" (")[0] || sonicLangFilter.toUpperCase()}
                            </span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-3 h-3 text-[var(--color-muted)] shrink-0" />
                            <span>Any language</span>
                          </>
                        )}
                        <ChevronDown className={`w-3 h-3 text-[var(--color-muted)] shrink-0 transition-transform ${isModalLangFilterOpen ? "rotate-180 text-[var(--color-primary)]" : ""}`} />
                      </button>

                      {isModalLangFilterOpen && (
                        <div className="absolute left-0 top-full mt-1 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-1 z-50 max-h-60 overflow-y-auto scrollbar-thin space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-150">
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedEngine === "sonic") setSonicLangFilter("all");
                              else setActiveFilter("all");
                              setIsModalLangFilterOpen(false);
                            }}
                            className={`w-full px-2 py-1.5 rounded text-[11px] flex items-center justify-between gap-1.5 cursor-pointer text-left transition-colors ${
                              (selectedEngine === "sonic" ? sonicLangFilter === "all" : activeFilter === "all")
                                ? "bg-[var(--color-primary-light)]/40 text-[var(--color-primary)] font-bold"
                                : "text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                              <span>Any language (All)</span>
                            </div>
                            {(selectedEngine === "sonic" ? sonicLangFilter === "all" : activeFilter === "all") && (
                              <Check className="w-3 h-3 text-[var(--color-primary)]" />
                            )}
                          </button>

                          {SUPPORTED_LANGUAGES.map((lang) => {
                            const isSelected = selectedEngine === "sonic" ? sonicLangFilter === lang.code : false;
                            const countryCode = LANG_TO_COUNTRY_CODE[lang.code] || "us";
                            return (
                              <button
                                key={lang.code}
                                type="button"
                                onClick={() => {
                                  if (selectedEngine === "sonic") setSonicLangFilter(lang.code);
                                  else {
                                    if (["es", "fr", "de", "it", "ja"].includes(lang.code)) {
                                      setActiveFilter("multilingual");
                                    } else {
                                      setActiveFilter("all");
                                    }
                                  }
                                  setIsModalLangFilterOpen(false);
                                }}
                                className={`w-full px-2 py-1.5 rounded text-[11px] flex items-center justify-between gap-1.5 cursor-pointer text-left transition-colors ${
                                  isSelected
                                    ? "bg-[var(--color-primary-light)]/40 text-[var(--color-primary)] font-bold"
                                    : "text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <CountryFlag code={countryCode} />
                                  <span className="truncate">{lang.label}</span>
                                </div>
                                {isSelected && <Check className="w-3 h-3 text-[var(--color-primary)] shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clean Navigation Tabs: Featured | Saved */}
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-muted)]">
                    {[
                      { id: "featured", label: `Featured (${selectedEngine === "sonic" ? POPULAR_SONIC_VOICES.length : AURA_VOICES.length})` },
                      { id: "saved", label: `Saved (${savedVoiceIds.size})` }
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setVoiceTab(t.id as any)}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          voiceTab === t.id
                            ? "text-[var(--color-primary)] font-bold border-b-2 border-[var(--color-primary)] bg-[var(--color-primary-light)]/20"
                            : "hover:text-[var(--color-heading)]"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clean Scrollable List of Voice Items matching Image 1 */}
                <div
                  onScroll={(e) => {
                    const target = e.currentTarget;
                    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 150) {
                      setVisibleLimit((prev) => Math.min(prev + 40, filteredVoices.length));
                    }
                  }}
                  className="max-h-[360px] overflow-y-auto divide-y divide-[var(--color-border)]/50 focus:outline-none scrollbar-thin"
                >
                  {filteredVoices.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[var(--color-muted)]">
                      {searchQuery.trim()
                        ? `No voices found matching "${searchQuery}".`
                        : "No voices found in this tab or filter. Try switching tabs."}
                    </div>
                  ) : (
                    filteredVoices.slice(0, visibleLimit).map((v) => {
                      const isSelected = selectedVoiceId === v.id;
                      const isVoicePlaying = playingVoiceId === v.id;
                      const meta = VOICE_METADATA_MAP[v.id] || {
                        accent: v.language === "en" ? "US English" : v.language.toUpperCase(),
                        tone: v.style || "Natural Conversational",
                        bestFor: "Customer Care & Support"
                      };
                      const isFemale = (v.gender || "").toLowerCase() === "female";
                      const isSaved = savedVoiceIds.has(v.id);
                      const primaryCountryCode = getVoiceCountryCode(v.id, v.language);
                      const voiceEngine = (v as any).engine || (v.id.includes("-") && !v.id.startsWith("flux-") && !v.id.startsWith("aura-") ? "sonic" : "flux");
                      const supportedList = getVoiceSupportedList(v.id, voiceEngine, v.language);
                      const extraCount = supportedList.length > 1 ? `+${supportedList.length - 1}` : "";

                      return (
                        <div
                          key={v.id}
                          onMouseEnter={() => prefetchVoiceSample(v.id)}
                          onClick={() => {
                            handleVoiceChange(v.id);
                            setIsVoiceDropdownOpen(false);
                          }}
                          className={`px-4 py-3 flex items-center justify-between gap-3.5 cursor-pointer transition-all group select-none ${
                            isSelected
                              ? "bg-[var(--color-primary-light)]/25 text-[var(--color-heading)]"
                              : "hover:bg-[var(--color-surface-muted)]/70 text-[var(--color-heading)]"
                          }`}
                        >
                          {/* Far Left: Prominent Circular Play/Stop Button with Primary Brand Color */}
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playVoiceSample(v.id);
                              }}
                              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-xs ${
                                isVoicePlaying
                                  ? "bg-[var(--color-primary)] text-white ring-2 ring-[var(--color-primary)]/40 animate-pulse"
                                  : "bg-[var(--color-primary-light)]/40 text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white border border-[var(--color-primary)]/30"
                              }`}
                              title={isVoicePlaying ? "Stop audio" : `Play ${v.name} voice preview`}
                            >
                              {isVoicePlaying ? (
                                <Square className="w-3.5 h-3.5 fill-current" />
                              ) : (
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              )}
                            </button>

                            {/* Middle Details: Name + Persona + Gender Glyph + Wave Effect + Description */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-xs text-[var(--color-heading)] group-hover:text-[var(--color-primary)] transition-colors">
                                  {v.name}
                                </span>
                                <span className="text-[11px] text-[var(--color-muted)] font-normal">
                                  - {meta.tone || meta.bestFor}
                                </span>
                                {/* Verified badge */}
                                <span className="w-3.5 h-3.5 rounded-full bg-[var(--color-heading)] text-[var(--color-surface)] flex items-center justify-center text-[8px] font-bold shrink-0">
                                  ✓
                                </span>
                                {/* Gender Icon */}
                                <span className={`text-[11px] font-bold ${isFemale ? "text-pink-500" : "text-blue-500"}`}>
                                  {isFemale ? "♀" : "♂"}
                                </span>

                                {/* Minimalist Live Soundwave effect when voice is playing */}
                                {isVoicePlaying && (
                                  <div className="flex items-end gap-0.5 h-3 ml-1">
                                    <span className="w-0.5 h-2 bg-[var(--color-primary)] rounded-full animate-wave-1" />
                                    <span className="w-0.5 h-3 bg-[var(--color-primary)] rounded-full animate-wave-2" />
                                    <span className="w-0.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-wave-3" />
                                    <span className="w-0.5 h-2.5 bg-[var(--color-primary)] rounded-full animate-wave-2" />
                                  </div>
                                )}
                              </div>

                              {/* Clean one-line human description on line 2 */}
                              <div className="text-[11px] text-[var(--color-muted)] truncate max-w-[480px] mt-0.5">
                                {v.description || `Ideal for ${meta.bestFor.toLowerCase()} and natural telephone dialogue.`}
                              </div>
                            </div>
                          </div>

                          {/* Far Right: Multi-language Flag Pill + Bookmark Icon + Active Check */}
                          <div className="flex items-center gap-3 shrink-0">
                            {/* Multilingual Flag + Counter Pill with Zero-Gap Hover & Clickable Flyout */}
                            <div className="relative group/flag" data-flyout-container>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFlyoutVoiceId(openFlyoutVoiceId === v.id ? null : v.id);
                                }}
                                className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md border shadow-2xs font-medium cursor-pointer transition-colors ${
                                  openFlyoutVoiceId === v.id
                                    ? "bg-[var(--color-primary-light)]/40 text-[var(--color-primary)] border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20"
                                    : "text-[var(--color-muted)] bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-heading)]"
                                }`}
                                title="Click or hover to select supported regional languages"
                              >
                                <CountryFlag code={primaryCountryCode} />
                                {extraCount && <span className="font-semibold">{extraCount}</span>}
                              </div>

                              {/* Seamless Flyout Bridge (Zero-Gap) with Direct Selection */}
                              <div
                                className={`absolute right-0 top-full pt-1.5 w-60 z-50 ${
                                  openFlyoutVoiceId === v.id ? "block" : "hidden group-hover/flag:block"
                                }`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl p-2.5 text-xs animate-in fade-in-50 zoom-in-95 duration-150">
                                  <div className="text-[11px] font-semibold text-[var(--color-muted)] mb-2 pb-1.5 border-b border-[var(--color-border)] flex items-center justify-between">
                                    <span>Select Language ({supportedList.length})</span>
                                    <span className="font-mono text-[10px] bg-[var(--color-surface-muted)] px-1.5 py-0.2 rounded border border-[var(--color-border)]">
                                      Active: {(agentData.voice?.language || "en").toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="max-h-56 overflow-y-auto scrollbar-thin space-y-0.5 pr-1">
                                    {supportedList.map((item, idx) => {
                                      const isLangActive = (agentData.voice?.language || "en") === item.lang;
                                      return (
                                        <button
                                          key={idx}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleVoiceChange(v.id, item.lang);
                                            setOpenFlyoutVoiceId(null);
                                            setIsVoiceDropdownOpen(false);
                                          }}
                                          className={`w-full flex items-center justify-between gap-2 py-1.5 px-2 rounded-md text-xs transition-colors cursor-pointer text-left ${
                                            isLangActive
                                              ? "bg-[var(--color-primary-light)]/40 text-[var(--color-primary)] font-bold"
                                              : "text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-primary)]"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 truncate">
                                            <CountryFlag code={item.countryCode} />
                                            <span className="truncate">{item.label}</span>
                                          </div>
                                          {isLangActive && (
                                            <Check className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Bookmark / Favorite Button */}
                            <button
                              type="button"
                              onClick={(e) => toggleSaveVoice(v.id, e)}
                              className={`p-1 rounded hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer ${
                                isSaved ? "text-amber-500" : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                              }`}
                              title={isSaved ? "Remove from saved" : "Save this voice"}
                            >
                              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? "fill-current" : ""}`} />
                            </button>

                            {/* Selection Indicator */}
                            <div className="w-5 h-5 flex items-center justify-center">
                              {isSelected && (
                                <Check className="w-4 h-4 text-[var(--color-primary)] stroke-[2.5]" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Preview Button with Fixed Width to prevent layout jumping */}
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handlePlaySample}
            leftIcon={isPlayingSample ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            className={`cursor-pointer text-xs h-10 px-4 font-semibold shrink-0 min-w-[130px] justify-center transition-all ${
              isPlayingSample ? "bg-[var(--color-primary-hover)] ring-2 ring-[var(--color-primary)]/30" : ""
            }`}
          >
            {isPlayingSample ? "Stop Preview" : "Preview Voice"}
          </Button>
        </div>
        {audioError && <p className="text-[10px] text-[var(--color-danger)] font-medium">{audioError}</p>}
      </div>

      {/* Section 2: Speaking Speed & Language */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Speaking Speed */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <label className="text-xs font-semibold text-[var(--color-heading)]">
                Speaking Speed
              </label>
              <InfoTooltip
                content="Calibrate speech playback rate. 1.0x is standard natural conversation speed."
                position="top"
              />
            </div>
            <div className="flex items-center gap-2">
              {matchedPurpose?.recommendedSpeed !== undefined && (
                <span className="text-[10px] text-[var(--color-muted)] font-medium">
                  Rec: <strong className="text-[var(--color-primary)]">{matchedPurpose.recommendedSpeed}x</strong>
                </span>
              )}
              <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                {agentData.voice?.speed || 1.0}x
              </span>
            </div>
          </div>
          <input
            type="range"
            min="0.8"
            max="1.2"
            step="0.05"
            value={agentData.voice?.speed || 1.0}
            onChange={(e) => setAgentData({
              ...agentData,
              voice: { ...agentData.voice, speed: parseFloat(e.target.value) }
            })}
            className="w-full accent-[var(--color-primary)] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[var(--color-muted)] font-medium">
            <span>0.8x (Slower)</span>
            <span>1.0x (Natural Default)</span>
            <span>1.2x (Faster)</span>
          </div>
        </div>

        {/* Primary Language */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2">
          <div className="flex items-center gap-1">
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Spoken Language &amp; Accent
            </label>
            <InfoTooltip
              content="The primary language spoken by the text-to-speech engine and transcribed by speech recognition."
              position="top"
            />
          </div>
          {/* Custom Themed Language Dropdown */}
          <div className="relative" ref={langDropdownRef}>
            <button
              type="button"
              onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] font-semibold flex items-center justify-between gap-2 focus:outline-none cursor-pointer transition-all ${
                isLangDropdownOpen
                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 shadow-xs"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15"
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <CountryFlag
                  code={LANG_TO_COUNTRY_CODE[agentData.voice?.language || "en"] || "us"}
                  className="w-4 h-3 rounded-[2px] object-cover inline-block shadow-2xs border border-black/10 shrink-0"
                />
                <span className="truncate">
                  {SUPPORTED_LANGUAGES.find((l) => l.code === (agentData.voice?.language || "en"))?.label || "English (US / Global Standard)"}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[var(--color-muted)] shrink-0 transition-transform duration-200 ${
                  isLangDropdownOpen ? "rotate-180 text-[var(--color-primary)]" : ""
                }`}
              />
            </button>

            {isLangDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-xl z-50 max-h-64 overflow-y-auto p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-150 scrollbar-thin">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const isSelected = (agentData.voice?.language || "en") === lang.code;
                  const countryCode = LANG_TO_COUNTRY_CODE[lang.code] || "us";
                  return (
                    <div
                      key={lang.code}
                      onClick={() => {
                        handleLanguageChange(lang.code);
                        setIsLangDropdownOpen(false);
                      }}
                      className={`w-full px-2.5 py-2 rounded-[var(--radius-main,0.25rem)] text-xs flex items-center justify-between gap-2 cursor-pointer transition-all select-none ${
                        isSelected
                          ? "bg-[var(--color-primary)] text-white font-semibold shadow-2xs"
                          : "text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <CountryFlag code={countryCode} />
                        <span className="truncate font-medium">{lang.label}</span>
                        <span className={`text-[10px] ${isSelected ? "text-white/80" : "text-[var(--color-muted)]"}`}>
                          ({lang.native})
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-white stroke-[2.5] shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <MultilingualSettings agentData={agentData} setAgentData={setAgentData} />

      {/* Section 3: Advanced AI Model Settings (Collapsible) */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowAdvancedAI(!showAdvancedAI)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--color-heading)] bg-[var(--color-surface-muted)]/50 hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Advanced AI Model Settings (Optional)</span>
            <InfoTooltip
              content="Configure underlying LLM model, temperature variability, and token response limits."
              position="top"
            />
          </div>
          {showAdvancedAI ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
        </button>

        {showAdvancedAI && (
          <div className="p-4 space-y-4 border-t border-[var(--color-border)] animate-fade-in text-xs">
            {/* AI Model Cards */}
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">
                  Conversational LLM Model
                </label>
                <InfoTooltip
                  content="The reasoning model that interprets user intent and generates conversation replies."
                  position="top"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {LLM_MODELS.map((model) => {
                  const isSelected = (agentData.llm?.model || "gpt-4o-mini") === model.id;

                  return (
                    <div
                      key={model.id}
                      onClick={() => setAgentData({
                        ...agentData,
                        llm: {
                          ...agentData.llm,
                          model: model.id,
                          provider: (model as any).provider || agentData.llm?.provider || "open_ai"
                        }
                      })}
                      className={`p-3 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex flex-col justify-between select-none ${isSelected
                          ? "bg-[var(--color-primary-light)] border-[var(--color-primary)] shadow-2xs ring-1 ring-[var(--color-primary)]/30 font-semibold"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))]"
                        }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <h4 className="text-xs font-bold text-[var(--color-heading)] truncate">{model.name}</h4>
                            {model.description && (
                              <InfoTooltip content={model.description} position="top" />
                            )}
                          </div>
                          {model.recommended && (
                            <Badge variant="success" className="text-[9px] py-0 px-1 font-semibold shrink-0">
                              Recommended
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-[var(--color-muted)] mt-2 pt-1 border-t border-[var(--color-border)]">
                        <span>Speed: <strong>{model.speed}</strong></span>
                        <span>Cost: <strong>{model.cost}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Temperature and Max Tokens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">
                      Temperature (Predictability)
                    </label>
                    <InfoTooltip
                      content="Lower temperature produces more predictable, factual answers; higher values allow more natural phrasing variance."
                      position="top"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {matchedPurpose?.recommendedTemperature !== undefined && (
                      <span className="text-[10px] text-[var(--color-muted)] font-medium">
                        Rec: <strong className="text-[var(--color-primary)]">{matchedPurpose.recommendedTemperature}</strong>
                      </span>
                    )}
                    <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                      {agentData.llm?.temperature ?? 0.4}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={agentData.llm?.temperature ?? 0.4}
                  onChange={(e) => setAgentData({
                    ...agentData,
                    llm: { ...agentData.llm, temperature: parseFloat(e.target.value) }
                  })}
                  className="w-full accent-[var(--color-primary)] cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <label className="block text-xs font-semibold text-[var(--color-heading)]">
                    Maximum Tokens Per Spoken Turn
                  </label>
                  <InfoTooltip
                    content="Limits the length of a single spoken reply to keep telephony turns snappy and interactive."
                    position="top"
                  />
                </div>
                <input
                  type="number"
                  min="50"
                  max="800"
                  step="50"
                  value={agentData.llm?.max_tokens || 300}
                  onChange={(e) => setAgentData({
                    ...agentData,
                    llm: { ...agentData.llm, max_tokens: parseInt(e.target.value) || 300 }
                  })}
                  className="w-full h-8 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: Phonetic Pronunciation Dictionary */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                <span>Phonetic Pronunciation Dictionary &amp; Spoken Rules</span>
                <InfoTooltip
                  content="Define exact phonetic pronunciations for proper nouns, Indian cities, brand names, and business acronyms so the speech engine articulates them with 100% natural, human-grade clarity."
                  position="top"
                />
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="primary" size="sm" className="text-[10px] font-mono font-bold">
              {pronunciationRules.length} Active Rules
            </Badge>
            <button
              type="button"
              onClick={() => setIsPronunciationOpen(!isPronunciationOpen)}
              className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-heading)] transition-colors cursor-pointer"
            >
              {isPronunciationOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isPronunciationOpen && (
          <div className="space-y-4 pt-1 border-t border-[var(--color-border)]">
            {/* Quick Preset Packs */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                Quick-Add Presets:
              </span>
              <button
                type="button"
                onClick={() => handleLoadPresetPack("general")}
                className="px-2.5 py-1 text-[11px] rounded-[var(--radius-main,0.25rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-surface)] text-[var(--color-heading)] font-medium flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3 text-[var(--color-primary)]" />
                <span>Global English Words (Schedule, Status, Route...)</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoadPresetPack("acronyms")}
                className="px-2.5 py-1 text-[11px] rounded-[var(--radius-main,0.25rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-surface)] text-[var(--color-heading)] font-medium flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3 text-[var(--color-primary)]" />
                <span>Telephony &amp; Business Acronyms (B2B, FAQ, API, VIP...)</span>
              </button>
              <button
                type="button"
                onClick={handleResetPronunciationRules}
                className="px-2 py-1 text-[10px] rounded text-[var(--color-muted)] hover:text-[var(--color-heading)] flex items-center gap-1 transition-colors ml-auto cursor-pointer"
                title="Reset to recommended defaults"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Defaults</span>
              </button>
            </div>

            {/* Add New Rule Row */}
            <div className="p-3 bg-[var(--color-surface-muted)]/60 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2">
              <span className="text-[11px] font-bold text-[var(--color-heading)]">Add Custom Word Override</span>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    placeholder="Written word (e.g. Schedule)"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    placeholder="Spoken phonetic (e.g. sked-jool)"
                    value={newPhonetic}
                    onChange={(e) => setNewPhonetic(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full h-8 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer"
                  >
                    <option value="custom">Custom</option>
                    <option value="general">General Word</option>
                    <option value="acronyms">Acronym</option>
                    <option value="brand">Brand</option>
                  </select>

                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleAddPronunciationRule}
                    disabled={!newWord.trim() || !newPhonetic.trim()}
                    className="h-8 px-3 text-xs shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 mr-0.5" />
                    <span>Add</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Rules List / Table */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {pronunciationRules.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--color-muted)]">
                  No pronunciation rules added yet. Click one of the quick presets above or add a custom rule.
                </div>
              ) : (
                pronunciationRules.map((rule, idx) => (
                  <div
                    key={`${rule.word}-${idx}`}
                    className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-xs hover:border-[var(--color-primary)]/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-semibold text-[var(--color-heading)]">{rule.word}</span>
                      <span className="text-[var(--color-muted)] text-[11px]">&rarr;</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px]">
                        "{rule.phonetic}"
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" size="sm" className="text-[9px] py-0 px-1.5 capitalize text-[var(--color-muted)]">
                        {rule.category?.replace(/_/g, " ") || "general"}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handleRemovePronunciationRule(idx)}
                        className="p-1 text-[var(--color-muted)] hover:text-red-500 transition-colors cursor-pointer"
                        title="Remove rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
