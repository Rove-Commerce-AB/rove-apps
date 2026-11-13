"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileDown, Plus } from "lucide-react";
import {
  Button,
  DataTable,
  IconButton,
  PageHeader,
  type DataTableColumn,
} from "@/components/ui";
import {
  ListSearchInput,
  ListTableToolbar,
} from "@/components/ListTableToolbar";
import { ROUTES, travelExpenseDetailHref } from "@/lib/routes";
import { downloadTravelExpensePdf } from "@/lib/travelExpensePdf";
import type { TravelExpenseListItem } from "@/lib/travelExpenseTypes";
import { copyTravelExpense, getMyTravelExpense } from "./actions";

type Props = {
  items: TravelExpenseListItem[];
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

function formatUpdated(value: string): string {
  try {
    return new Date(value).toLocaleDateString("sv-SE");
  } catch {
    return value.slice(0, 10);
  }
}

export function TravelExpenseListClient({ items }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.destination} ${item.purpose}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  function handleCopy(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        const { id: newId } = await copyTravelExpense(id);
        router.push(travelExpenseDetailHref(newId));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not copy");
      }
    });
  }

  function handlePdf(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        const record = await getMyTravelExpense(id);
        if (!record) throw new Error("Not found");
        downloadTravelExpensePdf(record.formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create PDF");
      }
    });
  }

  const columns: DataTableColumn<TravelExpenseListItem>[] = [
    {
      id: "destination",
      header: "Destination",
      cell: (row) => row.destination || "Untitled trip",
    },
    {
      id: "purpose",
      header: "Purpose",
      secondary: true,
      cell: (row) => row.purpose || "—",
    },
    {
      id: "departure",
      header: "Departure",
      secondary: true,
      width: "7.5rem",
      cell: (row) => (
        <span className="tabular-nums">{formatDate(row.departureDate)}</span>
      ),
    },
    {
      id: "return",
      header: "Return",
      secondary: true,
      width: "7.5rem",
      cell: (row) => (
        <span className="tabular-nums">{formatDate(row.returnDate)}</span>
      ),
    },
    {
      id: "updated",
      header: "Updated",
      secondary: true,
      width: "7.5rem",
      cell: (row) => (
        <span className="tabular-nums">{formatUpdated(row.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      width: "5.5rem",
      cell: (row) => (
        <span
          className="inline-flex items-center justify-end gap-0.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <IconButton
            aria-label="Copy travel expense"
            title="Copy"
            disabled={isPending}
            onClick={() => handleCopy(row.id)}
          >
            <Copy className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Download PDF"
            title="Download PDF"
            disabled={isPending}
            onClick={() => handlePdf(row.id)}
          >
            <FileDown className="h-4 w-4" />
          </IconButton>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Travel expense"
        description="Create travel expense claims, save them, and download a PDF for payroll."
      >
        <Button asChild>
          <Link href={ROUTES.travelExpenseNew}>
            <Plus className="h-4 w-4" />
            New travel expense
          </Link>
        </Button>
      </PageHeader>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div>
        <ListTableToolbar
          leading={
            <ListSearchInput
              placeholder="Search destination or purpose"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search travel expenses"
            />
          }
        />
        <DataTable
          columns={columns}
          rows={filtered}
          getRowId={(row) => row.id}
          rowHref={(row) => travelExpenseDetailHref(row.id)}
          emptyState={{
            title: "No travel expenses yet",
            description: "Create your first travel expense claim.",
            actionLabel: "New travel expense",
            onAction: () => router.push(ROUTES.travelExpenseNew),
          }}
        />
      </div>
    </div>
  );
}
