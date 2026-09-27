/**
 * Ambiguity decisions for DE lexicon (OpenAI + cache).
 * Used by build-de-lexicon.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { openai } from "../../ai/openai";
import { CHAT_MODEL_PRO, chatParams } from "../../config/models";

export type AmbiguityCase = "a" | "b" | "c";

export type AmbiguityItem = {
  id: string;
  case: AmbiguityCase;
  word: string;
  pos: string[];
  article: string | null;
  gloss_hint: string;
  /** Case a: lowercase lemma to use when keep=false. */
  altLemma?: string;
  /** Frequency token that triggered the choice (a/b). */
  token?: string;
};

export type DecisionRecord = {
  case: AmbiguityCase;
  word: string;
  keep: boolean;
  reason: string;
  /** Manual override; when boolean, beats `keep`. */
  force?: boolean | null;
  model?: string;
  updated_at?: string;
};

export type DecisionsFile = {
  version: 1;
  model: string;
  decisions: Record<string, DecisionRecord>;
};

const decisionResponseSchema = z.object({
  items: z.array(
    z.object({
      word: z.string(),
      keep: z.boolean(),
      reason: z.string(),
    }),
  ),
});

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function loadDecisionsFile(path: string): DecisionsFile {
  if (!fs.existsSync(path)) {
    return { version: 1, model: CHAT_MODEL_PRO, decisions: {} };
  }
  const raw = JSON.parse(fs.readFileSync(path, "utf8")) as DecisionsFile;
  if (!raw.decisions || typeof raw.decisions !== "object") {
    return { version: 1, model: CHAT_MODEL_PRO, decisions: {} };
  }
  return {
    version: 1,
    model: raw.model || CHAT_MODEL_PRO,
    decisions: raw.decisions,
  };
}

export function saveDecisionsFile(pathName: string, file: DecisionsFile): void {
  fs.mkdirSync(path.dirname(pathName), { recursive: true });
  fs.writeFileSync(pathName, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export function effectiveKeep(record: DecisionRecord): boolean {
  if (typeof record.force === "boolean") return record.force;
  return record.keep;
}

export type AmbiguityResolveResult = {
  file: DecisionsFile;
  /** Newly queried item count. */
  queried: number;
  /** Estimated/reported prompt+completion tokens. */
  promptTokens: number;
  completionTokens: number;
  /** Rough USD estimate (gpt-5.2 ballpark; informational). */
  costUsdEstimate: number;
};

/**
 * Ensure every item has a decision. Reuses cache; only calls the model for missing ids.
 * `forceKeepWords` always get keep=true (existing CAPITALIZED_NOUN_KEEP).
 */
export async function ensureAmbiguityDecisions(
  cachePath: string,
  items: AmbiguityItem[],
  forceKeepWords: Set<string>,
): Promise<AmbiguityResolveResult> {
  const file = loadDecisionsFile(cachePath);
  file.model = CHAT_MODEL_PRO;

  const missing: AmbiguityItem[] = [];
  for (const item of items) {
    if (forceKeepWords.has(item.word)) {
      file.decisions[item.id] = {
        case: item.case,
        word: item.word,
        keep: true,
        reason: "CAPITALIZED_NOUN_KEEP force keep",
        force: true,
        model: "force-keep-list",
        updated_at: new Date().toISOString(),
      };
      continue;
    }
    if (!file.decisions[item.id]) {
      missing.push(item);
    } else {
      // Refresh case/word metadata but preserve keep/force/reason if present.
      const prev = file.decisions[item.id];
      file.decisions[item.id] = {
        ...prev,
        case: item.case,
        word: item.word,
      };
    }
  }

  let promptTokens = 0;
  let completionTokens = 0;
  let queried = 0;

  const batches = chunk(missing, BATCH_SIZE);
  console.log(
    `Ambiguity: ${items.length} items, ${missing.length} missing from cache, ${batches.length} model batches`,
  );

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Ambiguity batch ${i + 1}/${batches.length} (${batch.length} items)...`);
    const { decisions, usage } = await askModelBatch(batch);
    promptTokens += usage.prompt_tokens;
    completionTokens += usage.completion_tokens;
    queried += batch.length;

    const byWord = new Map(decisions.map((d) => [d.word, d]));
    for (const item of batch) {
      const hit = byWord.get(item.word);
      file.decisions[item.id] = {
        case: item.case,
        word: item.word,
        keep: hit?.keep ?? false,
        reason: hit?.reason ?? "model returned no decision; default drop",
        force: null,
        model: CHAT_MODEL_PRO,
        updated_at: new Date().toISOString(),
      };
    }

    // Persist after each batch so crashes don't lose progress.
    saveDecisionsFile(cachePath, file);
    if (i + 1 < batches.length) await sleep(BATCH_DELAY_MS);
  }

  saveDecisionsFile(cachePath, file);

  // gpt-5.2 rough public ballpark (informational; adjust if pricing changes).
  const costUsdEstimate =
    (promptTokens / 1_000_000) * 1.75 + (completionTokens / 1_000_000) * 14.0;

  return { file, queried, promptTokens, completionTokens, costUsdEstimate };
}

async function askModelBatch(
  batch: AmbiguityItem[],
): Promise<{
  decisions: Array<{ word: string; keep: boolean; reason: string }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}> {
  const payload = batch.map((b) => ({
    word: b.word,
    pos: b.pos,
    article: b.article,
    gloss_hint: b.gloss_hint,
    case: b.case,
  }));

  const completion = await openai.chat.completions.create({
    ...chatParams(CHAT_MODEL_PRO, 0),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a German curriculum editor for adult learners (A1–B2). " +
          "For each candidate vocabulary item, decide whether it should be studied as its own headword. " +
          'Return JSON: {"items":[{"word":"...","keep":true|false,"reason":"short"}]}. ' +
          "Answer keep=false for rare/dated/obscure senses and for pure verbal nominalisations " +
          "like \"das Fangen\" (= the act of catching). keep=true for common standalone nouns/words " +
          "a learner should know (e.g. das Essen, die Frage, die Angst).",
      },
      {
        role: "user",
        content:
          "For each item, answer: Is this a common word (roughly A1–B2) that a German learner " +
          "should study as its own vocabulary item?\n\n" +
          JSON.stringify({ items: payload }),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? '{"items":[]}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { items: [] };
  }
  const validated = decisionResponseSchema.safeParse(parsed);
  const decisions = validated.success ? validated.data.items : [];
  const usage = completion.usage;
  return {
    decisions,
    usage: {
      prompt_tokens: usage?.prompt_tokens ?? 0,
      completion_tokens: usage?.completion_tokens ?? 0,
    },
  };
}
