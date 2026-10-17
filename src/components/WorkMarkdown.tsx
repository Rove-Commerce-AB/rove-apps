"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { workMarkdownUrlTransform } from "@/lib/workMarkdown";

const ALLOWED_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "code",
  "pre",
  "hr",
  "input",
] as const;

const components: Components = {
  a: ({ href, children, ...props }) => (
    <a
      {...props}
      href={href}
      target={href?.startsWith("/") ? undefined : "_blank"}
      rel={href?.startsWith("/") ? undefined : "noopener noreferrer"}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
  input: ({ type, checked, ...props }) => {
    if (type !== "checkbox") return null;
    return (
      <input
        {...props}
        type="checkbox"
        checked={Boolean(checked)}
        disabled
        readOnly
        tabIndex={-1}
        aria-hidden
      />
    );
  },
};

export function WorkMarkdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  if (!children.trim()) return null;
  return (
    <div className={`work-markdown ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        allowedElements={[...ALLOWED_ELEMENTS]}
        unwrapDisallowed
        urlTransform={workMarkdownUrlTransform}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
