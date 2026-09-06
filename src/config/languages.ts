export type TargetLanguage = "es" | "fr" | "en";

export type LanguageLevel = "beginner" | "intermediate" | "advanced";

export type LanguageConfig = {
  code: TargetLanguage;
  name: string;
  flag: string;
  whisperLanguage: string;
  ttsVoice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  levelAsk: string;
  conversationNudge: {
    reply: string;
    replyExplanation: string;
  };
  quizMessages: {
    correct: string[];
    encouragement: string[];
  };
  conversationEncouragement: string[];
  openingLines: Record<LanguageLevel, string>;
  quizOutro: string;
  fillBlankTeacherPrompt: string;
  fillBlankUserPrompt: (word: string) => string;
  gradeInflectionRules: string;
  reviewAsk: (translation: string) => string;
  inactivity: {
    neverStarted24h: string;
    neverStarted72h: string;
    weekPause: string;
    recallTemplate: (word: string, translation: string) => string;
    monthProgress: (count: number) => string;
    finalPause: string;
  };
  moderationRedirect: string;
  moderationSafeTopic: string;
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
    levelAsk: "Great! What's your Spanish level?",
    conversationNudge: {
      reply: "¡Inténtalo en español! 😊 No importa si cometes errores.",
      replyExplanation:
        "I encouraged you to try replying in Spanish, letting you know it's okay to make mistakes.",
    },
    quizMessages: {
      correct: ["¡Correcto! 🎉", "¡Muy bien! ✨", "¡Exacto! 🌟", "¡Perfecto! 💪", "¡Excelente! 🎯"],
      encouragement: ["¡Sigue así! 💪", "¡Tú puedes! 🌟", "¡Casi! Inténtalo de nuevo 😊"],
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
    reviewAsk: (translation) =>
      `🔁 Quick review! How do you say "${translation}" in Spanish?\n(Respond by voice or text!)`,
    inactivity: {
      neverStarted24h: "¡Hola! Ready to start practicing? Just send me a message 🇪🇸",
      neverStarted72h: "Still here when you're ready! Even 5 minutes of Spanish practice makes a difference 💪",
      weekPause:
        "Hola! 👋 You haven't practiced in a week, so I'm pausing your daily words for now. When you're ready to continue, just send me any message and we'll pick up right where you left off. ¡Hasta pronto!",
      recallTemplate: (word, translation) =>
        `¿Todavía recuerdas qué significa «${word}»? It means "${translation}" — and you learned it! Come back and keep going. 💪`,
      monthProgress: (count) =>
        `You've already learned ${count} Spanish words. That's real progress — don't let it go to waste. The next word is waiting for you. 👀`,
      finalPause:
        "We gave it our best shot! 😄 I'm pausing all messages for now so I don't bother you. Whenever you want to pick up Spanish again, just send me a message — I'll be here. ¡Buena suerte!",
    },
    moderationRedirect:
      "Let's keep things focused on safe Spanish practice. Try a friendly topic and we can continue.",
    moderationSafeTopic:
      "Let's switch to a safer topic and keep practicing Spanish together. Try asking about travel, food, or daily conversation.",
  },
  fr: {
    code: "fr",
    name: "French",
    flag: "🇫🇷",
    whisperLanguage: "fr",
    ttsVoice: "alloy",
    levelAsk: "Great! What's your French level?",
    conversationNudge: {
      reply: "Essaie en français ! 😊 Ce n'est pas grave si tu fais des erreurs.",
      replyExplanation:
        "I encouraged you to try replying in French, letting you know it's okay to make mistakes.",
    },
    quizMessages: {
      correct: ["Correct ! 🎉", "Très bien ! ✨", "Exactement ! 🌟", "Parfait ! 💪", "Excellent ! 🎯"],
      encouragement: ["Continue comme ça ! 💪", "Tu y arrives ! 🌟", "Presque ! Réessaie 😊"],
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
    reviewAsk: (translation) =>
      `🔁 Quick review! How do you say "${translation}" in French?\n(Respond by voice or text!)`,
    inactivity: {
      neverStarted24h: "Bonjour! Ready to start practicing? Just send me a message 🇫🇷",
      neverStarted72h: "Still here when you're ready! Even 5 minutes of French practice makes a difference 💪",
      weekPause:
        "Bonjour! 👋 You haven't practiced in a week, so I'm pausing your daily words for now. When you're ready to continue, just send me any message and we'll pick up right where you left off. À bientôt!",
      recallTemplate: (word, translation) =>
        `Tu te souviens encore de ce que signifie «${word}» ? It means "${translation}" — and you learned it! Come back and keep going. 💪`,
      monthProgress: (count) =>
        `You've already learned ${count} French words. That's real progress — don't let it go to waste. The next word is waiting for you. 👀`,
      finalPause:
        "We gave it our best shot! 😄 I'm pausing all messages for now so I don't bother you. Whenever you want to pick up French again, just send me a message — I'll be here. Bonne chance!",
    },
    moderationRedirect:
      "Let's keep things focused on safe French practice. Try a friendly topic and we can continue.",
    moderationSafeTopic:
      "Let's switch to a safer topic and keep practicing French together. Try asking about travel, food, or daily conversation.",
  },
  en: {
    code: "en",
    name: "English",
    flag: "🇬🇧",
    whisperLanguage: "en",
    ttsVoice: "alloy",
    levelAsk: "Great! What's your English level?",
    conversationNudge: {
      reply: "Try it in English! 😊 It's okay to make mistakes.",
      replyExplanation:
        "I encouraged you to try replying in English, letting you know it's okay to make mistakes.",
    },
    quizMessages: {
      correct: ["Correct! 🎉", "Nice work! ✨", "Exactly! 🌟", "Perfect! 💪", "Excellent! 🎯"],
      encouragement: ["Keep going! 💪", "You've got this! 🌟", "Almost! Try again 😊"],
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
    reviewAsk: (translation) =>
      `🔁 Quick review! Which English word means "${translation}"?\n(Respond by voice or text!)`,
    inactivity: {
      neverStarted24h: "Hi! Ready to start practicing? Just send me a message 🇬🇧",
      neverStarted72h: "Still here when you're ready! Even 5 minutes of English practice makes a difference 💪",
      weekPause:
        "Hi! 👋 You haven't practiced in a week, so I'm pausing your daily words for now. When you're ready to continue, just send me any message and we'll pick up right where you left off. See you soon!",
      recallTemplate: (word, translation) =>
        `Do you still remember what "${word}" means? It means "${translation}" — and you learned it! Come back and keep going. 💪`,
      monthProgress: (count) =>
        `You've already learned ${count} English words. That's real progress — don't let it go to waste. The next word is waiting for you. 👀`,
      finalPause:
        "We gave it our best shot! 😄 I'm pausing all messages for now so I don't bother you. Whenever you want to pick up English again, just send me a message — I'll be here. Good luck!",
    },
    moderationRedirect:
      "Let's keep things focused on safe English practice. Try a friendly topic and we can continue.",
    moderationSafeTopic:
      "Let's switch to a safer topic and keep practicing English together. Try asking about travel, food, or daily conversation.",
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

export function pickerLabel(code: TargetLanguage, current: TargetLanguage): string {
  const lang = LANGUAGES[code];
  const base = `${lang.flag} ${lang.name}`;
  return code === current ? `${base} ✓` : base;
}

export function languageDisplayLabel(code: TargetLanguage): string {
  const lang = LANGUAGES[code];
  return `${lang.name} ${lang.flag}`;
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

export function settingsLevelAsk(raw: string | null | undefined): string {
  const lang = getLanguageConfig(raw);
  return `What is your ${lang.name} level?`;
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

const MILESTONES = [50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000] as const;

function milestoneMessagesFor(lang: TargetLanguage): Record<number, string> {
  const name = LANGUAGES[lang].name;
  return {
    50: `Nice work! You've learned your first 50 ${name} words — you can already understand basic greetings and everyday phrases!`,
    100: `Congratulations! 100 ${name} words down — you can introduce yourself and understand simple conversations!`,
    250: `Great job! 250 ${name} words learned. You can now handle basic shopping, directions, and small talk!`,
    500: `Incredible! 500 ${name} words — you're building real conversational ability. Keep going!`,
    750: `Excellent! 750 ${name} words learned. You can now express opinions and understand most everyday ${name}!`,
    1000: `Fantastic! 1,000 ${name} words — you've crossed a major milestone. Most conversations are within reach!`,
    1500: `Impressive! 1,500 ${name} words. You're approaching intermediate fluency — keep it up!`,
    2000: `Amazing! 2,000 ${name} words learned. You can read simple texts and hold extended conversations!`,
    3000: `Outstanding! 3,000 ${name} words — you're in advanced territory now. Most native content is accessible!`,
    4000: `You're incredible! 4,000 ${name} words mastered. You're fluent in the most essential vocabulary — well done!`,
  };
}

export function getMilestoneMessage(
  wordsCount: number,
  language: string = DEFAULT_TARGET_LANGUAGE
): string | null {
  if (MILESTONES.includes(wordsCount as (typeof MILESTONES)[number])) {
    const messages = milestoneMessagesFor(parseTargetLanguage(language));
    return messages[wordsCount as (typeof MILESTONES)[number]] ?? null;
  }
  return null;
}
