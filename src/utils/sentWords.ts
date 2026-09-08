export type SentWordRow = {
  id: number;
  word: string;
  kind?: "new" | "due";
};

/** Normalize jsonb words_sent / words_used into {id, word, kind?}[]. */
export function parseSentWords(raw: unknown): SentWordRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: SentWordRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "number" ? row.id : Number(row.id);
    const word = typeof row.word === "string" ? row.word : null;
    if (!Number.isFinite(id) || !word) {
      continue;
    }
    const kind = row.kind === "new" || row.kind === "due" ? row.kind : undefined;
    out.push(kind ? { id, word, kind } : { id, word });
  }
  return out;
}
