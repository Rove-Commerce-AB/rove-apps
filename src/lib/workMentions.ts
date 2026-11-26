import type { WorkPerson } from "@/lib/workTypes";

function mentionTokenRe() {
  return /@\[([^\]]+)\]\(([^)]+)\)/g;
}

export type MentionQuery = {
  start: number;
  query: string;
};

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; id: string };

export function mentionToken(person: WorkPerson): string {
  return `@[${person.name}](${person.id})`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function peopleByLongestName(people: readonly WorkPerson[]) {
  return [...people].sort((a, b) => b.name.length - a.name.length);
}

function completedMentionLength(
  text: string,
  at: number,
  people: readonly WorkPerson[]
): number | null {
  const token = text.slice(at).match(/^@\[[^\]]*\]\([^)]*\)/);
  if (token) return token[0].length;
  const after = text.slice(at + 1);
  for (const person of peopleByLongestName(people)) {
    if (!after.startsWith(person.name)) continue;
    const end = at + 1 + person.name.length;
    const next = text.charAt(end);
    if (next === "" || /\s/.test(next)) return 1 + person.name.length;
  }
  return null;
}

export function mentionQueryAt(
  text: string,
  caret: number,
  people: readonly WorkPerson[] = []
): MentionQuery | null {
  if (caret < 0 || caret > text.length) return null;
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(text.charAt(at - 1))) return null;
  const completed = completedMentionLength(text, at, people);
  if (completed != null) return null;
  const query = before.slice(at + 1);
  if (query.includes("\n")) return null;
  return { start: at, query };
}

export function filterMentionPeople(
  people: WorkPerson[],
  query: string
): WorkPerson[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return people;
  return people.filter(
    (person) =>
      person.name.toLowerCase().includes(needle) ||
      person.initials.toLowerCase().includes(needle)
  );
}

export function insertMention(
  text: string,
  start: number,
  caret: number,
  person: WorkPerson
): { text: string; caret: number } {
  const visible = `@${person.name} `;
  const next = `${text.slice(0, start)}${visible}${text.slice(caret)}`;
  return { text: next, caret: start + visible.length };
}

export function encodeMentions(
  body: string,
  people: readonly WorkPerson[]
): string {
  let encoded = body;
  for (const person of peopleByLongestName(people)) {
    const pattern = new RegExp(`(^|\\s)@${escapeRegExp(person.name)}(?=$|\\s)`, "g");
    encoded = encoded.replace(pattern, `$1${mentionToken(person)}`);
  }
  return encoded;
}

export function extractMentionedIds(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(mentionTokenRe())]
        .map((match) => match[2])
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

export function parseMentionSegments(body: string): MentionSegment[] {
  const parts: MentionSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(mentionTokenRe())) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ type: "text", value: body.slice(last, index) });
    }
    parts.push({
      type: "mention",
      value: match[1] ?? "",
      id: match[2] ?? "",
    });
    last = index + match[0].length;
  }
  if (last < body.length) {
    parts.push({ type: "text", value: body.slice(last) });
  }
  return parts;
}

export function mentionPlainText(body: string): string {
  return body.replace(mentionTokenRe(), "@$1");
}

/**
 * Turn stored `@[Name](id)` tokens into Markdown links that WorkMarkdown
 * can style as mention chips (`#mention:id`).
 */
export function mentionsToDisplayMarkdown(body: string): string {
  return body.replace(mentionTokenRe(), "[@$1](#mention:$2)");
}

export function commentPreview(body: string, max = 120): string {
  const plain = mentionPlainText(body).replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}
