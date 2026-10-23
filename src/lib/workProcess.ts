export type WorkProcessStep = {
  /** Linked column id when the step tracks a board status. */
  statusId: string | null;
  /** Display title (used when status is missing or custom). */
  title: string;
  body: string;
};

export type WorkProcess = {
  steps: WorkProcessStep[];
  notesMd: string;
};

export function emptyWorkProcess(): WorkProcess {
  return { steps: [], notesMd: "" };
}

export function parseWorkProcessSteps(raw: unknown): WorkProcessStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: WorkProcessStep[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const title =
      typeof record.title === "string" ? record.title.trim() : "";
    const body = typeof record.body === "string" ? record.body : "";
    const statusId =
      typeof record.statusId === "string" && record.statusId.trim()
        ? record.statusId.trim()
        : null;
    if (!title && !body && !statusId) continue;
    steps.push({
      statusId,
      title: title || "Step",
      body,
    });
  }
  return steps;
}

export function serializeWorkProcessSteps(steps: WorkProcessStep[]): WorkProcessStep[] {
  return steps
    .map((step) => ({
      statusId: step.statusId?.trim() || null,
      title: step.title.trim() || "Step",
      body: step.body.trim(),
    }))
    .filter((step) => step.title || step.body || step.statusId);
}

export function workProcessHasContent(process: WorkProcess): boolean {
  if (process.notesMd.trim()) return true;
  return process.steps.some(
    (step) => step.title.trim() || step.body.trim() || step.statusId
  );
}

/** Resolve display title from live statuses when linked. */
export function resolveProcessStepTitle(
  step: WorkProcessStep,
  statuses: ReadonlyArray<{ id: string; name: string }>
): string {
  if (step.statusId) {
    const match = statuses.find((status) => status.id === step.statusId);
    if (match) return match.name;
  }
  return step.title.trim() || "Step";
}
