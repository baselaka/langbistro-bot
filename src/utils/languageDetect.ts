import { openai } from "../ai/openai";
import { CHAT_MODEL_GRADE, chatParams } from "../config/models";

function shouldBypassDetection(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) {
    return true;
  }

  // If there are no letters at all (numbers, punctuation, emoji), do not block.
  if (!/\p{L}/u.test(trimmed)) {
    return true;
  }

  return false;
}

const DETECT_SYSTEM_PROMPT = `You are a language detector for short Telegram messages from language learners. Reply only with 'yes' or 'no'.

Treat minor typos and missing accents as still the target language when the message is clearly intended to be that language (e.g. "bonjor" is French, "grasias" is Spanish, "como estas" is Spanish).

Code-switched messages count as yes when the target language is clearly present or the message is a learner attempt in the target language mixed with English.

Answer 'no' when the message is clearly in another language (especially English) or a different Romance language than the target.`;

function buildDetectUserPrompt(text: string, targetLang: "es" | "fr"): string {
  return targetLang === "fr"
    ? `Is the following message written in French? Answer 'no' if it appears to be Spanish, Italian, Portuguese, or any other language. Message: ${text}`
    : `Is the following message written in Spanish? Answer 'no' if it appears to be French, Italian, Portuguese, or any other language. Message: ${text}`;
}

/** True when text appears to be in the learner's target language. Uses LLM (not franc/tinyld) — short Telegram replies are too ambiguous for n-gram detectors. */
export async function isTargetLanguage(text: string, targetLang: "es" | "fr"): Promise<boolean> {
  if (shouldBypassDetection(text)) {
    return true;
  }

  try {
    const completion = await openai.chat.completions.create({
      ...chatParams(CHAT_MODEL_GRADE, 0),
      messages: [
        {
          role: "system",
          content: DETECT_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildDetectUserPrompt(text, targetLang),
        },
      ],
    });

    const verdict = completion.choices[0]?.message?.content?.trim().toLowerCase();
    return verdict === "yes";
  } catch {
    // Fail open to avoid blocking learners due to detector errors.
    return true;
  }
}
