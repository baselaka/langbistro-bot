/**
 * Offline DE 5k lexicon builder.
 *
 * Inputs (gitignored ./tmp/, downloaded if missing):
 *   - FrequencyWords German 50k (OpenSubtitles, CC BY 4.0)
 *   - kaikki.org English-edition German JSONL.gz (Wiktionary via wiktextract)
 *
 * Output: src/db/seeds/data/de_5k.json
 *
 * No OpenAI. Deterministic given fixed inputs.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = path.resolve(__dirname, "../../..");
const TMP_DIR = path.join(ROOT, "tmp");
const FREQ_PATH = path.join(TMP_DIR, "de_50k.txt");
const KAIKKI_PATH = path.join(TMP_DIR, "kaikki.org-dictionary-German.jsonl.gz");
const OUT_PATH = path.join(__dirname, "data", "de_5k.json");

const FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt";
const KAIKKI_URL =
  "https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl.gz";
/** Non-deprecated English-edition raw dump (filter lang_code === "de"). */
const KAIKKI_NON_DEPRECATED_URL =
  "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz";

const USER_AGENT =
  "LangBistroBot/1.0 (de-lexicon builder; https://github.com/baselaka/langbistro-bot)";

const TARGET_COUNT = 5000;

const JUNK_FORM_TAGS = new Set([
  "table-tags",
  "inflection-template",
  "class",
  "auxiliary",
  "includes-article",
]);

/** Standalone article tokens that appear as forms on many noun tables. */
const BARE_ARTICLES = new Set([
  "der",
  "die",
  "das",
  "dem",
  "den",
  "des",
  "ein",
  "eine",
  "einem",
  "einen",
  "einer",
  "eines",
]);

const PROFANE_TAGS = new Set(["vulgar", "offensive", "derogatory"]);

const GENDER_TAGS = ["masculine", "feminine", "neuter"] as const;
type Gender = (typeof GENDER_TAGS)[number];

const CONTENT_POS = new Set([
  "noun",
  "verb",
  "adj",
  "adv",
  "pron",
  "det",
  "num",
  "prep",
  "conj",
  "particle",
  "article",
  "postp",
]);

const DROP_POS = new Set(["name", "intj", "abbrev", "symbol", "punct", "character"]);

type KaikkiForm = {
  form?: string;
  tags?: string[];
  source?: string;
};

type KaikkiSense = {
  tags?: string[];
};

type KaikkiEntry = {
  word?: string;
  pos?: string;
  lang?: string;
  lang_code?: string;
  tags?: string[];
  forms?: KaikkiForm[];
  senses?: KaikkiSense[];
};

type LemmaEntry = {
  lemma: string;
  pos: string;
  gender: Gender | null;
  plural: string | null;
  forms: string[];
  isProfane: boolean;
};

type DropReason =
  | "single_letter"
  | "no_lemma"
  | "proper_noun"
  | "abbreviation"
  | "interjection"
  | "profanity"
  | "non_content_pos";

type LexiconRow = {
  word: string;
  translation: null;
  example_sentence: null;
  tier: number;
  frequency_rank: number;
  language: "de";
  article: "der" | "die" | "das" | null;
  plural: string | null;
  forms: string[];
};

function nfcLower(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

function tierForRank(rank: number): number {
  if (rank <= 500) return 1;
  if (rank <= 1500) return 2;
  if (rank <= 2500) return 3;
  if (rank <= 3500) return 4;
  return 5;
}

function capitalizeNoun(lemma: string): string {
  if (!lemma) return lemma;
  return lemma.charAt(0).toUpperCase() + lemma.slice(1);
}

function articleFromGender(gender: Gender | null): "der" | "die" | "das" | null {
  if (gender === "masculine") return "der";
  if (gender === "feminine") return "die";
  if (gender === "neuter") return "das";
  return null;
}

function isRealWordForm(form: string): boolean {
  const t = form.trim();
  if (!t) return false;
  if (t === "-" || t === "—") return false;
  // Template / meta strings from wiktextract conjugation tables.
  if (/^de-[a-z]+$/i.test(t)) return false;
  if (/^no-table-tags$/i.test(t)) return false;
  if (/^\d+\s+strong$/i.test(t)) return false;
  if (/^(strong|weak|mixed)$/i.test(t)) return false;
  return true;
}

/** Lemmas that should never enter the learner list. */
function isUsableLemma(lemma: string): boolean {
  const t = lemma.trim();
  if (t.length < 2) return false;
  if (/\s/.test(t)) return false; // multi-word phrases
  if (t.includes("/") || t.includes("\\")) return false;
  if (t.includes("{") || t.includes("}")) return false;
  return true;
}

function shouldIndexForm(lemma: string, form: string): boolean {
  if (!isRealWordForm(form)) return false;
  // Separable-verb splits ("ruft an") are kept as forms but only indexed as the full string.
  // Never index a bare article onto an unrelated longer lemma.
  if (BARE_ARTICLES.has(nfcLower(form)) && nfcLower(form) !== nfcLower(lemma)) {
    return false;
  }
  return true;
}

function collectTags(entry: KaikkiEntry): string[] {
  const out: string[] = [];
  if (entry.tags) out.push(...entry.tags);
  for (const sense of entry.senses ?? []) {
    if (sense.tags) out.push(...sense.tags);
  }
  return out;
}

function extractGender(entry: KaikkiEntry): Gender | null {
  for (const tag of collectTags(entry)) {
    if ((GENDER_TAGS as readonly string[]).includes(tag)) {
      return tag as Gender;
    }
  }
  return null;
}

function extractPlural(forms: KaikkiForm[]): string | null {
  for (const f of forms) {
    const form = f.form?.trim();
    if (!form || !isRealWordForm(form)) continue;
    if (/\s/.test(form)) continue;
    const tags = f.tags ?? [];
    if (!tags.includes("plural")) continue;
    if (tags.includes("diminutive")) continue;
    if (tags.some((t) => JUNK_FORM_TAGS.has(t))) continue;
    return form;
  }
  return null;
}

function extractForms(lemma: string, forms: KaikkiForm[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string): void => {
    const key = nfcLower(s);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  push(lemma);
  for (const f of forms) {
    const form = f.form?.trim();
    if (!form) continue;
    const tags = f.tags ?? [];
    if (tags.some((t) => JUNK_FORM_TAGS.has(t))) continue;
    if (!shouldIndexForm(lemma, form)) continue;
    // Keep separable splits ("ruft an") in the forms array; skip other multi-word tables.
    if (/\s/.test(form) && !/^[^\s]+ [^\s]+$/.test(form)) continue;
    push(form);
  }
  return out;
}

function isProfaneEntry(entry: KaikkiEntry): boolean {
  return collectTags(entry).some((t) => PROFANE_TAGS.has(t));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function ensureFile(filePath: string, url: string): Promise<void> {
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    console.log(`Using cached ${filePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  console.log(`Downloading ${url}`);
  console.log(`  → ${filePath}`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
  });
  if (!res.ok || !res.body) {
    throw new Error(
      `Failed to download ${url}: HTTP ${res.status} ${res.statusText}. ` +
        `Place the file manually at ${filePath}`,
    );
  }
  const tmp = `${filePath}.partial`;
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
  fs.renameSync(tmp, filePath);
  console.log(`Downloaded ${(fs.statSync(filePath).size / 1e6).toFixed(1)} MB`);
}

async function loadKaikki(): Promise<{
  byForm: Map<string, LemmaEntry[]>;
  byLemma: Map<string, LemmaEntry[]>;
}> {
  const byForm = new Map<string, LemmaEntry[]>();
  const byLemma = new Map<string, LemmaEntry[]>();
  const lemmaPosSeen = new Set<string>();
  const headwords = new Set<string>(); // nfcLower(lemma)::pos
  const pending: LemmaEntry[] = [];

  const input = fs.createReadStream(KAIKKI_PATH).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let lines = 0;
  for await (const line of rl) {
    lines += 1;
    if (!line.trim()) continue;
    let entry: KaikkiEntry;
    try {
      entry = JSON.parse(line) as KaikkiEntry;
    } catch {
      continue;
    }
    if (entry.lang_code !== "de" && entry.lang !== "German") continue;
    const lemma = entry.word?.trim();
    const pos = entry.pos?.trim();
    if (!lemma || !pos) continue;
    if (!isUsableLemma(lemma)) continue;

    const formsRaw = entry.forms ?? [];
    const gender = pos === "noun" ? extractGender(entry) : null;
    const plural = pos === "noun" ? extractPlural(formsRaw) : null;
    const forms = extractForms(lemma, formsRaw);
    const lemmaEntry: LemmaEntry = {
      lemma,
      pos,
      gender,
      plural,
      forms,
      isProfane: isProfaneEntry(entry),
    };

    const lemmaKey = `${nfcLower(lemma)}::${pos}`;
    headwords.add(lemmaKey);
    if (!lemmaPosSeen.has(lemmaKey)) {
      lemmaPosSeen.add(lemmaKey);
      const lk = nfcLower(lemma);
      const list = byLemma.get(lk) ?? [];
      list.push(lemmaEntry);
      byLemma.set(lk, list);
      pending.push(lemmaEntry);
    }
  }

  // Second pass: index inflections, but never attach a sibling headword
  // (fixes pronoun paradigm tables that list du/er/sie as "forms" of ich).
  for (const lemmaEntry of pending) {
    const { lemma, pos, forms } = lemmaEntry;
    const indexForm = (surface: string): void => {
      if (!shouldIndexForm(lemma, surface)) return;
      if (/\s/.test(surface)) return;
      const key = nfcLower(surface);
      if (key !== nfcLower(lemma) && headwords.has(`${key}::${pos}`)) {
        return;
      }
      const list = byForm.get(key) ?? [];
      if (!list.some((e) => e.lemma === lemma && e.pos === pos)) {
        list.push(lemmaEntry);
        byForm.set(key, list);
      }
    };
    indexForm(lemma);
    for (const f of forms) indexForm(f);
  }

  console.log(
    `Parsed kaikki: ${lines} lines, ${byLemma.size} lemma keys, ${byForm.size} form keys`,
  );
  return { byForm, byLemma };
}

function findLemma(
  byLemma: Map<string, LemmaEntry[]>,
  word: string,
  preferPos?: string,
): LemmaEntry | undefined {
  const list = byLemma.get(nfcLower(word)) ?? [];
  if (preferPos) {
    const hit = list.find((e) => e.pos === preferPos && e.lemma === word);
    if (hit) return hit;
  }
  return list.find((e) => e.lemma === word) ?? list[0];
}

function selfCheck(byLemma: Map<string, LemmaEntry[]>): void {
  console.log("\n=== Self-check (Haus, gehen, anrufen, gut) ===");
  const haus = findLemma(byLemma, "Haus", "noun");
  const gehen = findLemma(byLemma, "gehen", "verb");
  const anrufen = findLemma(byLemma, "anrufen", "verb");
  const gut = findLemma(byLemma, "gut", "adj");

  for (const [label, entry] of [
    ["Haus", haus],
    ["gehen", gehen],
    ["anrufen", anrufen],
    ["gut", gut],
  ] as const) {
    if (!entry) {
      console.log(`${label}: MISSING`);
      continue;
    }
    console.log(
      `${label}: pos=${entry.pos} gender=${entry.gender} plural=${entry.plural} ` +
        `forms(${entry.forms.length})=[${entry.forms.slice(0, 12).join(", ")}${entry.forms.length > 12 ? ", ..." : ""}]`,
    );
  }

  const errors: string[] = [];
  if (!haus || !haus.gender || !haus.plural) {
    errors.push("Haus: missing gender and/or plural");
  }
  if (!gehen || gehen.forms.length === 0) {
    errors.push("gehen: missing forms");
  }
  if (!anrufen || anrufen.forms.length === 0) {
    errors.push("anrufen: missing forms");
  } else if (!anrufen.forms.some((f) => f.includes(" "))) {
    errors.push('anrufen: expected a separable form with a space (e.g. "ruft an")');
  }
  if (!gut || gut.forms.length === 0) {
    errors.push("gut: missing forms");
  }
  if (errors.length > 0) {
    throw new Error(`Self-check failed:\n- ${errors.join("\n- ")}`);
  }
  console.log("Self-check OK\n");
}

function classifyDrop(candidates: LemmaEntry[]): DropReason | null {
  if (candidates.length === 0) return "no_lemma";
  const nonProfane = candidates.filter((e) => !e.isProfane);
  if (nonProfane.length === 0) return "profanity";

  const content = nonProfane.filter((e) => CONTENT_POS.has(e.pos));
  if (content.length > 0) return null;

  if (nonProfane.every((e) => e.pos === "name")) return "proper_noun";
  if (nonProfane.every((e) => e.pos === "abbrev")) return "abbreviation";
  if (nonProfane.every((e) => e.pos === "intj")) return "interjection";
  if (nonProfane.every((e) => DROP_POS.has(e.pos))) {
    if (nonProfane.some((e) => e.pos === "name")) return "proper_noun";
    if (nonProfane.some((e) => e.pos === "abbrev")) return "abbreviation";
    if (nonProfane.some((e) => e.pos === "intj")) return "interjection";
    return "non_content_pos";
  }
  return "non_content_pos";
}

function selectEntries(candidates: LemmaEntry[]): LemmaEntry[] {
  return candidates.filter((e) => !e.isProfane && CONTENT_POS.has(e.pos));
}

function loadFrequencyTokens(): string[] {
  const text = fs.readFileSync(FREQ_PATH, "utf8");
  const tokens: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const word = trimmed.split(/\s+/)[0];
    if (word) tokens.push(word);
  }
  return tokens;
}

function buildLexicon(
  byForm: Map<string, LemmaEntry[]>,
  tokens: string[],
): {
  rows: LexiconRow[];
  rawTokensConsumed: number;
  drops: Record<DropReason, number>;
} {
  const drops: Record<DropReason, number> = {
    single_letter: 0,
    no_lemma: 0,
    proper_noun: 0,
    abbreviation: 0,
    interjection: 0,
    profanity: 0,
    non_content_pos: 0,
  };

  type Accepted = {
    entry: LemmaEntry;
    bestRank: number; // 1-based token index in frequency list
  };
  const accepted = new Map<string, Accepted>(); // lemmaLower::pos
  let rawTokensConsumed = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (accepted.size >= TARGET_COUNT) break;
    rawTokensConsumed = i + 1;
    const token = tokens[i];
    const key = nfcLower(token);

    if (key.length === 1) {
      drops.single_letter += 1;
      continue;
    }

    const candidates = byForm.get(key) ?? [];
    const drop = classifyDrop(candidates);
    if (drop) {
      drops[drop] += 1;
      continue;
    }

    const selected = selectEntries(candidates);
    // Keep all content POS; noun+verb pairs (essen/Essen) both survive.
    const freqRank = i + 1;
    for (const entry of selected) {
      if (accepted.size >= TARGET_COUNT) break;
      const id = `${nfcLower(entry.lemma)}::${entry.pos}`;
      const prev = accepted.get(id);
      if (!prev || freqRank < prev.bestRank) {
        accepted.set(id, { entry, bestRank: freqRank });
      }
    }
  }

  if (accepted.size < TARGET_COUNT) {
    throw new Error(
      `Only collected ${accepted.size} lemmas after ${rawTokensConsumed} tokens; need ${TARGET_COUNT}`,
    );
  }

  const sorted = [...accepted.values()].sort((a, b) => {
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    const la = nfcLower(a.entry.lemma);
    const lb = nfcLower(b.entry.lemma);
    if (la !== lb) return la < lb ? -1 : 1;
    return a.entry.pos < b.entry.pos ? -1 : 1;
  });

  const top = sorted.slice(0, TARGET_COUNT);
  const rows: LexiconRow[] = top.map((item, index) => {
    const rank = index + 1;
    const { entry } = item;
    const isNoun = entry.pos === "noun";
    return {
      word: isNoun ? capitalizeNoun(entry.lemma) : entry.lemma,
      translation: null,
      example_sentence: null,
      tier: tierForRank(rank),
      frequency_rank: rank,
      language: "de",
      article: isNoun ? articleFromGender(entry.gender) : null,
      plural: isNoun ? entry.plural : null,
      forms: entry.forms,
    };
  });

  return { rows, rawTokensConsumed, drops };
}

function assertTier(rows: LexiconRow[]): void {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) counts[r.tier] = (counts[r.tier] ?? 0) + 1;
  const expected: Record<number, number> = {
    1: 500,
    2: 1000,
    3: 1000,
    4: 1000,
    5: 1500,
  };
  for (const t of [1, 2, 3, 4, 5]) {
    if (counts[t] !== expected[t]) {
      throw new Error(
        `Tier ${t} count ${counts[t]} !== expected ${expected[t]} (all=${JSON.stringify(counts)})`,
      );
    }
  }
}

function printReport(
  rows: LexiconRow[],
  rawTokensConsumed: number,
  drops: Record<DropReason, number>,
): void {
  console.log("=== Status report ===");
  console.log("Sources:");
  console.log(`  FrequencyWords: ${FREQ_URL}`);
  console.log(`  kaikki (used):  ${KAIKKI_URL}`);
  console.log(
    `  kaikki (non-deprecated successor): ${KAIKKI_NON_DEPRECATED_URL} (filter lang_code === "de")`,
  );
  console.log(`Raw tokens consumed to reach ${TARGET_COUNT}: ${rawTokensConsumed}`);
  console.log("Drop counts:");
  for (const [reason, n] of Object.entries(drops)) {
    console.log(`  ${reason}: ${n}`);
  }

  console.log("\nFirst 40 rows:");
  for (const r of rows.slice(0, 40)) {
    console.log(
      `  #${r.frequency_rank} t${r.tier} ${r.word}` +
        (r.article ? ` [${r.article}]` : "") +
        (r.plural ? ` pl=${r.plural}` : "") +
        ` forms=${r.forms.length}`,
    );
  }

  const nouns = rows.filter((r) => r.article !== null);
  const rng = mulberry32(42);
  const picked: LexiconRow[] = [];
  const pool = [...nouns];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const n of pool) {
    if (picked.length >= 20) break;
    picked.push(n);
  }
  console.log("\n20 random nouns (seed=42):");
  for (const n of picked) {
    console.log(`  ${n.article} ${n.word} / pl=${n.plural ?? "null"} (rank ${n.frequency_rank})`);
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  await ensureFile(FREQ_PATH, FREQ_URL);
  await ensureFile(KAIKKI_PATH, KAIKKI_URL);

  const { byForm, byLemma } = await loadKaikki();
  selfCheck(byLemma);

  const tokens = loadFrequencyTokens();
  console.log(`Frequency tokens: ${tokens.length}`);

  const { rows, rawTokensConsumed, drops } = buildLexicon(byForm, tokens);
  assertTier(rows);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${rows.length} rows → ${OUT_PATH}`);

  printReport(rows, rawTokensConsumed, drops);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
