"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EmptyState } from "./EmptyState";

const tableBorder = "border-border-subtle";

/** Compact density: tight rows for operational grids (Notion-like lists). */
const compact = {
  header: "px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary",
  // max-w-0 + overflow-hidden: truncate fills the col width under table-fixed.
  cell: `max-w-0 overflow-hidden px-2 py-1 text-[13px] text-text-primary border-b ${tableBorder}`,
  cellPrimary: `max-w-0 overflow-hidden px-2 py-1 text-[13px] font-medium text-text-primary border-b ${tableBorder}`,
  cellSecondary: `max-w-0 overflow-hidden px-2 py-1 text-[13px] text-text-secondary border-b ${tableBorder}`,
  row: "last:[&>td]:border-b-0 hover:bg-bg-muted/40",
  headerRow: `border-b ${tableBorder}`,
  emptyCell: "px-2 py-2 text-center text-[13px] text-text-primary opacity-60",
} as const;

/** Comfortable density: default for overview lists (Figma). */
const comfortable = {
  header: "h-10 px-3 align-middle text-heading-xs text-text-primary first:rounded-tl-lg last:rounded-tr-lg",
  cell: "px-3 py-2 text-body-l text-text-primary border-b border-border-default",
  cellPrimary: "px-3 py-2 text-label-l text-text-primary border-b border-border-default",
  cellSecondary: "px-3 py-2 text-body-l text-text-secondary border-b border-border-default",
  row: "last:[&>td]:border-b-0",
  headerRow: "bg-table-header",
  emptyCell: "px-3 py-4 text-center text-body-l text-text-secondary",
} as const;

export type Density = "compact" | "comfortable";

export type DataTableColumn<T> = {
  id: string;
  /** Header content (string or ReactNode for custom sort controls). */
  header: React.ReactNode;
  /** Left, right, or center. Default left for identity columns; use right for numeric/time/actions. */
  align?: "left" | "right" | "center";
  /** Cell renderer. Return ReactNode; use secondary style (opacity) for metadata. */
  cell: (row: T) => React.ReactNode;
  /** Optional width (e.g. "4rem" for actions column). */
  width?: string;
  /** If true, cell uses secondary (de-emphasized) styling. */
  secondary?: boolean;
  /** If true, header is a sort control when `sort` is passed. */
  sortable?: boolean;
};

export type DataTableSort = {
  columnId: string;
  direction: "asc" | "desc";
  onSort: (columnId: string) => void;
};

export type EmptyStateConfig = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** If provided, row is a link (use with or without onRowClick). */
  rowHref?: (row: T) => string | undefined;
  /** If provided and rowHref not set, row is clickable. */
  onRowClick?: (row: T) => void;
  emptyState?: EmptyStateConfig;
  loading?: boolean;
  /** Default "comfortable" for overview lists. Use "compact" for dense grids. */
  density?: Density;
  /** Default true when used inside a scrollable panel. */
  stickyHeader?: boolean;
  /** If set, that row uses the nav-active surface (e.g. overlay detail is open). */
  selectedRowId?: string;
  /** Optional header sort. Page owns the data order; the table only renders the control. */
  sort?: DataTableSort;
  /** Extra classes for a row (e.g. dim inactive rows). */
  getRowClassName?: (row: T) => string | undefined;
  /** Rendered under the table, inside the same card (e.g. Show inactive). */
  footer?: React.ReactNode;
  className?: string;
};

function SkeletonRow({ colCount, density }: { colCount: number; density: Density }) {
  const styles = density === "compact" ? compact : comfortable;
  return (
    <tr className={styles.row}>
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} className={i === 0 ? styles.cell : styles.cellSecondary}>
          <span className="inline-block h-4 w-24 animate-pulse rounded bg-bg-muted" aria-hidden />
        </td>
      ))}
    </tr>
  );
}

function HeaderLabel({
  column,
  sort,
  className,
}: {
  column: DataTableColumn<unknown>;
  sort?: DataTableSort;
  className: string;
}) {
  const align =
    column.align === "right"
      ? "text-right"
      : column.align === "center"
        ? "text-center"
        : "text-left";

  if (!column.sortable || !sort) {
    return <th className={`${className} ${align}`}>{column.header}</th>;
  }

  const isSorted = sort.columnId === column.id;
  const ariaSort = isSorted ? (sort.direction === "asc" ? "ascending" : "descending") : "none";

  return (
    <th className={`${className} ${align}`} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => sort.onSort(column.id)}
        className="inline-flex h-full cursor-pointer items-center gap-2 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-inset"
      >
        {column.header}
        {isSorted ? (
          sort.direction === "asc" ? (
            <ChevronUp className="h-4 w-4 text-text-secondary" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-secondary" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  rowHref,
  onRowClick,
  emptyState,
  loading = false,
  density = "comfortable",
  stickyHeader = true,
  selectedRowId,
  sort,
  getRowClassName,
  footer,
  className = "",
}: DataTableProps<T>) {
  const router = useRouter();
  const styles = density === "compact" ? compact : comfortable;
  const handleRowClick =
    onRowClick ?? (rowHref ? (row: T) => router.push(rowHref(row) ?? "#") : undefined);
  const isInteractive = Boolean(handleRowClick);

  if (!loading && rows.length === 0 && emptyState) {
    return (
      <EmptyState
        title={emptyState.title}
        description={emptyState.description}
        actionLabel={emptyState.actionLabel}
        onAction={emptyState.onAction}
      />
    );
  }

  return (
    <div
      className={
        density === "comfortable"
          ? `bg-bg-default shadow-primary ${footer ? "rounded-lg" : "rounded-t-lg"}`
          : undefined
      }
    >
      <div
        className={
          density === "comfortable"
            ? "overflow-x-auto overflow-y-clip rounded-t-lg"
            : "overflow-x-auto overflow-y-clip"
        }
      >
      <table className={`w-full min-w-[200px] border-separate border-spacing-0 text-sm ${className}`.trim()}>
        <colgroup>
          {columns.map((col) => (
            <col key={col.id} style={col.width ? { width: col.width } : undefined} />
          ))}
        </colgroup>
        <thead
          className={[
            "bg-table-header",
            density === "comfortable" ? "rounded-t-lg" : "",
            stickyHeader ? "sticky top-0 z-10" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <tr className={styles.headerRow}>
            {columns.map((col) => (
              <HeaderLabel
                key={col.id}
                column={col as DataTableColumn<unknown>}
                sort={sort}
                className={styles.header}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} colCount={columns.length} density={density} />
            ))
          ) : rows.length === 0 ? (
            footer ? null : (
            <tr>
              <td colSpan={columns.length} className={styles.emptyCell}>
                No data
              </td>
            </tr>
            )
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              const content = (
                <>
                  {columns.map((col, index) => {
                    const typeClass =
                      index === 0
                        ? styles.cellPrimary
                        : col.secondary
                          ? styles.cellSecondary
                          : styles.cell;
                    const alignClass =
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : "text-left";
                    return (
                    <td
                      key={col.id}
                      className={`${typeClass} ${alignClass}`}
                    >
                      {col.cell(row)}
                    </td>
                    );
                  })}
                </>
              );

              if (isInteractive && handleRowClick) {
                return (
                  <tr
                    key={id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(row);
                      }
                    }}
                    className={`${styles.row} cursor-pointer transition-colors hover:bg-interactive-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-inset ${
                      selectedRowId === id ? "bg-nav-active" : ""
                    } ${getRowClassName?.(row) ?? ""}`.trim()}
                  >
                    {content}
                  </tr>
                );
              }

              return (
                <tr
                  key={id}
                  className={`${styles.row} ${getRowClassName?.(row) ?? ""}`.trim()}
                >
                  {content}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
      {footer}
    </div>
  );
}
