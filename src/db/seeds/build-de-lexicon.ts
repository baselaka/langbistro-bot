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
  "alternative",
  "obsolete",
]);

const PLURAL_BAD_TAGS = new Set([
  "colloquial",
  "dated",
  "rare",
  "humorous",
  "archaic",
  "nonstandard",
]);

const ARCHAIC_SENSE_TAGS = new Set([
  "dated",
  "archaic",
  "obsolete",
  "historical",
]);

const PROFANE_TAGS = new Set(["vulgar", "offensive", "derogatory"]);

const GENDER_TAGS = ["masculine", "feminine", "neuter"] as const;
type Gender = (typeof GENDER_TAGS)[number];

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

/** Pure sound / filler tokens — dropped. Other interjections are kept. */
const SOUND_STOPLIST = new Set(
  [
    "ah",
    "oh",
    "äh",
    "ähm",
    "hm",
    "hmm",
    "uh",
    "huh",
    "ha",
    "haha",
    "hehe",
    "aha",
    "ey",
    "na",
    "pst",
    "uff",
    "au",
    "oje",
  ].map((s) => s.normalize("NFC").toLowerCase()),
);

/** POS dropped from the learner list. */
const DROP_POS = new Set(["pron", "article", "det", "name", "abbrev", "symbol", "punct", "character"]);

const KEEP_POS = new Set([
  "noun",
  "verb",
  "adj",
  "adv",
  "prep",
  "conj",
  "particle",
  "intj",
  "num",
  "postp",
]);

type KaikkiForm = {
  form?: string;
  tags?: string[];
  source?: string;
};

type KaikkiSense = {
  tags?: string[];
  form_of?: Array<{ word?: string }>;
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
  lemma: string; // surface casing from kaikiki headword
  pos: string;
  gender: Gender | null;
  genders: Gender[]; // all distinct genders seen (for multi-gender report)
  plural: string | null;
  forms: string[];
  isProfane: boolean;
  isArchaicOnly: boolean;
  isFormOfOnly: boolean;
};

type DropReason =
  | "single_letter"
  | "sound_stoplist"
  | "no_lemma"
  | "proper_noun"
  | "abbreviation"
  | "dropped_pos"
  | "profanity"
  | "archaic_only"
  | "form_of_only"
  | "non_content_pos";

type LexiconRow = {
  word: string;
  pos: string[];
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
  if (/^de-[a-z]+$/i.test(t)) return false;
  if (/^no-table-tags$/i.test(t)) return false;
  if (/^\d+\s+strong$/i.test(t)) return false;
  if (/^(strong|weak|mixed)$/i.test(t)) return false;
  return true;
}

function isUsableLemmaSurface(lemma: string): boolean {
  const t = lemma.trim();
  if (t.length < 2) return false;
  if (/\s/.test(t)) return false;
  if (t.includes("/") || t.includes("\\")) return false;
  if (t.includes("{") || t.includes("}")) return false;
  return true;
}

function shouldKeepForm(lemma: string, form: string, tags: string[]): boolean {
  if (!isRealWordForm(form)) return false;
  if (tags.some((t) => JUNK_FORM_TAGS.has(t))) return false;
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

function extractGenders(entry: KaikkiEntry): Gender[] {
  const seen = new Set<Gender>();
  const ordered: Gender[] = [];
  for (const tag of collectTags(entry)) {
    if ((GENDER_TAGS as readonly string[]).includes(tag) && !seen.has(tag as Gender)) {
      seen.add(tag as Gender);
      ordered.push(tag as Gender);
    }
  }
  return ordered;
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
    if (tags.some((t) => PLURAL_BAD_TAGS.has(t))) continue;
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
    if (!shouldKeepForm(lemma, form, tags)) continue;
    // Keep two-token separable splits ("ruft an"); skip longer table phrases.
    if (/\s/.test(form) && !/^[^\s]+ [^\s]+$/.test(form)) continue;
    push(form);
  }
  return out;
}

function isFormOfOnlyEntry(entry: KaikkiEntry): boolean {
  const senses = entry.senses ?? [];
  if (senses.length === 0) return false;
  return senses.every((s) => Array.isArray(s.form_of) && s.form_of.length > 0);
}

function isArchaicOnlyEntry(entry: KaikkiEntry): boolean {
  const senses = entry.senses ?? [];
  if (senses.length === 0) return false;
  return senses.every((s) => (s.tags ?? []).some((t) => ARCHAIC_SENSE_TAGS.has(t)));
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

type KaikkiIndex = {
  /** Real lemmas (not form_of-only), keyed by nfcLower(lemma). */
  lemmasByLower: Map<string, LemmaEntry[]>;
  /** Inflected form (nfc lower) → candidate real lemmas. */
  byForm: Map<string, LemmaEntry[]>;
  /** Surfaces that appear ONLY as form_of headwords (never a real lemma). */
  formOfOnlySurfaces: Set<string>;
};

async function loadKaikki(): Promise<KaikkiIndex> {
  const lemmasByLower = new Map<string, LemmaEntry[]>();
  const byForm = new Map<string, LemmaEntry[]>();
  const formOfOnlySurfaces = new Set<string>();
  const realLemmaKeys = new Set<string>(); // nfcLower(lemma)::pos
  const pending: LemmaEntry[] = [];
  const seenLemmaPos = new Set<string>();

  // Surfaces that appear as any headword (including form_of pages).
  const anyHeadwordLower = new Set<string>();
  const realHeadwordLower = new Set<string>();

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
    if (!isUsableLemmaSurface(lemma)) continue;

    anyHeadwordLower.add(nfcLower(lemma));

    const formOfOnly = isFormOfOnlyEntry(entry);
    if (formOfOnly) {
      continue; // do not treat conjugation pages as lemmas
    }

    realHeadwordLower.add(nfcLower(lemma));

    const formsRaw = entry.forms ?? [];
    const genders = pos === "noun" ? extractGenders(entry) : [];
    const lemmaEntry: LemmaEntry = {
      lemma,
      pos,
      gender: genders[0] ?? null,
      genders,
      plural: pos === "noun" ? extractPlural(formsRaw) : null,
      forms: extractForms(lemma, formsRaw),
      isProfane: isProfaneEntry(entry),
      isArchaicOnly: isArchaicOnlyEntry(entry),
      isFormOfOnly: false,
    };

    const lemmaKey = `${nfcLower(lemma)}::${pos}`;
    realLemmaKeys.add(lemmaKey);
    if (!seenLemmaPos.has(lemmaKey)) {
      seenLemmaPos.add(lemmaKey);
      const lk = nfcLower(lemma);
      const list = lemmasByLower.get(lk) ?? [];
      list.push(lemmaEntry);
      lemmasByLower.set(lk, list);
      pending.push(lemmaEntry);
    }
  }

  for (const surface of anyHeadwordLower) {
    if (!realHeadwordLower.has(surface)) {
      formOfOnlySurfaces.add(surface);
    }
  }

  // Index inflections; never attach a sibling headword of the same POS
  // (pronoun paradigm tables list du/er as "forms" of ich).
  for (const lemmaEntry of pending) {
    const { lemma, pos, forms } = lemmaEntry;
    const indexForm = (surface: string): void => {
      if (/\s/.test(surface)) return;
      if (!shouldKeepForm(lemma, surface, [])) return;
      const key = nfcLower(surface);
      if (key !== nfcLower(lemma) && realLemmaKeys.has(`${key}::${pos}`)) {
        return;
      }
      const list = byForm.get(key) ?? [];
      if (!list.some((e) => e.lemma === lemma && e.pos === pos)) {
        list.push(lemmaEntry);
        byForm.set(key, list);
      }
    };
    indexForm(lemma);
    for (const f of forms) {
      const tags: string[] = [];
      if (!shouldKeepForm(lemma, f, tags)) continue;
      indexForm(f);
    }
  }

  console.log(
    `Parsed kaikki: ${lines} lines, ${lemmasByLower.size} lemma keys, ` +
      `${byForm.size} form keys, ${formOfOnlySurfaces.size} form_of-only surfaces`,
  );
  return { lemmasByLower, byForm, formOfOnlySurfaces };
}

function selfCheck(lemmasByLower: Map<string, LemmaEntry[]>): void {
  console.log("\n=== Self-check (Haus, gehen, anrufen, gut) ===");
  const pick = (word: string, pos?: string): LemmaEntry | undefined => {
    const list = lemmasByLower.get(nfcLower(word)) ?? [];
    if (pos) {
      return list.find((e) => e.lemma === word && e.pos === pos) ?? list.find((e) => e.pos === pos);
    }
    return list.find((e) => e.lemma === word) ?? list[0];
  };
  const haus = pick("Haus", "noun");
  const gehen = pick("gehen", "verb");
  const anrufen = pick("anrufen", "verb");
  const gut = pick("gut", "adj");

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
      `${label}: pos=${entry.pos} gender=${entry.gender} genders=${entry.genders.join("|")} ` +
        `plural=${entry.plural} forms(${entry.forms.length})=[${entry.forms.slice(0, 10).join(", ")}${entry.forms.length > 10 ? ", ..." : ""}]`,
    );
  }

  const errors: string[] = [];
  if (!haus || !haus.gender || !haus.plural) {
    errors.push("Haus: missing gender and/or plural");
  }
  if (!gehen || gehen.forms.length === 0) errors.push("gehen: missing forms");
  if (!anrufen || anrufen.forms.length === 0) {
    errors.push("anrufen: missing forms");
  } else if (!anrufen.forms.some((f) => f.includes(" "))) {
    errors.push('anrufen: expected a separable form with a space (e.g. "ruft an")');
  }
  if (!gut || gut.forms.length === 0) errors.push("gut: missing forms");
  if (errors.length > 0) {
    throw new Error(`Self-check failed:\n- ${errors.join("\n- ")}`);
  }
  console.log("Self-check OK\n");
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

/** Best (lowest) 1-based frequency rank of a lemma surface in the freq list. */
function buildLemmaFreqRanks(tokens: string[]): Map<string, number> {
  const ranks = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const key = nfcLower(tokens[i]);
    if (!ranks.has(key)) ranks.set(key, i + 1);
  }
  return ranks;
}

function lemmaFreqRank(lemma: string, ranks: Map<string, number>): number {
  return ranks.get(nfcLower(lemma)) ?? Number.POSITIVE_INFINITY;
}

function outputWordFor(entry: LemmaEntry): string {
  return entry.pos === "noun" ? capitalizeNoun(entry.lemma) : entry.lemma;
}

function isKeepable(entry: LemmaEntry): boolean {
  if (entry.isProfane) return false;
  if (entry.isArchaicOnly) return false;
  if (entry.isFormOfOnly) return false;
  if (DROP_POS.has(entry.pos)) return false;
  if (!KEEP_POS.has(entry.pos)) return false;
  return true;
}

function dropReasonFor(entries: LemmaEntry[]): DropReason | null {
  if (entries.length === 0) return "no_lemma";
  if (entries.every((e) => e.isProfane)) return "profanity";
  if (entries.every((e) => e.isArchaicOnly)) return "archaic_only";
  if (entries.every((e) => e.isFormOfOnly)) return "form_of_only";
  const keepable = entries.filter(isKeepable);
  if (keepable.length > 0) return null;
  if (entries.every((e) => e.pos === "name")) return "proper_noun";
  if (entries.every((e) => e.pos === "abbrev")) return "abbreviation";
  if (entries.every((e) => DROP_POS.has(e.pos))) return "dropped_pos";
  return "non_content_pos";
}

/**
 * Resolve a frequency token to one or more real lemmas to accept.
 * - If the token is itself a lemma (ci): all keepable lemmas for that headword
 *   (Essen + essen stay separate via different `word` surfaces).
 * - Else: exactly one inflection candidate — best lemma frequency rank.
 */
function resolveToken(
  token: string,
  index: KaikkiIndex,
  lemmaRanks: Map<string, number>,
): LemmaEntry[] {
  const key = nfcLower(token);
  const asLemma = (index.lemmasByLower.get(key) ?? []).filter(isKeepable);
  if (asLemma.length > 0) {
    return asLemma;
  }

  const candidates = (index.byForm.get(key) ?? []).filter(isKeepable);
  if (candidates.length === 0) return [];

  // Dedupe by lemma surface + pos, then pick the single best lemma surface
  // by frequency rank of that lemma's own headword.
  let bestRank = Number.POSITIVE_INFINITY;
  let bestLemmaLower = "";
  for (const c of candidates) {
    const r = lemmaFreqRank(c.lemma, lemmaRanks);
    const lk = nfcLower(c.lemma);
    if (r < bestRank || (r === bestRank && lk < bestLemmaLower)) {
      bestRank = r;
      bestLemmaLower = lk;
    }
  }

  // Among entries for that winning lemma surface, keep all keepable POS
  // (will be merged into one row per output word casing).
  // Actually: pick exactly ONE candidate lemma — meaning one lemma entry?
  // "pick exactly ONE candidate lemma, the one whose own lemma has the best frequency rank"
  // So one lemma headword. If that headword has multiple POS, we still have multiple
  // LemmaEntries — but output is per word string. For inflection "waren" → sein (verb only).
  // Take all POS entries that share the winning lemma surface (same casing group).
  const winners = candidates.filter((c) => nfcLower(c.lemma) === bestLemmaLower);
  // Prefer the exact kaikiki casing that matches noun capitalization rules later.
  // If multiple casings of same lower exist (shouldn't for same lower key in candidates
  // from different entries), pick the one with best lemmaFreqRank already tied.
  // Collapse to entries that share the winning lemma *string* with best rank among casings.
  let bestSurface = winners[0]?.lemma ?? "";
  let bestSurfaceRank = lemmaFreqRank(bestSurface, lemmaRanks);
  for (const w of winners) {
    const r = lemmaFreqRank(w.lemma, lemmaRanks);
    if (r < bestSurfaceRank || (r === bestSurfaceRank && w.lemma < bestSurface)) {
      bestSurface = w.lemma;
      bestSurfaceRank = r;
    }
  }
  return winners.filter((c) => c.lemma === bestSurface);
}

type Accepted = {
  word: string;
  pos: Set<string>;
  forms: Set<string>;
  article: "der" | "die" | "das" | null;
  plural: string | null;
  gender: Gender | null;
  genders: Gender[];
  bestTokenRank: number;
};

function buildLexicon(
  index: KaikkiIndex,
  tokens: string[],
): {
  rows: LexiconRow[];
  rawTokensConsumed: number;
  drops: Record<DropReason, number>;
  multiGenderNouns: Array<{ word: string; genders: Gender[] }>;
  keptInterjections: string[];
} {
  const drops: Record<DropReason, number> = {
    single_letter: 0,
    sound_stoplist: 0,
    no_lemma: 0,
    proper_noun: 0,
    abbreviation: 0,
    dropped_pos: 0,
    profanity: 0,
    archaic_only: 0,
    form_of_only: 0,
    non_content_pos: 0,
  };

  const lemmaRanks = buildLemmaFreqRanks(tokens);
  const accepted = new Map<string, Accepted>(); // exact word string
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
    if (SOUND_STOPLIST.has(key)) {
      drops.sound_stoplist += 1;
      continue;
    }

    // Collect raw candidates for drop accounting.
    const lemmaHits = index.lemmasByLower.get(key) ?? [];
    const formHits = index.byForm.get(key) ?? [];
    const rawPool = lemmaHits.length > 0 ? lemmaHits : formHits;

    if (rawPool.length === 0) {
      drops.no_lemma += 1;
      continue;
    }

    const reason = dropReasonFor(rawPool);
    if (reason) {
      drops[reason] += 1;
      continue;
    }

    const resolved = resolveToken(token, index, lemmaRanks);
    if (resolved.length === 0) {
      // Had hits but none keepable after resolve (shouldn't happen if reason null)
      drops.non_content_pos += 1;
      continue;
    }

    const tokenRank = i + 1;
    for (const entry of resolved) {
      if (accepted.size >= TARGET_COUNT && !accepted.has(outputWordFor(entry))) {
        break;
      }
      const word = outputWordFor(entry);
      // Never emit a form_of-only surface as word.
      if (index.formOfOnlySurfaces.has(nfcLower(word))) {
        continue;
      }
      const existing = accepted.get(word);
      if (existing) {
        existing.pos.add(entry.pos);
        for (const f of entry.forms) existing.forms.add(f);
        if (tokenRank < existing.bestTokenRank) {
          existing.bestTokenRank = tokenRank;
        }
        // Prefer first-seen noun article/plural; fill if missing.
        if (existing.article === null && entry.pos === "noun") {
          existing.article = articleFromGender(entry.gender);
          existing.plural = entry.plural;
          existing.gender = entry.gender;
          existing.genders = entry.genders;
        }
      } else if (accepted.size < TARGET_COUNT) {
        accepted.set(word, {
          word,
          pos: new Set([entry.pos]),
          forms: new Set(entry.forms),
          article: entry.pos === "noun" ? articleFromGender(entry.gender) : null,
          plural: entry.pos === "noun" ? entry.plural : null,
          gender: entry.pos === "noun" ? entry.gender : null,
          genders: entry.pos === "noun" ? [...entry.genders] : [],
          bestTokenRank: tokenRank,
        });
      }
    }
  }

  if (accepted.size < TARGET_COUNT) {
    throw new Error(
      `Only collected ${accepted.size} distinct words after ${rawTokensConsumed} tokens; need ${TARGET_COUNT}`,
    );
  }

  const sorted = [...accepted.values()].sort((a, b) => {
    if (a.bestTokenRank !== b.bestTokenRank) return a.bestTokenRank - b.bestTokenRank;
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
  });

  const top = sorted.slice(0, TARGET_COUNT);
  const rows: LexiconRow[] = top.map((item, index) => {
    const rank = index + 1;
    const pos = [...item.pos].sort();
    const forms = [...item.forms];
    // Stable form order: lemma/word first, then alphabetical by nfcLower.
    forms.sort((a, b) => {
      if (nfcLower(a) === nfcLower(item.word)) return -1;
      if (nfcLower(b) === nfcLower(item.word)) return 1;
      return nfcLower(a) < nfcLower(b) ? -1 : nfcLower(a) > nfcLower(b) ? 1 : 0;
    });
    return {
      word: item.word,
      pos,
      translation: null,
      example_sentence: null,
      tier: tierForRank(rank),
      frequency_rank: rank,
      language: "de" as const,
      article: item.article,
      plural: item.plural,
      forms,
    };
  });

  const multiGenderNouns = top
    .filter((a) => a.genders.length > 1)
    .map((a) => ({ word: a.word, genders: a.genders }));

  const keptInterjections = top
    .filter((a) => a.pos.has("intj"))
    .map((a) => a.word)
    .sort((a, b) => nfcLower(a).localeCompare(nfcLower(b)));

  return { rows, rawTokensConsumed, drops, multiGenderNouns, keptInterjections };
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

function assertNoDuplicateWords(rows: LexiconRow[]): void {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const r of rows) {
    if (seen.has(r.word)) dups.push(r.word);
    seen.add(r.word);
  }
  if (dups.length > 0) {
    throw new Error(`Duplicate word values: ${dups.slice(0, 20).join(", ")}`);
  }
}

function assertNoFormOfOnlyWords(rows: LexiconRow[], formOfOnly: Set<string>): void {
  const bad = rows.filter((r) => formOfOnly.has(nfcLower(r.word))).map((r) => r.word);
  if (bad.length > 0) {
    throw new Error(
      `Output words that are form_of-only in kaikiki: ${bad.slice(0, 20).join(", ")}`,
    );
  }
}

function printReport(
  rows: LexiconRow[],
  rawTokensConsumed: number,
  drops: Record<DropReason, number>,
  multiGenderNouns: Array<{ word: string; genders: Gender[] }>,
  keptInterjections: string[],
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

  console.log("\nAssertions:");
  console.log("  no duplicate word values: OK");
  console.log("  no form_of-only output words: OK");

  console.log("\nFirst 60 rows (rank | word | pos | article | plural):");
  for (const r of rows.slice(0, 60)) {
    console.log(
      `  ${String(r.frequency_rank).padStart(4)} | ${r.word.padEnd(20)} | ${r.pos.join(",").padEnd(16)} | ${String(r.article ?? "-").padEnd(4)} | ${r.plural ?? "-"}`,
    );
  }

  const nouns = rows.filter((r) => r.article !== null || r.pos.includes("noun"));
  const rng = mulberry32(42);
  const pool = nouns.filter((r) => r.pos.includes("noun"));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  console.log("\n20 random nouns (seed=42):");
  for (const n of pool.slice(0, 20)) {
    console.log(
      `  ${n.article ?? "?"} ${n.word} / pl=${n.plural ?? "null"} (rank ${n.frequency_rank})`,
    );
  }

  console.log(`\nMulti-gender nouns (${multiGenderNouns.length}):`);
  for (const n of multiGenderNouns.slice(0, 50)) {
    console.log(`  ${n.word}: ${n.genders.join(", ")}`);
  }
  if (multiGenderNouns.length > 50) {
    console.log(`  ... and ${multiGenderNouns.length - 50} more`);
  }

  console.log(`\nKept interjections (${keptInterjections.length}):`);
  console.log(`  ${keptInterjections.join(", ") || "(none)"}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  await ensureFile(FREQ_PATH, FREQ_URL);
  await ensureFile(KAIKKI_PATH, KAIKKI_URL);

  const index = await loadKaikki();
  selfCheck(index.lemmasByLower);

  const tokens = loadFrequencyTokens();
  console.log(`Frequency tokens: ${tokens.length}`);

  const { rows, rawTokensConsumed, drops, multiGenderNouns, keptInterjections } =
    buildLexicon(index, tokens);

  assertTier(rows);
  assertNoDuplicateWords(rows);
  assertNoFormOfOnlyWords(rows, index.formOfOnlySurfaces);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${rows.length} rows → ${OUT_PATH}`);

  printReport(rows, rawTokensConsumed, drops, multiGenderNouns, keptInterjections);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
