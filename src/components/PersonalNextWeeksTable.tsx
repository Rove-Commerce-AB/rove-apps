"use client";

import Link from "next/link";
import {
  TimeGridColumnHighlightProvider,
  useTimeGridColumnHighlight,
  timeGridColumnCellInteractionProps,
} from "@/components/TimeGridColumnHighlight";
import { projectHref } from "@/lib/routes";

type RowKey = { projectId: string; roleId: string | null };
type RowInfo = { customerName: string; projectName: string; roleName: string };

export type PersonalNextWeeksTableProps = {
  weeks: { year: number; week: number }[];
  monthSpans: { label: string; colSpan: number }[];
  rowKeys: RowKey[];
  rowInfoMap: Map<string, RowInfo>;
  hoursMap: Map<string, number>;
  currentYear: number;
  currentWeek: number;
};

function keyStr(k: RowKey) {
  return `${k.projectId}\0${k.roleId ?? ""}`;
}

export function PersonalNextWeeksTable(props: PersonalNextWeeksTableProps) {
  return (
    <TimeGridColumnHighlightProvider>
      <PersonalNextWeeksTableInner {...props} />
    </TimeGridColumnHighlightProvider>
  );
}

function PersonalNextWeeksTableInner({
  weeks,
  monthSpans,
  rowKeys,
  rowInfoMap,
  hoursMap,
  currentYear,
  currentWeek,
}: PersonalNextWeeksTableProps) {
  const { highlightedColumnIndex, setHighlightedColumnIndex } =
    useTimeGridColumnHighlight();

  const isCurrentWeek = (w: { year: number; week: number }) =>
    w.year === currentYear && w.week === currentWeek;

  return (
    <div className="allocation-tables overflow-x-auto p-2 pt-0">
      <table className="w-full min-w-0 table-fixed border border-form text-[10px]">
        <colgroup>
          <col style={{ width: 280 }} />
          {weeks.map((w) => (
            <col key={`${w.year}-${w.week}`} className="w-[1.75rem]" />
          ))}
          <col className="w-14" />
        </colgroup>
        <thead>
          <tr className="border-b border-grid-subtle">
            <th
              rowSpan={2}
              className="border-r border-grid-subtle px-2 py-1 text-left text-[10px] font-medium text-text-primary opacity-80"
              style={{ width: 280, maxWidth: 280, boxSizing: "border-box" }}
            >
              Customer · Project · Role
            </th>
            {monthSpans.map((span, i) => (
              <th
                key={i}
                colSpan={span.colSpan}
                title={span.label}
                className="overflow-hidden border-r border-grid-subtle px-0.5 py-1 text-center text-[10px] font-medium uppercase tracking-wide text-text-primary opacity-60"
              >
                <span className="block truncate">{span.label}</span>
              </th>
            ))}
            <th
              rowSpan={2}
              className="border-r border-grid-subtle px-1 py-1 text-center text-[10px] font-medium text-text-primary opacity-80"
            >
              Sum
            </th>
          </tr>
          <tr className="border-b border-grid-subtle">
            {weeks.map((w, wi) => (
              <th
                key={`${w.year}-${w.week}`}
                className={`border-r border-grid-subtle px-0.5 py-1 text-center text-[10px] font-medium text-text-primary opacity-80 ${
                  isCurrentWeek(w)
                    ? "current-week-header bg-brand-signal/20 border-l border-r"
                    : ""
                } ${highlightedColumnIndex === wi ? "time-grid-header-column-active" : ""}`}
              >
                v{w.week}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((key) => {
            const info = rowInfoMap.get(keyStr(key))!;
            let rowTotal = 0;
            return (
              <tr
                key={keyStr(key)}
                className="border-b border-grid-light-subtle last:border-form bg-bg-default"
              >
                <td className="border-r border-grid-light-subtle px-2 py-1.5 align-top text-left text-[10px] text-text-primary">
                  <span className="opacity-90">{info.customerName}</span>
                  <span className="mx-1.5 opacity-50">·</span>
                  <Link
                    href={projectHref(key.projectId)}
                    prefetch={false}
                    className="font-medium text-text-primary hover:underline"
                  >
                    {info.projectName}
                  </Link>
                  {info.roleName !== "—" && (
                    <>
                      <span className="mx-1.5 opacity-50">·</span>
                      <span className="opacity-80">{info.roleName}</span>
                    </>
                  )}
                </td>
                {weeks.map((w, wi) => {
                  const h =
                    hoursMap.get(`${keyStr(key)}\0${w.year}\0${w.week}`) ?? 0;
                  rowTotal += h;
                  return (
                    <td
                      key={`${w.year}-${w.week}`}
                      {...timeGridColumnCellInteractionProps(
                        wi,
                        setHighlightedColumnIndex
                      )}
                      className={`border-r border-grid-light-subtle px-1 py-1 text-center text-[10px] tabular-nums text-text-primary ${
                        isCurrentWeek(w) ? "current-week-cell border-l border-r" : ""
                      }`}
                    >
                      {h > 0 ? `${h}h` : "—"}
                    </td>
                  );
                })}
                <td className="border-r border-grid-light-subtle px-1 py-1 text-right text-[10px] tabular-nums font-medium text-text-primary">
                  {rowTotal > 0 ? `${rowTotal}h` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
