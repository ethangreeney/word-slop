// Pure, dependency-free game logic for Word Slop.
// Shared by the client (live validation while typing) and the server (authoritative checks).
// Everything here is deterministic and unit-tested.

export interface Token {
  /** The word exactly as it appeared in the text. */
  raw: string;
  /** Normalized form used for "have we seen this word" comparisons. */
  norm: string;
}

// A "word" is a run of letters/numbers, optionally joined by internal apostrophes
// (so "don't" and "rock'n'roll" stay whole). Unicode-aware. Punctuation is dropped.
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/** Normalize a single word: lowercase + fold curly apostrophes to straight. */
export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/’/g, "'").trim();
}

/** Split text into word tokens (raw + normalized). */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const raw = m[0];
    out.push({ raw, norm: normalizeWord(raw) });
  }
  return out;
}

/** Normalized words of a text, in order (with duplicates). */
export function words(text: string): string[] {
  return tokenize(text).map((t) => t.norm);
}

/** Set of normalized words in a text. */
export function wordSet(text: string): Set<string> {
  return new Set(words(text));
}

/** Number of word tokens in a text. */
export function wordCount(text: string): number {
  return tokenize(text).length;
}

/** Normalize a chosen locked word to a single token (or null if blank). */
export function normalizeLocked(locked: string | null | undefined): string | null {
  if (!locked) return null;
  const toks = tokenize(locked);
  return toks.length ? toks[0].norm : null;
}

export interface PipelineStep {
  text: string;
  /** True if the turn was auto-skipped (timed out / player gone). Skipped text does not burn words. */
  skipped?: boolean;
}

/**
 * Build the set of "burned" (already-used, now-forbidden) words for a pipeline,
 * from all of its non-skipped steps. The locked word is never burned.
 */
export function burnedFromSteps(steps: PipelineStep[], locked: string | null): Set<string> {
  const burned = new Set<string>();
  for (const s of steps) {
    if (s.skipped) continue;
    for (const w of words(s.text)) {
      if (locked && w === locked) continue;
      burned.add(w);
    }
  }
  return burned;
}

export interface RewriteValidation {
  ok: boolean;
  empty: boolean;
  /** Unique normalized burned words that appear in the text, in order of first appearance. */
  violations: string[];
  /** The raw (as-typed) form of each violation, parallel to `violations`. */
  violationRaw: string[];
}

/**
 * Validate a rewrite against the burned set. A rewrite is OK when it is non-empty
 * and contains no burned word (the locked word is always allowed).
 */
export function validateRewrite(
  text: string,
  burned: Set<string>,
  locked: string | null,
): RewriteValidation {
  const toks = tokenize(text);
  const empty = toks.length === 0;
  const seen = new Set<string>();
  const violations: string[] = [];
  const violationRaw: string[] = [];
  for (const t of toks) {
    if (locked && t.norm === locked) continue;
    if (burned.has(t.norm) && !seen.has(t.norm)) {
      seen.add(t.norm);
      violations.push(t.norm);
      violationRaw.push(t.raw);
    }
  }
  return { ok: !empty && violations.length === 0, empty, violations, violationRaw };
}

/** Validate a seed sentence + chosen locked word. */
export function validateSeed(
  text: string,
  lockedWord: string | null,
): { ok: boolean; empty: boolean; lockedInText: boolean } {
  const ws = wordSet(text);
  const empty = ws.size === 0;
  const norm = normalizeLocked(lockedWord);
  // A chosen locked word must actually appear in the seed. No locked word is allowed.
  const lockedInText = norm === null ? true : ws.has(norm);
  return { ok: !empty && lockedInText, empty, lockedInText };
}

// ---- Telephone rotation -------------------------------------------------
//
// Players and pipelines are both indexed 0..n-1. Player p seeds pipeline p.
// On rewrite round r (1-based) player p edits pipeline (p - r) mod n, i.e.
// pipeline i is edited by player (i + r) mod n. Each round is a permutation,
// so everyone is busy every round and never sees a pipeline twice (for r < n).

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Which player edits pipeline `pipelineIndex` on rewrite round `round` (1-based). */
export function editorForPipeline(pipelineIndex: number, round: number, n: number): number {
  return mod(pipelineIndex + round, n);
}

/** Which pipeline player `playerIndex` edits on rewrite round `round` (1-based). */
export function pipelineForEditor(playerIndex: number, round: number, n: number): number {
  return mod(playerIndex - round, n);
}

/**
 * Effective number of rewrite rounds given player count and host preference.
 * Without drawing: up to n-1 (everyone but the author touches it).
 * With drawing: up to n-2, leaving the final, unseen player to draw it.
 * Always at least 1.
 */
export function effectiveRounds(numPlayers: number, maxRounds: number, drawing: boolean): number {
  const ceiling = drawing ? numPlayers - 2 : numPlayers - 1;
  return Math.max(1, Math.min(maxRounds, ceiling));
}

/** The draw round index = one past the last rewrite round. */
export function drawRound(totalRounds: number): number {
  return totalRounds + 1;
}

/** Which player draws pipeline `pipelineIndex`. */
export function drawerForPipeline(pipelineIndex: number, totalRounds: number, n: number): number {
  return editorForPipeline(pipelineIndex, drawRound(totalRounds), n);
}

// ---- Misc helpers -------------------------------------------------------

/** Deterministic shuffle (Fisher–Yates) driven by a seeded PRNG, for stable option ordering. */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0 || 1;
  const rand = () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
