import { z } from "zod";
import { InlineKeyboard } from "grammy";
import { openai } from "../ai/openai";
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

async function gptGradeSpanishAnswer(
  userAnswer: string,
  expected: string,
  context: "review" | "fill_blank"
): Promise<boolean> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You grade Spanish learner answers. Return JSON only: {"correct": true} or {"correct": false}.
Accept correct answers, minor typos, and valid conjugations/inflections of the expected word or phrase.
Context: ${context}.`,
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces first case-insensitive occurrence of `word` with blanks */
export function buildFillBlankMessage(word: Vocabulary): string {
  const sentence = word.example_sentence ?? "";
  const pattern = new RegExp(escapeRegExp(word.word), "i");
  const blanked = sentence.replace(pattern, "_____");

  return `Now try this! Fill in the blank:\n"${blanked}"\n(use your voice or type your answer!)`;
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
