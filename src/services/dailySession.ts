import { z } from "zod";
import { InlineKeyboard } from "grammy";
import { openai } from "../ai/openai";
import { CHAT_MODEL_FREE, CHAT_MODEL_GRADE, chatParams } from "../config/models";
import { supabase } from "../db/client";
import { getLocalDateString } from "../utils/dateTz";
import { checkAnswerMatch, type Vocabulary } from "./vocabulary";

export type DailySession = {
  id: number;
  user_id: number;
  date: string;
  words_sent: unknown;
  fill_blank_word_id: number | null;
  review_word_id: number | null;
  engaged: boolean;
  created_at: string;
};

function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

const gradeSchema = z.object({
  correct: z.boolean(),
});

function buildGradeSystemPrompt(context: "review" | "fill_blank"): string {
  return `You grade Spanish learner answers for a language-learning quiz. Return JSON only: {"correct": true} or {"correct": false}.

Be LENIENT with minor typos (1–2 character swaps, missing accents, doubled/missing letters) and with valid conjugations, inflections, gerunds, or gender/number variants of the expected word or phrase. The learner is practicing vocabulary, not spelling perfection.

ADJECTIVE GENDER/NUMBER RULE (apply mechanically, not by example memorization):
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
- Expected "comer", learner "beber" (different verb, not a form of the expected word)

Context: ${context}.`;
}

async function gptGradeSpanishAnswer(
  userAnswer: string,
  expected: string,
  context: "review" | "fill_blank"
): Promise<boolean> {
  const completion = await openai.chat.completions.create({
    ...chatParams(CHAT_MODEL_GRADE, 0),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildGradeSystemPrompt(context),
      },
      {
        role: "user",
        content: `Expected (target word or phrase): ${expected}\nLearner answer: ${userAnswer}\nIs the learner answer correct or close enough?`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  const parsed = JSON.parse(raw);
  return gradeSchema.parse(parsed).correct;
}

export async function getOrCreateDailySession(userId: number, timezone: string): Promise<DailySession> {
  const today = getLocalDateString(timezone);

  const { data, error } = await supabase
    .from("daily_sessions")
    .upsert(
      {
        user_id: userId,
        date: today,
      },
      { onConflict: "user_id,date" }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to get or create daily session: ${error?.message ?? "unknown"}`);
  }

  return data as DailySession;
}

function keycapForIndex(index: number): string {
  const n = index + 1;
  if (n === 10) {
    return "1️⃣0️⃣";
  }
  return `${n}️⃣`;
}

export function buildWordMessage(words: Vocabulary[]): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const blocks: string[] = ["📚 *Your 10 words for today:*", ""];

  words.forEach((w, index) => {
    const emoji = keycapForIndex(index);
    const word = escapeMarkdownV2(w.word);
    const translation = escapeMarkdownV2(w.translation ?? "");
    const example = escapeMarkdownV2(w.example_sentence ?? "");
    blocks.push(`${emoji} *${word}* — ${translation}\n   _"${example}"_`);
    blocks.push("");
  });

  const keyboard = new InlineKeyboard();
  words.forEach((w, i) => {
    keyboard.text(`🔊 ${w.word}`, `listen_word:${w.id}`);
    if ((i + 1) % 3 === 0 && i < words.length - 1) {
      keyboard.row();
    }
  });

  return {
    text: blocks.join("\n").trimEnd(),
    keyboard,
  };
}

type FillBlankSentence = {
  sentence: string;
  blanked: string;
};

export async function generateFillBlankSentence(word: string): Promise<FillBlankSentence> {
  try {
    const completion = await openai.chat.completions.create({
      ...chatParams(CHAT_MODEL_FREE, 0.3),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a Spanish language teacher. Generate a natural Spanish sentence that uses the exact word form provided. The sentence should be 8-12 words long and appropriate for language learners. Return JSON only: {\"sentence\": \"your sentence here\", \"blanked\": \"same sentence with the target word replaced by _____\"}",
        },
        {
          role: "user",
          content: `Generate a sentence using this exact Spanish word: ${word}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as Partial<FillBlankSentence>;
    const sentence = typeof parsed.sentence === "string" ? parsed.sentence.trim() : "";
    const blanked = typeof parsed.blanked === "string" ? parsed.blanked.trim() : "";
    if (sentence && blanked) {
      return { sentence, blanked };
    }
  } catch {
    // Fall through to deterministic fallback message.
  }

  return {
    sentence: "",
    blanked: `Complete this sentence using: ${word}\n_____`,
  };
}

export async function buildFillBlankMessage(word: Vocabulary, language: string = "es"): Promise<string> {
  const { blanked } = await (async () => {
    try {
      const completion = await openai.chat.completions.create({
        ...chatParams(CHAT_MODEL_FREE, 0.3),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              language === "fr"
                ? "You are a French language teacher. Write a natural French sentence using the exact word form provided. The sentence should be 8-12 words long and appropriate for language learners. Return JSON only: {\"sentence\": \"your sentence here\", \"blanked\": \"same sentence with the target word replaced by _____\"}"
                : "You are a Spanish language teacher. Write a natural Spanish sentence using the exact word form provided. The sentence should be 8-12 words long and appropriate for language learners. Return JSON only: {\"sentence\": \"your sentence here\", \"blanked\": \"same sentence with the target word replaced by _____\"}",
          },
          {
            role: "user",
            content: `Generate a sentence using this exact ${language === "fr" ? "French" : "Spanish"} word: ${word.word}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
      const parsed = JSON.parse(raw) as Partial<FillBlankSentence>;
      const sentence = typeof parsed.sentence === "string" ? parsed.sentence.trim() : "";
      const blanked = typeof parsed.blanked === "string" ? parsed.blanked.trim() : "";
      if (sentence && blanked) {
        return { sentence, blanked };
      }
    } catch {
      // Fall back to shared deterministic message below.
    }

    return await generateFillBlankSentence(word.word);
  })();
  return `Fill in the blank:\n"${blanked}"\n(Reply by voice or text!)`;
}

export function buildReviewMessage(word: Vocabulary): string {
  const tr = word.translation ?? "";
  return `🔁 Quick review! How do you say "${tr}" in Spanish?\n(Respond by voice or text!)`;
}

export async function evaluateReviewAnswer(userAnswer: string, correctWord: string): Promise<boolean> {
  if (checkAnswerMatch(userAnswer, correctWord)) {
    return true;
  }
  return gptGradeSpanishAnswer(userAnswer, correctWord, "review");
}

export async function evaluateFillBlank(userAnswer: string, expectedWord: string): Promise<boolean> {
  if (checkAnswerMatch(userAnswer, expectedWord)) {
    return true;
  }
  return gptGradeSpanishAnswer(userAnswer, expectedWord, "fill_blank");
}
