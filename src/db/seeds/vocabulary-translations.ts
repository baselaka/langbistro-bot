import { z } from "zod";
import { openai } from "../../ai/openai";
import { CHAT_MODEL_FREE, chatParams } from "../../config/models";
import { supabase } from "../../db/client";
import {
  INTERFACE_LANGUAGE_ENGLISH_NAME,
  type InterfaceLanguage,
} from "../../i18n";
import type { TargetLanguage } from "../../config/languages";

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 500;
const PAGE_SIZE = 1000;

/** Gloss locales to generate per learnable language (skip same-language + English). */
export const GLOSS_LOCALES_BY_LANGUAGE: Record<TargetLanguage, InterfaceLanguage[]> = {
  es: ["pt", "ru"],
  fr: ["es", "pt", "ru"],
  en: ["es", "pt", "ru"],
};

const glossItemSchema = z.object({
  vocabulary_id: z.number().int().positive(),
  gloss: z.string().min(1),
});

type VocabRow = {
  id: number;
  word: string;
  translation: string | null;
  language: string;
};

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

async function fetchAllVocabulary(language: TargetLanguage): Promise<VocabRow[]> {
  const rows: VocabRow[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("vocabulary")
      .select("id, word, translation, language")
      .eq("language", language)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch vocabulary for ${language}: ${error.message}`);
    }

    const batch = (data ?? []) as VocabRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchExistingIds(vocabularyIds: number[], locale: InterfaceLanguage): Promise<Set<number>> {
  const existing = new Set<number>();
  for (const idChunk of chunk(vocabularyIds, PAGE_SIZE)) {
    if (idChunk.length === 0) continue;
    const { data, error } = await supabase
      .from("vocabulary_translations")
      .select("vocabulary_id")
      .eq("locale", locale)
      .in("vocabulary_id", idChunk);

    if (error) {
      throw new Error(`Failed to fetch existing glosses for ${locale}: ${error.message}`);
    }
    for (const row of data ?? []) {
      if (typeof row.vocabulary_id === "number") {
        existing.add(row.vocabulary_id);
      }
    }
  }
  return existing;
}

function buildUserPrompt(rows: VocabRow[]): string {
  const items = rows.map((r) => ({
    vocabulary_id: r.id,
    word: r.word,
    english: r.translation ?? "",
  }));
  return ["Translate each item's English sense into the target locale. Return JSON only.", JSON.stringify({ items })].join(
    "\n"
  );
}

async function enrichBatch(
  rows: VocabRow[],
  locale: InterfaceLanguage
): Promise<z.infer<typeof glossItemSchema>[]> {
  const localeName = INTERFACE_LANGUAGE_ENGLISH_NAME[locale];
  const completion = await openai.chat.completions.create({
    ...chatParams(CHAT_MODEL_FREE, 0.2),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          `You are a bilingual dictionary assistant writing concise ${localeName} glosses for language learners.`,
          `For each item, return a gloss that captures the English sense in ${localeName} (1-4 words).`,
          "Do not translate the source word letter-for-letter when the English sense is a definition or synonym — translate the meaning.",
          'Return JSON only: {"items":[{"vocabulary_id":123,"gloss":"..."}]}',
          "Keep vocabulary_id exactly as given. Do not invent IDs.",
        ].join(" "),
      },
      {
        role: "user",
        content: buildUserPrompt(rows),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? '{"items":[]}';
  const parsed = parseModelJson(text) as { items?: unknown };
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const validIds = new Set(rows.map((r) => r.id));
  const out: z.infer<typeof glossItemSchema>[] = [];

  for (const item of rawItems) {
    const validated = glossItemSchema.safeParse(item);
    if (!validated.success) {
      console.warn("[vocabulary-translations] Skipping malformed item:", item);
      continue;
    }
    if (!validIds.has(validated.data.vocabulary_id)) {
      console.warn("[vocabulary-translations] Filtered hallucinated id:", validated.data.vocabulary_id);
      continue;
    }
    const gloss = validated.data.gloss.trim();
    if (!gloss) continue;
    out.push({ vocabulary_id: validated.data.vocabulary_id, gloss });
  }

  return out;
}

export async function seedVocabularyTranslations(): Promise<number> {
  let batchesSucceeded = 0;
  let batchesAttempted = 0;

  for (const [language, locales] of Object.entries(GLOSS_LOCALES_BY_LANGUAGE) as [
    TargetLanguage,
    InterfaceLanguage[],
  ][]) {
    const vocab = await fetchAllVocabulary(language);
    console.log(`[vocabulary-translations] ${language}: ${vocab.length} words.`);

    for (const locale of locales) {
      const existing = await fetchExistingIds(
        vocab.map((v) => v.id),
        locale
      );
      const pending = vocab.filter((v) => !existing.has(v.id));
      console.log(
        `[vocabulary-translations] ${language} → ${locale}: ${pending.length} missing (${existing.size} already present).`
      );

      const batches = chunk(pending, BATCH_SIZE);
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]!;
        batchesAttempted++;
        console.log(
          `[vocabulary-translations] ${language}→${locale} batch ${i + 1}/${batches.length} (${batch.length} words)...`
        );

        try {
          const enriched = await enrichBatch(batch, locale);
          if (enriched.length === 0) {
            console.warn(`[vocabulary-translations] Batch ${i + 1}: no valid items; skipping upsert.`);
            await sleep(BATCH_DELAY_MS);
            continue;
          }

          const rows = enriched.map((item) => ({
            vocabulary_id: item.vocabulary_id,
            locale,
            gloss: item.gloss,
          }));

          const { error } = await supabase
            .from("vocabulary_translations")
            .upsert(rows, { onConflict: "vocabulary_id, locale" });

          if (error) {
            console.error(`[vocabulary-translations] Upsert failed:`, error.message);
            await sleep(BATCH_DELAY_MS);
            continue;
          }

          batchesSucceeded++;
          console.log(`[vocabulary-translations] Upserted ${rows.length} glosses.`);
        } catch (error) {
          console.error(`[vocabulary-translations] Batch failed:`, error);
        }

        await sleep(BATCH_DELAY_MS);
      }
    }
  }

  console.log("[vocabulary-translations] Done.");
  if (batchesAttempted > 0 && batchesSucceeded === 0) {
    console.error("[vocabulary-translations] No batches completed successfully.");
    return 1;
  }
  return 0;
}
