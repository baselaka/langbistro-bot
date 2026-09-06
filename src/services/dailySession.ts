import { z } from "zod";
import { InlineKeyboard } from "grammy";
import { openai } from "../ai/openai";
import {
  buildGradeSystemPrompt,
  getLanguageConfig,
  parseTargetLanguage,
  type TargetLanguage,
} from "../config/languages";
import { CHAT_MODEL_FREE, CHAT_MODEL_GRADE, chatParams } from "../config/models";
import { supabase } from "../db/client";
import { getLocalDateString } from "../utils/dateTz";
import { checkAnswerMatch, startsWithExpectedPhrase } from "../utils/text";
import { type Vocabulary } from "./vocabulary";

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

/** Exported for unit tests — builds the GPT grading system prompt for a target language. */
export { buildGradeSystemPrompt };

async function gptGradeAnswer(
  userAnswer: string,
  expected: string,
  context: "review" | "fill_blank",
  targetLang: TargetLanguage
): Promise<boolean> {
  const completion = await openai.chat.completions.create({
    ...chatParams(CHAT_MODEL_GRADE, 0),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildGradeSystemPrompt(context, targetLang),
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

/** Exported for unit tests — fill-blank teacher/user prompts for a language. */
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

export async function generateFillBlankSentence(
  word: string,
  language: string = "es",
  avoidExample?: string | null
): Promise<FillBlankSentence> {
  const prompts = buildFillBlankPrompts(word, language, avoidExample);
  try {
    const completion = await openai.chat.completions.create({
      ...chatParams(CHAT_MODEL_FREE, 0.3),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: prompts.system,
        },
        {
          role: "user",
          content: prompts.user,
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

export type FillBlankPrompt = {
  message: string;
  sentence: string;
};

function completeSentenceFromBlanked(blanked: string, word: string): string {
  return blanked.includes("_____") ? blanked.replace("_____", word) : word;
}

export async function buildFillBlank(word: Vocabulary, language: string = "es"): Promise<FillBlankPrompt> {
  const targetLang = parseTargetLanguage(language);
  const generated = await (async () => {
    try {
      const prompts = buildFillBlankPrompts(word.word, targetLang, word.example_sentence);
      const completion = await openai.chat.completions.create({
        ...chatParams(CHAT_MODEL_FREE, 0.3),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: prompts.system,
          },
          {
            role: "user",
            content: prompts.user,
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
      // Fall back to language-aware generator below.
    }

    return await generateFillBlankSentence(word.word, targetLang, word.example_sentence);
  })();

  const sentence = generated.sentence || completeSentenceFromBlanked(generated.blanked, word.word);
  return {
    message: `Fill in the blank:\n"${generated.blanked}"\n(Reply by voice or text!)`,
    sentence,
  };
}

export function buildReviewMessage(word: Vocabulary, language: string = "es"): string {
  const cfg = getLanguageConfig(language);
  const tr = word.translation ?? "";
  return cfg.reviewAsk(tr);
}

export async function evaluateReviewAnswer(
  userAnswer: string,
  correctWord: string,
  language: string = "es"
): Promise<boolean> {
  if (checkAnswerMatch(userAnswer, correctWord)) {
    return true;
  }
  return gptGradeAnswer(userAnswer, correctWord, "review", parseTargetLanguage(language));
}

export async function evaluateFillBlank(
  userAnswer: string,
  expectedWord: string,
  completeSentence?: string,
  language: string = "es"
): Promise<boolean> {
  if (checkAnswerMatch(userAnswer, expectedWord)) {
    return true;
  }
  if (completeSentence && checkAnswerMatch(userAnswer, completeSentence)) {
    return true;
  }
  if (startsWithExpectedPhrase(userAnswer, expectedWord)) {
    return true;
  }
  return gptGradeAnswer(userAnswer, expectedWord, "fill_blank", parseTargetLanguage(language));
}
