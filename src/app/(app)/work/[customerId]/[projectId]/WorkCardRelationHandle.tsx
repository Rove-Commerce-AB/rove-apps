"use client";

import type { DragEvent } from "react";
import { Link2 } from "lucide-react";

export const WORK_RELATION_DRAG_MIME = "application/x-work-issue-relation";

export function isWorkRelationDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(WORK_RELATION_DRAG_MIME);
}

type Props = {
  issueId: string;
  hasRelations: boolean;
  active?: boolean;
  onHoverChange: (hovering: boolean) => void;
  onRelationDragStart: (issueId: string, event: DragEvent) => void;
  onRelationDragEnd: () => void;
};

/**
 * Right-edge link handle: hover reveals related lines; drag creates Relates.
 */
export function WorkCardRelationHandle({
  issueId,
  hasRelations,
  active = false,
  onHoverChange,
  onRelationDragStart,
  onRelationDragEnd,
}: Props) {
  return (
    <button
      type="button"
      draggable
      data-work-relation-handle
      aria-label={
        hasRelations
          ? "Linked issues — drag to another card to relate"
          : "Drag to another card to create a relation"
      }
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData(WORK_RELATION_DRAG_MIME, issueId);
        event.dataTransfer.effectAllowed = "link";
        // Empty drag image so the rubber-band line is the affordance.
        const blank = document.createElement("div");
        blank.style.width = "1px";
        blank.style.height = "1px";
        blank.style.opacity = "0";
        document.body.appendChild(blank);
        event.dataTransfer.setDragImage(blank, 0, 0);
        window.setTimeout(() => blank.remove(), 0);
        onRelationDragStart(issueId, event);
      }}
      onDragEnd={(event) => {
        event.stopPropagation();
        onRelationDragEnd();
      }}
      className={[
        "absolute top-1/2 right-1 z-20 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-border-subtle bg-bg-default text-text-secondary shadow-sm transition",
        "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100",
        active
          ? "opacity-100 border-brand-signal text-brand-signal"
          : "hover:border-brand-signal hover:text-brand-signal",
        hasRelations ? "text-text-primary" : "",
      ].join(" ")}
    >
      <Link2 className="h-3 w-3" aria-hidden />
    </button>
  );
}
