import path from "node:path";
import xlsx from "xlsx";
import { z } from "zod";
import { openai } from "../../ai/openai";
import { supabase } from "../../db/client";

const SHEET_NAME = "Spanish Vocabulary";
const EXCEL_PATH = path.resolve(__dirname, "spanish_vocabulary.xlsx");
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 500;

const vocabItemSchema = z.object({
  word: z.string().min(1),
  translation: z.string().min(1),
  example_sentence: z.string().min(1),
});

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

function parseModelJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function readWordsFromExcel(filePath: string): string[] {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet '${SHEET_NAME}' not found in ${filePath}`);
  }

  const rows = xlsx.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    blankrows: false,
  });

  const words: string[] = [];
  for (const row of rows) {
    const cell = row[0];
    if (cell === undefined || cell === null) continue;
    const value = String(cell).trim();
    if (!value) continue;
    if (value.toLowerCase() === "spanish") continue;
    words.push(value);
  }

  return words;
}

function buildUserPrompt(words: string[]): string {
  return [
    "Words:",
    words.join(", "),
  ].join("\n");
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
          "You are a Spanish-English dictionary. For each Spanish word provided, return a JSON object with an `items` array where each element has: word (exact Spanish word as given), translation (concise English translation, 1-4 words), example_sentence (one natural Spanish sentence using the word, 8-15 words, appropriate for language learners). Return JSON only.",
      },
      {
        role: "user",
        content: buildUserPrompt(words),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? '{"items":[]}';
  const parsed = parseModelJson(text) as { items?: unknown };
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const validWords = new Set(words);
  const out: z.infer<typeof vocabItemSchema>[] = [];

  for (const item of rawItems) {
    const validated = vocabItemSchema.safeParse(item);
    if (!validated.success) {
      console.warn("[vocabulary-5k] Skipping malformed item:", item);
      continue;
    }
    if (!validWords.has(validated.data.word)) {
      console.warn("[vocabulary-5k] Filtered hallucinated word:", validated.data.word);
      continue;
    }
    out.push(validated.data);
  }

  return out;
}

async function main(): Promise<void> {
  const words = readWordsFromExcel(EXCEL_PATH);
  if (words.length === 0) {
    console.log("[vocabulary-5k] No words found in Excel file.");
    return;
  }

  const wordsWithRank = words.map((word, index) => ({
    word,
    frequency_rank: index + 1,
    tier: tierForRank(index + 1),
  }));

  const batches = chunk(wordsWithRank, BATCH_SIZE);
  console.log(`[vocabulary-5k] Loaded ${wordsWithRank.length} words, ${batches.length} batches.`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchWords = batch.map((b) => b.word);
    const rankByWord = new Map(batch.map((b) => [b.word, b]));
    console.log(`[vocabulary-5k] Processing batch ${i + 1}/${batches.length} (${batch.length} words)...`);

    const enriched = await enrichBatch(batchWords);
    if (enriched.length === 0) {
      console.warn(`[vocabulary-5k] Batch ${i + 1}: no valid items returned; skipping upsert.`);
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
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const { error } = await supabase.from("vocabulary").upsert(rows, { onConflict: "word" });
    if (error) {
      throw new Error(`Batch ${i + 1} upsert failed: ${error.message}`);
    }

    console.log(`[vocabulary-5k] Batch ${i + 1}: upserted ${rows.length} rows.`);
    await sleep(BATCH_DELAY_MS);
  }

  console.log("[vocabulary-5k] Done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[vocabulary-5k] Fatal error:", error);
    process.exit(1);
  });
