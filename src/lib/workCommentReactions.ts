export const WORK_COMMENT_REACTION_TYPES = [
  "seen",
  "agree",
  "good",
  "thanks",
] as const;

export type WorkCommentReactionType =
  (typeof WORK_COMMENT_REACTION_TYPES)[number];

export const WORK_COMMENT_REACTION_META: {
  type: WorkCommentReactionType;
  emoji: string;
  label: string;
}[] = [
  { type: "seen", emoji: "👀", label: "Seen" },
  { type: "agree", emoji: "👍", label: "Agree" },
  { type: "good", emoji: "✅", label: "Good" },
  { type: "thanks", emoji: "❤️", label: "Thanks" },
];

export type WorkCommentReaction = {
  type: WorkCommentReactionType;
  emoji: string;
  label: string;
  count: number;
  reactedByMe: boolean;
  names: string[];
};

export function isWorkCommentReactionType(
  value: string
): value is WorkCommentReactionType {
  return (WORK_COMMENT_REACTION_TYPES as readonly string[]).includes(value);
}

export function emptyWorkCommentReactions(): WorkCommentReaction[] {
  return WORK_COMMENT_REACTION_META.map((meta) => ({
    type: meta.type,
    emoji: meta.emoji,
    label: meta.label,
    count: 0,
    reactedByMe: false,
    names: [],
  }));
}

export type WorkCommentReactionRow = {
  comment_id: string;
  reaction: string;
  app_user_id: string;
  user_name: string | null;
  user_email: string;
};

function displayName(name: string | null, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const local = email.split("@")[0]?.trim();
  return local || "Someone";
}

/** Aggregate DB rows into the fixed reaction set for one comment. */
export function aggregateWorkCommentReactions(
  rows: WorkCommentReactionRow[],
  viewerAppUserId: string | null
): WorkCommentReaction[] {
  const byType = new Map<
    WorkCommentReactionType,
    { names: string[]; reactedByMe: boolean }
  >();
  for (const meta of WORK_COMMENT_REACTION_META) {
    byType.set(meta.type, { names: [], reactedByMe: false });
  }
  for (const row of rows) {
    if (!isWorkCommentReactionType(row.reaction)) continue;
    const bucket = byType.get(row.reaction);
    if (!bucket) continue;
    bucket.names.push(displayName(row.user_name, row.user_email));
    if (viewerAppUserId && row.app_user_id === viewerAppUserId) {
      bucket.reactedByMe = true;
    }
  }
  return WORK_COMMENT_REACTION_META.map((meta) => {
    const bucket = byType.get(meta.type)!;
    return {
      type: meta.type,
      emoji: meta.emoji,
      label: meta.label,
      count: bucket.names.length,
      reactedByMe: bucket.reactedByMe,
      names: bucket.names,
    };
  });
}

/** Optimistic local toggle for drawer UI. */
export function toggleWorkCommentReactionLocal(
  reactions: WorkCommentReaction[],
  type: WorkCommentReactionType,
  viewerName: string
): WorkCommentReaction[] {
  const base =
    reactions.length === WORK_COMMENT_REACTION_META.length
      ? reactions
      : emptyWorkCommentReactions().map((empty) => {
          const existing = reactions.find((r) => r.type === empty.type);
          return existing ?? empty;
        });
  return base.map((reaction) => {
    if (reaction.type !== type) return reaction;
    if (reaction.reactedByMe) {
      return {
        ...reaction,
        reactedByMe: false,
        count: Math.max(0, reaction.count - 1),
        names: reaction.names.filter((name) => name !== viewerName),
      };
    }
    return {
      ...reaction,
      reactedByMe: true,
      count: reaction.count + 1,
      names: reaction.names.includes(viewerName)
        ? reaction.names
        : [...reaction.names, viewerName],
    };
  });
}
