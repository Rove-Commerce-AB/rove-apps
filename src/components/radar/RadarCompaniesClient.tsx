"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, Group, Loader2, Square } from "lucide-react";
import {
  addRadarDomainAction,
  clearRadarProspectAction,
  clearRadarProspectsAction,
  deleteRadarDomainAction,
  guessDomainForSearchHitAction,
  scanRadarCompanyAction,
  setRadarProspectStatusAction,
  setRadarProspectsStatusAction,
} from "@/app/(app)/radar/actions";
import { ListFilterMenu } from "@/components/ListFilterMenu";
import {
  ListSearchInput,
  ListTableToolbar,
} from "@/components/ListTableToolbar";
import {
  Badge,
  DataTable,
  PageHeader,
  RemovableFilterChip,
  type DataTableColumn,
} from "@/components/ui";
import { formatOrganizationNumber } from "@/lib/radar/orgNumber";
import {
  formatAnstallningsklassRange,
  formatOmsattningsklassRange,
  stripOmsattningsklassKodPrefix,
} from "@/lib/radar/scb/omsattningsklasser";
import { formatSniDisplay } from "@/lib/radar/sniSections";
import { compareTextSv } from "@/lib/sort";
import type {
  RadarAudience,
  RadarCompanyListItem,
  RadarProspectStatus,
} from "@/lib/radar/types";
import { ROUTES } from "@/lib/routes";

type Props = {
  companies: RadarCompanyListItem[];
  audiences: RadarAudience[];
};

type GroupBy = "none" | "county" | "sni" | "turnover" | "audience" | "prospect";
type SortKey =
  | "name"
  | "county"
  | "sni"
  | "turnover"
  | "employees"
  | "domain"
  | "technology"
  | "prospect";

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: "none", label: "No grouping" },
  { id: "county", label: "County" },
  { id: "sni", label: "SNI" },
  { id: "turnover", label: "Turnover" },
  { id: "audience", label: "Target group" },
  { id: "prospect", label: "Prospect" },
];

function turnoverLabel(company: RadarCompanyListItem): string {
  if (company.oms_kl != null) {
    return formatOmsattningsklassRange(company.oms_kl);
  }
  if (company.oms_kl_label) {
    return stripOmsattningsklassKodPrefix(company.oms_kl_label);
  }
  return "Unknown";
}

function employeesLabel(company: RadarCompanyListItem): string | null {
  if (company.anst_kl != null) {
    return formatAnstallningsklassRange(company.anst_kl);
  }
  if (company.anst_kl_label?.trim()) return company.anst_kl_label.trim();
  if (company.employee_count != null) {
    return company.employee_count.toLocaleString("en-US");
  }
  return null;
}

function groupKeyFor(
  company: RadarCompanyListItem,
  groupBy: GroupBy
): string {
  switch (groupBy) {
    case "county":
      return company.county?.trim() || "No county";
    case "sni":
      return company.sni_code?.trim() || "unknown";
    case "turnover":
      return company.oms_kl != null ? String(company.oms_kl) : "unknown";
    case "audience":
      return company.audience_names[0] ?? "No target group";
    case "prospect":
      return company.prospect_status ?? "none";
    default:
      return "all";
  }
}

function groupTitleFor(
  company: RadarCompanyListItem,
  groupBy: GroupBy,
  key: string
): string {
  switch (groupBy) {
    case "county":
      return key;
    case "sni": {
      if (key === "unknown") return "No SNI";
      const { code, label } = formatSniDisplay(company);
      if (code && label) return `${code} – ${label}`;
      return code ?? key;
    }
    case "turnover":
      return key === "unknown"
        ? "Unknown turnover"
        : formatOmsattningsklassRange(Number(key));
    case "audience":
      return key;
    case "prospect":
      if (key === "none") return "No prospect status";
      return key;
    default:
      return "All companies";
  }
}

function DomainCell({
  company,
  hostname,
  onSaved,
}: {
  company: RadarCompanyListItem;
  hostname: string | null;
  onSaved: (hostname: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(hostname ?? "");
  const [pending, setPending] = useState(false);
  const [guessing, setGuessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = pending || guessing;

  useEffect(() => {
    if (!editing) setValue(hostname ?? "");
  }, [hostname, editing]);

  useEffect(() => {
    if (!editing) return;
    // preventScroll: avoid the page jumping when the input is focused.
    inputRef.current?.focus({ preventScroll: true });
  }, [editing]);

  async function save(next: string, source: "manual" | "lookup") {
    const trimmed = next.trim();
    // Empty save clears an existing domain; ignore empty save when adding new.
    if (!trimmed && !hostname) return;
    setPending(true);
    setError(null);
    try {
      if (!trimmed) {
        await deleteRadarDomainAction({
          companyId: company.id,
          hostname,
        });
        onSaved(null);
        setValue("");
        setEditing(false);
        return;
      }
      const domain = await addRadarDomainAction({
        companyId: company.id,
        hostname: trimmed,
        isPrimary: true,
        source,
      });
      onSaved(domain.hostname);
      setValue(domain.hostname);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function guess() {
    setGuessing(true);
    setError(null);
    try {
      const result = await guessDomainForSearchHitAction({
        name: company.name,
        organization_number: company.organization_number,
      });
      if (!result.hostname) {
        setError("No domain found");
        setEditing(false);
        return;
      }
      await save(result.hostname, "lookup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guess failed");
      setEditing(false);
    } finally {
      setGuessing(false);
    }
  }

  if (!editing) {
    return (
      <div
        className="flex h-6 min-w-0 items-center gap-1"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {hostname ? (
          <>
            <button
              type="button"
              className="min-w-0 truncate text-left text-[13px] text-text-link hover:underline"
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
              title="Edit domain"
            >
              {hostname}
            </button>
            <a
              href={`https://${hostname}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-text-tertiary hover:text-text-primary"
              aria-label={`Open ${hostname}`}
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </>
        ) : guessing ? (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] text-text-tertiary"
            aria-busy="true"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Guessing…
          </span>
        ) : (
          <>
            <button
              type="button"
              className="text-[13px] text-text-tertiary hover:text-text-primary"
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
            >
              Add
            </button>
            <span className="text-text-tertiary" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="text-[13px] text-text-tertiary hover:text-text-primary disabled:opacity-50"
              disabled={busy}
              title={
                error
                  ? `${error} — click to try again`
                  : "Guess domain from company name"
              }
              aria-label={
                error ? `No domain found. Try guess again` : "Guess domain"
              }
              onClick={() => void guess()}
            >
              Guess
            </button>
            {error ? (
              <span
                className="truncate text-[12px] text-danger"
                title={error}
                role="status"
              >
                Not found
              </span>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex h-6 min-w-0 items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={busy}
        placeholder="example.com"
        aria-label={`Domain for ${company.name}`}
        title={error ?? undefined}
        className={`h-6 min-w-0 flex-1 rounded border bg-bg-default px-1.5 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-strong ${
          error ? "border-danger" : "border-border-subtle"
        }`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save(value, "manual");
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
            setError(null);
            setValue(hostname ?? "");
          }
        }}
        onBlur={() => {
          if (busy || error) return;
          // Collapse only when nothing changed (empty add, or same hostname).
          const trimmed = value.trim();
          const unchanged =
            trimmed === (hostname ?? "") || (!trimmed && !hostname);
          if (unchanged) {
            setEditing(false);
            setValue(hostname ?? "");
          }
        }}
      />
      <button
        type="button"
        className="shrink-0 text-[12px] text-text-tertiary hover:text-text-primary disabled:opacity-50"
        disabled={
          busy ||
          (value.trim() === (hostname ?? "") && Boolean(hostname)) ||
          (!value.trim() && !hostname)
        }
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void save(value, "manual")}
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 text-[12px] text-text-tertiary hover:text-text-primary disabled:opacity-50"
        disabled={busy}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void guess()}
      >
        {guessing ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          "Guess"
        )}
      </button>
    </div>
  );
}

function TechCell({
  companyId,
  hostname,
  technologies,
  onScanned,
}: {
  companyId: string;
  hostname: string | null;
  technologies: string[];
  onScanned: (technologies: string[]) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function scan() {
    if (!hostname || scanning) return;
    setScanning(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await scanRadarCompanyAction(companyId);
      onScanned(result.technologies);
      if (result.scan_status === "failed") {
        setError("Scan failed");
      } else if (result.technologies.length === 0) {
        setNotFound(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div
      className="flex h-6 min-w-0 items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {scanning ? (
        <span
          className="inline-flex items-center gap-1.5 text-[13px] text-text-tertiary"
          aria-busy="true"
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Scanning…
        </span>
      ) : technologies.length > 0 ? (
        <>
          <span
            className="min-w-0 truncate text-[13px]"
            title={technologies.join(", ")}
          >
            {technologies.join(", ")}
          </span>
          {hostname ? (
            <button
              type="button"
              className="shrink-0 text-[12px] text-text-tertiary hover:text-text-primary"
              title="Scan technology again"
              onClick={() => void scan()}
            >
              Scan
            </button>
          ) : null}
        </>
      ) : !hostname ? (
        <span className="text-[13px] text-text-tertiary">—</span>
      ) : (
        <>
          <button
            type="button"
            className="text-[13px] text-text-tertiary hover:text-text-primary"
            title={
              error
                ? `${error} — click to try again`
                : "Scan website for technology"
            }
            aria-label={
              error ? "Scan failed. Try again" : "Scan technology"
            }
            onClick={() => void scan()}
          >
            Scan
          </button>
          {error ? (
            <span
              className="truncate text-[12px] text-danger"
              title={error}
              role="status"
            >
              Failed
            </span>
          ) : notFound ? (
            <span
              className="truncate text-[12px] text-text-tertiary"
              role="status"
            >
              Not found
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

function ProspectCell({
  companyId,
  status,
  onChanged,
}: {
  companyId: string;
  status: RadarProspectStatus | null;
  onChanged: (status: RadarProspectStatus | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const interesting = status === "interesting";

  async function toggle() {
    if (pending) return;
    setPending(true);
    const previous = status;
    const next = interesting ? null : "interesting";
    onChanged(next);
    try {
      if (next === "interesting") {
        await setRadarProspectStatusAction({
          companyId,
          status: "interesting",
        });
      } else {
        await clearRadarProspectAction(companyId);
      }
    } catch {
      onChanged(previous);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="flex h-6 items-center"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`inline-flex h-5 w-5 items-center justify-center rounded disabled:opacity-50 ${
          interesting
            ? "text-status-success hover:opacity-80"
            : "text-text-tertiary hover:text-text-secondary"
        }`}
        disabled={pending}
        aria-pressed={interesting}
        aria-label={
          interesting ? "Clear interesting" : "Mark interesting"
        }
        title={interesting ? "Interesting — click to clear" : "Mark interesting"}
        onClick={() => void toggle()}
      >
        {interesting ? (
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        ) : (
          <Square className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
}

function GroupByControl({
  groupBy,
  onChange,
}: {
  groupBy: GroupBy;
  onChange: (value: GroupBy) => void;
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const active = groupBy !== "none";
  const label =
    GROUP_OPTIONS.find((o) => o.id === groupBy)?.label ?? "Group";

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-radar-group-menu]")) return;
      setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  return (
    <>
      <button
        type="button"
        data-radar-group-menu
        aria-label="Group companies"
        aria-expanded={menu != null}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors ${
          active
            ? "bg-accent-primary-subtle text-accent-primary-text"
            : "text-text-secondary hover:bg-bg-muted hover:text-text-primary"
        }`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({
            top: rect.bottom + 4,
            left: Math.min(rect.right - 224, window.innerWidth - 232),
          });
        }}
      >
        <Group className="h-3.5 w-3.5" aria-hidden />
        <span className="max-w-28 truncate">
          {groupBy === "none" ? "Group" : label}
        </span>
      </button>
      {menu
        ? createPortal(
            <div
              data-radar-group-menu
              role="menu"
              className="fixed z-50 w-56 overflow-hidden rounded-md border border-border-subtle bg-bg-default py-1 shadow-lg"
              style={{ top: menu.top, left: menu.left }}
            >
              {GROUP_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={groupBy === option.id}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-text-primary hover:bg-bg-muted"
                  onClick={() => {
                    onChange(option.id);
                    setMenu(null);
                  }}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 ${
                      groupBy === option.id
                        ? "text-text-primary"
                        : "text-transparent"
                    }`}
                    aria-hidden
                  />
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function RadarCompaniesClient({ companies, audiences }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [audienceFilterIds, setAudienceFilterIds] = useState<string[]>([]);
  const [sniFilterIds, setSniFilterIds] = useState<string[]>([]);
  const [countyFilterIds, setCountyFilterIds] = useState<string[]>([]);
  const [turnoverFilterIds, setTurnoverFilterIds] = useState<string[]>([]);
  const [customerFilterIds, setCustomerFilterIds] = useState<string[]>([]);
  const [prospectFilterIds, setProspectFilterIds] = useState<string[]>([]);
  const [techFilterIds, setTechFilterIds] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [domainOverrides, setDomainOverrides] = useState<
    Record<string, string | null>
  >({});
  const [techOverrides, setTechOverrides] = useState<Record<string, string[]>>(
    {}
  );
  const [prospectOverrides, setProspectOverrides] = useState<
    Record<string, RadarProspectStatus | null>
  >({});
  const [markingInteresting, setMarkingInteresting] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      companies.map((c) => ({
        ...c,
        primary_hostname:
          c.id in domainOverrides
            ? domainOverrides[c.id]
            : c.primary_hostname,
        technologies:
          c.id in techOverrides ? techOverrides[c.id] : c.technologies,
        prospect_status:
          c.id in prospectOverrides
            ? prospectOverrides[c.id]
            : c.prospect_status,
      })),
    [companies, domainOverrides, techOverrides, prospectOverrides]
  );

  const sniOptions = useMemo(() => {
    const byCode = new Map<string, { name: string; description?: string }>();
    for (const c of rows) {
      const { code, label } = formatSniDisplay(c);
      if (!code || byCode.has(code)) continue;
      byCode.set(code, {
        name: code,
        ...(label ? { description: label } : {}),
      });
    }
    return [...byCode.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "sv"))
      .map(([id, option]) => ({ id, ...option }));
  }, [rows]);

  const countyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of rows) {
      if (c.county?.trim()) set.add(c.county.trim());
    }
    return [...set]
      .sort(compareTextSv)
      .map((name) => ({ id: name, name }));
  }, [rows]);

  const turnoverOptions = useMemo(() => {
    const set = new Set<number>();
    for (const c of rows) {
      if (c.oms_kl != null) set.add(c.oms_kl);
    }
    return [...set]
      .sort((a, b) => a - b)
      .map((kod) => ({
        id: String(kod),
        name: formatOmsattningsklassRange(kod),
      }));
  }, [rows]);

  const techOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of rows) {
      for (const tech of c.technologies) {
        if (tech.trim()) set.add(tech.trim());
      }
    }
    return [...set]
      .sort(compareTextSv)
      .map((name) => ({ id: name, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const audienceNames = new Set(
      audienceFilterIds
        .map((id) => audiences.find((a) => a.id === id)?.name)
        .filter(Boolean) as string[]
    );

    return rows.filter((c) => {
      if (needle) {
        const orgDigits = needle.replace(/\D/g, "");
        const nameHit = c.name.toLowerCase().includes(needle);
        // "".includes("") is true in JS — only match org when digits were typed.
        const orgHit =
          orgDigits.length > 0 &&
          c.organization_number.includes(orgDigits);
        const sniHit =
          (c.sni_code ?? "").toLowerCase().includes(needle) ||
          (c.sni_description ?? "").toLowerCase().includes(needle);
        const domainHit = (c.primary_hostname ?? "")
          .toLowerCase()
          .includes(needle);
        const techHit = c.technologies.some((t) =>
          t.toLowerCase().includes(needle)
        );
        if (!nameHit && !orgHit && !sniHit && !domainHit && !techHit) {
          return false;
        }
      }
      if (audienceNames.size > 0) {
        if (!c.audience_names.some((n) => audienceNames.has(n))) return false;
      }
      if (sniFilterIds.length > 0) {
        if (!c.sni_code || !sniFilterIds.includes(c.sni_code)) return false;
      }
      if (countyFilterIds.length > 0) {
        if (!c.county || !countyFilterIds.includes(c.county)) return false;
      }
      if (turnoverFilterIds.length > 0) {
        if (c.oms_kl == null || !turnoverFilterIds.includes(String(c.oms_kl))) {
          return false;
        }
      }
      if (customerFilterIds.length > 0) {
        const isCustomer = Boolean(c.matched_customer_id);
        const wantYes = customerFilterIds.includes("yes");
        const wantNo = customerFilterIds.includes("no");
        if (wantYes && wantNo) {
          /* both = all */
        } else if (wantYes && !isCustomer) return false;
        else if (wantNo && isCustomer) return false;
      }
      if (prospectFilterIds.length > 0) {
        const status = c.prospect_status ?? "none";
        if (!prospectFilterIds.includes(status)) return false;
      }
      if (techFilterIds.length > 0) {
        if (!c.technologies.some((t) => techFilterIds.includes(t))) {
          return false;
        }
      }
      return true;
    });
  }, [
    rows,
    search,
    audienceFilterIds,
    audiences,
    sniFilterIds,
    countyFilterIds,
    turnoverFilterIds,
    customerFilterIds,
    prospectFilterIds,
    techFilterIds,
  ]);

  const sorted = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "county":
          cmp = compareTextSv(a.county ?? "", b.county ?? "");
          break;
        case "sni":
          cmp = compareTextSv(a.sni_code ?? "", b.sni_code ?? "");
          break;
        case "turnover":
          cmp = (a.oms_kl ?? -1) - (b.oms_kl ?? -1);
          break;
        case "employees":
          cmp = (a.anst_kl ?? -1) - (b.anst_kl ?? -1);
          break;
        case "domain":
          cmp = compareTextSv(a.primary_hostname ?? "", b.primary_hostname ?? "");
          break;
        case "technology":
          cmp = compareTextSv(
            a.technologies.join(", "),
            b.technologies.join(", ")
          );
          break;
        case "prospect":
          cmp = compareTextSv(a.prospect_status ?? "", b.prospect_status ?? "");
          break;
        default:
          cmp = compareTextSv(a.name, b.name);
      }
      return direction * cmp || compareTextSv(a.name, b.name);
    });
  }, [filtered, sortKey, sortDirection]);

  const groups = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", title: "All companies", rows: sorted }];
    }
    const map = new Map<string, { title: string; rows: RadarCompanyListItem[] }>();
    for (const company of sorted) {
      const key = groupKeyFor(company, groupBy);
      const existing = map.get(key);
      if (existing) {
        existing.rows.push(company);
      } else {
        map.set(key, {
          title: groupTitleFor(company, groupBy, key),
          rows: [company],
        });
      }
    }
    return [...map.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => compareTextSv(a.title, b.title));
  }, [sorted, groupBy]);

  const filterChips = useMemo(() => {
    const chips: ReactNode[] = [];

    for (const id of audienceFilterIds) {
      const audience = audiences.find((a) => a.id === id);
      if (!audience) continue;
      chips.push(
        <RemovableFilterChip
          key={`audience-${id}`}
          prefix="Target group"
          label={audience.name}
          onRemove={() =>
            setAudienceFilterIds((prev) => prev.filter((x) => x !== id))
          }
        />
      );
    }

    for (const id of sniFilterIds) {
      const option = sniOptions.find((o) => o.id === id);
      chips.push(
        <RemovableFilterChip
          key={`sni-${id}`}
          prefix="SNI"
          label={option?.name ?? id}
          onRemove={() =>
            setSniFilterIds((prev) => prev.filter((x) => x !== id))
          }
        />
      );
    }

    for (const id of countyFilterIds) {
      chips.push(
        <RemovableFilterChip
          key={`county-${id}`}
          prefix="County"
          label={id}
          onRemove={() =>
            setCountyFilterIds((prev) => prev.filter((x) => x !== id))
          }
        />
      );
    }

    for (const id of turnoverFilterIds) {
      const option = turnoverOptions.find((o) => o.id === id);
      chips.push(
        <RemovableFilterChip
          key={`turnover-${id}`}
          prefix="Turnover"
          label={option?.name ?? id}
          onRemove={() =>
            setTurnoverFilterIds((prev) => prev.filter((x) => x !== id))
          }
        />
      );
    }

    for (const id of customerFilterIds) {
      chips.push(
        <RemovableFilterChip
          key={`customer-${id}`}
          prefix="Customer"
          label={id === "yes" ? "Existing customer" : "New prospect"}
          onRemove={() =>
            setCustomerFilterIds((prev) => prev.filter((x) => x !== id))
          }
        />
      );
    }

    for (const id of prospectFilterIds) {
      const label =
        id === "interesting"
          ? "Interesting"
          : id === "irrelevant"
            ? "Irrelevant"
            : "No status";
      chips.push(
        <RemovableFilterChip
          key={`prospect-${id}`}
          prefix="Prospect"
          label={label}
          onRemove={() =>
            setProspectFilterIds((prev) => prev.filter((x) => x !== id))
          }
        />
      );
    }

    for (const id of techFilterIds) {
      chips.push(
        <RemovableFilterChip
          key={`tech-${id}`}
          prefix="Tech"
          label={id}
          onRemove={() =>
            setTechFilterIds((prev) => prev.filter((x) => x !== id))
          }
        />
      );
    }

    return chips;
  }, [
    audienceFilterIds,
    audiences,
    sniFilterIds,
    sniOptions,
    countyFilterIds,
    turnoverFilterIds,
    turnoverOptions,
    customerFilterIds,
    prospectFilterIds,
    techFilterIds,
  ]);

  const hasActiveFilter =
    Boolean(search.trim()) ||
    audienceFilterIds.length > 0 ||
    sniFilterIds.length > 0 ||
    countyFilterIds.length > 0 ||
    turnoverFilterIds.length > 0 ||
    customerFilterIds.length > 0 ||
    prospectFilterIds.length > 0 ||
    techFilterIds.length > 0;

  const filteredNotInteresting = useMemo(
    () => filtered.filter((c) => c.prospect_status !== "interesting"),
    [filtered]
  );

  const filteredAllInteresting =
    filtered.length > 0 && filteredNotInteresting.length === 0;

  async function toggleFilteredInteresting() {
    if (markingInteresting || filtered.length === 0) return;
    setMarkingInteresting(true);
    setBulkFeedback(null);
    try {
      if (filteredAllInteresting) {
        const ids = filtered.map((c) => c.id);
        await clearRadarProspectsAction(ids);
        setProspectOverrides((prev) => {
          const next = { ...prev };
          for (const id of ids) next[id] = null;
          return next;
        });
        setBulkFeedback(
          `Cleared interesting on ${ids.length.toLocaleString("en-US")} ${
            ids.length === 1 ? "company" : "companies"
          }.`
        );
      } else {
        const ids = filteredNotInteresting.map((c) => c.id);
        await setRadarProspectsStatusAction({
          companyIds: ids,
          status: "interesting",
        });
        setProspectOverrides((prev) => {
          const next = { ...prev };
          for (const id of ids) next[id] = "interesting";
          return next;
        });
        setBulkFeedback(
          `Marked ${ids.length.toLocaleString("en-US")} ${
            ids.length === 1 ? "company" : "companies"
          } as interesting.`
        );
      }
      router.refresh();
    } catch (err) {
      setBulkFeedback(
        err instanceof Error ? err.message : "Could not update interesting"
      );
    } finally {
      setMarkingInteresting(false);
    }
  }

  const columns: DataTableColumn<RadarCompanyListItem>[] = [
    {
      id: "name",
      header: "Company",
      sortable: true,
      width: "18%",
      cell: (c) => (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <Link
            href={`${ROUTES.radarCompanies}/${c.id}`}
            className="min-w-0 truncate text-[13px] font-medium text-text-link"
            onClick={(event) => event.stopPropagation()}
          >
            {c.name}
          </Link>
          <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">
            {formatOrganizationNumber(c.organization_number)}
          </span>
          {c.matched_customer_name ? (
            <Badge variant="success">Customer</Badge>
          ) : null}
          {c.is_demo ? <Badge variant="warning">Demo</Badge> : null}
        </span>
      ),
    },
    {
      id: "domain",
      header: "Domain",
      sortable: true,
      width: "12%",
      cell: (c) => (
        <DomainCell
          company={c}
          hostname={c.primary_hostname}
          onSaved={(hostname) => {
            setDomainOverrides((prev) => ({ ...prev, [c.id]: hostname }));
            if (!hostname) {
              setTechOverrides((prev) => ({ ...prev, [c.id]: [] }));
            }
            router.refresh();
          }}
        />
      ),
    },
    {
      id: "sni",
      header: "SNI",
      sortable: true,
      secondary: true,
      width: "22%",
      cell: (c) => {
        const { code, label } = formatSniDisplay(c);
        if (!code) return null;
        return (
          <span
            className="block truncate tabular-nums text-[13px]"
            title={label ? `${code} – ${label}` : code}
          >
            {code}
            {label ? (
              <span className="text-text-tertiary"> · {label}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "county",
      header: "County",
      sortable: true,
      secondary: true,
      width: "9%",
      cell: (c) =>
        c.county ? (
          <span className="truncate text-[13px]">{c.county}</span>
        ) : null,
    },
    {
      id: "employees",
      header: "Emp.",
      sortable: true,
      secondary: true,
      width: "7%",
      cell: (c) => {
        const label = employeesLabel(c);
        return label ? (
          <span className="tabular-nums text-[13px]">{label}</span>
        ) : null;
      },
    },
    {
      id: "turnover",
      header: "Turnover",
      sortable: true,
      secondary: true,
      width: "12%",
      cell: (c) =>
        c.oms_kl != null || c.oms_kl_label ? (
          <span className="truncate text-[13px]">{turnoverLabel(c)}</span>
        ) : null,
    },
    {
      id: "technology",
      header: "Tech",
      sortable: true,
      secondary: true,
      width: "10%",
      cell: (c) => (
        <TechCell
          companyId={c.id}
          hostname={c.primary_hostname}
          technologies={c.technologies}
          onScanned={(technologies) => {
            setTechOverrides((prev) => ({ ...prev, [c.id]: technologies }));
            router.refresh();
          }}
        />
      ),
    },
    {
      id: "prospect",
      header: hasActiveFilter ? (
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            className={`inline-flex h-5 w-5 items-center justify-center rounded disabled:opacity-50 ${
              filteredAllInteresting
                ? "text-status-success hover:opacity-80"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
            disabled={markingInteresting || filtered.length === 0}
            aria-pressed={filteredAllInteresting}
            aria-label={
              filteredAllInteresting
                ? "Clear interesting for filtered companies"
                : "Mark filtered companies interesting"
            }
            title={
              filteredAllInteresting
                ? "Clear interesting for all in this filter"
                : "Mark all in this filter as interesting"
            }
            onClick={(event) => {
              event.stopPropagation();
              void toggleFilteredInteresting();
            }}
          >
            {markingInteresting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : filteredAllInteresting ? (
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            ) : (
              <Square className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            )}
          </button>
          <span>Prospect</span>
        </span>
      ) : (
        "Prospect"
      ),
      sortable: !hasActiveFilter,
      secondary: true,
      width: "10%",
      cell: (c) => (
        <ProspectCell
          companyId={c.id}
          status={c.prospect_status}
          onChanged={(status) => {
            setProspectOverrides((prev) => ({ ...prev, [c.id]: status }));
            router.refresh();
          }}
        />
      ),
    },
  ];

  function handleSort(columnId: string) {
    const key = columnId as SortKey;
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Companies"
        description="Imported companies with domains, technologies, and Rove customer match."
      />

      <div>
        <ListTableToolbar
          leading={
            <ListSearchInput
              placeholder="Search name, org number, SNI…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search companies"
            />
          }
          trailing={
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
              {filterChips}
              <ListFilterMenu
                ariaLabel="Filter companies"
                sections={[
                  {
                    id: "audience",
                    label: "Target group",
                    allLabel: "All target groups",
                    options: audiences.map((a) => ({
                      id: a.id,
                      name: a.name,
                    })),
                    selectedIds: audienceFilterIds,
                    onChange: setAudienceFilterIds,
                  },
                  {
                    id: "sni",
                    label: "SNI",
                    allLabel: "All SNI codes",
                    options: sniOptions,
                    selectedIds: sniFilterIds,
                    onChange: setSniFilterIds,
                    searchable: true,
                  },
                  {
                    id: "county",
                    label: "County",
                    allLabel: "All counties",
                    options: countyOptions,
                    selectedIds: countyFilterIds,
                    onChange: setCountyFilterIds,
                  },
                  {
                    id: "turnover",
                    label: "Turnover",
                    allLabel: "All turnover classes",
                    options: turnoverOptions,
                    selectedIds: turnoverFilterIds,
                    onChange: setTurnoverFilterIds,
                  },
                  {
                    id: "customer",
                    label: "Customer match",
                    allLabel: "All",
                    options: [
                      { id: "yes", name: "Existing customer" },
                      { id: "no", name: "New prospect" },
                    ],
                    selectedIds: customerFilterIds,
                    onChange: setCustomerFilterIds,
                  },
                  {
                    id: "prospect",
                    label: "Prospect",
                    allLabel: "All prospect statuses",
                    options: [
                      { id: "interesting", name: "Interesting" },
                      { id: "irrelevant", name: "Irrelevant" },
                      { id: "none", name: "No status" },
                    ],
                    selectedIds: prospectFilterIds,
                    onChange: setProspectFilterIds,
                  },
                  {
                    id: "tech",
                    label: "Tech",
                    allLabel: "All technologies",
                    options: techOptions,
                    selectedIds: techFilterIds,
                    onChange: setTechFilterIds,
                    searchable: true,
                  },
                ]}
              />
              <GroupByControl groupBy={groupBy} onChange={setGroupBy} />
            </div>
          }
        />

        <p className="mt-1.5 px-1 text-[12px] text-text-tertiary" aria-live="polite">
          {filtered.length === rows.length
            ? `${rows.length.toLocaleString("en-US")} ${
                rows.length === 1 ? "company" : "companies"
              }`
            : `${filtered.length.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} companies · ${(
                rows.length - filtered.length
              ).toLocaleString("en-US")} filtered out`}
          {bulkFeedback ? (
            <span className="ml-2 text-text-secondary">· {bulkFeedback}</span>
          ) : null}
        </p>

        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-sm text-text-secondary">
            No companies match this filter.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <section key={group.key} className="space-y-1">
                {groupBy !== "none" ? (
                  <h2 className="px-0.5 text-[12px] font-medium text-text-tertiary">
                    {group.title}
                    <span>
                      {" "}
                      · {group.rows.length}
                    </span>
                  </h2>
                ) : null}
                <DataTable
                  className="table-fixed"
                  density="compact"
                  columns={columns}
                  rows={group.rows}
                  getRowId={(c) => c.id}
                  sort={{
                    columnId: sortKey,
                    direction: sortDirection,
                    onSort: handleSort,
                  }}
                />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
