"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Code,
  Code2,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Strikethrough,
  CodeXml,
} from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { IconButton } from "@/components/ui";
import {
  mentionListKeyDown,
  WorkMentionSuggest,
} from "@/components/WorkMentionSuggest";
import { isAllowedWorkMarkdownHref } from "@/lib/workMarkdown";
import {
  filterMentionPeople,
  insertMention,
  mentionQueryAt,
  type MentionQuery,
} from "@/lib/workMentions";
import type { WorkPerson } from "@/lib/workTypes";

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function collectImageFiles(data: DataTransfer | null): File[] {
  if (!data?.items?.length) return [];
  const images: File[] = [];
  for (const item of data.items) {
    if (!item.type.startsWith("image/")) continue;
    const blob = item.getAsFile();
    if (blob) images.push(blob);
  }
  return images;
}

function mentionQueryFromEditor(
  editor: Editor,
  people: readonly WorkPerson[]
): (MentionQuery & { from: number; to: number }) | null {
  const { $from } = editor.state.selection;
  const blockStart = $from.start();
  const textBefore = editor.state.doc.textBetween(blockStart, $from.pos, "\n", "\n");
  const query = mentionQueryAt(textBefore, textBefore.length, people);
  if (!query) return null;
  return {
    ...query,
    from: blockStart + query.start,
    to: $from.pos,
  };
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors disabled:opacity-40 ${
        active
          ? "bg-accent-primary-subtle text-accent-primary-text"
          : "hover:bg-text-primary/[0.06] hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

export function WorkDescriptionEditor({
  value,
  contentKey,
  people = [],
  disabled = false,
  placeholder = "Add description… Use @ to mention",
  onChange,
  onBlur,
  onPasteImages,
}: {
  value: string;
  /** Reset editor when this changes (e.g. issue id). */
  contentKey: string;
  people?: WorkPerson[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  onPasteImages?: (files: File[]) => void;
}) {
  const [mode, setMode] = useState<"wysiwyg" | "source">("wysiwyg");
  const [sourceDraft, setSourceDraft] = useState(value);
  const [mention, setMention] = useState<
    (MentionQuery & { from?: number; to?: number }) | null
  >(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const lastEmittedRef = useRef(normalizeMarkdown(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPasteImagesRef = useRef(onPasteImages);
  onPasteImagesRef.current = onPasteImages;
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const mentionRef = useRef(mention);
  mentionRef.current = mention;
  const matchesRef = useRef<WorkPerson[]>([]);
  const activeIndexRef = useRef(0);

  const matches = useMemo(
    () => (mention ? filterMentionPeople(people, mention.query) : []),
    [mention, people]
  );
  matchesRef.current = matches;

  useEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
  }, [mention?.query, mention?.start, matches.length]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          validate: (href) => isAllowedWorkMarkdownHref(href),
        },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "work-markdown work-description-editor focus:outline-none",
      },
      handlePaste: (_view, event) => {
        const images = collectImageFiles(event.clipboardData);
        if (images.length === 0) return false;
        event.preventDefault();
        onPasteImagesRef.current?.(images);
        return true;
      },
      handleKeyDown: (_view, event) => {
        const current = mentionRef.current;
        if (!current) return false;
        return mentionListKeyDown(event, {
          open: true,
          matches: matchesRef.current,
          activeIndex: activeIndexRef.current,
          setActiveIndex: (updater) => {
            setActiveIndex((index) => {
              const next = updater(index);
              activeIndexRef.current = next;
              return next;
            });
          },
          onPick: (person) => {
            const ed = editorRef.current;
            const range = mentionRef.current;
            if (!ed || range?.from == null || range.to == null) return;
            ed.chain()
              .focus()
              .deleteRange({ from: range.from, to: range.to })
              .insertContent(`@${person.name} `)
              .run();
            setMention(null);
          },
          onClose: () => setMention(null),
        });
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown();
      const normalized = normalizeMarkdown(markdown);
      lastEmittedRef.current = normalized;
      onChangeRef.current(markdown);
      setMention(mentionQueryFromEditor(current, peopleRef.current));
    },
    onSelectionUpdate: ({ editor: current }) => {
      setMention(mentionQueryFromEditor(current, peopleRef.current));
    },
    onBlur: () => {
      onBlur?.();
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    setMode("wysiwyg");
    setSourceDraft(value);
    setMention(null);
    lastEmittedRef.current = normalizeMarkdown(value);
    if (!editor) return;
    editor.commands.setContent(value || "", {
      contentType: "markdown",
      emitUpdate: false,
    });
    // Only reset when switching issues (or equivalent contentKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: ignore value drift while editing
  }, [contentKey, editor]);

  useEffect(() => {
    if (!editor || mode !== "wysiwyg") return;
    const normalized = normalizeMarkdown(value);
    if (normalized === lastEmittedRef.current) return;
    lastEmittedRef.current = normalized;
    editor.commands.setContent(value || "", {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [value, editor, mode]);

  function emitMarkdown(markdown: string) {
    const normalized = normalizeMarkdown(markdown);
    lastEmittedRef.current = normalized;
    onChange(markdown);
  }

  function switchToSource() {
    if (!editor) return;
    const markdown = editor.getMarkdown();
    setSourceDraft(markdown);
    setMention(null);
    setMode("source");
  }

  function switchToWysiwyg() {
    if (!editor) return;
    editor.commands.setContent(sourceDraft || "", {
      contentType: "markdown",
      emitUpdate: false,
    });
    emitMarkdown(sourceDraft);
    setMention(null);
    setMode("wysiwyg");
  }

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const next = window.prompt("Link URL", previous ?? "https://");
    if (next == null) return;
    const href = next.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!isAllowedWorkMarkdownHref(href)) {
      window.alert(
        "Only http(s), mailto, or /work/… links are allowed."
      );
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  function pickSourceMention(person: WorkPerson) {
    const el = sourceRef.current;
    if (!mention || !el) return;
    const next = insertMention(
      sourceDraft,
      mention.start,
      el.selectionStart,
      person
    );
    setSourceDraft(next.text);
    emitMarkdown(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  function pickWysiwygMention(person: WorkPerson) {
    if (!editor || mention?.from == null || mention.to == null) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: mention.from, to: mention.to })
      .insertContent(`@${person.name} `)
      .run();
    setMention(null);
  }

  function syncSourceMention(el: HTMLTextAreaElement) {
    setMention(mentionQueryAt(el.value, el.selectionStart, people));
  }

  const iconClass = "h-3.5 w-3.5";

  return (
    <div className="relative overflow-hidden rounded-xl bg-bg-muted/40 ring-1 ring-border-subtle">
      <div className="flex items-center gap-0.5 border-b border-border-subtle/70 px-1.5 py-1">
        {mode === "wysiwyg" ? (
          <>
            <ToolbarButton
              label="Bold"
              active={editor?.isActive("bold")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Italic"
              active={editor?.isActive("italic")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Strikethrough"
              active={editor?.isActive("strike")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Inline code"
              active={editor?.isActive("code")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleCode().run()}
            >
              <Code className={iconClass} aria-hidden />
            </ToolbarButton>
            <span className="mx-0.5 h-4 w-px bg-border-subtle" aria-hidden />
            <ToolbarButton
              label="Heading"
              active={editor?.isActive("heading", { level: 2 })}
              disabled={disabled || !editor}
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              <Heading2 className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Bullet list"
              active={editor?.isActive("bulletList")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              active={editor?.isActive("orderedList")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Checklist"
              active={editor?.isActive("taskList")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleTaskList().run()}
            >
              <ListTodo className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Quote"
              active={editor?.isActive("blockquote")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <Quote className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Code block"
              active={editor?.isActive("codeBlock")}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            >
              <Code2 className={iconClass} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Link"
              active={editor?.isActive("link")}
              disabled={disabled || !editor}
              onClick={setLink}
            >
              <LinkIcon className={iconClass} aria-hidden />
            </ToolbarButton>
          </>
        ) : (
          <span className="px-1.5 text-caption text-text-tertiary">
            Markdown source
          </span>
        )}
        <div className="ml-auto">
          <IconButton
            aria-label={
              mode === "wysiwyg" ? "Show Markdown source" : "Show rich text"
            }
            title={
              mode === "wysiwyg" ? "Show Markdown source" : "Show rich text"
            }
            disabled={disabled}
            className="!p-1"
            onClick={() => {
              if (mode === "wysiwyg") switchToSource();
              else switchToWysiwyg();
            }}
          >
            <CodeXml className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </div>
      </div>

      <div className="relative bg-bg-default px-3 py-2">
        {mention ? (
          <WorkMentionSuggest
            matches={matches}
            activeIndex={activeIndex}
            onPick={mode === "source" ? pickSourceMention : pickWysiwygMention}
            placement="below"
          />
        ) : null}
        {mode === "wysiwyg" ? (
          <EditorContent editor={editor} />
        ) : (
          <textarea
            ref={sourceRef}
            value={sourceDraft}
            disabled={disabled}
            placeholder={placeholder}
            rows={6}
            className="w-full resize-y rounded-md border-0 bg-transparent px-0 py-0 font-mono text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50"
            onChange={(event) => {
              const next = event.target.value;
              setSourceDraft(next);
              emitMarkdown(next);
              syncSourceMention(event.target);
            }}
            onClick={(event) => syncSourceMention(event.currentTarget)}
            onKeyUp={(event) => syncSourceMention(event.currentTarget)}
            onKeyDown={(event) => {
              mentionListKeyDown(event, {
                open: Boolean(mention),
                matches,
                activeIndex,
                setActiveIndex,
                onPick: pickSourceMention,
                onClose: () => setMention(null),
              });
            }}
            onBlur={() => onBlur?.()}
          />
        )}
      </div>
    </div>
  );
}
