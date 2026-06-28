import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { openai } from "../../ai/openai";
import { supabase } from "../../db/client";

const TXT_PATH = path.resolve(__dirname, "data/fr_10k.txt");
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 500;

const vocabItemSchema = z.object({
  word: z.string().min(1),
  translation: z.string().min(1),
  example_sentence: z.string().min(1),
});

type WordWithRank = {
  word: string;
  frequency_rank: number;
  tier: number;
};

function tierForRank(rank: number): number {
  if (rank <= 500) return 1;
  if (rank <= 1500) return 2;
  if (rank <= 2500) return 3;
  if (rank <= 3500) return 4;
  return 5;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeWordForPrompt(raw: string): string {
  return raw
    .replace(/[\x00-\x1F\x7F-\x9F\uFEFF]/g, "")
    .replace(/\\/g, "")
    .replace(/"/g, "")
    .trim();
}

function parseModelJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function readWordsFromTxt(filePath: string): WordWithRank[] {
  const content = fs.readFileSync(filePath, "utf8");
  const words: WordWithRank[] = [];
  let rank = 0;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    rank++;
    words.push({
      word: trimmed,
      frequency_rank: rank,
      tier: tierForRank(rank),
    });
  }
  return words;
}

function buildUserPrompt(words: string[]): string {
  const line = words.map((w) => JSON.stringify(w)).join(", ");
  return ["Words:", line].join("\n");
}

async function enrichBatch(words: string[]): Promise<z.infer<typeof vocabItemSchema>[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a French-English dictionary. For each French word provided, return a JSON object with an `items` array where each element has: word (exact French word as given), translation (concise English translation, 1-4 words), example_sentence (one natural French sentence using the word, 8-15 words, appropriate for language learners). Return JSON only.",
      },
      {
        role: "user",
        content: buildUserPrompt(words),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "{\"items\":[]}";
  const parsed = parseModelJson(text) as { items?: unknown };
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const validWords = new Set(words);
  const out: z.infer<typeof vocabItemSchema>[] = [];

  for (const item of rawItems) {
    const validated = vocabItemSchema.safeParse(item);
    if (!validated.success) {
      console.warn("[vocabulary-fr] Skipping malformed item:", item);
      continue;
    }
    if (!validWords.has(validated.data.word)) {
      console.warn("[vocabulary-fr] Filtered hallucinated word:", validated.data.word);
      continue;
    }
    out.push(validated.data);
  }

  return out;
}

export async function seedVocabularyFr(): Promise<number> {
  const rawWords = readWordsFromTxt(TXT_PATH);
  const wordsWithRank = rawWords
    .map((entry) => ({ ...entry, word: sanitizeWordForPrompt(entry.word) }))
    .filter((entry) => entry.word.length > 0);

  if (wordsWithRank.length === 0) {
    console.log("[vocabulary-fr] No words found in text file.");
    return 0;
  }

  const batches = chunk(wordsWithRank, BATCH_SIZE);
  console.log(`[vocabulary-fr] Loaded ${wordsWithRank.length} words, ${batches.length} batches.`);

  let batchesSucceeded = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchWords = batch.map((b) => b.word);
    const rankByWord = new Map(batch.map((b) => [b.word, b]));
    console.log(`[vocabulary-fr] Processing batch ${i + 1}/${batches.length} (${batch.length} words)...`);

    try {
      const enriched = await enrichBatch(batchWords);
      if (enriched.length === 0) {
        console.warn(`[vocabulary-fr] Batch ${i + 1}: no valid items returned; skipping upsert.`);
        await sleep(BATCH_DELAY_MS);
        continue;
      }

      const rows = enriched
        .map((item) => {
          const rankMeta = rankByWord.get(item.word);
          if (!rankMeta) return null;
          return {
            word: item.word,
            translation: item.translation,
            example_sentence: item.example_sentence,
            tier: rankMeta.tier,
            frequency_rank: rankMeta.frequency_rank,
            language: "fr",
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const { error } = await supabase.from("vocabulary").upsert(rows, { onConflict: "word, language" });
      if (error) {
        console.error(`[vocabulary-fr] Batch ${i + 1} upsert failed:`, error.message);
        await sleep(BATCH_DELAY_MS);
        continue;
      }

      batchesSucceeded++;
      console.log(`[vocabulary-fr] Batch ${i + 1}: upserted ${rows.length} rows.`);
    } catch (error) {
      console.error(`[vocabulary-fr] Batch ${i + 1} failed:`, error);
    }

    await sleep(BATCH_DELAY_MS);
  }

  console.log("[vocabulary-fr] Done.");
  if (batches.length > 0 && batchesSucceeded === 0) {
    console.error("[vocabulary-fr] No batches completed successfully.");
    return 1;
  }
  return 0;
}
