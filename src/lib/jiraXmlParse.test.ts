import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  buildJiraRelationEdges,
  decodeXmlEntities,
  estimateHoursFromSeconds,
  extractPreDeployFromHtml,
  formatImportedComment,
  htmlToPlainText,
  mapJiraIssueLinkToEdge,
  parseJiraRfc822Date,
  parseJiraRfc822DateTime,
  parseJiraRssXml,
  suggestPriorityMapping,
  suggestTypeMapping,
} from "./jiraXmlParse";
import { matchPeopleByName } from "./workJiraImportShared";

const SAMPLE = `<?xml version="1.0"?>
<rss version="0.92">
  <channel>
    <title>Jira</title>
    <item>
      <title>[GOH-1] Hello &#246; world</title>
      <link>https://example.atlassian.net/browse/GOH-1</link>
      <project id="1" key="GOH">G&#246;hlins</project>
      <description>&lt;p&gt;Krav&lt;/p&gt;
&lt;p&gt;&lt;b&gt;Pre deploy actions&lt;/b&gt;&lt;/p&gt;
&lt;ul&gt;
  &lt;li&gt;&lt;del&gt;Done step&lt;/del&gt;&lt;/li&gt;
  &lt;li&gt;Open step&lt;/li&gt;
&lt;/ul&gt;</description>
      <key id="1">GOH-1</key>
      <summary>Hello &#246; world</summary>
      <type id="1">Story</type>
      <priority id="3">Medium</priority>
      <status id="1">Done</status>
      <statusCategory id="3" key="done" colorName="green"/>
      <assignee accountid="acc-a">Ada Lovelace</assignee>
      <reporter accountid="acc-b">Grace Hopper</reporter>
      <labels><label>PREDEPLOYACTIONS</label></labels>
      <created>Wed, 3 Dec 2025 09:28:54 +0100</created>
      <updated>Wed, 3 Dec 2025 09:28:54 +0100</updated>
      <due></due>
      <timeoriginalestimate seconds="7200">2 hours</timeoriginalestimate>
      <comments>
        <comment id="9" author="acc-a" created="Wed, 3 Dec 2025 10:00:00 +0100">&lt;p&gt;Looks good&lt;/p&gt;</comment>
      </comments>
      <issuelinks>
        <issuelinktype id="10000">
          <name>Blocks</name>
          <outwardlinks description="blocks">
            <issuelink><issuekey id="9">GOH-9</issuekey></issuelink>
          </outwardlinks>
        </issuelinktype>
        <issuelinktype id="10003">
          <name>Relates</name>
          <inwardlinks description="relates to">
            <issuelink><issuekey id="8">GOH-8</issuekey></issuelink>
          </inwardlinks>
        </issuelinktype>
      </issuelinks>
      <parent id="2">GOH-EPIC</parent>
    </item>
    <item>
      <title>[GOH-SUB] Child task</title>
      <link>https://example.atlassian.net/browse/GOH-SUB</link>
      <project id="1" key="GOH">Gohlins</project>
      <description></description>
      <key id="3">GOH-SUB</key>
      <summary>Child task</summary>
      <type id="10003">Subtask</type>
      <priority id="3">Medium</priority>
      <status id="1">To Do</status>
      <assignee accountid="-1">Unassigned</assignee>
      <reporter accountid="acc-b">Grace Hopper</reporter>
      <labels></labels>
      <created>Wed, 3 Dec 2025 09:28:54 +0100</created>
      <updated>Wed, 3 Dec 2025 09:28:54 +0100</updated>
      <due></due>
      <parent id="1">GOH-1</parent>
    </item>
    <item>
      <title>[GOH-EPIC] Area</title>
      <link>https://example.atlassian.net/browse/GOH-EPIC</link>
      <project id="1" key="GOH">Gohlins</project>
      <description></description>
      <key id="2">GOH-EPIC</key>
      <summary>Area</summary>
      <type id="10070">Epic</type>
      <priority id="3">Medium</priority>
      <status id="1">To Do</status>
      <statusCategory id="2" key="new" colorName="blue"/>
      <assignee accountid="-1">Unassigned</assignee>
      <reporter accountid="acc-b">Grace Hopper</reporter>
      <labels></labels>
      <created>Wed, 3 Dec 2025 09:28:54 +0100</created>
      <updated>Wed, 3 Dec 2025 09:28:54 +0100</updated>
      <due>Fri, 31 May 2024 00:00:00 +0000</due>
    </item>
  </channel>
</rss>`;

describe("jiraXmlParse", () => {
  it("decodes entities and HTML to text", () => {
    expect(decodeXmlEntities("S&#246;k &amp; hitta")).toBe("Sök & hitta");
    expect(htmlToPlainText("<p>Hi</p><p>There</p>")).toContain("Hi");
  });

  it("extracts pre-deploy checklist and strips section", () => {
    const html = decodeXmlEntities(
      "&lt;p&gt;Body&lt;/p&gt;&lt;p&gt;&lt;b&gt;Pre deploy actions&lt;/b&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;&lt;del&gt;A&lt;/del&gt;&lt;/li&gt;&lt;li&gt;B&lt;/li&gt;&lt;/ul&gt;"
    );
    const { actions, htmlWithoutSection } = extractPreDeployFromHtml(html);
    expect(actions).toEqual([
      { body: "A", isDone: true },
      { body: "B", isDone: false },
    ]);
    expect(htmlWithoutSection.toLowerCase()).not.toContain("pre deploy");
    expect(htmlToPlainText(htmlWithoutSection)).toContain("Body");
  });

  it("parses a Jira RSS sample", () => {
    const parsed = parseJiraRssXml(SAMPLE);
    expect(parsed.projectKey).toBe("GOH");
    expect(parsed.issues).toHaveLength(3);
    expect(parsed.epics).toEqual([{ key: "GOH-EPIC", summary: "Area" }]);
    expect(parsed.uniqueStatuses).toEqual(["Done", "To Do"]);

    const story = parsed.issues.find((i) => i.key === "GOH-1")!;
    expect(story.summary).toBe("Hello ö world");
    expect(story.assigneeName).toBe("Ada Lovelace");
    expect(story.parentKey).toBe("GOH-EPIC");
    expect(story.estimateSeconds).toBe(7200);
    expect(story.hasPreDeployLabel).toBe(true);
    expect(story.preDeployActions).toHaveLength(2);
    expect(story.descriptionText).toContain("Krav");
    expect(story.descriptionText.toLowerCase()).not.toContain("pre deploy");
    expect(story.comments[0]?.authorName).toBe("Ada Lovelace");
    expect(story.comments[0]?.bodyText).toBe("Looks good");
    expect(parsed.uniqueCommentAuthors).toEqual(["Ada Lovelace"]);
    expect(story.links).toEqual([
      { typeName: "Blocks", direction: "outward", otherKey: "GOH-9" },
      { typeName: "Relates", direction: "inward", otherKey: "GOH-8" },
    ]);

    const sub = parsed.issues.find((i) => i.key === "GOH-SUB")!;
    expect(sub.parentKey).toBe("GOH-1");

    const epic = parsed.issues.find((i) => i.key === "GOH-EPIC")!;
    expect(epic.assigneeName).toBeNull();
    expect(epic.dueDate).toBe("2024-05-31");
  });

  it("builds relation edges with epic parent gate", () => {
    const parsed = parseJiraRssXml(SAMPLE);
    const withEpics = buildJiraRelationEdges(parsed.issues, {
      createEpicCards: true,
    });
    expect(
      withEpics.some(
        (e) =>
          e.kind === "parent" &&
          e.fromKey === "GOH-EPIC" &&
          e.toKey === "GOH-1"
      )
    ).toBe(true);
    expect(
      withEpics.some(
        (e) =>
          e.kind === "parent" && e.fromKey === "GOH-1" && e.toKey === "GOH-SUB"
      )
    ).toBe(true);
    expect(
      withEpics.some(
        (e) =>
          e.kind === "blocks" && e.fromKey === "GOH-1" && e.toKey === "GOH-9"
      )
    ).toBe(true);

    const withoutEpics = buildJiraRelationEdges(parsed.issues, {
      createEpicCards: false,
    });
    expect(
      withoutEpics.some(
        (e) => e.kind === "parent" && e.fromKey === "GOH-EPIC"
      )
    ).toBe(false);
    expect(
      withoutEpics.some(
        (e) =>
          e.kind === "parent" && e.fromKey === "GOH-1" && e.toKey === "GOH-SUB"
      )
    ).toBe(true);
  });

  it("suggests mappings and formats comments", () => {
    expect(suggestTypeMapping("Bug")).toBe("bug");
    expect(suggestTypeMapping("Story")).toBe("issue");
    expect(suggestPriorityMapping("Highest")).toBe("high");
    expect(estimateHoursFromSeconds(7200)).toBe(2);
    expect(parseJiraRfc822Date("")).toBeNull();
    expect(
      mapJiraIssueLinkToEdge("A-1", {
        typeName: "Polaris work item link",
        direction: "outward",
        otherKey: "A-2",
      }).kind
    ).toBe("relates");
    expect(
      formatImportedComment({
        authorAccountId: "x",
        authorName: "Ada",
        created: "Wed, 3 Dec 2025",
        bodyText: "Hi",
      })
    ).toBe("[Ada, Wed, 3 Dec 2025]\nHi");
    expect(
      formatImportedComment(
        {
          authorAccountId: "x",
          authorName: "Ada",
          created: "Wed, 3 Dec 2025",
          bodyText: "Hi",
        },
        { authorMapped: true }
      )
    ).toBe("Hi");
    expect(parseJiraRfc822DateTime("Wed, 3 Dec 2025 10:00:00 +0100")).toBe(
      new Date("Wed, 3 Dec 2025 10:00:00 +0100").toISOString()
    );
    expect(
      matchPeopleByName(
        ["marie.ahdel-franzen", "Ada Lovelace"],
        [
          { id: "1", name: "Marie Ahdel-Franzen", initials: "MA" },
          { id: "2", name: "Ada Lovelace", initials: "AL" },
        ]
      )
    ).toEqual({
      "marie.ahdel-franzen": "1",
      "Ada Lovelace": "2",
    });
  });

  it("rejects non-Jira XML", () => {
    expect(() => parseJiraRssXml("<html></html>")).toThrow(/Jira RSS/);
  });

  it("parses Skansen Jira export when present", () => {
    const path = resolve(process.cwd(), "docs/_tmp_skansen_jira.xml");
    if (!existsSync(path)) return;
    const parsed = parseJiraRssXml(readFileSync(path, "utf8"));
    expect(parsed.projectKey).toBe("SKANSEN");
    expect(parsed.issues.length).toBe(48);
    expect(parsed.uniqueTypes.sort()).toEqual(["Bug", "Story", "Task"]);
    expect(parsed.uniqueStatuses).toContain("Ready for test");
  });

  it("parses docs/Jira.xml when present", () => {
    const path = resolve(process.cwd(), "docs/Jira.xml");
    if (!existsSync(path)) return;
    const parsed = parseJiraRssXml(readFileSync(path, "utf8"));
    expect(parsed.issues.length).toBe(380);
    expect(parsed.epics.length).toBeGreaterThan(0);
    expect(parsed.uniqueStatuses.length).toBeGreaterThan(3);
    const withPre = parsed.issues.filter((i) => i.preDeployActions.length > 0);
    expect(withPre.length).toBeGreaterThan(0);
    expect(withPre[0]!.descriptionText.toLowerCase()).not.toContain(
      "pre deploy actions"
    );
  });
});
