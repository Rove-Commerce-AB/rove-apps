"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCompanyToProspectListAction,
  addRadarDomainAction,
  setRadarProspectStatusAction,
  updateRadarCompanyBusinessModelAction,
} from "@/app/(app)/radar/actions";
import {
  Badge,
  Button,
  Input,
  PageHeader,
  Panel,
  Select,
} from "@/components/ui";
import { formatOrganizationNumber } from "@/lib/radar/orgNumber";
import type {
  RadarBusinessModel,
  RadarCompanyDetail,
  RadarProspectList,
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

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={company.name}
        description={`${formatOrganizationNumber(company.organization_number)}${
          company.county ? ` · ${company.county}` : ""
        }`}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={async () => {
              await setRadarProspectStatusAction({
                companyId: company.id,
                status: "interesting",
              });
              refresh();
            }}
          >
            Mark interesting
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={async () => {
              await setRadarProspectStatusAction({
                companyId: company.id,
                status: "irrelevant",
              });
              refresh();
            }}
          >
            Mark irrelevant
          </Button>
        </div>
      </PageHeader>

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
        {company.prospect_status ? (
          <Badge
            variant={
              company.prospect_status === "interesting" ? "success" : "muted"
            }
          >
            {company.prospect_status}
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
                company.employee_count == null
                  ? "—"
                  : String(company.employee_count)
              }
            />
            <Field
              label="Revenue (SEK)"
              value={
                company.revenue_sek == null
                  ? "—"
                  : company.revenue_sek.toLocaleString("sv-SE")
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
          <h2 className="text-heading-m text-text-primary">Technologies</h2>
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
                No scan results yet. Run the technology scan job.
              </li>
            ) : null}
          </ul>
        </div>
      </Panel>
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
