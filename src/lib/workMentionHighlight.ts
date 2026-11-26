import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { WorkPerson } from "@/lib/workTypes";

const pluginKey = new PluginKey("workMentionHighlight");

function peopleByLongestName(people: readonly WorkPerson[]) {
  return [...people].sort((a, b) => b.name.length - a.name.length);
}

/** Local ranges of completed `@Name` tokens inside a text node. */
export function mentionRangesInText(
  text: string,
  people: readonly WorkPerson[]
): { from: number; to: number }[] {
  if (!text || people.length === 0) return [];
  const sorted = peopleByLongestName(people);
  const ranges: { from: number; to: number }[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "@") {
      i += 1;
      continue;
    }
    if (i > 0 && !/\s/.test(text.charAt(i - 1))) {
      i += 1;
      continue;
    }
    const after = text.slice(i + 1);
    let matched = false;
    for (const person of sorted) {
      if (!after.startsWith(person.name)) continue;
      const end = i + 1 + person.name.length;
      const next = text.charAt(end);
      if (next === "" || /\s/.test(next) || /[.,;:!?)\]}]/.test(next)) {
        ranges.push({ from: i, to: end });
        i = end;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1;
  }
  return ranges;
}

export function WorkMentionHighlight(options: {
  getPeople: () => readonly WorkPerson[];
}) {
  return Extension.create({
    name: "workMentionHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pluginKey,
          props: {
            decorations(state) {
              const people = options.getPeople();
              if (people.length === 0) {
                return DecorationSet.empty;
              }
              const decos: ReturnType<typeof Decoration.inline>[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                for (const range of mentionRangesInText(node.text, people)) {
                  decos.push(
                    Decoration.inline(pos + range.from, pos + range.to, {
                      class: "work-mention-chip",
                    })
                  );
                }
              });
              return DecorationSet.create(state.doc, decos);
            },
          },
        }),
      ];
    },
  });
}
