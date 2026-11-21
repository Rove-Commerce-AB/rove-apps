"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCompanyToProspectListAction,
  addRadarDomainAction,
  clearRadarProspectAction,
  deleteRadarCompanyAction,
  scanRadarCompanyAction,
  setRadarProspectStatusAction,
  updateRadarCompanyBusinessModelAction,
} from "@/app/(app)/radar/actions";
import { SetRadarCompanyTrail } from "@/components/WorkTrailContext";
import {
  Badge,
  Button,
  ConfirmModal,
  Input,
  PageHeader,
  Panel,
  Select,
} from "@/components/ui";
import { Loader2 } from "lucide-react";
import { formatOrganizationNumber } from "@/lib/radar/orgNumber";
import {
  formatAnstallningsklassRange,
  formatOmsattningsklassRange,
  stripOmsattningsklassKodPrefix,
} from "@/lib/radar/scb/omsattningsklasser";
import { ROUTES } from "@/lib/routes";
import type {
  RadarBusinessModel,
  RadarCompanyDetail,
  RadarProspectList,
  RadarProspectStatus,
} from "@/lib/radar/types";

type Props = {
  company: RadarCompanyDetail;
  lists: RadarProspectList[];
};

export function RadarCompanyDetailClient({ company, lists }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hostname, setHostname] = useState("");
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [prospectStatus, setProspectStatus] = useState<
    RadarProspectStatus | null
  >(company.prospect_status);
  const [prospectPending, setProspectPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);

  useEffect(() => {
    setProspectStatus(company.prospect_status);
  }, [company.prospect_status]);

  const deleteMessage = useMemo(() => {
    const bits: string[] = [];
    if (company.audience_names.length > 0) {
      bits.push(
        `${company.audience_names.length} target group link${
          company.audience_names.length === 1 ? "" : "s"
        }`
      );
    }
    if (company.domains.length > 0) {
      bits.push(
        `${company.domains.length} domain${
          company.domains.length === 1 ? "" : "s"
        }`
      );
    }
    if (company.technologies_detail.length > 0) {
      bits.push("technology scan results");
    }
    if (prospectStatus) {
      bits.push(`prospect status (${prospectStatus})`);
    }
    const related =
      bits.length > 0
        ? ` This also removes ${bits.join(", ")}.`
        : "";
    return `Permanently delete ${company.name}?${related} This cannot be undone.`;
  }, [company, prospectStatus]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function markProspect(status: RadarProspectStatus) {
    setError(null);
    setFeedback(null);
    setProspectPending(true);
    const previous = prospectStatus;
    setProspectStatus(status);
    try {
      await setRadarProspectStatusAction({
        companyId: company.id,
        status,
      });
      setFeedback(
        status === "interesting"
          ? "Marked as interesting."
          : "Marked as irrelevant."
      );
      refresh();
    } catch (cause) {
      setProspectStatus(previous);
      setError(
        cause instanceof Error ? cause.message : "Could not update prospect"
      );
    } finally {
      setProspectPending(false);
    }
  }

  async function clearProspect() {
    setError(null);
    setFeedback(null);
    setProspectPending(true);
    const previous = prospectStatus;
    setProspectStatus(null);
    try {
      await clearRadarProspectAction(company.id);
      setFeedback("Prospect status cleared.");
      refresh();
    } catch (cause) {
      setProspectStatus(previous);
      setError(
        cause instanceof Error ? cause.message : "Could not clear prospect"
      );
    } finally {
      setProspectPending(false);
    }
  }

  async function removeCompany() {
    setError(null);
    setDeleting(true);
    try {
      await deleteRadarCompanyAction(company.id);
      router.push(ROUTES.radarCompanies);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete company"
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SetRadarCompanyTrail companyName={company.name} />
      <PageHeader
        title={company.name}
        description={`${formatOrganizationNumber(company.organization_number)}${
          company.county ? ` · ${company.county}` : ""
        }`}
      >
        <div className="flex flex-wrap gap-2">
          {prospectStatus === "interesting" ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || deleting || prospectPending}
              onClick={() => void clearProspect()}
            >
              {prospectPending ? "Saving…" : "Interesting ✓"}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={pending || deleting || prospectPending}
              onClick={() => void markProspect("interesting")}
            >
              {prospectPending ? "Saving…" : "Mark interesting"}
            </Button>
          )}
          {prospectStatus === "irrelevant" ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || deleting || prospectPending}
              onClick={() => void clearProspect()}
            >
              {prospectPending ? "Saving…" : "Irrelevant ✓"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || deleting || prospectPending}
              onClick={() => void markProspect("irrelevant")}
            >
              Mark irrelevant
            </Button>
          )}
          <Button
            size="sm"
            variant="dangerSecondary"
            disabled={pending || deleting || prospectPending}
            onClick={() => setConfirmDelete(true)}
          >
            Remove company
          </Button>
        </div>
      </PageHeader>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p className="text-sm text-text-secondary" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {company.is_demo ? <Badge variant="warning">Demo data</Badge> : null}
        <Badge variant="muted">Source: {company.source}</Badge>
        <Badge variant="muted">
          Financials: {company.financials_origin}
        </Badge>
        {company.matched_customer_name ? (
          <Badge variant="success">
            Rove customer: {company.matched_customer_name}
          </Badge>
        ) : (
          <Badge variant="active">New prospect</Badge>
        )}
        {prospectStatus ? (
          <Badge
            variant={prospectStatus === "interesting" ? "success" : "muted"}
          >
            {prospectStatus}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-heading-m text-text-primary">Profile</h2>
            <Field label="SNI" value={`${company.sni_code ?? "—"} ${company.sni_description ?? ""}`} />
            <Field label="Legal form" value={company.legal_form ?? "—"} />
            <Field label="Municipality" value={company.municipality ?? "—"} />
            <Field
              label="Employees"
              value={
                company.anst_kl != null
                  ? formatAnstallningsklassRange(company.anst_kl)
                  : company.anst_kl_label?.trim() ||
                    (company.employee_count == null
                      ? "—"
                      : company.employee_count.toLocaleString("en-US"))
              }
            />
            <Field
              label="Revenue class"
              value={
                company.oms_kl != null
                  ? formatOmsattningsklassRange(company.oms_kl)
                  : company.oms_kl_label
                    ? stripOmsattningsklassKodPrefix(company.oms_kl_label)
                    : company.revenue_sek == null
                      ? "—"
                      : `${company.revenue_sek.toLocaleString("sv-SE")} SEK`
              }
            />
            <Field
              label="Target groups"
              value={company.audience_names.join(", ") || "—"}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">Business model</span>
              <Select
                value={company.business_model ?? "__unset"}
                onValueChange={async (v) => {
                  await updateRadarCompanyBusinessModelAction(
                    company.id,
                    v === "__unset" ? null : (v as RadarBusinessModel)
                  );
                  refresh();
                }}
                options={[
                  { value: "__unset", label: "Not set" },
                  { value: "d2c", label: "D2C" },
                  { value: "b2b", label: "B2B" },
                  { value: "wholesale", label: "Wholesale" },
                  { value: "other", label: "Other" },
                ]}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-heading-m text-text-primary">Offer match</h2>
            <ul className="flex flex-col gap-1 text-sm text-text-secondary">
              {company.offer_signals.map((s) => (
                <li key={s}>· {s}</li>
              ))}
            </ul>
            {lists.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Select
                  value={listId}
                  onValueChange={setListId}
                  options={lists.map((l) => ({
                    value: l.id,
                    label: l.name,
                  }))}
                  className="min-w-[12rem]"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!listId || pending}
                  onClick={async () => {
                    await addCompanyToProspectListAction({
                      listId,
                      companyId: company.id,
                    });
                    refresh();
                  }}
                >
                  Add to list
                </Button>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-heading-m text-text-primary">Domains</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {company.domains.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-2 text-text-secondary">
                <span className="text-text-primary">{d.hostname}</span>
                {d.is_primary ? <Badge variant="muted">Primary</Badge> : null}
                <Badge variant="muted">{d.source}</Badge>
                <Badge variant="muted">{d.scan_status}</Badge>
              </li>
            ))}
            {company.domains.length === 0 ? (
              <li className="text-text-secondary">No domains yet.</li>
            ) : null}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="example.com"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!hostname.trim() || pending}
              onClick={async () => {
                setError(null);
                try {
                  await addRadarDomainAction({
                    companyId: company.id,
                    hostname,
                    isPrimary: company.domains.length === 0,
                  });
                  setHostname("");
                  refresh();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not add domain"
                  );
                }
              }}
            >
              Add domain
            </Button>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-heading-m text-text-primary">Technologies</h2>
            <Button
              size="sm"
              variant="secondary"
              disabled={company.domains.length === 0 || scanning}
              title={
                company.domains.length === 0
                  ? "Add a domain before scanning"
                  : "Scan company domains for technology"
              }
              onClick={async () => {
                setScanFeedback(null);
                setError(null);
                setScanning(true);
                try {
                  const result = await scanRadarCompanyAction(company.id);
                  if (result.scan_status === "failed") {
                    setScanFeedback("Scan failed — try again.");
                  } else if (result.technologies.length === 0) {
                    setScanFeedback("No matching technology found.");
                  } else {
                    setScanFeedback(
                      `Found ${result.technologies.join(", ")}.`
                    );
                  }
                  refresh();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not scan technology"
                  );
                } finally {
                  setScanning(false);
                }
              }}
            >
              {scanning ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Scanning…
                </span>
              ) : company.technologies_detail.some(
                  (t) => t.outcome === "identified"
                ) ? (
                "Scan again"
              ) : (
                "Scan"
              )}
            </Button>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {company.technologies_detail.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <span className="text-text-primary">{t.technology_name}</span>
                <Badge
                  variant={
                    t.outcome === "identified" ? "success" : "warning"
                  }
                >
                  {t.outcome}
                </Badge>
                <span className="text-text-tertiary">
                  {t.source} · {(t.confidence * 100).toFixed(0)}% ·{" "}
                  {t.hostname ?? "—"}
                </span>
              </li>
            ))}
            {company.technologies_detail.length === 0 ? (
              <li className="text-text-secondary">
                {company.domains.length === 0
                  ? "Add a domain, then scan for technology."
                  : "No scan results yet. Click Scan to check the website."}
              </li>
            ) : null}
          </ul>
          {scanFeedback ? (
            <p className="text-sm text-text-secondary" role="status">
              {scanFeedback}
            </p>
          ) : null}
        </div>
      </Panel>

      <ConfirmModal
        isOpen={confirmDelete}
        title="Remove company?"
        message={deleteMessage}
        confirmLabel={deleting ? "Removing…" : "Remove"}
        onClose={() => {
          if (deleting) return;
          setConfirmDelete(false);
        }}
        onConfirm={removeCompany}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="text-text-secondary">{label}</div>
      <div className="text-text-primary">{value}</div>
    </div>
  );
}
