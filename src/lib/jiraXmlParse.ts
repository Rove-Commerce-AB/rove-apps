/**
 * Parse Jira RSS/XML exports (Jira Cloud "Export XML") into a structured
 * shape for the Work import wizard. Pure functions — safe on client and server.
 */

export type ParsedJiraComment = {
  authorAccountId: string;
  authorName: string | null;
  created: string;
  bodyText: string;
};

export type ParsedJiraPreDeployAction = {
  body: string;
  isDone: boolean;
};

/** Issue link as stored on a Jira item (one side of the pair). */
export type ParsedJiraIssueLink = {
  typeName: string;
  direction: "outward" | "inward";
  otherKey: string;
};

export type ParsedJiraIssue = {
  key: string;
  link: string;
  summary: string;
  descriptionHtml: string;
  descriptionText: string;
  type: string;
  priority: string;
  status: string;
  statusCategoryKey: string | null;
  assigneeName: string | null;
  assigneeAccountId: string | null;
  labels: string[];
  parentKey: string | null;
  links: ParsedJiraIssueLink[];
  estimateSeconds: number | null;
  dueDate: string | null;
  startDate: string | null;
  comments: ParsedJiraComment[];
  preDeployActions: ParsedJiraPreDeployAction[];
  hasPreDeployLabel: boolean;
};

export type ParsedJiraEpic = {
  key: string;
  summary: string;
};

export type ParsedJiraExport = {
  projectKey: string | null;
  projectName: string | null;
  issues: ParsedJiraIssue[];
  epics: ParsedJiraEpic[];
  accountNames: Record<string, string>;
  uniqueStatuses: string[];
  uniqueTypes: string[];
  uniquePriorities: string[];
  uniqueAssignees: string[];
};

const PREDEPLOY_LABEL = "PREDEPLOYACTIONS";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode numeric and common named HTML/XML entities. */
export function decodeXmlEntities(input: string): string {
  if (!input) return "";
  return input.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g,
    (match, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1] === "x" || entity[1] === "X"
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        if (!Number.isFinite(code)) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return NAMED_ENTITIES[entity] ?? match;
    }
  );
}

function stripTagsKeepBreaks(html: string): string {
  let text = html;
  text = text.replace(/<\s*br\s*\/?>/gi, "\n");
  text = text.replace(/<\/\s*p\s*>/gi, "\n\n");
  text = text.replace(/<\/\s*li\s*>/gi, "\n");
  text = text.replace(/<\/\s*h[1-6]\s*>/gi, "\n\n");
  text = text.replace(/<\/\s*div\s*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeXmlEntities(text);
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Convert Jira description/comment HTML (already entity-decoded) to plain text. */
export function htmlToPlainText(html: string): string {
  if (!html.trim()) return "";
  return stripTagsKeepBreaks(html);
}

const PREDEPLOY_HEADING =
  /<(?:p|h[1-6]|div)[^>]*>\s*(?:<(?:b|strong|em|span)[^>]*>\s*)*pre[\s-]?deploy(?:\s+actions?)?\s*(?:<\/(?:b|strong|em|span)>\s*)*<\/(?:p|h[1-6]|div)>/i;

/**
 * Extract checklist items under a Pre deploy heading.
 * Items wrapped in <del> are marked done. Returns actions + HTML with that
 * section removed (so description text stays clean).
 */
export function extractPreDeployFromHtml(html: string): {
  actions: ParsedJiraPreDeployAction[];
  htmlWithoutSection: string;
} {
  if (!html.trim()) return { actions: [], htmlWithoutSection: html };

  const headingMatch = PREDEPLOY_HEADING.exec(html);
  if (!headingMatch || headingMatch.index == null) {
    return { actions: [], htmlWithoutSection: html };
  }

  const afterHeading = html.slice(headingMatch.index + headingMatch[0].length);
  const listMatch = afterHeading.match(
    /^\s*<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i
  );

  if (!listMatch) {
    // Heading only (e.g. "Inga pre deploy actions") — drop the heading.
    const without = (
      html.slice(0, headingMatch.index) +
      html.slice(headingMatch.index + headingMatch[0].length)
    ).trim();
    return { actions: [], htmlWithoutSection: without };
  }

  const listHtml = listMatch[2] ?? "";
  const items = [...listHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(
    (m) => m[1] ?? ""
  );

  const actions: ParsedJiraPreDeployAction[] = [];
  for (const item of items) {
    const isDone = /<del\b/i.test(item);
    const body = htmlToPlainText(item);
    if (!body) continue;
    // Skip "none" placeholders
    if (/^inga\b/i.test(body) && /pre[\s-]?deploy/i.test(body)) continue;
    actions.push({ body, isDone });
  }

  const sectionEnd =
    headingMatch.index +
    headingMatch[0].length +
    (listMatch.index ?? 0) +
    listMatch[0].length;
  const htmlWithoutSection = (
    html.slice(0, headingMatch.index) + html.slice(sectionEnd)
  ).trim();

  return { actions, htmlWithoutSection };
}

/** Fallback when PREDEPLOYACTIONS label is set but no heading matched. */
export function extractTrailingListAsPreDeploy(
  html: string
): ParsedJiraPreDeployAction[] {
  const lists = [...html.matchAll(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi)];
  const last = lists[lists.length - 1];
  if (!last) return [];
  const listHtml = last[2] ?? "";
  const items = [...listHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(
    (m) => m[1] ?? ""
  );
  const actions: ParsedJiraPreDeployAction[] = [];
  for (const item of items) {
    const isDone = /<del\b/i.test(item);
    const body = htmlToPlainText(item);
    if (!body) continue;
    actions.push({ body, isDone });
  }
  return actions;
}

export function parseJiraRfc822Date(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function tagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1].trim()) : "";
}

function tagAttr(block: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "i");
  const m = block.match(re);
  if (!m) return null;
  const attrs = m[1] ?? "";
  const attrRe = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const am = attrs.match(attrRe);
  return am ? decodeXmlEntities(am[2] ?? am[3] ?? "") : null;
}

function selfClosingOrEmpty(block: string, tag: string): boolean {
  const empty = new RegExp(`<${tag}\\b[^>]*>\\s*</${tag}>`, "i");
  const self = new RegExp(`<${tag}\\b[^>]*/>`, "i");
  return empty.test(block) || self.test(block);
}

function collectAccountName(
  map: Record<string, string>,
  accountId: string | null,
  name: string | null
) {
  if (!accountId || !name) return;
  if (accountId === "-1") return;
  if (!map[accountId]) map[accountId] = name;
}

/**
 * Parse a full Jira RSS XML document string.
 * Throws if the document does not look like a Jira export with items.
 */
export function parseJiraRssXml(xml: string): ParsedJiraExport {
  if (!xml || typeof xml !== "string") {
    throw new Error("Empty file");
  }
  if (!/<rss\b/i.test(xml) || !/<item\b/i.test(xml)) {
    throw new Error("Not a Jira RSS/XML export (missing rss/item)");
  }

  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(
    (m) => m[0]
  );
  if (itemBlocks.length === 0) {
    throw new Error("No issues found in the export");
  }

  const accountNames: Record<string, string> = {};
  const issues: ParsedJiraIssue[] = [];
  const epics: ParsedJiraEpic[] = [];
  let projectKey: string | null = null;
  let projectName: string | null = null;

  for (const block of itemBlocks) {
    const key = tagText(block, "key");
    if (!key) continue;

    const link = tagText(block, "link");
    const summary = tagText(block, "summary") || tagText(block, "title");
    const type = tagText(block, "type") || "Task";
    const priority = tagText(block, "priority") || "Medium";
    const status = tagText(block, "status") || "To Do";
    const statusCategoryKey = tagAttr(block, "statusCategory", "key");

    const projectKeyAttr = tagAttr(block, "project", "key");
    const projectText = tagText(block, "project");
    if (!projectKey && projectKeyAttr) projectKey = projectKeyAttr;
    if (!projectName && projectText) projectName = projectText;

    const assigneeRaw = tagText(block, "assignee");
    const assigneeAccountId = tagAttr(block, "assignee", "accountid");
    const assigneeName =
      !assigneeRaw ||
      assigneeRaw === "Unassigned" ||
      assigneeAccountId === "-1"
        ? null
        : assigneeRaw;

    const reporterName = tagText(block, "reporter") || null;
    const reporterAccountId = tagAttr(block, "reporter", "accountid");
    collectAccountName(accountNames, assigneeAccountId, assigneeName);
    collectAccountName(accountNames, reporterAccountId, reporterName);

    const labels = [...block.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)]
      .map((m) => decodeXmlEntities((m[1] ?? "").trim()))
      .filter(Boolean);

    const parentKey = tagText(block, "parent") || null;

    const links: ParsedJiraIssueLink[] = [];
    for (const typeBlock of block.matchAll(
      /<issuelinktype\b[^>]*>([\s\S]*?)<\/issuelinktype>/gi
    )) {
      const inner = typeBlock[1] ?? "";
      const typeName = tagText(`<x>${inner}</x>`, "name") || "Relates";
      for (const out of inner.matchAll(
        /<outwardlinks\b[^>]*>([\s\S]*?)<\/outwardlinks>/gi
      )) {
        for (const keyMatch of (out[1] ?? "").matchAll(
          /<issuekey\b[^>]*>([\s\S]*?)<\/issuekey>/gi
        )) {
          const otherKey = decodeXmlEntities((keyMatch[1] ?? "").trim());
          if (otherKey) {
            links.push({ typeName, direction: "outward", otherKey });
          }
        }
      }
      for (const inn of inner.matchAll(
        /<inwardlinks\b[^>]*>([\s\S]*?)<\/inwardlinks>/gi
      )) {
        for (const keyMatch of (inn[1] ?? "").matchAll(
          /<issuekey\b[^>]*>([\s\S]*?)<\/issuekey>/gi
        )) {
          const otherKey = decodeXmlEntities((keyMatch[1] ?? "").trim());
          if (otherKey) {
            links.push({ typeName, direction: "inward", otherKey });
          }
        }
      }
    }

    const estimateAttr = tagAttr(block, "timeoriginalestimate", "seconds");
    const estimateSeconds = estimateAttr ? Number(estimateAttr) : null;
    const dueDate = selfClosingOrEmpty(block, "due")
      ? null
      : parseJiraRfc822Date(tagText(block, "due"));

    // Custom field "Start date" (datepicker)
    let startDate: string | null = null;
    const startField = block.match(
      /<customfieldname>\s*Start date\s*<\/customfieldname>[\s\S]*?<customfieldvalue[^>]*>([\s\S]*?)<\/customfieldvalue>/i
    );
    if (startField?.[1]) {
      startDate = parseJiraRfc822Date(decodeXmlEntities(startField[1].trim()));
    }

    // Description is entity-escaped HTML inside the XML text node
    const descriptionEncoded = (() => {
      const m = block.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i);
      return m ? m[1].trim() : "";
    })();
    const descriptionHtml = decodeXmlEntities(descriptionEncoded);

    const hasPreDeployLabel = labels.some(
      (l) => l.toUpperCase() === PREDEPLOY_LABEL
    );
    let { actions: preDeployActions, htmlWithoutSection } =
      extractPreDeployFromHtml(descriptionHtml);
    if (preDeployActions.length === 0 && hasPreDeployLabel) {
      preDeployActions = extractTrailingListAsPreDeploy(descriptionHtml);
      // Keep full description if we only used weak fallback
      htmlWithoutSection = descriptionHtml;
    }
    const descriptionText = htmlToPlainText(htmlWithoutSection);

    const comments: ParsedJiraComment[] = [];
    for (const cm of block.matchAll(
      /<comment\b([^>]*)>([\s\S]*?)<\/comment>/gi
    )) {
      const attrs = cm[1] ?? "";
      const bodyEncoded = (cm[2] ?? "").trim();
      const authorMatch = attrs.match(
        /author\s*=\s*("([^"]*)"|'([^']*)')/i
      );
      const createdMatch = attrs.match(
        /created\s*=\s*("([^"]*)"|'([^']*)')/i
      );
      const authorAccountId = decodeXmlEntities(
        authorMatch?.[2] ?? authorMatch?.[3] ?? ""
      );
      const created = decodeXmlEntities(
        createdMatch?.[2] ?? createdMatch?.[3] ?? ""
      );
      const bodyHtml = decodeXmlEntities(bodyEncoded);
      comments.push({
        authorAccountId,
        authorName: accountNames[authorAccountId] ?? null,
        created,
        bodyText: htmlToPlainText(bodyHtml),
      });
    }

    // Also harvest mention display names from comment HTML for author resolution
    for (const cm of comments) {
      // already plain; harvest from original via account map updates below
      void cm;
    }
    for (const mention of block.matchAll(
      /data-account-id=&quot;([^&]+)&quot;[\s\S]*?&gt;([^&<]+)&lt;/gi
    )) {
      const id = decodeXmlEntities(mention[1] ?? "");
      const name = decodeXmlEntities(mention[2] ?? "").trim();
      collectAccountName(accountNames, id, name);
    }
    // Second pass: fill authorName now that mentions may have updated the map
    for (const comment of comments) {
      if (!comment.authorName && accountNames[comment.authorAccountId]) {
        comment.authorName = accountNames[comment.authorAccountId];
      }
    }

    if (type.toLowerCase() === "epic") {
      epics.push({ key, summary: summary || key });
    }

    issues.push({
      key,
      link,
      summary: summary || key,
      descriptionHtml,
      descriptionText,
      type,
      priority,
      status,
      statusCategoryKey,
      assigneeName,
      assigneeAccountId:
        assigneeAccountId && assigneeAccountId !== "-1"
          ? assigneeAccountId
          : null,
      labels,
      parentKey,
      links,
      estimateSeconds:
        estimateSeconds != null && Number.isFinite(estimateSeconds)
          ? estimateSeconds
          : null,
      dueDate,
      startDate,
      comments,
      preDeployActions,
      hasPreDeployLabel,
    });
  }

  // Resolve comment author names after full pass over assignees/reporters
  for (const issue of issues) {
    for (const comment of issue.comments) {
      if (!comment.authorName && accountNames[comment.authorAccountId]) {
        comment.authorName = accountNames[comment.authorAccountId];
      }
    }
  }

  const uniqueStatuses = [
    ...new Set(issues.map((i) => i.status).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const uniqueTypes = [
    ...new Set(issues.map((i) => i.type).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const uniquePriorities = [
    ...new Set(issues.map((i) => i.priority).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const uniqueAssignees = [
    ...new Set(
      issues
        .map((i) => i.assigneeName)
        .filter((n): n is string => Boolean(n))
    ),
  ].sort((a, b) => a.localeCompare(b));

  return {
    projectKey,
    projectName,
    issues,
    epics,
    accountNames,
    uniqueStatuses,
    uniqueTypes,
    uniquePriorities,
    uniqueAssignees,
  };
}

export function normalizePersonName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function suggestPriorityMapping(
  jiraPriority: string
): "low" | "medium" | "high" | null {
  const p = jiraPriority.trim().toLowerCase();
  if (p === "highest" || p === "high" || p === "critical" || p === "blocker") {
    return "high";
  }
  if (p === "medium" || p === "major" || p === "normal") return "medium";
  if (p === "low" || p === "lowest" || p === "minor" || p === "trivial") {
    return "low";
  }
  return "medium";
}

export function suggestTypeMapping(jiraType: string): "issue" | "bug" {
  return jiraType.trim().toLowerCase() === "bug" ? "bug" : "issue";
}

export function formatImportedComment(comment: ParsedJiraComment): string {
  const author = comment.authorName?.trim() || comment.authorAccountId || "Unknown";
  const when = comment.created.trim() || "unknown date";
  const body = comment.bodyText.trim();
  return `[${author}, ${when}]\n${body}`;
}

export function estimateHoursFromSeconds(seconds: number | null): number | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  // Keep quarter-hour precision
  return Math.round((seconds / 3600) * 100) / 100;
}

export type JiraWorkRelationKind = "parent" | "blocks" | "relates";

export type JiraRelationEdge = {
  fromKey: string;
  toKey: string;
  kind: JiraWorkRelationKind;
  /** Original Jira link type name, for logging (e.g. Duplicate → relates). */
  jiraType: string;
};

/**
 * Map a Jira issuelink on `sourceKey` to a directed Work edge.
 * Blocks keeps direction; Relates and unknown types become undirected `relates`.
 */
export function mapJiraIssueLinkToEdge(
  sourceKey: string,
  link: ParsedJiraIssueLink
): JiraRelationEdge {
  const typeName = link.typeName.trim();
  const t = typeName.toLowerCase();
  if (t === "blocks") {
    if (link.direction === "outward") {
      return {
        fromKey: sourceKey,
        toKey: link.otherKey,
        kind: "blocks",
        jiraType: typeName,
      };
    }
    return {
      fromKey: link.otherKey,
      toKey: sourceKey,
      kind: "blocks",
      jiraType: typeName,
    };
  }
  const [a, b] =
    sourceKey < link.otherKey
      ? [sourceKey, link.otherKey]
      : [link.otherKey, sourceKey];
  return { fromKey: a, toKey: b, kind: "relates", jiraType: typeName };
}

/**
 * Build the full set of Work relation edges from a parsed export.
 * Parent links to epics are omitted when createEpicCards is false (those epics
 * are not imported as cards; use components instead if enabled).
 */
export function buildJiraRelationEdges(
  issues: ParsedJiraIssue[],
  options: { createEpicCards: boolean }
): JiraRelationEdge[] {
  const epicKeys = new Set(
    issues
      .filter((i) => i.type.trim().toLowerCase() === "epic")
      .map((i) => i.key)
  );
  const edges: JiraRelationEdge[] = [];
  const seen = new Set<string>();

  function add(edge: JiraRelationEdge) {
    if (edge.fromKey === edge.toKey) return;
    const id = `${edge.kind}:${edge.fromKey}->${edge.toKey}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push(edge);
  }

  for (const issue of issues) {
    if (issue.parentKey) {
      const parentIsEpic = epicKeys.has(issue.parentKey);
      if (!parentIsEpic || options.createEpicCards) {
        add({
          fromKey: issue.parentKey,
          toKey: issue.key,
          kind: "parent",
          jiraType: "Parent",
        });
      }
    }
    for (const link of issue.links) {
      add(mapJiraIssueLinkToEdge(issue.key, link));
    }
  }

  return edges;
}
