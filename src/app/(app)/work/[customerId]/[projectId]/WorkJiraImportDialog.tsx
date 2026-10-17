"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Button, Dialog, IconButton } from "@/components/ui";
import {
  buildJiraRelationEdges,
  parseJiraRssXml,
  suggestPriorityMapping,
  suggestTypeMapping,
  type ParsedJiraExport,
  type ParsedJiraIssue,
} from "@/lib/jiraXmlParse";
import {
  JIRA_STATUS_CREATE,
  matchPeopleByName,
  type JiraImportIssuePayload,
  type JiraImportMappings,
  type JiraImportRelationSkip,
} from "@/lib/workJiraImportShared";
import type { WorkBoardStatus } from "@/lib/workStatuses";
import type {
  WorkIssuePriority,
  WorkIssueType,
  WorkPerson,
} from "@/lib/workTypes";
import {
  importJiraIssuesBatchAction,
  importJiraRelationsAction,
  prepareJiraImportAction,
} from "../../actions";

type Step = "upload" | "map" | "preview" | "importing" | "done";
type ImportPhase = "issues" | "relations" | "done";

/** Server batch size; UI simulates 1-step progress during each batch. */
const BATCH_SIZE = 5;
const DEFAULT_MS_PER_ITEM = 220;

function buildImportReportText(input: {
  fileName: string | null;
  projectKey: string | null;
  projectName: string | null;
  createEpicCards: boolean;
  mapEpicsToComponents: boolean;
  issuesInFile: number;
  processed: number;
  total: number;
  created: number;
  skipped: number;
  failed: { key: string; error: string }[];
  skippedIssues: { key: string; reason: string }[];
  relationsPlanned: number;
  relationsCreated: number;
  relationsSkipped: JiraImportRelationSkip[];
}): string {
  const lines: string[] = [
    "Jira import report",
    input.fileName ? `File: ${input.fileName}` : "File: (unknown)",
    input.projectKey
      ? `Project: ${input.projectKey}${
          input.projectName ? ` (${input.projectName})` : ""
        }`
      : null,
    `Options: create epic cards=${input.createEpicCards ? "yes" : "no"}; map epics to components=${input.mapEpicsToComponents ? "yes" : "no"}`,
    "",
    "Issues",
    `  In file: ${input.issuesInFile}`,
    `  Processed: ${input.processed}/${input.total}`,
    `  Created: ${input.created}`,
    `  Skipped: ${input.skipped}`,
    `  Failed: ${input.failed.length}`,
  ].filter((line): line is string => line != null);

  if (input.skippedIssues.length > 0) {
    lines.push("", "Skipped issues:");
    for (const row of input.skippedIssues) {
      lines.push(`- ${row.key}: ${row.reason}`);
    }
  } else {
    lines.push("", "Skipped issues: (none)");
  }

  if (input.failed.length > 0) {
    lines.push("", "Failures:");
    for (const row of input.failed) {
      lines.push(`- ${row.key}: ${row.error}`);
    }
  } else {
    lines.push("", "Failures: (none)");
  }

  lines.push(
    "",
    "Relations",
    `  Planned: ${input.relationsPlanned}`,
    `  Created: ${input.relationsCreated}`,
    `  Skipped: ${input.relationsSkipped.length}`
  );

  if (input.relationsSkipped.length > 0) {
    lines.push("", "Skipped relations:");
    for (const row of input.relationsSkipped) {
      lines.push(
        `- ${row.kind} ${row.fromKey} → ${row.toKey} (${row.jiraType}): ${row.reason}`
      );
    }
  } else {
    lines.push("", "Skipped relations: (none)");
  }

  return lines.join("\n");
}

function toPayload(issue: ParsedJiraIssue): JiraImportIssuePayload {
  return {
    key: issue.key,
    link: issue.link,
    summary: issue.summary,
    descriptionText: issue.descriptionText,
    type: issue.type,
    priority: issue.priority,
    status: issue.status,
    assigneeName: issue.assigneeName,
    labels: issue.labels,
    parentKey: issue.parentKey,
    links: issue.links,
    estimateSeconds: issue.estimateSeconds,
    dueDate: issue.dueDate,
    startDate: issue.startDate,
    comments: issue.comments,
    preDeployActions: issue.preDeployActions,
  };
}

function defaultStatusMap(
  statuses: string[],
  columns: WorkBoardStatus[]
): Record<string, string> {
  const byName = new Map(
    columns.map((c) => [c.name.trim().toLowerCase(), c.id])
  );
  const out: Record<string, string> = {};
  for (const status of statuses) {
    const match = byName.get(status.trim().toLowerCase());
    out[status] = match ?? JIRA_STATUS_CREATE;
  }
  return out;
}

function defaultTypeMap(types: string[]): Record<string, WorkIssueType> {
  return Object.fromEntries(
    types.map((t) => [t, suggestTypeMapping(t)])
  ) as Record<string, WorkIssueType>;
}

function defaultPriorityMap(
  priorities: string[]
): Record<string, WorkIssuePriority | null> {
  return Object.fromEntries(
    priorities.map((p) => [p, suggestPriorityMapping(p)])
  ) as Record<string, WorkIssuePriority | null>;
}

export function WorkJiraImportDialog({
  open,
  onOpenChange,
  boardId,
  columns,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  columns: WorkBoardStatus[];
  members: WorkPerson[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedJiraExport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [typeMap, setTypeMap] = useState<Record<string, WorkIssueType>>({});
  const [priorityMap, setPriorityMap] = useState<
    Record<string, WorkIssuePriority | null>
  >({});
  const [peopleMap, setPeopleMap] = useState<Record<string, string>>({});
  const [createEpicCards, setCreateEpicCards] = useState(false);
  const [mapEpicsToComponents, setMapEpicsToComponents] = useState(false);

  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [resolvedStatusMap, setResolvedStatusMap] = useState<
    Record<string, string>
  >({});

  const [progress, setProgress] = useState({
    processed: 0,
    total: 0,
    created: 0,
    skipped: 0,
    failed: 0,
  });
  const [importPhase, setImportPhase] = useState<ImportPhase>("issues");
  const [failedRows, setFailedRows] = useState<{ key: string; error: string }[]>(
    []
  );
  const [relationsCreated, setRelationsCreated] = useState(0);
  const [relationsSkipped, setRelationsSkipped] = useState<
    JiraImportRelationSkip[]
  >([]);
  const [reportText, setReportText] = useState("");
  const [copied, setCopied] = useState(false);

  function reset() {
    setStep("upload");
    setError(null);
    setParsed(null);
    setFileName(null);
    setStatusMap({});
    setTypeMap({});
    setPriorityMap({});
    setPeopleMap({});
    setCreateEpicCards(false);
    setMapEpicsToComponents(false);
    setExistingKeys(new Set());
    setResolvedStatusMap({});
    setProgress({ processed: 0, total: 0, created: 0, skipped: 0, failed: 0 });
    setImportPhase("issues");
    setFailedRows([]);
    setRelationsCreated(0);
    setRelationsSkipped([]);
    setReportText("");
    setCopied(false);
  }

  function handleClose(next: boolean) {
    if (pending && step === "importing") return;
    onOpenChange(next);
    if (!next) reset();
  }

  async function onFileSelected(file: File | null) {
    setError(null);
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseJiraRssXml(text);
      setParsed(result);
      setFileName(file.name);
      setStatusMap(defaultStatusMap(result.uniqueStatuses, columns));
      setTypeMap(defaultTypeMap(result.uniqueTypes));
      setPriorityMap(defaultPriorityMap(result.uniquePriorities));
      setPeopleMap(matchPeopleByName(result.uniqueAssignees, members));
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse file");
    }
  }

  const importableIssues = useMemo(() => {
    if (!parsed) return [];
    return parsed.issues.filter((issue) => {
      if (existingKeys.has(issue.key)) return false;
      if (
        !createEpicCards &&
        issue.type.trim().toLowerCase() === "epic"
      ) {
        return false;
      }
      return true;
    });
  }, [parsed, existingKeys, createEpicCards]);

  const skipCount = useMemo(() => {
    if (!parsed) return 0;
    let n = 0;
    for (const issue of parsed.issues) {
      if (existingKeys.has(issue.key)) {
        n += 1;
        continue;
      }
      if (
        !createEpicCards &&
        issue.type.trim().toLowerCase() === "epic"
      ) {
        n += 1;
      }
    }
    return n;
  }, [parsed, existingKeys, createEpicCards]);

  const relationPreviewCount = useMemo(() => {
    if (!parsed) return 0;
    return buildJiraRelationEdges(parsed.issues, { createEpicCards }).length;
  }, [parsed, createEpicCards]);

  const componentPreview = useMemo(() => {
    if (!parsed || !mapEpicsToComponents) {
      return { components: 0, mappedChildren: 0 };
    }
    const epicKeys = new Set(parsed.epics.map((epic) => epic.key));
    const componentNames = new Set(
      parsed.epics
        .map((epic) => epic.summary.trim().toLowerCase())
        .filter(Boolean)
    );
    let mappedChildren = 0;
    for (const issue of parsed.issues) {
      if (existingKeys.has(issue.key)) continue;
      if (issue.type.trim().toLowerCase() === "epic") continue;
      if (!issue.parentKey || !epicKeys.has(issue.parentKey)) continue;
      mappedChildren += 1;
    }
    return {
      components: componentNames.size,
      mappedChildren,
    };
  }, [parsed, mapEpicsToComponents, existingKeys]);

  const allStatusesMapped = useMemo(() => {
    if (!parsed) return false;
    return parsed.uniqueStatuses.every((s) => Boolean(statusMap[s]));
  }, [parsed, statusMap]);

  function goPreview() {
    setError(null);
    if (!parsed) return;
    if (!allStatusesMapped) {
      setError("Map every Jira status to a column (or create one).");
      return;
    }
    startTransition(async () => {
      const result = await prepareJiraImportAction(
        boardId,
        statusMap,
        parsed.issues.map((i) => i.key)
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setExistingKeys(new Set(result.existingKeys));
      setResolvedStatusMap(result.statusMap);
      setStep("preview");
    });
  }

  function buildMappings(): JiraImportMappings {
    const epicTitles: Record<string, string> = {};
    for (const epic of parsed?.epics ?? []) {
      epicTitles[epic.key] = epic.summary;
    }
    return {
      statusMap: resolvedStatusMap,
      typeMap,
      priorityMap,
      peopleMap,
      createEpicCards,
      mapEpicsToComponents,
      epicTitles,
    };
  }

  function buildSkippedIssueRows(): { key: string; reason: string }[] {
    if (!parsed) return [];
    const rows: { key: string; reason: string }[] = [];
    for (const issue of parsed.issues) {
      if (existingKeys.has(issue.key)) {
        rows.push({ key: issue.key, reason: "Already imported (Jira key exists)" });
        continue;
      }
      if (
        !createEpicCards &&
        issue.type.trim().toLowerCase() === "epic"
      ) {
        rows.push({
          key: issue.key,
          reason: mapEpicsToComponents
            ? "Epic not imported as card (component mapping only)"
            : "Epic not imported as card",
        });
      }
    }
    return rows;
  }

  function runImport() {
    if (!parsed) return;
    setError(null);
    setStep("importing");
    setImportPhase("issues");
    setReportText("");

    const cardPayloads = importableIssues.map(toPayload);
    const epicSeedPayloads =
      !createEpicCards && mapEpicsToComponents
        ? parsed.issues
            .filter(
              (issue) =>
                issue.type.trim().toLowerCase() === "epic" &&
                !existingKeys.has(issue.key)
            )
            .map(toPayload)
        : [];

    const mappings = buildMappings();
    const edges = buildJiraRelationEdges(parsed.issues, { createEpicCards });
    const skippedIssueRows = buildSkippedIssueRows();
    const cardCount = cardPayloads.length;
    const plannedSkip =
      existingKeys.size + (!createEpicCards ? parsed.epics.length : 0);

    setProgress({
      processed: 0,
      total: cardCount,
      created: 0,
      skipped: plannedSkip,
      failed: 0,
    });
    setFailedRows([]);
    setRelationsCreated(0);
    setRelationsSkipped([]);
    setCopied(false);

    startTransition(async () => {
      let created = 0;
      let skipped = plannedSkip;
      const failed: { key: string; error: string }[] = [];
      let msPerItem = DEFAULT_MS_PER_ITEM;

      function startBatchSimulation(baseProcessed: number, batchLen: number) {
        let stepped = 0;
        // Kick UI immediately so it doesn't sit still during the request
        if (batchLen > 0) {
          stepped = 1;
          setProgress((p) => ({
            ...p,
            processed: Math.min(baseProcessed + 1, cardCount),
          }));
        }
        const timer = window.setInterval(() => {
          if (stepped >= batchLen) return;
          stepped += 1;
          setProgress((p) => ({
            ...p,
            processed: Math.min(baseProcessed + stepped, cardCount),
          }));
        }, msPerItem);
        return {
          stop: () => window.clearInterval(timer),
        };
      }

      for (let i = 0; i < epicSeedPayloads.length; i += BATCH_SIZE) {
        const batch = epicSeedPayloads.slice(i, i + BATCH_SIZE);
        const result = await importJiraIssuesBatchAction(
          boardId,
          batch,
          mappings
        );
        if (!result.ok) {
          setError(result.error);
          setImportPhase("done");
          setStep("done");
          return;
        }
        failed.push(...result.failed);
        setFailedRows([...failed]);
      }

      for (let i = 0; i < cardPayloads.length; i += BATCH_SIZE) {
        const batch = cardPayloads.slice(i, i + BATCH_SIZE);
        const sim = startBatchSimulation(i, batch.length);
        const startedAt = Date.now();
        const result = await importJiraIssuesBatchAction(
          boardId,
          batch,
          mappings
        );
        sim.stop();
        const elapsed = Date.now() - startedAt;
        if (batch.length > 0) {
          msPerItem = Math.max(
            80,
            Math.min(500, Math.round(elapsed / batch.length))
          );
        }
        if (!result.ok) {
          setError(result.error);
          setImportPhase("done");
          setStep("done");
          return;
        }
        created += result.created;
        skipped += result.skipped;
        failed.push(...result.failed);
        setProgress({
          processed: Math.min(i + batch.length, cardCount),
          total: cardCount,
          created,
          skipped,
          failed: failed.length,
        });
        setFailedRows([...failed]);
      }

      setProgress({
        processed: cardCount,
        total: cardCount,
        created,
        skipped,
        failed: failed.length,
      });
      setFailedRows(failed);

      let relCreated = 0;
      let relSkipped: JiraImportRelationSkip[] = [];
      if (edges.length > 0) {
        setImportPhase("relations");
        const relResult = await importJiraRelationsAction(boardId, edges);
        if (!relResult.ok) {
          setError(relResult.error);
        } else {
          relCreated = relResult.created;
          relSkipped = relResult.skipped;
          setRelationsCreated(relCreated);
          setRelationsSkipped(relSkipped);
        }
      }

      const report = buildImportReportText({
        fileName,
        projectKey: parsed.projectKey,
        projectName: parsed.projectName,
        createEpicCards,
        mapEpicsToComponents,
        issuesInFile: parsed.issues.length,
        processed: cardCount,
        total: cardCount,
        created,
        skipped,
        failed,
        skippedIssues: skippedIssueRows,
        relationsPlanned: edges.length,
        relationsCreated: relCreated,
        relationsSkipped: relSkipped,
      });
      setReportText(report);
      setImportPhase("done");
      setStep("done");
      router.refresh();
    });
  }

  async function copyReport() {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  const progressPercent =
    progress.total === 0
      ? importPhase === "done" || step === "done"
        ? 100
        : importPhase === "relations"
          ? 95
          : 0
      : Math.min(
          100,
          Math.round((progress.processed / progress.total) * 100)
        );

  const subtitle =
    step === "upload"
      ? "Upload a Jira RSS/XML export"
      : step === "map"
        ? fileName ?? "Map fields"
        : step === "preview"
          ? "Review before import"
          : step === "importing"
            ? "Importing…"
            : "Import complete";

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title="Import from Jira"
      subtitle={subtitle}
      contentClassName="max-w-[720px] max-h-[min(90vh,840px)] overflow-y-auto"
    >
      <div className="modal-form-discreet mt-4 space-y-4">
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {step === "upload" && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              Export issues from Jira as XML (RSS), then upload the file here.
              Existing issues with the same Jira key (as a reference) are
              skipped.
            </p>
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-subtle bg-bg-muted/40 px-4 py-10 text-sm text-text-secondary hover:border-border-strong"
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const file = event.dataTransfer.files?.[0] ?? null;
                void onFileSelected(file);
              }}
            >
              <span className="font-medium text-text-primary">
                Choose XML file
              </span>
              <span>or drop it here</span>
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                className="sr-only"
                autoFocus
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void onFileSelected(file);
                }}
              />
            </label>
          </div>
        )}

        {step === "map" && parsed && (
          <div className="space-y-5">
            <p className="text-sm text-text-secondary">
              {parsed.issues.length} issues
              {parsed.projectKey ? ` from ${parsed.projectKey}` : ""}
              {parsed.projectName ? ` (${parsed.projectName})` : ""}.
            </p>

            <section className="space-y-2">
              <h3 className="text-sm font-medium text-text-primary">
                Status → column
              </h3>
              <div className="space-y-2">
                {parsed.uniqueStatuses.map((status) => (
                  <label
                    key={status}
                    className="grid grid-cols-[1fr_minmax(12rem,1fr)] items-center gap-2 text-sm"
                  >
                    <span className="truncate text-text-primary">{status}</span>
                    <select
                      className="w-full rounded-md border border-form bg-bg-default px-2 py-1.5 text-sm text-text-primary"
                      value={statusMap[status] ?? ""}
                      onChange={(event) =>
                        setStatusMap((current) => ({
                          ...current,
                          [status]: event.target.value,
                        }))
                      }
                    >
                      {columns.map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.name}
                        </option>
                      ))}
                      <option value={JIRA_STATUS_CREATE}>
                        Create “{status}”
                      </option>
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium text-text-primary">
                Type → Work type
              </h3>
              <div className="space-y-2">
                {parsed.uniqueTypes.map((type) => (
                  <label
                    key={type}
                    className="grid grid-cols-[1fr_minmax(12rem,1fr)] items-center gap-2 text-sm"
                  >
                    <span className="truncate text-text-primary">{type}</span>
                    <select
                      className="w-full rounded-md border border-form bg-bg-default px-2 py-1.5 text-sm text-text-primary"
                      value={typeMap[type] ?? "issue"}
                      onChange={(event) =>
                        setTypeMap((current) => ({
                          ...current,
                          [type]: event.target.value as WorkIssueType,
                        }))
                      }
                    >
                      <option value="issue">Issue</option>
                      <option value="bug">Bug</option>
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium text-text-primary">
                Priority
              </h3>
              <div className="space-y-2">
                {parsed.uniquePriorities.map((priority) => (
                  <label
                    key={priority}
                    className="grid grid-cols-[1fr_minmax(12rem,1fr)] items-center gap-2 text-sm"
                  >
                    <span className="truncate text-text-primary">
                      {priority}
                    </span>
                    <select
                      className="w-full rounded-md border border-form bg-bg-default px-2 py-1.5 text-sm text-text-primary"
                      value={priorityMap[priority] ?? "medium"}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPriorityMap((current) => ({
                          ...current,
                          [priority]:
                            value === ""
                              ? null
                              : (value as WorkIssuePriority),
                        }));
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="">None</option>
                    </select>
                  </label>
                ))}
              </div>
            </section>

            {parsed.uniqueAssignees.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-text-primary">
                  People (owner)
                </h3>
                <p className="text-xs text-text-tertiary">
                  Matched by name to project members. Unmatched stay empty.
                </p>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {parsed.uniqueAssignees.map((name) => (
                    <label
                      key={name}
                      className="grid grid-cols-[1fr_minmax(12rem,1fr)] items-center gap-2 text-sm"
                    >
                      <span className="truncate text-text-primary">{name}</span>
                      <select
                        className="w-full rounded-md border border-form bg-bg-default px-2 py-1.5 text-sm text-text-primary"
                        value={peopleMap[name] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPeopleMap((current) => {
                            const next = { ...current };
                            if (!value) delete next[name];
                            else next[name] = value;
                            return next;
                          });
                        }}
                      >
                        <option value="">Unassigned</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {parsed.epics.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-text-primary">
                  Epics ({parsed.epics.length})
                </h3>
                <label className="flex items-start gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={createEpicCards}
                    onChange={(event) =>
                      setCreateEpicCards(event.target.checked)
                    }
                  />
                  <span>
                    Create epic cards
                    <span className="mt-0.5 block text-xs text-text-tertiary">
                      Import epics as Work issues and set parent relations from
                      Story/Task/Bug children.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={mapEpicsToComponents}
                    onChange={(event) =>
                      setMapEpicsToComponents(event.target.checked)
                    }
                  />
                  <span>
                    Map epics to components
                    <span className="mt-0.5 block text-xs text-text-tertiary">
                      Create a component from each epic title and assign it to
                      child issues. Can be combined with epic cards.
                    </span>
                  </span>
                </label>
              </section>
            )}
            <p className="text-xs text-text-tertiary">
              Subtasks always become cards with a parent link. Other Jira links
              (Blocks → blocks, Relates and unknown types → relates) are applied
              after cards are created.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  reset();
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={pending || !allStatusesMapped}
                onClick={goPreview}
              >
                {pending ? "Preparing…" : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && parsed && (
          <div className="space-y-4">
            <ul className="space-y-1 text-sm text-text-primary">
              <li>
                In file:{" "}
                <strong className="font-semibold">{parsed.issues.length}</strong>
                <span className="text-text-tertiary">
                  {" "}
                  ({parsed.epics.length} epics)
                </span>
              </li>
              <li>
                Will create:{" "}
                <strong className="font-semibold">{importableIssues.length}</strong>
              </li>
              <li>
                Will skip:{" "}
                <strong className="font-semibold">{skipCount}</strong>
                <span className="text-text-tertiary">
                  {" "}
                  ({existingKeys.size} already imported
                  {!createEpicCards
                    ? `, ${parsed.epics.length} epics as non-cards`
                    : ""}
                  )
                </span>
              </li>
              <li>
                Components:{" "}
                {mapEpicsToComponents ? (
                  <>
                    <strong className="font-semibold">
                      {componentPreview.components}
                    </strong>
                    <span className="text-text-tertiary">
                      {" "}
                      created,{" "}
                    </span>
                    <strong className="font-semibold">
                      {componentPreview.mappedChildren}
                    </strong>
                    <span className="text-text-tertiary">
                      {" "}
                      children mapped
                    </span>
                  </>
                ) : (
                  <span className="text-text-tertiary">
                    none (epic → component off)
                  </span>
                )}
              </li>
              <li>
                Relations planned:{" "}
                <strong className="font-semibold">
                  {relationPreviewCount}
                </strong>
                <span className="text-text-tertiary">
                  {" "}
                  (parent, blocks, relates — after cards)
                </span>
              </li>
            </ul>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border-subtle">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-bg-muted text-text-tertiary">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Key</th>
                    <th className="px-2 py-1.5 font-medium">Summary</th>
                    <th className="px-2 py-1.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.issues.slice(0, 40).map((issue) => {
                    const skip =
                      existingKeys.has(issue.key) ||
                      (!createEpicCards &&
                        issue.type.trim().toLowerCase() === "epic");
                    return (
                      <tr
                        key={issue.key}
                        className="border-t border-border-subtle"
                      >
                        <td className="px-2 py-1 font-mono text-text-secondary">
                          {issue.key}
                        </td>
                        <td className="truncate px-2 py-1 text-text-primary">
                          {issue.summary}
                        </td>
                        <td className="px-2 py-1 text-text-secondary">
                          {skip ? "Skip" : "Create"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsed.issues.length > 40 && (
                <p className="border-t border-border-subtle px-2 py-1.5 text-xs text-text-tertiary">
                  Showing first 40 of {parsed.issues.length}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("map")}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={pending || importableIssues.length === 0}
                onClick={runImport}
              >
                Import {importableIssues.length} issues
              </Button>
            </div>
          </div>
        )}

        {(step === "importing" || step === "done") && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border-subtle bg-bg-muted/40 px-3 py-3">
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-medium text-text-primary">
                  {step === "importing"
                    ? importPhase === "relations"
                      ? "Linking relations…"
                      : "Importing issues…"
                    : "Import complete"}
                </p>
                <p className="whitespace-pre font-mono text-xs tabular-nums tracking-normal text-text-secondary sm:text-sm">
                  {(() => {
                    const fig = "\u2007";
                    const width = Math.max(
                      1,
                      String(progress.total).length
                    );
                    const pad = (n: number, w = width) =>
                      String(n).padStart(w, fig);
                    const base = `${pad(progress.processed)}/${pad(progress.total)} processed (${pad(progressPercent, 3)}%) · Created ${pad(progress.created)} · Skipped ${pad(progress.skipped)} · Failed ${pad(progress.failed)}`;
                    if (step === "done") {
                      return `${base} · Relations ${pad(relationsCreated)} (skipped ${pad(relationsSkipped.length)})`;
                    }
                    if (importPhase === "relations") {
                      return `${base} · Linking relations…`;
                    }
                    return base;
                  })()}
                </p>
              </div>
              <div
                className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg-default ring-1 ring-border-subtle"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
              >
                <div
                  className="h-full rounded-full bg-brand-signal transition-[width] duration-150 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {step === "done" && reportText && (
              <div className="overflow-hidden rounded-md border border-border-subtle bg-bg-default">
                <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-1.5">
                  <span className="text-xs font-medium text-text-primary">
                    Report
                  </span>
                  <IconButton
                    aria-label={copied ? "Copied" : "Copy report"}
                    title={copied ? "Copied" : "Copy report to clipboard"}
                    onClick={() => {
                      void copyReport();
                    }}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                  </IconButton>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed text-text-primary">
                  {reportText}
                </pre>
              </div>
            )}

            {step === "done" && (
              <div className="flex justify-end">
                <Button type="button" onClick={() => handleClose(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
