"use client";

import { Dialog } from "@/components/ui";
import { WorkMarkdown } from "@/components/WorkMarkdown";
import {
  resolveProcessStepTitle,
  workProcessHasContent,
  type WorkProcess,
} from "@/lib/workProcess";
import type { WorkBoardStatus } from "@/lib/workStatuses";

export function WorkProcessPanel({
  open,
  onOpenChange,
  process,
  statuses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  process: WorkProcess;
  statuses: WorkBoardStatus[];
}) {
  if (!workProcessHasContent(process)) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Board process"
      subtitle="How we work on this board"
      contentClassName="max-w-[560px] max-h-[min(90vh,840px)] overflow-y-auto"
    >
      <div className="modal-form-discreet mt-4 space-y-5">
        {process.steps.length > 0 ? (
          <ol className="relative flex flex-col">
            {process.steps.map((step, index) => {
              const title = resolveProcessStepTitle(step, statuses);
              const isLast = index === process.steps.length - 1;
              return (
                <li
                  key={`${step.statusId ?? step.title}-${index}`}
                  className="relative flex gap-3 pb-5 last:pb-0"
                >
                  {!isLast ? (
                    <span
                      className="absolute left-[15px] top-8 bottom-0 w-px bg-border-subtle"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-bg-default text-label-s text-text-tertiary"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <h3 className="text-sm font-medium text-text-primary">
                      {title}
                    </h3>
                    {step.body.trim() ? (
                      <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                        {step.body.trim()}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}

        {process.notesMd.trim() ? (
          <section className="space-y-2">
            {process.steps.length > 0 ? (
              <h3 className="text-sm font-medium text-text-primary">Notes</h3>
            ) : null}
            <WorkMarkdown className="text-sm text-text-secondary">
              {process.notesMd}
            </WorkMarkdown>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
