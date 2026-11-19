"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRadarProspectListAction } from "@/app/(app)/radar/actions";
import {
  Badge,
  Button,
  Dialog,
  Input,
  PageHeader,
  Panel,
} from "@/components/ui";
import type {
  RadarCompanyListItem,
  RadarProspectList,
} from "@/lib/radar/types";
import { ROUTES } from "@/lib/routes";

type Props = {
  interesting: RadarCompanyListItem[];
  lists: RadarProspectList[];
};

export function RadarProspectsClient({ interesting, lists }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Prospects"
        description="Companies marked interesting, plus shared lists for export."
      >
        <Button size="sm" onClick={() => setOpen(true)}>
          New list
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-heading-m text-text-primary">Interesting</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {interesting.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`${ROUTES.radarCompanies}/${c.id}`}
                    className="text-text-link"
                  >
                    {c.name}
                  </Link>
                  {c.is_demo ? <Badge variant="warning">Demo</Badge> : null}
                  {c.technologies[0] ? (
                    <span className="text-text-tertiary">{c.technologies[0]}</span>
                  ) : null}
                </li>
              ))}
              {interesting.length === 0 ? (
                <li className="text-text-secondary">
                  Mark companies as interesting from a company profile.
                </li>
              ) : null}
            </ul>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-heading-m text-text-primary">Lists</h2>
            <ul className="flex flex-col gap-3 text-sm">
              {lists.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-text-primary">{l.name}</div>
                    <div className="text-text-tertiary">
                      {l.member_count} companies
                    </div>
                  </div>
                  <a
                    className="text-text-link"
                    href={`/api/radar/prospect-lists/${l.id}/export`}
                  >
                    Export CSV
                  </a>
                </li>
              ))}
              {lists.length === 0 ? (
                <li className="text-text-secondary">No lists yet.</li>
              ) : null}
            </ul>
          </div>
        </Panel>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New prospect list"
        subtitle="Shared list for outreach prep and CSV export."
      >
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || pending}
              onClick={async () => {
                await createRadarProspectListAction({ name });
                setOpen(false);
                setName("");
                startTransition(() => router.refresh());
              }}
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
