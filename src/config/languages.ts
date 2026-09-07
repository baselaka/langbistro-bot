export type TargetLanguage = "es" | "fr" | "en";

export type LanguageLevel = "beginner" | "intermediate" | "advanced";

export type LanguageConfig = {
  code: TargetLanguage;
  name: string;
  flag: string;
  whisperLanguage: string;
  ttsVoice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  inactivityGreeting: string;
  conversationNudge: {
    reply: string;
  };
  quizMessages: {
    correct: string[];
    encouragement: string[];
    retry: string[];
  };
  conversationEncouragement: string[];
  openingLines: Record<LanguageLevel, string>;
  quizOutro: string;
  fillBlankTeacherPrompt: string;
  fillBlankUserPrompt: (word: string) => string;
  gradeInflectionRules: string;
};

const SHARED_QUIZ_JSON =
  'Return JSON only: {"sentence": "your sentence here", "blanked": "same sentence with the target word replaced by _____"}';

export const LANGUAGES: Record<TargetLanguage, LanguageConfig> = {
  es: {
    code: "es",
    name: "Spanish",
    flag: "🇪🇸",
    whisperLanguage: "es",
    ttsVoice: "alloy",
    inactivityGreeting: "¡Hola!",
    conversationNudge: {
      reply: "¡Inténtalo en español! 😊 No importa si cometes errores.",
    },
    quizMessages: {
      correct: ["¡Correcto! 🎉", "¡Muy bien! ✨", "¡Exacto! 🌟", "¡Perfecto! 💪", "¡Excelente! 🎯"],
      encouragement: ["¡Sigue así! 💪", "¡Tú puedes! 🌟"],
      retry: ["¡Casi! Inténtalo de nuevo 😊"],
    },
    conversationEncouragement: ["¡Muy bien! 🌟", "¡Excelente! ✨", "¡Perfecto! 💪", "¡Sigue así! 🎯", "¡Genial! 🎉"],
    openingLines: {
      beginner: "¡Hola! Soy Bistro. ¿Cómo te llamas?",
      intermediate: "¡Hola! Soy Bistro. ¿Cómo te llamas y de dónde eres?",
      advanced: "¡Buenas! Soy Bistro. Cuéntame — ¿cómo te llamas y qué te trae aquí?",
    },
    quizOutro: "¿O prefieres hablar de otra cosa?",
    fillBlankTeacherPrompt: `You are a Spanish language teacher. Write a natural Spanish sentence using the exact word form provided. The sentence should be 8-12 words long and appropriate for language learners. Do not reuse or lightly paraphrase any provided example sentence — invent a fresh sentence. ${SHARED_QUIZ_JSON}`,
    fillBlankUserPrompt: (word) => `Generate a sentence using this exact Spanish word: ${word}`,
    gradeInflectionRules: `ADJECTIVE GENDER/NUMBER RULE (apply mechanically, not by example memorization):
If the expected word is an adjective (or adjective-like form) and the learner's answer differs ONLY by Spanish gender and/or number agreement endings, mark correct: true whenever the base/lemma is the same word.
- Gender-only: -o ↔ -a (e.g. abierto↔abierta, rojo↔roja, pequeño↔pequeña, cansado↔cansada)
- Number-only: add/remove -s or -es (e.g. rojo↔rojos, abierta↔abiertas)
- Combined gender+number: e.g. abierto↔abiertas, rojo↔rojas, pequeño↔pequeñas
Do NOT require the learner to match the exact citation form. Masculine/feminine and singular/plural agreement forms of the SAME adjective are always valid. Apply this rule even for adjectives not listed in the examples below.

Examples that MUST be correct: true:
- Expected "casa", learner "kasa" (minor typo)
- Expected "gracias", learner "grasias" (minor typo)
- Expected "perro", learner "pero" (one-letter typo; still the intended word)
- Expected "comer", learner "comemos" (valid verb conjugation)
- Expected "comer", learner "comí" (past-tense conjugation of the same verb)
- Expected "beber", learner "bebiendo" (gerund form of the same verb)
- Expected "cansado", learner "cansada" (gender variant)
- Expected "abierto", learner "abiertas" (adjective gender+number agreement)
- Expected "rojo", learner "rojas" (adjective gender+number agreement)
- Expected "pequeño", learner "pequeñas" (adjective gender+number agreement)
- Expected "libro", learner "libros" (number variant)

Examples that MUST be correct: false:
- Expected "casa", learner "perro" (unrelated word)
- Expected "comer", learner "beber" (different verb, not a form of the expected word)`,
  },
  fr: {
    code: "fr",
    name: "French",
    flag: "🇫🇷",
    whisperLanguage: "fr",
    ttsVoice: "alloy",
    inactivityGreeting: "Bonjour !",
    conversationNudge: {
      reply: "Essaie en français ! 😊 Ce n'est pas grave si tu fais des erreurs.",
    },
    quizMessages: {
      correct: ["Correct ! 🎉", "Très bien ! ✨", "Exactement ! 🌟", "Parfait ! 💪", "Excellent ! 🎯"],
      encouragement: ["Continue comme ça ! 💪", "Tu y arrives ! 🌟"],
      retry: ["Presque ! Réessaie 😊"],
    },
    conversationEncouragement: ["Très bien ! 🌟", "Excellent ! ✨", "Parfait ! 💪", "Continue ! 🎯", "Génial ! 🎉"],
    openingLines: {
      beginner: "Bonjour ! Je suis Bistro. Comment tu t'appelles ?",
      intermediate: "Bonjour ! Je suis Bistro. Comment tu t'appelles et d'où viens-tu ?",
      advanced: "Bonjour ! Je suis Bistro. Raconte-moi — comment tu t'appelles et qu'est-ce qui t'amène ici ?",
    },
    quizOutro: "Ou tu préfères parler d'autre chose ?",
    fillBlankTeacherPrompt: `You are a French language teacher. Write a natural French sentence using the exact word form provided. The sentence should be 8-12 words long and appropriate for language learners. Do not reuse or lightly paraphrase any provided example sentence — invent a fresh sentence. ${SHARED_QUIZ_JSON}`,
    fillBlankUserPrompt: (word) => `Generate a sentence using this exact French word: ${word}`,
    gradeInflectionRules: `FRENCH INFLECTION RULE:
Accept valid conjugations, gender/number agreement, and common learner variants of the same lemma.
- Verb conjugations of the same infinitive are correct (e.g. parler ↔ parlons ↔ parlé)
- Adjective gender/number: petit↔petite↔petits↔petites
- Plural -s/-x variants of the same noun are correct when the lemma matches

Examples that MUST be correct: true:
- Expected "maison", learner "meson" (minor typo)
- Expected "merci", learner "mersi" (minor typo)
- Expected "parler", learner "parlons" (valid conjugation)
- Expected "petit", learner "petite" (gender variant)
- Expected "livre", learner "livres" (number variant)

Examples that MUST be correct: false:
- Expected "maison", learner "chien" (unrelated word)
- Expected "parler", learner "manger" (different verb)`,
  },
  en: {
    code: "en",
    name: "English",
    flag: "🇬🇧",
    whisperLanguage: "en",
    ttsVoice: "alloy",
    inactivityGreeting: "Hi!",
    conversationNudge: {
      reply: "Try it in English! 😊 It's okay to make mistakes.",
    },
    quizMessages: {
      correct: ["Correct! 🎉", "Nice work! ✨", "Exactly! 🌟", "Perfect! 💪", "Excellent! 🎯"],
      encouragement: ["Keep going! 💪", "You've got this! 🌟"],
      retry: ["Almost! Try again 😊"],
    },
    conversationEncouragement: ["Nice work! 🌟", "Excellent! ✨", "Perfect! 💪", "Keep going! 🎯", "Great! 🎉"],
    openingLines: {
      beginner: "Hi! I'm Bistro. What's your name?",
      intermediate: "Hi! I'm Bistro. What's your name, and where are you from?",
      advanced: "Hey! I'm Bistro. Tell me — what's your name, and what brings you here?",
    },
    quizOutro: "Or would you rather talk about something else?",
    fillBlankTeacherPrompt: `You are an English language teacher for ESL learners. Write a natural English sentence using the exact word form provided. The sentence should be 8-12 words long and appropriate for language learners. Do not reuse or lightly paraphrase any provided example sentence — invent a fresh sentence. ${SHARED_QUIZ_JSON}`,
    fillBlankUserPrompt: (word) => `Generate a sentence using this exact English word: ${word}`,
    gradeInflectionRules: `ENGLISH INFLECTION RULE:
Accept valid conjugations, plurals, and common learner variants of the same lemma.
- Verb forms of the same base are correct (e.g. walk↔walks↔walked↔walking)
- Regular/irregular plurals of the same noun are correct (e.g. child↔children, book↔books)
- Do NOT require the exact citation form when the lemma matches

Examples that MUST be correct: true:
- Expected "house", learner "houze" (minor typo)
- Expected "thank", learner "thanks" (inflection)
- Expected "walk", learner "walking" (gerund)
- Expected "go", learner "went" (past tense of the same verb)
- Expected "child", learner "children" (plural)

Examples that MUST be correct: false:
- Expected "house", learner "dog" (unrelated word)
- Expected "walk", learner "run" (different verb)`,
  },
};

export const SUPPORTED_LANGUAGES: readonly TargetLanguage[] = ["es", "fr", "en"];

export const DEFAULT_TARGET_LANGUAGE: TargetLanguage = "es";

export function isSupportedLanguage(value: string): value is TargetLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Resolve a stored/raw language code. Unknown values fall back — never treat unknown as Spanish via fr-else-es. */
export function parseTargetLanguage(
  raw: string | null | undefined,
  fallback: TargetLanguage = DEFAULT_TARGET_LANGUAGE
): TargetLanguage {
  if (raw && isSupportedLanguage(raw)) {
    return raw;
  }
  return fallback;
}

export function getLanguageConfig(raw: string | null | undefined): LanguageConfig {
  return LANGUAGES[parseTargetLanguage(raw)];
}

export function buildDetectUserPrompt(text: string, targetLang: TargetLanguage): string {
  if (targetLang === "fr") {
    return `Is the following message written in French? Answer 'no' if it appears to be Spanish, English, Italian, Portuguese, or any other language. Message: ${text}`;
  }
  if (targetLang === "en") {
    return `Is the following message written in English? Answer 'no' if it appears to be Spanish, French, Italian, Portuguese, or any other language. Message: ${text}`;
  }
  return `Is the following message written in Spanish? Answer 'no' if it appears to be French, English, Italian, Portuguese, or any other language. Message: ${text}`;
}

export function buildGradeSystemPrompt(
  context: "review" | "fill_blank",
  targetLang: TargetLanguage = DEFAULT_TARGET_LANGUAGE
): string {
  const lang = LANGUAGES[targetLang];
  return `You grade ${lang.name} learner answers for a language-learning quiz. Return JSON only: {"correct": true} or {"correct": false}.

Be LENIENT with minor typos (1–2 character swaps, missing accents, doubled/missing letters) and with valid conjugations, inflections, gerunds, or gender/number variants of the expected word or phrase. The learner is practicing vocabulary, not spelling perfection.

${lang.gradeInflectionRules}

For fill_blank, the learner may answer with only the missing word, or by saying the completed sentence. If they used the expected word (or a valid variant) to fill the blank, mark correct: true. Reciting the given sentence without the missing word is correct: false.

Context: ${context}.`;
}

/** Pure fill-blank GPT prompt builder — kept free of OpenAI/env imports for unit tests. */
export function buildFillBlankPrompts(
  word: string,
  language: string,
  avoidExample?: string | null
): { system: string; user: string } {
  const cfg = getLanguageConfig(language);
  let system = cfg.fillBlankTeacherPrompt;
  if (avoidExample?.trim()) {
    system += ` Do not reuse or lightly paraphrase this example sentence: "${avoidExample.trim()}".`;
  }
  return {
    system,
    user: cfg.fillBlankUserPrompt(word),
  };
}
