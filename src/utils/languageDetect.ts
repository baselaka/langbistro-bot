import { openai } from "../ai/openai";

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

export async function isTargetLanguage(text: string, targetLang: "es" | "fr"): Promise<boolean> {
  if (shouldBypassDetection(text)) {
    return true;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "You are a language detector. Reply only with 'yes' or 'no'.",
        },
        {
          role: "user",
          content:
            targetLang === "fr"
              ? `Is the following message written in French? Answer 'no' if it appears to be Spanish, Italian, Portuguese, or any other language. Message: ${text}`
              : `Is the following message written in Spanish? Answer 'no' if it appears to be French, Italian, Portuguese, or any other language. Message: ${text}`,
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
