import type { Representation, SupportLevel, SupportStateV1 } from "./support-state";

export type SupportRoute = {
  representation: Representation;
  supportLevel: SupportLevel;
  restoreMode: SupportStateV1["global"]["restoreMode"];
  sourceVisible: true;
  reason: string[];
};

export function routeRubricSupport({
  supportState,
  assignmentId,
}: {
  supportState: SupportStateV1;
  assignmentId: string;
}): SupportRoute {
  const now = Date.now();
  const activeMoment = supportState.moment && (!supportState.moment.expiresAt || supportState.moment.expiresAt > now)
    ? supportState.moment
    : undefined;
  const taskOverride = supportState.taskOverride?.assignmentId === assignmentId ? supportState.taskOverride : undefined;
  const context = supportState.contexts.rubric;

  if (activeMoment?.representation) {
    return {
      representation: activeMoment.representation,
      supportLevel: activeMoment.supportLevel ?? context?.supportLevel ?? 1,
      restoreMode: supportState.global.restoreMode,
      sourceVisible: true,
      reason: ["moment"],
    };
  }

  if (taskOverride?.representation) {
    return {
      representation: taskOverride.representation,
      supportLevel: taskOverride.supportLevel ?? context?.supportLevel ?? 1,
      restoreMode: supportState.global.restoreMode,
      sourceVisible: true,
      reason: ["task_override"],
    };
  }

  if (context?.representationRank[0]) {
    return {
      representation: context.representationRank[0],
      supportLevel: context.supportLevel,
      restoreMode: supportState.global.restoreMode,
      sourceVisible: true,
      reason: [`rubric_context:${context.confidence}`],
    };
  }

  return {
    representation: "guide",
    supportLevel: 1,
    restoreMode: supportState.global.restoreMode,
    sourceVisible: true,
    reason: ["safe_default"],
  };
}
