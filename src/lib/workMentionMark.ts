import { Mark, mergeAttributes } from "@tiptap/core";

/** Inline mark so a picked `@Name` renders as a chip in the editor. */
export const WorkMentionMark = Mark.create({
  name: "workMention",
  inclusive: false,
  excludes: "_",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-mention-id"),
        renderHTML: (attributes) =>
          attributes.id ? { "data-mention-id": attributes.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-work-mention]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-work-mention": "",
        class: "work-mention-chip",
      }),
      0,
    ];
  },
});
