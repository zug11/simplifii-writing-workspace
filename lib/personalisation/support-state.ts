export type Representation = "guide" | "compare" | "original";
export type SupportConfidence = "open" | "provisional" | "emerging" | "confirmed";
export type SupportContext = "rubric" | "reading" | "planning";
export type SupportLevel = 0 | 1 | 2 | 3;

export type ContextSupportPreference = {
  representationRank: Representation[];
  confidence: SupportConfidence;
  supportLevel: SupportLevel;
  probeBeforeTell?: boolean;
  lastConfirmedAt?: number;
};

export type SupportEvidenceV1 = {
  id: string;
  context: SupportContext;
  signal: "selected" | "confirmed_helpful" | "requested_more" | "requested_less";
  value: string;
  assignmentId?: string;
  createdAt: number;
};

export type SupportCorrectionV1 = {
  id: string;
  context: SupportContext;
  previousValue?: string;
  newValue?: string;
  action: "change" | "task_only" | "forget";
  createdAt: number;
};

export type SupportStateV1 = {
  version: 1;
  global: {
    sourceOneTapAway: true;
    restoreMode: "exact" | "recap20s" | "ask";
    fadePolicy: "ask_first" | "steady" | "manual";
  };
  contexts: {
    rubric?: ContextSupportPreference;
    reading?: ContextSupportPreference;
    planning?: ContextSupportPreference;
  };
  taskOverride?: {
    assignmentId: string;
    representation?: Representation;
    supportLevel?: SupportLevel;
  };
  moment?: {
    representation?: Representation;
    supportLevel?: SupportLevel;
    expiresAt?: number;
  };
  evidence: SupportEvidenceV1[];
  corrections: SupportCorrectionV1[];
};

const REPRESENTATIONS: Representation[] = ["guide", "compare", "original"];
const CONFIDENCE: SupportConfidence[] = ["open", "provisional", "emerging", "confirmed"];
const LEVELS: SupportLevel[] = [0, 1, 2, 3];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRepresentation(value: unknown): value is Representation {
  return typeof value === "string" && REPRESENTATIONS.includes(value as Representation);
}

function isSupportLevel(value: unknown): value is SupportLevel {
  return typeof value === "number" && LEVELS.includes(value as SupportLevel);
}

function isContextPreference(value: unknown): value is ContextSupportPreference {
  if (!isRecord(value) || !Array.isArray(value.representationRank) || !value.representationRank.every(isRepresentation)) return false;
  if (typeof value.confidence !== "string" || !CONFIDENCE.includes(value.confidence as SupportConfidence)) return false;
  if (!isSupportLevel(value.supportLevel)) return false;
  if (value.probeBeforeTell !== undefined && typeof value.probeBeforeTell !== "boolean") return false;
  if (value.lastConfirmedAt !== undefined && typeof value.lastConfirmedAt !== "number") return false;
  return true;
}

export function createDefaultSupportState(): SupportStateV1 {
  return {
    version: 1,
    global: {
      sourceOneTapAway: true,
      restoreMode: "ask",
      fadePolicy: "ask_first",
    },
    contexts: {},
    evidence: [],
    corrections: [],
  };
}

export function isSupportStateV1(value: unknown): value is SupportStateV1 {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.global) || !isRecord(value.contexts)) return false;
  if (value.global.sourceOneTapAway !== true) return false;
  if (!["exact", "recap20s", "ask"].includes(String(value.global.restoreMode))) return false;
  if (!["ask_first", "steady", "manual"].includes(String(value.global.fadePolicy))) return false;
  for (const key of ["rubric", "reading", "planning"] as const) {
    const preference = value.contexts[key];
    if (preference !== undefined && !isContextPreference(preference)) return false;
  }
  if (!Array.isArray(value.evidence) || !Array.isArray(value.corrections)) return false;
  return true;
}

export function normaliseSupportState(value: unknown): SupportStateV1 {
  return isSupportStateV1(value) ? value : createDefaultSupportState();
}

function pushEvidence(
  state: SupportStateV1,
  context: SupportContext,
  signal: SupportEvidenceV1["signal"],
  value: string,
  assignmentId?: string,
): SupportStateV1 {
  return {
    ...state,
    evidence: [
      ...state.evidence,
      { id: uid("support-evidence"), context, signal, value, assignmentId, createdAt: Date.now() },
    ].slice(-100),
  };
}

export function selectContextRepresentation(
  state: SupportStateV1,
  context: SupportContext,
  representation: Representation,
  assignmentId?: string,
): SupportStateV1 {
  const current = state.contexts[context];
  const representationRank = [
    representation,
    ...(current?.representationRank ?? []).filter((item) => item !== representation),
  ].slice(0, 3);
  const next: SupportStateV1 = {
    ...state,
    contexts: {
      ...state.contexts,
      [context]: {
        representationRank,
        confidence: current?.confidence === "confirmed" ? "emerging" : "provisional",
        supportLevel: current?.supportLevel ?? 1,
        probeBeforeTell: current?.probeBeforeTell,
        lastConfirmedAt: current?.lastConfirmedAt,
      },
    },
  };
  return pushEvidence(next, context, "selected", representation, assignmentId);
}

export function confirmContextHelpful(
  state: SupportStateV1,
  context: SupportContext,
  representation: Representation,
  assignmentId?: string,
): SupportStateV1 {
  const selected = selectContextRepresentation(state, context, representation, assignmentId);
  const current = selected.contexts[context]!;
  const previousConfirmations = selected.evidence.filter(
    (event) => event.context === context && event.signal === "confirmed_helpful" && event.value === representation,
  ).length;
  const confidence: SupportConfidence = previousConfirmations >= 2 ? "confirmed" : "emerging";
  const next: SupportStateV1 = {
    ...selected,
    contexts: {
      ...selected.contexts,
      [context]: { ...current, confidence, lastConfirmedAt: Date.now() },
    },
  };
  return pushEvidence(next, context, "confirmed_helpful", representation, assignmentId);
}

export function setTaskOnlyRepresentation(
  state: SupportStateV1,
  context: SupportContext,
  assignmentId: string,
  representation: Representation,
): SupportStateV1 {
  const previousValue = state.taskOverride?.representation;
  return {
    ...state,
    taskOverride: { assignmentId, representation, supportLevel: state.taskOverride?.supportLevel },
    corrections: [
      ...state.corrections,
      {
        id: uid("support-correction"),
        context,
        previousValue,
        newValue: representation,
        action: "task_only",
        createdAt: Date.now(),
      },
    ].slice(-100),
  };
}

export function adjustSupportLevel(
  state: SupportStateV1,
  context: SupportContext,
  direction: "more" | "less",
  assignmentId?: string,
): SupportStateV1 {
  const current = state.contexts[context] ?? {
    representationRank: [],
    confidence: "open" as const,
    supportLevel: 1 as const,
  };
  const delta = direction === "more" ? 1 : -1;
  const supportLevel = Math.max(0, Math.min(3, current.supportLevel + delta)) as SupportLevel;
  const next: SupportStateV1 = {
    ...state,
    contexts: { ...state.contexts, [context]: { ...current, supportLevel } },
  };
  return pushEvidence(next, context, direction === "more" ? "requested_more" : "requested_less", String(supportLevel), assignmentId);
}

export function forgetContextPreference(
  state: SupportStateV1,
  context: SupportContext,
  assignmentId?: string,
): SupportStateV1 {
  const previousValue = state.contexts[context]?.representationRank[0];
  const contexts = { ...state.contexts };
  delete contexts[context];
  const taskOverride = state.taskOverride?.assignmentId === assignmentId ? undefined : state.taskOverride;
  return {
    ...state,
    contexts,
    taskOverride,
    corrections: [
      ...state.corrections,
      {
        id: uid("support-correction"),
        context,
        previousValue,
        action: "forget",
        createdAt: Date.now(),
      },
    ].slice(-100),
  };
}
