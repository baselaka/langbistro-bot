import { z } from "zod";
import { openai } from "../ai/openai";
import {
  buildFillBlankPrompts,
  buildGradeSystemPrompt,
  parseTargetLanguage,
  type TargetLanguage,
} from "../config/languages";

export { buildFillBlankPrompts };
import { CHAT_MODEL_FREE, CHAT_MODEL_GRADE, chatParams } from "../config/models";
import { supabase } from "../db/client";
import { reviewAsk, t, type InterfaceLanguage } from "../i18n";
import { getLocalDateString } from "../utils/dateTz";
import { checkAnswerMatch, startsWithExpectedPhrase } from "../utils/text";
import { type Vocabulary } from "./vocabulary";
import { resolveGloss } from "./vocabGloss";
import { isDailyWordDelivered, nextUserTurnFields } from "./dailySessionMetrics";
import { buildWordMessage } from "./wordMessage";

export { isDailyWordDelivered };
export { buildWordMessage };
export type DailySession = {
  id: number;
  user_id: number;
  date: string;
  words_sent: unknown;
  words_used: unknown;
  fill_blank_word_id: number | null;
  review_word_id: number | null;
  engaged: boolean;
  delivered_at: string | null;
  engaged_at: string | null;
  user_turns: number;
  completed_at: string | null;
  checklist_message_id: number | null;
  session_win: string | null;
  created_at: string;
};

import { parseSentWords, type SentWordRow } from "../utils/sentWords";

export type { SentWordRow };
export { parseSentWords };

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

/** Claim same-day delivery. Returns false if another cron tick already claimed it. */
export async function markDailyWordDelivered(
  sessionId: number,
  options: {
    deliveredAt?: Date;
    wordsSent?: SentWordRow[];
    fillBlankWordId?: number | null;
  } = {}
): Promise<boolean> {
  const deliveredAt = options.deliveredAt ?? new Date();
  const patch: Record<string, unknown> = {
    engaged: true,
    delivered_at: deliveredAt.toISOString(),
  };
  if (options.wordsSent) {
    patch.words_sent = options.wordsSent;
  }
  if (options.fillBlankWordId !== undefined) {
    patch.fill_blank_word_id = options.fillBlankWordId;
  }

  const { data, error } = await supabase
    .from("daily_sessions")
    .update(patch)
    .eq("id", sessionId)
    .is("delivered_at", null)
    .select("id");

  if (error) {
    throw new Error(`Failed to mark daily session delivered: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}

/** Count a learner reply against today's session (timezone calendar date). */
export async function recordDailySessionUserTurn(userId: number): Promise<void> {
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("preferred_word_timezone")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    throw new Error(`Failed to load user timezone for session turn: ${userError?.message ?? "unknown"}`);
  }

  const session = await getOrCreateDailySession(userId, user.preferred_word_timezone);
  const patch = nextUserTurnFields(
    {
      user_turns: session.user_turns ?? 0,
      engaged_at: session.engaged_at ?? null,
    },
    new Date().toISOString()
  );

  const { error: updateError } = await supabase.from("daily_sessions").update(patch).eq("id", session.id);

  if (updateError) {
    throw new Error(`Failed to record daily session user turn: ${updateError.message}`);
  }
}

type FillBlankSentence = {
  sentence: string;
  blanked: string;
};

export async function generateFillBlankSentence(
  word: string,
  language: string = "es",
  avoidExample?: string | null,
  locale: InterfaceLanguage = "en"
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
    blanked: t(locale, "daily.fillBlankFallback", { word }),
  };
}

export type FillBlankPrompt = {
  message: string;
  sentence: string;
};

function completeSentenceFromBlanked(blanked: string, word: string): string {
  return blanked.includes("_____") ? blanked.replace("_____", word) : word;
}

export async function buildFillBlank(
  word: Vocabulary,
  language: string = "es",
  locale: InterfaceLanguage = "en"
): Promise<FillBlankPrompt> {
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

    return await generateFillBlankSentence(word.word, targetLang, word.example_sentence, locale);
  })();

  const sentence = generated.sentence || completeSentenceFromBlanked(generated.blanked, word.word);
  return {
    message: t(locale, "daily.fillBlank", { blanked: generated.blanked }),
    sentence,
  };
}

export async function buildReviewMessage(
  word: Vocabulary,
  language: string = "es",
  locale: InterfaceLanguage = "en"
): Promise<string> {
  const tr = await resolveGloss(
    {
      id: word.id,
      translation: word.translation,
      language: word.language ?? parseTargetLanguage(language),
    },
    locale
  );
  return reviewAsk(tr, parseTargetLanguage(language), locale);
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
