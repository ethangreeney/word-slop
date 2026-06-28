// Wire protocol shared by client and server.

export type Phase = 'lobby' | 'seed' | 'rewrite' | 'draw' | 'guess' | 'reveal';
export type PromptMode = 'custom' | 'generated';

export interface Settings {
  promptMode: PromptMode;
  drawingFinale: boolean;
  /** Host preference for number of rewrite rounds; effective value is capped by player count. */
  maxRounds: number;
  /** Per-turn timer in seconds. 0 means no timer. */
  turnSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = {
  promptMode: 'custom',
  drawingFinale: true,
  maxRounds: 6,
  turnSeconds: 90,
};

export const TURN_OPTIONS = [0, 45, 60, 90, 120, 180];
export const ROUND_OPTIONS = [2, 3, 4, 5, 6, 8];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

export interface PlayerView {
  id: string;
  name: string;
  avatar: string; // emoji
  color: string; // hex
  connected: boolean;
  isHost: boolean;
  score: number;
  submitted: boolean; // has acted for the current phase
  rank?: number; // 1-based, only meaningful in reveal
}

export interface SeedTask {
  kind: 'seed';
  /** Pre-filled sentence for game-generated mode; null for custom mode. */
  prompt: string | null;
  promptMode: PromptMode;
  done: boolean;
}

export interface RewriteTask {
  kind: 'rewrite';
  /** The sentence you must rewrite. */
  currentText: string;
  lockedWord: string | null;
  /** Words already used in this pipeline that you may not reuse. */
  burnedWords: string[];
  round: number;
  totalRounds: number;
  done: boolean;
}

export interface DrawTask {
  kind: 'draw';
  /** The (sloppy) sentence you must draw. */
  promptText: string;
  done: boolean;
}

export interface GuessItem {
  drawingId: string;
  drawingDataUrl: string;
  /** Candidate original sentences (shuffled), including the correct one. */
  options: { id: string; text: string }[];
}

export interface GuessTask {
  kind: 'guess';
  items: GuessItem[];
  done: boolean;
}

export interface SpectateTask {
  kind: 'spectate';
  label: string;
}

export type Task = SeedTask | RewriteTask | DrawTask | GuessTask | SpectateTask;

export interface RevealStep {
  authorName: string;
  authorAvatar: string;
  authorColor: string;
  text: string;
  skipped: boolean;
  kind: 'seed' | 'rewrite';
}

export interface RevealPipeline {
  id: string;
  lockedWord: string | null;
  steps: RevealStep[];
  drawing?: {
    dataUrl: string;
    authorName: string;
    authorAvatar: string;
    authorColor: string;
    /** Whether this player guessed the original correctly is computed client-side; not needed here. */
  };
  /** Original (seed) sentence text, for the matching summary. */
  originalText: string;
}

export interface RevealData {
  pipelines: RevealPipeline[];
  leaderboard: {
    id: string;
    name: string;
    avatar: string;
    color: string;
    score: number;
    rank: number;
  }[];
  drawingFinale: boolean;
}

export interface ClientState {
  code: string;
  phase: Phase;
  settings: Settings;
  you: { id: string };
  hostId: string;
  players: PlayerView[];
  /** Current rewrite round (1-based) during the rewrite phase. */
  round: number;
  /** Effective number of rewrite rounds. */
  totalRounds: number;
  /** Human label for the round chip, e.g. "Round 3 / 6". */
  roundLabel: string;
  /** Epoch ms when the current phase auto-advances, or null. */
  deadline: number | null;
  /** Server clock at send time, so clients can correct for skew. */
  serverNow: number;
  task: Task | null;
  /** Names of players we're still waiting on (shown on "done" screens). */
  waitingFor: string[];
  reveal?: RevealData;
  /** Transient banner message. */
  message?: string;
}

// ---- Client -> Server ----
export type ClientMessage =
  | { type: 'hello'; playerId: string; name: string; avatar: string; color: string }
  | { type: 'profile'; name: string; avatar: string; color: string }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'start' }
  | { type: 'seed'; text: string; lockedWord: string | null }
  | { type: 'rewrite'; text: string }
  | { type: 'draw'; dataUrl: string }
  | { type: 'guess'; answers: { drawingId: string; originalId: string }[] }
  | { type: 'skip' }
  | { type: 'again' }
  | { type: 'kick'; playerId: string }
  | { type: 'ping' };

// ---- Server -> Client ----
export type ServerMessage =
  | { type: 'state'; state: ClientState }
  | { type: 'error'; message: string }
  | { type: 'kicked' }
  | { type: 'pong' };
