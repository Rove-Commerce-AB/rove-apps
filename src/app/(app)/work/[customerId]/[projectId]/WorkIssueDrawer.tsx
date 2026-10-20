"use client";

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ClipboardEvent,
  type MouseEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, Circle, CircleDot, Clock, Send, X } from "lucide-react";
import {
  Button,
  ConfirmModal,
  Dialog,
  DrawerItemList,
  FieldInfoTip,
  InitialsAvatar,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import {
  drawerSelectTriggerClass,
  quietComposeInputClass,
} from "@/components/ui/inlineEditStyles";
import { formatWorkTimestamp } from "@/lib/workTimeAgo";
import {
  joinWorkInlineImages,
  splitWorkInlineImages,
  workFileImageHref,
} from "@/lib/workInlineImages";
import {
  WORK_FILE_MAX_BYTES,
  type WorkBoardView,
  type WorkIssue,
  type WorkIssuePriority,
  type WorkPerson,
} from "@/lib/workTypes";
import type { WorkIssueStatus } from "@/lib/workStatuses";
import {
  addWorkIssueAssigneeAction,
  addWorkIssueCommentAction,
  addWorkIssueLabelAction,
  addWorkIssueRelationAction,
  addWorkIssuePreDeployActionAction,
  addWorkIssueReferenceAction,
  addWorkIssueRequirementAction,
  assignWorkIssueComponentAction,
  deleteWorkIssueAction,
  deleteWorkIssueCommentAction,
  deleteWorkIssueFileAction,
  deleteWorkIssuePreDeployActionAction,
  deleteWorkIssueReferenceAction,
  deleteWorkIssueRequirementAction,
  removeWorkIssueAssigneeAction,
  removeWorkIssueLabelAction,
  removeWorkIssueRelationAction,
  updateWorkIssueCommentAction,
  updateWorkIssueComponentAction,
  updateWorkIssueEstimateAction,
  updateWorkIssueFieldAction,
  updateWorkIssueOwnerAction,
  updateWorkIssuePriorityAction,
  updateWorkIssuePreDeployActionBodyAction,
  updateWorkIssuePreDeployActionDoneAction,
  updateWorkIssueRequirementBodyAction,
  updateWorkIssueRequirementDoneAction,
  deleteWorkIssueTimeEntryAction,
  getWorkIssueTimeLogAction,
  logWorkIssueTimeAction,
  updateWorkIssueTimeEntryAction,
  updateWorkIssueScheduleAction,
  updateWorkIssueTitleAction,
  updateWorkIssueTypeAction,
  uploadWorkIssueFileAction,
} from "../../actions";
import { WorkDescriptionEditor } from "@/components/WorkDescriptionEditor";
import { WorkCardTypeBadge } from "./WorkBoardViewControls";
import { WorkCommentComposer, WorkInlineImageThumbs } from "./WorkCommentComposer";
import { WorkIssueComment } from "./WorkIssueComment";
import { WorkIssueRelations } from "./WorkIssueRelations";
import { WorkTimeGraph } from "./WorkTimeGraph";
import { canDeleteWorkIssue } from "@/lib/workAccess";
import { encodeMentions, mentionPlainText } from "@/lib/workMentions";
import { formatWorkHours, parseWorkEstimateHours } from "@/lib/workTime";
import type {
  WorkIssueTimeLogEntry,
  WorkIssueTimeLogRoleOption,
} from "@/lib/workIssueTimeLogTypes";

const textFieldClass =
  "w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-1 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50";

const commentClass =
  "w-full rounded-md border border-form bg-bg-default px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal/25 disabled:opacity-50";

/** Matches Button size="sm" (h-9): 36px total, ~7px pad + 20px line inside the border box. */
const commentCollapsedClass =
  "box-border !h-9 !min-h-9 !max-h-9 rounded-md border border-transparent bg-transparent px-3 py-[7px] text-sm leading-5 text-text-primary placeholder-text-muted transition-colors hover:bg-text-primary/[0.06] focus:border-form focus:bg-bg-default focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal/25 disabled:opacity-50 resize-none";

const metaSelectTriggerClass =
  "h-7 !w-auto max-w-full border-0 bg-transparent px-0 py-0 text-[13px] font-medium text-text-primary hover:bg-transparent focus:border-transparent focus:ring-0";

const propertyChipClass =
  "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-text-primary/[0.06]";

const addPropertyClass =
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[13px] text-text-tertiary hover:bg-text-primary/[0.06] hover:text-text-secondary disabled:opacity-50";

const AutosizeTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    value: string;
    minRows?: number;
  }
>(function AutosizeTextarea(
  { value, className, minRows = 2, ...props },
  forwardedRef
) {
  const localRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = localRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      {...props}
      ref={(node) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      }}
      value={value}
      rows={minRows}
      className={className}
    />
  );
});

function isImageMime(mimeType: string) {
  return mimeType.toLowerCase().startsWith("image/");
}

function pasteFileName(file: File, index: number) {
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/gif"
          ? "gif"
          : file.type === "image/webp"
            ? "webp"
            : file.name.includes(".")
              ? file.name.split(".").pop()!
              : "png";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return file.name && !file.name.startsWith("image")
    ? file.name
    : `paste-${stamp}${index > 0 ? `-${index + 1}` : ""}.${ext}`;
}

function workFileHref(fileId: string) {
  return workFileImageHref(fileId);
}

type PasteZone = "description" | "comment";

type InlinePasteThumb = {
  localId: string;
  previewUrl: string;
  fileId: string | null;
  uploading: boolean;
  revokeOnClear: boolean;
};

function pasteZoneFromTarget(target: EventTarget | null): PasteZone | null {
  if (!(target instanceof Element)) return null;
  const zone = target.closest("[data-paste-zone]")?.getAttribute("data-paste-zone");
  if (zone === "description" || zone === "comment") return zone;
  return null;
}

function thumbsFromFileIds(fileIds: string[]): InlinePasteThumb[] {
  return fileIds.map((fileId) => ({
    localId: fileId,
    previewUrl: workFileImageHref(fileId),
    fileId,
    uploading: false,
    revokeOnClear: false,
  }));
}

function localTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeLogDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function WorkPropertySelect({
  value,
  onValueChange,
  options,
  disabled,
  prefix,
  placeholder,
  title,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  prefix?: ReactNode;
  placeholder?: string;
  title?: string;
}) {
  return (
    <div className={propertyChipClass}>
      {prefix}
      <Select
        value={value}
        onValueChange={onValueChange}
        options={options}
        disabled={disabled}
        placeholder={placeholder}
        triggerTitle={title}
        variant="inlineEdit"
        className="w-fit min-w-0"
        triggerClassName={metaSelectTriggerClass}
      />
    </div>
  );
}

function referenceHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function RequirementsChecklistSection({
  title,
  info,
  placeholder,
  items,
  draft,
  onDraftChange,
  pending,
  onToggle,
  onSaveBody,
  onRemove,
  onAdd,
}: {
  title: string;
  info: string;
  placeholder: string;
  items: Array<{ id: string; body: string; isDone: boolean }>;
  draft: string;
  onDraftChange: (value: string) => void;
  pending: boolean;
  onToggle: (
    item: { id: string; body: string; isDone: boolean },
    isDone: boolean
  ) => void;
  onSaveBody: (
    item: { id: string; body: string; isDone: boolean },
    body: string
  ) => void;
  onRemove: (item: { id: string; body: string; isDone: boolean }) => void;
  onAdd: (body: string) => void;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <DrawerItemList
      title={title}
      info={info}
      pending={pending}
      items={items.map((item) => ({
        id: item.id,
        label: item.body,
        muted: item.isDone,
      }))}
      renderLeading={(row) => {
        const item = byId.get(row.id);
        if (!item) return null;
        return (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-form"
            checked={item.isDone}
            disabled={pending}
            aria-label={`Mark ${item.isDone ? "incomplete" : "done"}`}
            onChange={() => onToggle(item, !item.isDone)}
          />
        );
      }}
      onRename={(row, nextLabel) => {
        const item = byId.get(row.id);
        if (!item) return;
        onSaveBody(item, nextLabel);
      }}
      onRemove={(row) => {
        const item = byId.get(row.id);
        if (!item) return;
        onRemove(item);
      }}
      compose={{
        value: draft,
        onChange: onDraftChange,
        onSubmit: onAdd,
        placeholder,
      }}
    />
  );
}

type Props = {
  board: WorkBoardView;
  issue: WorkIssue;
  onStatus: (status: WorkIssueStatus) => void;
  onChanged: () => void;
  onError: (message: string) => void;
  onIssuePatch: (patch: Partial<WorkIssue>) => void;
  onDeleted: () => void;
};

export function WorkIssueDrawer({
  board,
  issue,
  initialTab = "details",
  onStatus,
  onChanged,
  onError,
  onIssuePatch,
  onDeleted,
}: Props & { initialTab?: string }) {
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState(initialTab);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canShowDangerTab = canDeleteWorkIssue(
    { id: board.currentUser.id, role: board.viewerRole },
    issue.reporter?.id ?? null
  );

  useEffect(() => {
    setTab(
      !canShowDangerTab && initialTab === "danger" ? "details" : initialTab
    );
  }, [issue.id, initialTab, canShowDangerTab]);

  useEffect(() => {
    if (!board.showTime && tab === "time") setTab("details");
  }, [board.showTime, tab]);

  useEffect(() => {
    if (!canShowDangerTab && tab === "danger") setTab("details");
  }, [canShowDangerTab, tab]);
  const [feed, setFeed] = useState<"comments" | "activity">("comments");
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(
    () => mentionPlainText(splitWorkInlineImages(issue.description).text)
  );
  const [descriptionThumbs, setDescriptionThumbs] = useState<InlinePasteThumb[]>(
    () => thumbsFromFileIds(splitWorkInlineImages(issue.description).fileIds)
  );
  const [currentState, setCurrentState] = useState(issue.currentState);
  const [nextStep, setNextStep] = useState(issue.nextStep);
  const [labelDraft, setLabelDraft] = useState("");
  const [componentDraft, setComponentDraft] = useState("");
  const [addingComponent, setAddingComponent] = useState(false);
  const [requirementDraft, setRequirementDraft] = useState("");
  const [dodDraft, setDodDraft] = useState("");
  const [preDeployDraft, setPreDeployDraft] = useState("");
  const [outOfScope, setOutOfScope] = useState(issue.outOfScope);
  const [referenceUrlDraft, setReferenceUrlDraft] = useState("");
  const [referenceLabelDraft, setReferenceLabelDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentThumbs, setCommentThumbs] = useState<InlinePasteThumb[]>([]);
  const [addingLabel, setAddingLabel] = useState(false);
  const [estimateDraft, setEstimateDraft] = useState(
    issue.estimateHours == null ? "" : String(issue.estimateHours)
  );
  const [estimateFocused, setEstimateFocused] = useState(false);
  const estimateDraftRef = useRef(estimateDraft);
  estimateDraftRef.current = estimateDraft;
  /** Last value we successfully sent (or optimistically committed) to the server. */
  const lastSubmittedEstimateRef = useRef(issue.estimateHours);
  const skipEstimateSaveRef = useRef(false);
  const estimateSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const onIssuePatchRef = useRef(onIssuePatch);
  onIssuePatchRef.current = onIssuePatch;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const boardIdRef = useRef(board.id);
  boardIdRef.current = board.id;
  const issueIdRef = useRef(issue.id);
  issueIdRef.current = issue.id;
  const [startDateDraft, setStartDateDraft] = useState(issue.startDate ?? "");
  const [dueDateDraft, setDueDateDraft] = useState(issue.dueDate ?? "");
  const [timeEntries, setTimeEntries] = useState<WorkIssueTimeLogEntry[]>([]);
  const [timeCanLog, setTimeCanLog] = useState(false);
  const [timeCannotLogReason, setTimeCannotLogReason] = useState<string | null>(
    null
  );
  const [currentConsultantId, setCurrentConsultantId] = useState<string | null>(
    null
  );
  const [loggingTime, setLoggingTime] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [deletingTimeId, setDeletingTimeId] = useState<string | null>(null);
  const [logHoursDraft, setLogHoursDraft] = useState("");
  const [logDateDraft, setLogDateDraft] = useState(localTodayYmd);
  const [logNoteDraft, setLogNoteDraft] = useState("");
  const [logRoleDraft, setLogRoleDraft] = useState("");
  const [timeRoleOptions, setTimeRoleOptions] = useState<
    WorkIssueTimeLogRoleOption[]
  >([]);
  const [timeDefaultRoleId, setTimeDefaultRoleId] = useState<string | null>(
    null
  );
  const [showDates, setShowDates] = useState(
    () => Boolean(issue.startDate || issue.dueDate)
  );
  const [showCurrentState, setShowCurrentState] = useState(
    () => Boolean(issue.currentState.trim())
  );
  const [showNextStep, setShowNextStep] = useState(() =>
    Boolean(issue.nextStep.trim())
  );
  const [commentFocused, setCommentFocused] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadBarVisible, setUploadBarVisible] = useState(false);
  const uploadingCountRef = useRef(0);
  const uploadStartedAtRef = useRef(0);
  const uploadHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const descriptionRef = useRef(description);
  descriptionRef.current = description;
  const issueDescriptionRef = useRef(issue.description);
  issueDescriptionRef.current = issue.description;

  function clearThumbs(thumbs: InlinePasteThumb[]) {
    for (const thumb of thumbs) {
      if (thumb.revokeOnClear) URL.revokeObjectURL(thumb.previewUrl);
    }
  }

  function persistDescription(thumbs: InlinePasteThumb[]) {
    const next = joinWorkInlineImages(
      encodeMentions(descriptionRef.current, board.members),
      thumbs
        .map((thumb) => thumb.fileId)
        .filter((id): id is string => Boolean(id))
    );
    if (next === issueDescriptionRef.current) return;
    onIssuePatch({ description: next });
    run(() =>
      updateWorkIssueFieldAction(board.id, issue.id, "description", next)
    );
  }

  useEffect(() => {
    const split = splitWorkInlineImages(issue.description);
    setTitle(issue.title);
    setDescription(mentionPlainText(split.text));
    setDescriptionThumbs((prev) => {
      const fromServer = thumbsFromFileIds(split.fileIds);
      const pending = prev.filter(
        (thumb) =>
          thumb.uploading ||
          (thumb.fileId != null && !split.fileIds.includes(thumb.fileId))
      );
      for (const thumb of prev) {
        if (
          thumb.revokeOnClear &&
          !pending.some((row) => row.localId === thumb.localId)
        ) {
          URL.revokeObjectURL(thumb.previewUrl);
        }
      }
      const pendingNew = pending.filter(
        (thumb) =>
          !fromServer.some(
            (row) => row.fileId && row.fileId === thumb.fileId
          )
      );
      return [...fromServer, ...pendingNew];
    });
    setCurrentState(issue.currentState);
    setNextStep(issue.nextStep);
    setOutOfScope(issue.outOfScope);
    // Don't clobber an in-progress estimate edit when other issue fields patch
    // (description save, time log sync, etc.) — same guard as WorkCardEstimate.
    if (!estimateFocused) {
      setEstimateDraft(
        issue.estimateHours == null ? "" : String(issue.estimateHours)
      );
    }
    setStartDateDraft(issue.startDate ?? "");
    setDueDateDraft(issue.dueDate ?? "");
    if (issue.currentState.trim()) setShowCurrentState(true);
    if (issue.nextStep.trim()) setShowNextStep(true);
    if (issue.startDate || issue.dueDate) setShowDates(true);
  }, [
    issue.id,
    issue.title,
    issue.description,
    issue.currentState,
    issue.nextStep,
    issue.outOfScope,
    issue.estimateHours,
    issue.startDate,
    issue.dueDate,
    estimateFocused,
  ]);

  useEffect(() => {
    uploadingCountRef.current = 0;
    setUploadingCount(0);
    setUploadBarVisible(false);
    uploadStartedAtRef.current = 0;
    if (uploadHideTimeoutRef.current) {
      clearTimeout(uploadHideTimeoutRef.current);
      uploadHideTimeoutRef.current = null;
    }
    setCommentThumbs((prev) => {
      clearThumbs(prev);
      return [];
    });
    setCommentDraft("");
    setCommentFocused(false);
    setLoggingTime(false);
    setEditingTimeId(null);
    setDeletingTimeId(null);
    setLogHoursDraft("");
    setLogDateDraft(localTodayYmd());
    setLogNoteDraft("");
    setLogRoleDraft("");
    setShowDates(Boolean(issue.startDate || issue.dueDate));
    setShowCurrentState(Boolean(issue.currentState.trim()));
    setShowNextStep(Boolean(issue.nextStep.trim()));
  }, [issue.id]);

  useEffect(() => {
    if (!board.showTime) {
      setTimeEntries([]);
      setTimeCanLog(false);
      setTimeCannotLogReason(null);
      return;
    }
    let cancelled = false;
    void getWorkIssueTimeLogAction(board.id, issue.id).then((state) => {
      if (cancelled) return;
      setTimeEntries(state.entries);
      setTimeCanLog(state.canLog);
      setTimeCannotLogReason(state.cannotLogReason);
      setCurrentConsultantId(state.currentConsultantId);
      setTimeRoleOptions(state.roleOptions ?? []);
      setTimeDefaultRoleId(state.defaultRoleId ?? null);
      setLogRoleDraft((prev) => {
        const nextDefault = state.defaultRoleId ?? "";
        if (prev && (state.roleOptions ?? []).some((r) => r.id === prev)) {
          return prev;
        }
        return nextDefault;
      });
      onIssuePatch({ loggedHours: state.loggedHours });
    });
    return () => {
      cancelled = true;
    };
  }, [board.id, issue.id, board.plannerProjectId, board.showTime]);

  useEffect(() => {
    return () => {
      if (uploadHideTimeoutRef.current) {
        clearTimeout(uploadHideTimeoutRef.current);
      }
    };
  }, []);

  const people = board.members;

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    options?: { refresh?: boolean }
  ) {
    const refresh = options?.refresh !== false;
    const execute = async () => {
      const result = await action();
      if (!result.ok) {
        onError(result.error);
        return;
      }
      if (refresh) onChanged();
    };
    if (refresh) {
      startTransition(execute);
    } else {
      void execute();
    }
  }

  function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === issue.title) {
      setTitle(issue.title);
      return;
    }
    onIssuePatch({ title: trimmed });
    // Optimistic patch already updates the board; avoid pending+refresh while
    // dismiss (click outside) is closing the drawer — that combo freezes the UI.
    run(() => updateWorkIssueTitleAction(board.id, issue.id, trimmed), {
      refresh: false,
    });
  }

  function saveField(
    field: "description" | "current_state" | "next_step" | "out_of_scope",
    value: string,
    current: string
  ) {
    if (value === current) return;
    onIssuePatch(
      field === "description"
        ? { description: value }
        : field === "current_state"
          ? { currentState: value }
          : field === "next_step"
            ? { nextStep: value }
            : { outOfScope: value }
    );
    run(() => updateWorkIssueFieldAction(board.id, issue.id, field, value), {
      refresh: false,
    });
  }

  function saveDescription() {
    const next = joinWorkInlineImages(
      encodeMentions(description, board.members),
      descriptionThumbs
        .map((thumb) => thumb.fileId)
        .filter((id): id is string => Boolean(id))
    );
    saveField("description", next, issue.description);
  }

  function pasteDescriptionImages(files: File[]) {
    if (pending || files.length === 0) return;
    files.forEach((image, index) => {
      const named = new File([image], pasteFileName(image, index), {
        type: image.type || "image/png",
      });
      const localId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(named);
      const thumb: InlinePasteThumb = {
        localId,
        previewUrl,
        fileId: null,
        uploading: true,
        revokeOnClear: true,
      };
      setDescriptionThumbs((prev) => [...prev, thumb]);
      uploadFile(named, { zone: "description", localId, previewUrl });
    });
  }

  function saveEstimate(
    raw: string = estimateDraftRef.current,
    options?: { revertOnInvalid?: boolean }
  ) {
    const parsed = parseWorkEstimateHours(raw);
    if (!parsed.ok) {
      if (options?.revertOnInvalid !== false) {
        setEstimateDraft(
          lastSubmittedEstimateRef.current == null
            ? ""
            : String(lastSubmittedEstimateRef.current)
        );
        onError("Estimate must be a number of hours");
      }
      return;
    }
    setEstimateDraft(parsed.value == null ? "" : String(parsed.value));
    estimateDraftRef.current =
      parsed.value == null ? "" : String(parsed.value);
    if (parsed.value === lastSubmittedEstimateRef.current) return;
    const previous = lastSubmittedEstimateRef.current;
    lastSubmittedEstimateRef.current = parsed.value;
    onIssuePatch({ estimateHours: parsed.value });
    // Call the action directly (not via startTransition) so the POST is in
    // flight before a drawer dismiss navigates away.
    void updateWorkIssueEstimateAction(
      boardIdRef.current,
      issueIdRef.current,
      parsed.value == null ? "" : String(parsed.value)
    ).then((result) => {
      if (result.ok) return;
      lastSubmittedEstimateRef.current = previous;
      onError(result.error);
    });
  }

  function scheduleEstimateSave(raw: string) {
    if (estimateSaveTimerRef.current) {
      clearTimeout(estimateSaveTimerRef.current);
    }
    estimateSaveTimerRef.current = setTimeout(() => {
      estimateSaveTimerRef.current = null;
      saveEstimate(raw, { revertOnInvalid: false });
    }, 400);
  }

  // Flush a dirty estimate if the drawer unmounts without blur (e.g. route close).
  useEffect(() => {
    const boardId = board.id;
    const issueId = issue.id;
    return () => {
      if (estimateSaveTimerRef.current) {
        clearTimeout(estimateSaveTimerRef.current);
        estimateSaveTimerRef.current = null;
      }
      const parsed = parseWorkEstimateHours(estimateDraftRef.current);
      if (!parsed.ok) return;
      if (parsed.value === lastSubmittedEstimateRef.current) return;
      lastSubmittedEstimateRef.current = parsed.value;
      onIssuePatchRef.current({ estimateHours: parsed.value });
      void updateWorkIssueEstimateAction(
        boardId,
        issueId,
        parsed.value == null ? "" : String(parsed.value)
      ).then((result) => {
        if (result.ok) return;
        onErrorRef.current(result.error);
      });
    };
  }, [board.id, issue.id]);

  useEffect(() => {
    lastSubmittedEstimateRef.current = issue.estimateHours;
  }, [issue.id]);

  useEffect(() => {
    if (estimateFocused) return;
    lastSubmittedEstimateRef.current = issue.estimateHours;
  }, [issue.estimateHours, estimateFocused]);

  function saveSchedule() {
    const start = startDateDraft.trim() || null;
    const due = dueDateDraft.trim() || null;
    if (start === (issue.startDate ?? null) && due === (issue.dueDate ?? null)) {
      return;
    }
    if (start && due && due < start) {
      setStartDateDraft(issue.startDate ?? "");
      setDueDateDraft(issue.dueDate ?? "");
      onError("Due date must be on or after start date");
      return;
    }
    onIssuePatch({ startDate: start, dueDate: due });
    run(
      () => updateWorkIssueScheduleAction(board.id, issue.id, start, due),
      { refresh: false }
    );
  }

  function resetLogForm() {
    setLoggingTime(false);
    setEditingTimeId(null);
    setLogHoursDraft("");
    setLogNoteDraft("");
    setLogDateDraft(localTodayYmd());
    setLogRoleDraft(timeDefaultRoleId ?? "");
  }

  function beginEditTime(entry: WorkIssueTimeLogEntry) {
    setLoggingTime(false);
    setEditingTimeId(entry.id);
    setLogHoursDraft(String(entry.hours));
    setLogDateDraft(entry.date);
    setLogNoteDraft(entry.note ?? "");
  }

  function saveLogTime() {
    const hoursRaw = logHoursDraft.trim().replace(",", ".");
    const hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || hours <= 0) {
      onError("Enter hours greater than 0.");
      return;
    }
    if (!logDateDraft.trim()) {
      onError("Pick a date.");
      return;
    }
    const editingId = editingTimeId;
    if (!editingId && !logRoleDraft.trim()) {
      onError("Role is required.");
      return;
    }
    run(
      async () => {
        const result = editingId
          ? await updateWorkIssueTimeEntryAction(
              board.id,
              issue.id,
              editingId,
              {
                hours: hoursRaw,
                date: logDateDraft.trim(),
                note: logNoteDraft.trim() || undefined,
              }
            )
          : await logWorkIssueTimeAction(board.id, issue.id, {
              hours: hoursRaw,
              date: logDateDraft.trim(),
              note: logNoteDraft.trim() || undefined,
              roleId: logRoleDraft.trim(),
            });
        if (!result.ok) return result;
        setTimeEntries(result.entries);
        onIssuePatch({ loggedHours: result.loggedHours });
        resetLogForm();
        return result;
      },
      { refresh: false }
    );
  }

  function deleteLogTime(entryId: string) {
    run(
      async () => {
        const result = await deleteWorkIssueTimeEntryAction(
          board.id,
          issue.id,
          entryId
        );
        if (!result.ok) return result;
        setTimeEntries(result.entries);
        onIssuePatch({ loggedHours: result.loggedHours });
        setDeletingTimeId(null);
        if (editingTimeId === entryId) resetLogForm();
        return result;
      },
      { refresh: false }
    );
  }

  function uploadFile(
    file: File,
    options?: { zone?: PasteZone; localId?: string; previewUrl?: string }
  ) {
    if (file.size > WORK_FILE_MAX_BYTES) {
      onError("File must be 8 MB or smaller");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    if (uploadingCountRef.current === 0) {
      uploadStartedAtRef.current = Date.now();
      if (uploadHideTimeoutRef.current) {
        clearTimeout(uploadHideTimeoutRef.current);
        uploadHideTimeoutRef.current = null;
      }
      setUploadBarVisible(true);
    }
    uploadingCountRef.current += 1;
    setUploadingCount(uploadingCountRef.current);
    void uploadWorkIssueFileAction(board.id, issue.id, formData).then(
      (result) => {
        uploadingCountRef.current = Math.max(0, uploadingCountRef.current - 1);
        setUploadingCount(uploadingCountRef.current);
        if (uploadingCountRef.current === 0) {
          const elapsed = Date.now() - uploadStartedAtRef.current;
          const remaining = Math.max(0, 500 - elapsed);
          uploadHideTimeoutRef.current = setTimeout(() => {
            setUploadBarVisible(false);
            uploadHideTimeoutRef.current = null;
          }, remaining);
        }
        if (!result.ok) {
          onError(result.error);
          if (options?.zone && options.localId) {
            const setThumbs =
              options.zone === "description"
                ? setDescriptionThumbs
                : setCommentThumbs;
            setThumbs((prev) => {
              const row = prev.find((thumb) => thumb.localId === options.localId);
              if (row?.revokeOnClear) URL.revokeObjectURL(row.previewUrl);
              return prev.filter((thumb) => thumb.localId !== options.localId);
            });
          }
          return;
        }
        if (options?.zone && options.localId) {
          const setThumbs =
            options.zone === "description"
              ? setDescriptionThumbs
              : setCommentThumbs;
          setThumbs((prev) => {
            const next = prev.map((thumb) => {
              if (thumb.localId !== options.localId) return thumb;
              if (thumb.revokeOnClear) URL.revokeObjectURL(thumb.previewUrl);
              return {
                localId: result.id,
                previewUrl: workFileImageHref(result.id),
                fileId: result.id,
                uploading: false,
                revokeOnClear: false,
              };
            });
            if (options.zone === "description") {
              queueMicrotask(() => persistDescription(next));
            }
            return next;
          });
        }
        onChanged();
      }
    );
  }

  function handlePaste(event: ClipboardEvent) {
    if (pending) return;
    const items = event.clipboardData?.items;
    if (!items?.length) return;
    const images: File[] = [];
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const blob = item.getAsFile();
      if (blob) images.push(blob);
    }
    if (images.length === 0) return;
    event.preventDefault();
    const zone = pasteZoneFromTarget(event.target);
    images.forEach((image, index) => {
      const named = new File([image], pasteFileName(image, index), {
        type: image.type || "image/png",
      });
      if (zone) {
        const localId = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(named);
        const thumb: InlinePasteThumb = {
          localId,
          previewUrl,
          fileId: null,
          uploading: true,
          revokeOnClear: true,
        };
        if (zone === "description") {
          setDescriptionThumbs((prev) => [...prev, thumb]);
        } else {
          setCommentThumbs((prev) => [...prev, thumb]);
        }
        uploadFile(named, { zone, localId, previewUrl });
        return;
      }
      uploadFile(named);
    });
  }

  const imageFiles = useMemo(
    () => issue.files.filter((file) => isImageMime(file.mimeType)),
    [issue.files]
  );
  const otherFiles = useMemo(
    () => issue.files.filter((file) => !isImageMime(file.mimeType)),
    [issue.files]
  );

  const deletingTimeEntry =
    deletingTimeId == null
      ? null
      : timeEntries.find((entry) => entry.id === deletingTimeId) ?? null;

  return (
    <>
    <div
      className="flex min-h-0 flex-1 flex-col"
      onPaste={handlePaste}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="relative z-10 flex items-center gap-2 overflow-visible">
          <span className="shrink-0 self-center">
            <WorkCardTypeBadge
              issueType={issue.issueType}
              disabled={pending}
              portal={false}
              onChange={(issueType) => {
                onIssuePatch({ issueType });
                run(
                  () =>
                    updateWorkIssueTypeAction(board.id, issue.id, issueType),
                  { refresh: false }
                );
              }}
            />
          </span>
          <AutosizeTextarea
            value={title}
            minRows={1}
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            aria-label="Issue title"
            className="min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-heading-l leading-snug text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0 disabled:opacity-50"
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="!gap-0">
            <TabsTrigger value="details" className="px-3 !px-3">
              Details
            </TabsTrigger>
            <TabsTrigger value="requirements" className="px-3 !px-3">
              Requirements
            </TabsTrigger>
            <TabsTrigger value="pre-deploy" className="px-3 !px-3">
              Pre-deploy
            </TabsTrigger>
            {board.showTime ? (
              <TabsTrigger value="time" className="px-3 !px-3">
                Time
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="files" className="px-3 !px-3">
              Files
            </TabsTrigger>
            {canShowDangerTab ? (
              <TabsTrigger value="danger" className="px-3 !px-3">
                Danger
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="details" className="mt-5 space-y-8">
            <div className="space-y-1 rounded-xl bg-bg-muted/40 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
                <WorkPropertySelect
                  title="Status"
                  value={issue.status}
                  disabled={pending}
                  onValueChange={(value) => onStatus(value as WorkIssueStatus)}
                  options={board.statuses.map((status) => ({
                    value: status.id,
                    label: status.name,
                  }))}
                />
                <WorkPropertySelect
                  title="Priority"
                  value={issue.priority ?? ""}
                  disabled={pending}
                  onValueChange={(value) => {
                    const priority =
                      value === "" ? null : (value as WorkIssuePriority);
                    onIssuePatch({ priority });
                    run(() =>
                      updateWorkIssuePriorityAction(board.id, issue.id, priority)
                    );
                  }}
                  options={[
                    { value: "", label: "Priority" },
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ]}
                />
                {addingComponent ? (
                  <form
                    className="inline-flex min-w-[8rem] items-center"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = componentDraft.trim();
                      if (!name) return;
                      setComponentDraft("");
                      setAddingComponent(false);
                      run(async () => {
                        const result = await assignWorkIssueComponentAction(
                          board.id,
                          issue.id,
                          name
                        );
                        if (result.ok) {
                          onIssuePatch({ component: result.component });
                        }
                        return result;
                      });
                    }}
                  >
                    <Input
                      value={componentDraft}
                      onChange={(event) => setComponentDraft(event.target.value)}
                      placeholder="Component"
                      className="h-7 min-w-0 flex-1 py-0 text-[13px]"
                      disabled={pending}
                      autoFocus
                      onBlur={() => {
                        if (!componentDraft.trim()) setAddingComponent(false);
                      }}
                    />
                  </form>
                ) : (
                  <WorkPropertySelect
                    title="Component"
                    value={issue.component?.id ?? ""}
                    disabled={pending}
                    onValueChange={(value) => {
                      if (value === "__create__") {
                        setAddingComponent(true);
                        return;
                      }
                      const component =
                        board.components.find((row) => row.id === value) ?? null;
                      onIssuePatch({ component });
                      run(() =>
                        updateWorkIssueComponentAction(
                          board.id,
                          issue.id,
                          value || null,
                          component?.name ?? ""
                        )
                      );
                    }}
                    options={[
                      { value: "", label: "Component" },
                      ...board.components.map((component) => ({
                        value: component.id,
                        label: component.name,
                      })),
                      { value: "__create__", label: "Create component…" },
                    ]}
                  />
                )}
                <div className="ml-auto flex shrink-0 items-center pl-2">
                  <WorkCardPeople
                    owner={issue.owner}
                    assignees={issue.assignees}
                    people={people}
                    disabled={pending}
                    portal={false}
                    onSetOwner={(person) => {
                      onIssuePatch({ owner: person });
                      run(
                        () =>
                          updateWorkIssueOwnerAction(
                            board.id,
                            issue.id,
                            person?.id ?? null,
                            person?.name ?? "Unassigned"
                          ),
                        { refresh: false }
                      );
                    }}
                    onAddAssignee={(person) => {
                      onIssuePatch({ assignees: [...issue.assignees, person] });
                      run(
                        () =>
                          addWorkIssueAssigneeAction(
                            board.id,
                            issue.id,
                            person.id,
                            person.name
                          ),
                        { refresh: false }
                      );
                    }}
                    onRemoveAssignee={(person) => {
                      onIssuePatch({
                        assignees: issue.assignees.filter(
                          (row) => row.id !== person.id
                        ),
                      });
                      run(
                        () =>
                          removeWorkIssueAssigneeAction(
                            board.id,
                            issue.id,
                            person.id,
                            person.name
                          ),
                        { refresh: false }
                      );
                    }}
                  />
                </div>
              </div>
              {board.showTime ? (
                <div>
                  <label
                    className={`${propertyChipClass} cursor-text gap-1`}
                    title="Estimate in hours"
                  >
                    <Clock
                      className="h-3 w-3 shrink-0 text-text-tertiary"
                      aria-hidden
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={estimateDraft}
                      disabled={pending}
                      aria-label="Estimate in hours"
                      placeholder="Est"
                      onChange={(event) => {
                        const next = event.target.value;
                        setEstimateDraft(next);
                        estimateDraftRef.current = next;
                        scheduleEstimateSave(next);
                      }}
                      onFocus={() => setEstimateFocused(true)}
                      onBlur={(event) => {
                        if (estimateSaveTimerRef.current) {
                          clearTimeout(estimateSaveTimerRef.current);
                          estimateSaveTimerRef.current = null;
                        }
                        if (skipEstimateSaveRef.current) {
                          skipEstimateSaveRef.current = false;
                          setEstimateFocused(false);
                          return;
                        }
                        saveEstimate(event.currentTarget.value);
                        setEstimateFocused(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          if (estimateSaveTimerRef.current) {
                            clearTimeout(estimateSaveTimerRef.current);
                            estimateSaveTimerRef.current = null;
                          }
                          const revert =
                            lastSubmittedEstimateRef.current == null
                              ? ""
                              : String(lastSubmittedEstimateRef.current);
                          skipEstimateSaveRef.current = true;
                          estimateDraftRef.current = revert;
                          setEstimateDraft(revert);
                          setEstimateFocused(false);
                          event.currentTarget.blur();
                        }
                      }}
                      className="w-10 border-0 bg-transparent p-0 text-right text-[13px] tabular-nums text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
                    />
                    <span className="text-[13px] text-text-tertiary">h</span>
                  </label>
                </div>
              ) : null}
              <div>
                {showDates ? (
                  <div className={`${propertyChipClass} gap-1.5`}>
                    <input
                      type="date"
                      value={startDateDraft}
                      disabled={pending}
                      aria-label="Start date"
                      onChange={(event) => setStartDateDraft(event.target.value)}
                      onBlur={saveSchedule}
                      className="h-7 border-0 bg-transparent px-0 text-[13px] text-text-primary focus:outline-none disabled:opacity-50"
                    />
                    <span className="text-text-tertiary">→</span>
                    <input
                      type="date"
                      value={dueDateDraft}
                      disabled={pending}
                      aria-label="Due date"
                      onChange={(event) => setDueDateDraft(event.target.value)}
                      onBlur={saveSchedule}
                      className="h-7 border-0 bg-transparent px-0 text-[13px] text-text-primary focus:outline-none disabled:opacity-50"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    className={addPropertyClass}
                    onClick={() => setShowDates(true)}
                  >
                    + Dates
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="block" data-paste-zone="description">
                <span className="mb-0.5 block text-[13px] text-text-secondary">
                  Description
                </span>
                <WorkDescriptionEditor
                  contentKey={issue.id}
                  value={description}
                  people={board.members}
                  disabled={pending}
                  placeholder="Add description… Use @ to mention"
                  onChange={setDescription}
                  onBlur={saveDescription}
                  onPasteImages={pasteDescriptionImages}
                />
                <WorkInlineImageThumbs
                  items={descriptionThumbs.map((thumb) => ({
                    key: thumb.localId,
                    src: thumb.previewUrl,
                    uploading: thumb.uploading,
                  }))}
                  onRemove={(key) => {
                    setDescriptionThumbs((prev) => {
                      const row = prev.find((thumb) => thumb.localId === key);
                      if (row?.revokeOnClear) {
                        URL.revokeObjectURL(row.previewUrl);
                      }
                      const next = prev.filter((thumb) => thumb.localId !== key);
                      queueMicrotask(() => persistDescription(next));
                      return next;
                    });
                  }}
                />
              </div>

              {showCurrentState ? (
                <label className="block">
                  <span className="mb-0.5 block text-[13px] text-text-secondary">
                    Current state
                  </span>
                  <AutosizeTextarea
                    className={textFieldClass}
                    value={currentState}
                    disabled={pending}
                    placeholder="Add current state…"
                    autoFocus={!issue.currentState.trim()}
                    onChange={(event) => setCurrentState(event.target.value)}
                    onBlur={() => {
                      if (!currentState.trim()) setShowCurrentState(false);
                      saveField(
                        "current_state",
                        currentState,
                        issue.currentState
                      );
                    }}
                  />
                </label>
              ) : null}

              {showNextStep ? (
                <label className="block">
                  <span className="mb-0.5 block text-[13px] text-text-secondary">
                    Next step
                  </span>
                  <AutosizeTextarea
                    className={textFieldClass}
                    value={nextStep}
                    disabled={pending}
                    placeholder="Add next step…"
                    autoFocus={!issue.nextStep.trim()}
                    onChange={(event) => setNextStep(event.target.value)}
                    onBlur={() => {
                      if (!nextStep.trim()) setShowNextStep(false);
                      saveField("next_step", nextStep, issue.nextStep);
                    }}
                  />
                </label>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {!showCurrentState ? (
                  <button
                    type="button"
                    disabled={pending}
                    className={addPropertyClass}
                    onClick={() => setShowCurrentState(true)}
                  >
                    + Current state
                  </button>
                ) : null}
                {!showNextStep ? (
                  <button
                    type="button"
                    disabled={pending}
                    className={addPropertyClass}
                    onClick={() => setShowNextStep(true)}
                  >
                    + Next step
                  </button>
                ) : null}
                {issue.labels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      onIssuePatch({
                        labels: issue.labels.filter((row) => row.id !== label.id),
                      });
                      run(() =>
                        removeWorkIssueLabelAction(
                          board.id,
                          issue.id,
                          label.id,
                          label.name
                        )
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5 text-label-s text-text-primary hover:bg-border-subtle"
                  >
                    {label.name}
                    <X className="h-3 w-3 text-text-tertiary" aria-hidden />
                  </button>
                ))}
                {addingLabel ? (
                  <form
                    className="inline-flex items-center gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = labelDraft.trim();
                      if (!name) return;
                      setLabelDraft("");
                      setAddingLabel(false);
                      run(() =>
                        addWorkIssueLabelAction(board.id, issue.id, name)
                      );
                    }}
                  >
                    <Input
                      value={labelDraft}
                      onChange={(event) => setLabelDraft(event.target.value)}
                      placeholder="Label name"
                      className="h-7 w-32 py-0 text-[13px]"
                      disabled={pending}
                      autoFocus
                      onBlur={() => {
                        if (!labelDraft.trim()) setAddingLabel(false);
                      }}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setAddingLabel(true)}
                    className={addPropertyClass}
                  >
                    + Label
                  </button>
                )}
                <WorkIssueRelations
                  issue={issue}
                  issues={board.issues}
                  customerId={board.customerId}
                  boardId={board.id}
                  pending={pending}
                  compact
                  onAdd={(otherIssueId, role) => {
                    run(() =>
                      addWorkIssueRelationAction(
                        board.id,
                        issue.id,
                        otherIssueId,
                        role
                      )
                    );
                  }}
                  onRemove={(relationId) => {
                    run(() =>
                      removeWorkIssueRelationAction(
                        board.id,
                        issue.id,
                        relationId
                      )
                    );
                  }}
                />
              </div>
            </div>

            <div className="border-t border-border-subtle pt-6">
              <div className="flex gap-4 border-b border-border-subtle">
                <button
                  type="button"
                  className={`inline-flex items-center border-b-2 px-1 pb-2 text-sm font-medium ${
                    feed === "comments"
                      ? "border-text-primary text-text-primary"
                      : "border-transparent text-text-secondary"
                  }`}
                  onClick={() => setFeed("comments")}
                >
                  Comments
                  {issue.comments.length > 0 ? (
                    <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bg-muted px-1 text-[11px] font-medium tabular-nums text-text-secondary">
                      {issue.comments.length}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`border-b-2 px-1 pb-2 text-sm font-medium ${
                    feed === "activity"
                      ? "border-text-primary text-text-primary"
                      : "border-transparent text-text-secondary"
                  }`}
                  onClick={() => setFeed("activity")}
                >
                  Activity
                </button>
              </div>
              {feed === "comments" ? (
                <ul className="mt-4 space-y-4">
                  {issue.comments.length === 0 ? (
                    <li className="text-sm text-text-tertiary">No comments yet.</li>
                  ) : (
                    issue.comments.map((comment) => (
                      <WorkIssueComment
                        key={comment.id}
                        comment={comment}
                        canEdit={comment.author.id === board.currentUser.id}
                        people={board.members}
                        pending={pending}
                        onSave={(body) => {
                          onIssuePatch({
                            comments: issue.comments.map((row) =>
                              row.id === comment.id ? { ...row, body } : row
                            ),
                          });
                          run(() =>
                            updateWorkIssueCommentAction(
                              board.id,
                              issue.id,
                              comment.id,
                              body
                            )
                          );
                        }}
                        onDelete={() => {
                          onIssuePatch({
                            comments: issue.comments.filter(
                              (row) => row.id !== comment.id
                            ),
                          });
                          run(() =>
                            deleteWorkIssueCommentAction(
                              board.id,
                              issue.id,
                              comment.id
                            )
                          );
                        }}
                      />
                    ))
                  )}
                </ul>
              ) : (
                <ul className="mt-4 space-y-3">
                  {issue.events.length === 0 ? (
                    <li className="text-sm text-text-tertiary">No activity yet.</li>
                  ) : (
                    issue.events.map((event) => (
                      <li
                        key={event.id}
                        className="flex items-baseline gap-3 text-body-m text-text-primary"
                      >
                        <p className="min-w-0 flex-1">
                          <span className="font-medium">{event.actor.name}</span>{" "}
                          {event.summary}
                        </p>
                        <time
                          dateTime={event.createdAt}
                          className="w-32 shrink-0 text-right text-text-tertiary"
                        >
                          {formatWorkTimestamp(event.createdAt)}
                        </time>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="time" className="mt-5 space-y-5">
            <div className="flex items-center gap-3">
              <p className="min-w-0 shrink-0 text-sm tabular-nums text-text-primary">
                {formatWorkHours(issue.loggedHours)}
                {issue.estimateHours != null
                  ? ` / ${formatWorkHours(issue.estimateHours)} est`
                  : ""}
              </p>
              <div className="min-w-0 flex-1">
                <WorkTimeGraph
                  size="drawer"
                  estimateHours={issue.estimateHours}
                  loggedHours={issue.loggedHours}
                />
              </div>
              {timeCanLog && !loggingTime && editingTimeId == null ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setEditingTimeId(null);
                    setLoggingTime(true);
                    setLogHoursDraft("");
                    setLogNoteDraft("");
                    setLogDateDraft(localTodayYmd());
                    setLogRoleDraft(timeDefaultRoleId ?? "");
                  }}
                  className={addPropertyClass}
                >
                  + Log time
                </button>
              ) : null}
            </div>

            {!timeCanLog && timeCannotLogReason ? (
              <p className="text-[13px] leading-snug text-text-muted">
                {timeCannotLogReason}
              </p>
            ) : null}

            {loggingTime || editingTimeId != null ? (
              <div className="space-y-2 rounded-md bg-bg-muted/60 p-2.5">
                <p className="text-[13px] font-medium text-text-primary">
                  {editingTimeId ? "Edit time" : "Log time"}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block min-w-[4.5rem]">
                    <span className="mb-0.5 block text-[12px] text-text-secondary">
                      Hours
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={logHoursDraft}
                      disabled={pending}
                      autoFocus
                      placeholder="0"
                      onChange={(event) => setLogHoursDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveLogTime();
                        }
                        if (event.key === "Escape") {
                          resetLogForm();
                        }
                      }}
                      className="box-border h-9 w-full rounded-md border border-form bg-bg-default px-2 text-sm tabular-nums text-text-primary focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal/25 disabled:opacity-50"
                    />
                  </label>
                  <label className="block min-w-[9rem]">
                    <span className="mb-0.5 block text-[12px] text-text-secondary">
                      Date
                    </span>
                    <input
                      type="date"
                      value={logDateDraft}
                      disabled={pending}
                      onChange={(event) => setLogDateDraft(event.target.value)}
                      className="box-border h-9 w-full rounded-md border border-form bg-bg-default px-2 text-sm text-text-primary focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal/25 disabled:opacity-50"
                    />
                  </label>
                  {editingTimeId == null ? (
                    <div className="block min-w-[10rem] flex-1">
                      <span className="mb-0.5 block text-[12px] text-text-secondary">
                        Role
                      </span>
                      <Select
                        value={logRoleDraft}
                        onValueChange={setLogRoleDraft}
                        disabled={pending || timeRoleOptions.length === 0}
                        size="sm"
                        variant="inlineEdit"
                        placeholder="Select role"
                        triggerClassName={drawerSelectTriggerClass}
                        options={timeRoleOptions.map((role) => ({
                          value: role.id,
                          label: role.name,
                        }))}
                      />
                    </div>
                  ) : null}
                </div>
                <label className="block">
                  <span className="mb-0.5 block text-[12px] text-text-secondary">
                    Note
                  </span>
                  <input
                    type="text"
                    value={logNoteDraft}
                    disabled={pending}
                    placeholder="Optional"
                    onChange={(event) => setLogNoteDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveLogTime();
                      }
                      if (event.key === "Escape") {
                        resetLogForm();
                      }
                    }}
                    className="box-border h-9 w-full rounded-md border border-form bg-bg-default px-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal/25 disabled:opacity-50"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={saveLogTime}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={resetLogForm}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {timeEntries.length === 0 ? (
              <p className="text-sm text-text-tertiary">No time logged yet.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {timeEntries.map((entry) => {
                  const isOwn =
                    currentConsultantId != null &&
                    entry.consultantId === currentConsultantId;
                  return (
                    <li
                      key={entry.id}
                      className="group flex items-start gap-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-primary">
                          <span className="font-medium">
                            {entry.consultantName}
                          </span>
                          <span className="text-text-secondary">
                            {" "}
                            · {formatWorkHours(entry.hours)} ·{" "}
                            {formatTimeLogDate(entry.date)}
                          </span>
                        </p>
                        {entry.note ? (
                          <p className="mt-0.5 truncate text-[13px] text-text-muted">
                            {entry.note}
                          </p>
                        ) : null}
                      </div>
                      {isOwn && timeCanLog ? (
                        <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            disabled={pending || editingTimeId === entry.id}
                            className="text-label-s text-text-tertiary hover:text-text-primary disabled:opacity-50"
                            onClick={() => beginEditTime(entry)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="text-label-s text-text-tertiary hover:text-danger disabled:opacity-50"
                            onClick={() => setDeletingTimeId(entry.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="requirements" className="mt-5 space-y-5">
            <RequirementsChecklistSection
              title="Acceptance criteria"
              info="What must be true for this issue to be done."
              placeholder="Add a criterion…"
              items={issue.requirements}
              draft={requirementDraft}
              onDraftChange={setRequirementDraft}
              pending={pending}
              onToggle={(requirement, isDone) => {
                onIssuePatch({
                  requirements: issue.requirements.map((row) =>
                    row.id === requirement.id ? { ...row, isDone } : row
                  ),
                });
                run(
                  () =>
                    updateWorkIssueRequirementDoneAction(
                      board.id,
                      issue.id,
                      requirement.id,
                      isDone
                    ),
                  { refresh: false }
                );
              }}
              onSaveBody={(requirement, body) => {
                onIssuePatch({
                  requirements: issue.requirements.map((row) =>
                    row.id === requirement.id ? { ...row, body } : row
                  ),
                });
                run(() =>
                  updateWorkIssueRequirementBodyAction(
                    board.id,
                    issue.id,
                    requirement.id,
                    body
                  )
                );
              }}
              onRemove={(requirement) => {
                onIssuePatch({
                  requirements: issue.requirements.filter(
                    (row) => row.id !== requirement.id
                  ),
                });
                run(
                  () =>
                    deleteWorkIssueRequirementAction(
                      board.id,
                      issue.id,
                      requirement.id
                    ),
                  { refresh: false }
                );
              }}
              onAdd={(body) => {
                setRequirementDraft("");
                run(() =>
                  addWorkIssueRequirementAction(
                    board.id,
                    issue.id,
                    body,
                    "acceptance"
                  )
                );
              }}
            />

            <RequirementsChecklistSection
              title="Definition of done"
              info="Shared quality bar for this issue (review, staging, docs…)."
              placeholder="Add a DoD item…"
              items={issue.definitionOfDone}
              draft={dodDraft}
              onDraftChange={setDodDraft}
              pending={pending}
              onToggle={(requirement, isDone) => {
                onIssuePatch({
                  definitionOfDone: issue.definitionOfDone.map((row) =>
                    row.id === requirement.id ? { ...row, isDone } : row
                  ),
                });
                run(
                  () =>
                    updateWorkIssueRequirementDoneAction(
                      board.id,
                      issue.id,
                      requirement.id,
                      isDone
                    ),
                  { refresh: false }
                );
              }}
              onSaveBody={(requirement, body) => {
                onIssuePatch({
                  definitionOfDone: issue.definitionOfDone.map((row) =>
                    row.id === requirement.id ? { ...row, body } : row
                  ),
                });
                run(() =>
                  updateWorkIssueRequirementBodyAction(
                    board.id,
                    issue.id,
                    requirement.id,
                    body
                  )
                );
              }}
              onRemove={(requirement) => {
                onIssuePatch({
                  definitionOfDone: issue.definitionOfDone.filter(
                    (row) => row.id !== requirement.id
                  ),
                });
                run(
                  () =>
                    deleteWorkIssueRequirementAction(
                      board.id,
                      issue.id,
                      requirement.id
                    ),
                  { refresh: false }
                );
              }}
              onAdd={(body) => {
                setDodDraft("");
                run(() =>
                  addWorkIssueRequirementAction(board.id, issue.id, body, "dod")
                );
              }}
            />

            <div className="space-y-2">
              <h3 className="inline-flex items-center gap-1 text-sm font-medium text-text-primary">
                Out of scope
                <FieldInfoTip text="What this issue intentionally does not include." />
              </h3>
              <AutosizeTextarea
                className={textFieldClass}
                value={outOfScope}
                disabled={pending}
                minRows={2}
                placeholder="Not in this issue…"
                onChange={(event) => setOutOfScope(event.target.value)}
                onBlur={() =>
                  saveField("out_of_scope", outOfScope, issue.outOfScope)
                }
              />
            </div>

            <div className="space-y-2">
              <h3 className="inline-flex items-center gap-1 text-sm font-medium text-text-primary">
                References
                <FieldInfoTip text="Links to Figma, Confluence, tickets, or other context." />
              </h3>
              {issue.references.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {issue.references.map((reference) => (
                    <li
                      key={reference.id}
                      className="group flex items-center gap-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <a
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium text-text-primary hover:underline"
                        >
                          {reference.label.trim() || referenceHostname(reference.url)}
                        </a>
                        <p className="truncate text-caption text-text-tertiary">
                          {reference.url}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        className="shrink-0 rounded-md p-0.5 text-text-tertiary opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Remove reference"
                        onClick={() => {
                          onIssuePatch({
                            references: issue.references.filter(
                              (row) => row.id !== reference.id
                            ),
                          });
                          run(
                            () =>
                              deleteWorkIssueReferenceAction(
                                board.id,
                                issue.id,
                                reference.id
                              ),
                            { refresh: false }
                          );
                        }}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                className="flex flex-col gap-1.5 pt-1 sm:flex-row sm:items-center"
                onSubmit={(event) => {
                  event.preventDefault();
                  const url = referenceUrlDraft.trim();
                  if (!url) return;
                  const label = referenceLabelDraft.trim();
                  setReferenceUrlDraft("");
                  setReferenceLabelDraft("");
                  run(() =>
                    addWorkIssueReferenceAction(
                      board.id,
                      issue.id,
                      url,
                      label
                    )
                  );
                }}
              >
                <input
                  value={referenceUrlDraft}
                  disabled={pending}
                  placeholder="https://…"
                  className={quietComposeInputClass}
                  onChange={(event) => setReferenceUrlDraft(event.target.value)}
                />
                <input
                  value={referenceLabelDraft}
                  disabled={pending}
                  placeholder="Label (optional)"
                  className={`${quietComposeInputClass} sm:max-w-[10rem]`}
                  onChange={(event) =>
                    setReferenceLabelDraft(event.target.value)
                  }
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={pending || !referenceUrlDraft.trim()}
                >
                  Add
                </Button>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="pre-deploy" className="mt-5 space-y-5">
            <RequirementsChecklistSection
              title="Pre-deploy actions"
              info="Database or Litium back-office steps to complete before deploy."
              placeholder="Add a pre-deploy action…"
              items={issue.preDeployActions}
              draft={preDeployDraft}
              onDraftChange={setPreDeployDraft}
              pending={pending}
              onToggle={(item, isDone) => {
                onIssuePatch({
                  preDeployActions: issue.preDeployActions.map((row) =>
                    row.id === item.id ? { ...row, isDone } : row
                  ),
                });
                run(
                  () =>
                    updateWorkIssuePreDeployActionDoneAction(
                      board.id,
                      issue.id,
                      item.id,
                      isDone
                    ),
                  { refresh: false }
                );
              }}
              onSaveBody={(item, body) => {
                onIssuePatch({
                  preDeployActions: issue.preDeployActions.map((row) =>
                    row.id === item.id ? { ...row, body } : row
                  ),
                });
                run(() =>
                  updateWorkIssuePreDeployActionBodyAction(
                    board.id,
                    issue.id,
                    item.id,
                    body
                  )
                );
              }}
              onRemove={(item) => {
                onIssuePatch({
                  preDeployActions: issue.preDeployActions.filter(
                    (row) => row.id !== item.id
                  ),
                });
                run(
                  () =>
                    deleteWorkIssuePreDeployActionAction(
                      board.id,
                      issue.id,
                      item.id
                    ),
                  { refresh: false }
                );
              }}
              onAdd={(body) => {
                setPreDeployDraft("");
                run(() =>
                  addWorkIssuePreDeployActionAction(board.id, issue.id, body)
                );
              }}
            />
          </TabsContent>

          <TabsContent value="files" className="mt-5 space-y-4">
            <div className="space-y-1">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-primary">
                  Upload a file
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.csv,.zip"
                  disabled={pending}
                  className="text-sm text-text-secondary"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    uploadFile(file);
                  }}
                />
              </label>
              <p className="text-xs text-text-tertiary">
                Max 8 MB. Paste images from the clipboard anywhere in this
                issue.
              </p>
            </div>

            {issue.files.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No files yet. Paste a screenshot or upload a file.
              </p>
            ) : (
              <div className="space-y-4">
                {imageFiles.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-2">
                    {imageFiles.map((file) => (
                      <li
                        key={file.id}
                        className="group relative overflow-hidden rounded-lg border border-border-subtle bg-bg-muted"
                      >
                        <a
                          href={workFileHref(file.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="block"
                          title={file.fileName}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={workFileHref(file.id)}
                            alt={file.fileName}
                            className="aspect-[4/3] w-full object-cover"
                          />
                        </a>
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <a
                            href={workFileHref(file.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 truncate text-label-s text-text-secondary hover:text-text-primary hover:underline"
                          >
                            {file.fileName}
                          </a>
                          <button
                            type="button"
                            disabled={pending}
                            className="shrink-0 text-label-s text-text-secondary hover:text-danger"
                            onClick={() =>
                              run(() =>
                                deleteWorkIssueFileAction(
                                  board.id,
                                  issue.id,
                                  file.id
                                )
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {otherFiles.length > 0 ? (
                  <ul className="divide-y divide-border-subtle">
                    {otherFiles.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <a
                          href={workFileHref(file.id)}
                          className="min-w-0 truncate text-body-m text-text-primary hover:underline"
                        >
                          {file.fileName}
                          <span className="ml-2 text-text-tertiary">
                            {Math.max(1, Math.round(file.byteSize / 1024))} KB
                          </span>
                        </a>
                        <button
                          type="button"
                          disabled={pending}
                          className="text-label-s text-text-secondary hover:text-danger"
                          onClick={() =>
                            run(() =>
                              deleteWorkIssueFileAction(
                                board.id,
                                issue.id,
                                file.id
                              )
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </TabsContent>

          {canShowDangerTab ? (
            <TabsContent value="danger" className="mt-5 space-y-4">
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
                <h2 className="text-label-l text-danger">Danger zone</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Delete permanently removes this issue and its comments, files,
                  and activity. This cannot be undone.
                </p>
                {issue.loggedHours > 0 ? (
                  <p className="mt-3 text-sm text-text-secondary">
                    This issue has logged time and cannot be deleted.
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="dangerSecondary"
                  size="sm"
                  className="mt-3"
                  disabled={pending || issue.loggedHours > 0}
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete issue
                </Button>
              </div>
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

      <ConfirmModal
        isOpen={deleteOpen && canShowDangerTab}
        title={`Delete ${issue.key}?`}
        message="This permanently deletes the issue and its comments, files, and activity. Issues with logged time cannot be deleted."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        variant="danger"
        onClose={() => {
          if (deleting) return;
          setDeleteOpen(false);
        }}
        onConfirm={async () => {
          if (deleting || !canShowDangerTab) return;
          setDeleting(true);
          const result = await deleteWorkIssueAction(board.id, issue.id);
          setDeleting(false);
          if (!result.ok) {
            onError(result.error);
            return;
          }
          onDeleted();
        }}
      />

      {uploadBarVisible ? (
        <div
          className="shrink-0 border-t border-border-subtle px-6 py-2"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-label-s text-text-secondary">
              {uploadingCount > 1
                ? `Uploading ${uploadingCount} images…`
                : "Uploading image…"}
            </span>
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-muted">
              <div className="h-full w-full animate-pulse rounded-full bg-interactive-primary" />
            </div>
          </div>
        </div>
      ) : null}

      {tab === "details" ? (
      <form
        className="flex shrink-0 flex-col gap-2 border-t border-border-subtle px-6 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          const text = encodeMentions(commentDraft.trim(), board.members);
          const body = joinWorkInlineImages(
            text,
            commentThumbs
              .map((thumb) => thumb.fileId)
              .filter((id): id is string => Boolean(id))
          );
          if (!body) return;
          if (commentThumbs.some((thumb) => thumb.uploading)) return;
          setCommentDraft("");
          setCommentFocused(false);
          setCommentThumbs((prev) => {
            clearThumbs(prev);
            return [];
          });
          run(() => addWorkIssueCommentAction(board.id, issue.id, body));
        }}
      >
        {(() => {
          const commentExpanded =
            commentFocused ||
            Boolean(commentDraft.trim()) ||
            commentThumbs.length > 0;
          return (
            <>
              <div
                className={`flex gap-2 ${
                  commentExpanded ? "items-end" : "h-9 items-center"
                }`}
                data-paste-zone="comment"
              >
                <InitialsAvatar
                  name={board.currentUser.name}
                  initials={board.currentUser.initials}
                  size="sm"
                  className="!h-9 !w-9 !text-[11px]"
                />
                <div
                  className={`min-w-0 flex-1 ${commentExpanded ? "" : "h-9"}`}
                >
                  <WorkCommentComposer
                    people={board.members}
                    value={commentDraft}
                    disabled={pending}
                    rows={commentExpanded ? 3 : 1}
                    showShortcutHint={commentExpanded}
                    className={
                      commentExpanded
                        ? `${commentClass} min-h-[5.5rem] resize-none`
                        : commentCollapsedClass
                    }
                    onChange={setCommentDraft}
                    onFocus={() => setCommentFocused(true)}
                    onBlur={() => {
                      if (!commentDraft.trim() && commentThumbs.length === 0) {
                        setCommentFocused(false);
                      }
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="!h-9 !min-h-9 !max-h-9 shrink-0"
                  disabled={
                    pending ||
                    commentThumbs.some((thumb) => thumb.uploading) ||
                    (!commentDraft.trim() &&
                      commentThumbs.every((thumb) => !thumb.fileId))
                  }
                >
                  <Send className="h-4 w-4" aria-hidden />
                  Send
                </Button>
              </div>
              <WorkInlineImageThumbs
                items={commentThumbs.map((thumb) => ({
                  key: thumb.localId,
                  src: thumb.previewUrl,
                  uploading: thumb.uploading,
                }))}
                onRemove={(key) => {
                  setCommentThumbs((prev) => {
                    const row = prev.find((thumb) => thumb.localId === key);
                    if (row?.revokeOnClear) {
                      URL.revokeObjectURL(row.previewUrl);
                    }
                    return prev.filter((thumb) => thumb.localId !== key);
                  });
                }}
              />
            </>
          );
        })()}
      </form>
      ) : null}
    </div>

    <ConfirmModal
      isOpen={deletingTimeEntry != null}
      title="Delete time entry?"
      message={
        deletingTimeEntry
          ? [
              "Remove ",
              formatWorkHours(deletingTimeEntry.hours),
              " on ",
              formatTimeLogDate(deletingTimeEntry.date),
              "?",
            ].join("")
          : "Remove this time entry?"
      }
      confirmLabel="Delete"
      variant="danger"
      onClose={() => {
        if (pending) return;
        setDeletingTimeId(null);
      }}
      onConfirm={() => {
        if (!deletingTimeId || pending) return;
        deleteLogTime(deletingTimeId);
      }}
    />
    </>
  );
}

const CARD_AVATAR_GAP =
  "shadow-[0_0_0_1.5px_var(--color-bg-default)]";
const CARD_OWNER_FRAME =
  "shadow-[0_0_0_1.5px_var(--color-bg-default),0_0_0_2.5px_var(--color-border-strong)]";

const PEOPLE_MENU_WIDTH = 280;

export function WorkCardPeople({
  owner,
  assignees,
  people = [],
  disabled,
  onSetOwner,
  onAddAssignee,
  onRemoveAssignee,
  /** Portals to document.body (cards). Set false inside dialogs/drawers. */
  portal = true,
}: {
  owner: WorkPerson | null;
  assignees: WorkPerson[];
  people?: WorkPerson[];
  disabled?: boolean;
  onSetOwner?: (person: WorkPerson | null) => void;
  onAddAssignee?: (person: WorkPerson) => void;
  onRemoveAssignee?: (person: WorkPerson) => void;
  portal?: boolean;
}) {
  const interactive = onSetOwner != null && onAddAssignee != null;
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const menuOpen = menu != null;
  const extras = assignees
    .filter((person) => person.id !== owner?.id)
    .slice(0, 3);

  const assigneeIds = useMemo(
    () => new Set(assignees.map((person) => person.id)),
    [assignees]
  );

  // Picker is project members only; keep current owner/assignees visible so
  // they can still be cleared if they lost access.
  const pickablePeople = useMemo(() => {
    const byId = new Map(people.map((person) => [person.id, person]));
    const extras: WorkPerson[] = [];
    if (owner && !byId.has(owner.id)) extras.push(owner);
    for (const person of assignees) {
      if (!byId.has(person.id) && person.id !== owner?.id) {
        extras.push(person);
      }
    }
    return extras.length > 0 ? [...extras, ...people] : people;
  }, [people, owner, assignees]);

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pickablePeople;
    return pickablePeople.filter((person) =>
      person.name.toLowerCase().includes(needle)
    );
  }, [pickablePeople, query]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-card-assign-people]")
      ) {
        return;
      }
      setMenu(null);
      setQuery("");
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [menuOpen]);

  if (!interactive && !owner && extras.length === 0) return null;

  function openMenu(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
    if (!interactive || disabled || pickablePeople.length === 0) return;
    if (menuOpen) {
      setMenu(null);
      setQuery("");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(
        portal ? rect.left : rect.right - PEOPLE_MENU_WIDTH,
        window.innerWidth - PEOPLE_MENU_WIDTH - 8
      )
    );
    const top = Math.min(rect.bottom + 4, window.innerHeight - 320);
    setMenu({ top: Math.max(8, top), left });
  }

  const menuNode = interactive && menuOpen && menu ? (
    <div
      data-card-assign-people
      role="dialog"
      aria-label="Owner and assignees"
      className="fixed z-[80] overflow-hidden rounded-lg border border-border-subtle bg-bg-default shadow-lg"
      style={{
        top: menu.top,
        left: menu.left,
        width: PEOPLE_MENU_WIDTH,
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border-subtle px-2 py-1.5">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
          aria-label="Search people"
          className="w-full rounded-md border-0 bg-transparent px-1 py-1 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      </div>
      <div className="flex items-center justify-end gap-0.5 border-b border-border-subtle px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
        <span className="w-11 text-center">Owner</span>
        <span className="w-11 text-center">Assign</span>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {filteredPeople.length === 0 ? (
          <li className="px-2.5 py-3 text-center text-sm text-text-tertiary">
            No matches
          </li>
        ) : (
          filteredPeople.map((person) => {
            const isOwner = owner?.id === person.id;
            const isAssignee = assigneeIds.has(person.id);
            return (
              <li
                key={person.id}
                className="flex items-center gap-0.5 px-1.5 py-0.5"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1">
                  <InitialsAvatar
                    name={person.name}
                    initials={person.initials}
                    size="xxs"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {person.name}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  title={isOwner ? "Remove owner" : "Set as owner"}
                  aria-label={
                    isOwner
                      ? `Remove owner ${person.name}`
                      : `Set ${person.name} as owner`
                  }
                  aria-pressed={isOwner}
                  className={[
                    "flex h-7 w-11 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50",
                    isOwner
                      ? "text-accent-primary-text hover:bg-accent-primary-subtle"
                      : "text-text-tertiary hover:bg-bg-muted hover:text-text-secondary",
                  ].join(" ")}
                  onClick={() => {
                    onSetOwner?.(isOwner ? null : person);
                  }}
                >
                  {isOwner ? (
                    <CircleDot className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Circle className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  disabled={disabled || onRemoveAssignee == null}
                  title={isAssignee ? "Remove assignee" : "Add assignee"}
                  aria-label={
                    isAssignee
                      ? `Remove assignee ${person.name}`
                      : `Add assignee ${person.name}`
                  }
                  aria-pressed={isAssignee}
                  className={[
                    "flex h-7 w-11 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50",
                    isAssignee
                      ? "text-accent-primary-text hover:bg-accent-primary-subtle"
                      : "text-text-tertiary hover:bg-bg-muted hover:text-text-secondary",
                  ].join(" ")}
                  onClick={() => {
                    if (isAssignee) onRemoveAssignee?.(person);
                    else onAddAssignee?.(person);
                  }}
                >
                  <Check
                    className={
                      isAssignee ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-30"
                    }
                    aria-hidden
                  />
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  ) : null;

  const hasAvatars = Boolean(owner) || extras.length > 0;
  const peopleTitle = [
    owner ? `Owner: ${owner.name}` : null,
    extras.length > 0
      ? `Assignees: ${extras.map((person) => person.name).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className="relative flex shrink-0 items-center"
      data-card-assign-people
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {interactive && pickablePeople.length > 0 ? (
        <button
          type="button"
          disabled={disabled}
          title={peopleTitle || "Owner & assignees"}
          aria-label={
            peopleTitle
              ? `Change people · ${peopleTitle}`
              : "Set owner or assignees"
          }
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          className="flex items-center rounded-full disabled:opacity-50"
          onClick={openMenu}
        >
          <span className="flex items-center -space-x-1.5">
            {owner ? (
              <InitialsAvatar
                name={owner.name}
                initials={owner.initials}
                size="xxs"
                className={CARD_OWNER_FRAME}
              />
            ) : null}
            {extras.map((person) => (
              <InitialsAvatar
                key={person.id}
                name={person.name}
                initials={person.initials}
                size="xxs"
                className={CARD_AVATAR_GAP}
              />
            ))}
            {!hasAvatars ? (
              <span
                aria-hidden
                className={`inline-flex h-6 w-6 rounded-full border border-dashed border-border-strong bg-bg-muted/60 ${CARD_AVATAR_GAP}`}
              />
            ) : null}
          </span>
        </button>
      ) : hasAvatars ? (
        <span className="flex items-center -space-x-1.5" title={peopleTitle}>
          {owner ? (
            <InitialsAvatar
              name={owner.name}
              initials={owner.initials}
              size="xxs"
              className={CARD_OWNER_FRAME}
            />
          ) : null}
          {extras.map((person) => (
            <InitialsAvatar
              key={person.id}
              name={person.name}
              initials={person.initials}
              size="xxs"
              className={CARD_AVATAR_GAP}
            />
          ))}
        </span>
      ) : null}
      {menuNode
        ? portal && typeof document !== "undefined"
          ? createPortal(menuNode, document.body)
          : menuNode
        : null}
    </span>
  );
}
