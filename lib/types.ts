// Shared contracts. Frozen: see the PRD. Owned by Backend 1; everyone else imports only.
import type { ComponentType } from "react";

export type CompanionId =
  | "conversation"
  | "interview"
  | "sales"
  | "case"
  | "friend"
  | "presentation";

export type OptionGroup = {
  id: string;
  label: string;
  type: "single" | "text";
  required?: boolean;
  choices?: { id: string; label: string }[];
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
};

/** What the client is allowed to see. Never contains prompt text. */
export type CompanionPublic = {
  id: CompanionId;
  name: string;
  blurb: string;
  /** Skin id, a key of `skins` in components/characters. */
  character: string;
  /** Key of the voices registry in lib/voices.ts. */
  voiceId: string;
  groups: OptionGroup[];
  /** false = no notes, stats or labels (Friend). */
  notes: boolean;
};

/** groupId -> choiceId (single) or free text (text). */
export type Selections = Record<string, string>;

/** t = ms since session start. */
export type Message = { role: "user" | "assistant"; content: string; t: number };

export type AvatarState = "idle" | "listening" | "thinking" | "speaking";
export type Mood = "neutral" | "happy" | "curious" | "serious" | "surprised" | "concerned";
export const MOODS: Mood[] = ["neutral", "happy", "curious", "serious", "surprised", "concerned"];
export type Level = "needs-work" | "solid" | "strong";

// ---- Voices -------------------------------------------------------------

export type Voice = {
  id: string;
  label: string;
  /** kokoro-js voice id, e.g. "af_heart". */
  kokoroVoice: string;
  /** Substrings matched against SpeechSynthesisVoice.name, best first. */
  browserVoiceHints: string[];
  /** speechSynthesis tuning so the fallback voices still differ per companion. */
  pitch?: number;
  rate?: number;
};

// ---- Character skins ----------------------------------------------------

export type Pt = { x: number; y: number };

/** Points in the skin's own viewBox coordinates. The rig positions overlays with these. */
export type SkinAnchors = { eyeL: Pt; eyeR: Pt; mouth: Pt; head: Pt; body: Pt };

/** The rig computes these every frame; the skin only draws. */
export type SkinProps = {
  /** 0 = closed, 1 = fully open. */
  mouthOpen: number;
  blink: boolean;
  state: AvatarState;
  mood: Mood;
  /** Where the eyes look, each axis -1..1 (x: its left to its right on screen, y: up to down). Default: centre. */
  gaze?: Pt;
};

export type Skin = {
  id: string;
  label: string;
  /** e.g. "0 0 200 200". The Component renders a complete <svg> with this viewBox. */
  viewBox: string;
  anchors: SkinAnchors;
  Component: ComponentType<SkinProps>;
  /** True when the skin moves on its own (the voice orbs): the rig then adds no lean, bounce or squash around it. */
  selfAnimated?: boolean;
};

// ---- API ----------------------------------------------------------------

/** Tailored interview question plan, made once at Start by POST /api/plan and sent back on each chat turn. */
export type InterviewPlan = {
  roleFamily: string;
  /** What the company is publicly known to value or how it interviews; "Generic" when unknown. */
  companyStyle: string;
  questions: { kind: "situational" | "behavioral" | "motivation" | "technical"; skill: string; question: string; probe?: string }[];
};

/** POST /api/chat -> text/plain stream. Optional first line "MOOD:<mood>\n", then the reply. */
export type ChatRequest = {
  /** Session-start plan from POST /api/plan (interview, case, sales, presentation). Untrusted on the server: validated per companion. Absent when planning failed or timed out. */
  plan?: unknown;
  companionId: CompanionId;
  selections: Selections;
  /** Empty = the companion opens the conversation. */
  messages: Message[];
  /** The user came back to a finished session: the companion welcomes them back and carries on. */
  resume?: boolean;
};

/** POST /api/notes -> NotesResult. Refused for companions with notes=false. */
export type NotesRequest = ChatRequest & { durationMs: number };

export type NoteTag = "strength" | "improve" | "tip";
export type NoteCard = { id: string; title: string; body: string; tags: NoteTag[] };
export type Dimension = { label: string; level: Level; reason: string };
export type Stats = {
  userWords: number;
  wpm: number;
  fillerCount: number;
  fillers: Record<string, number>;
  /** User share of all words spoken, 0-1. */
  talkRatio: number;
};

export type NotesResult = {
  summary: string;
  overall: Level;
  dimensions: Dimension[];
  notes: NoteCard[];
  stats: Stats;
};

export type ApiError = { error: string };

// ---- Session storage ----------------------------------------------------

export const SESSION_KEY = "session:v1";

/** Setup writes the first four fields; the session page adds the rest; results caches `notes`. */
export type SessionData = {
  companionId: CompanionId;
  selections: Selections;
  /** Snapshot so later pages need no refetch. */
  companion: CompanionPublic;
  hdVoice: boolean;
  plan?: unknown;
  /** New on every Start, so /session never reuses the state of an earlier session. */
  sessionId?: string;
  messages?: Message[];
  durationMs?: number;
  notes?: NotesResult;
  /** How many times /api/notes has been called for this session (cap 2). */
  notesCalls?: number;
  /** Signed-in users only: the client-generated id this session is saved under in the account's history. */
  savedId?: string;
  /** The `notesCalls` value at the last successful save, so a reload does not save again. */
  savedNotesCalls?: number;
};

// ---- Saved history (signed-in users) ------------------------------------

/** One row of the account's history, as returned by GET /api/sessions/[id]. */
export type SavedSession = {
  id: string;
  companionId: CompanionId;
  selections: Selections;
  messages: Message[];
  durationMs: number;
  notes: NotesResult | null;
  /** ISO timestamp. */
  createdAt: string;
};

/** List item returned by GET /api/sessions (no transcript). */
export type SavedSessionSummary = {
  id: string;
  companionId: CompanionId;
  companionName: string;
  /** ISO timestamp. */
  createdAt: string;
  durationMs: number;
  overall: Level | null;
  userTurns: number;
};

export type SavedSessionPage = { sessions: SavedSessionSummary[]; nextCursor: string | null };
